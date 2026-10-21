"""Photograph "Almost" as a stop-motion stage is photographed. The camera and the lights never move,
so each photograph only needs the part of the picture that changed since the last one.

    blender -b --factory-startup --python scripts/almost/render.py -- --out DIR [options]

    --res WxH       the open-matte frame (default 1280x1440). Both crops come from the same
                    photographs: a 16:9 band for wide screens and a 9:16 crop for upright phones.
    --samples N     (default 80)
    --draft         blocking: no fibres, 16 samples, half size, denoised regions as PNG
    --only A-B      photographs A..B only (in order of first use)

**Photograph 0** is rendered whole.

**Each later photograph** renders only the region where anything changed since the one before:
- the vertices that moved, where they were and where they are;
- their shadows from the bulb on the table top and on the wall above the table's far edge (the
  floor is never in frame);
- padded (more where her long hair moved: its fibres are 7 mm).

**What a photograph is made of.** It is rendered with the same fixed seed and no dither, and
written noisy: DIR/regions/NNNN.exr (the image and the denoiser's albedo and normal), with its place
in DIR/regions.json. Pasted into the photograph before it, nothing that stood still differs by a
bit. `develop.py` pastes them in order and denoises each whole photograph once. (Each region
denoised alone re-made the room round it every photograph, so the room shimmered in rectangles:
the technical artist's review, 2026-10-20.) `assemble.py` lays the developed photographs out by
the exposure sheet.

**The fibres.** They are grown once, at the rest pose, before the first photograph (a tiny warm-up
render), so every run grows the same fibres.

Re-running resumes: regions already on disk are kept. A region depends on the photograph before
it, so change a pose and re-render from that photograph on (`--only`).
"""
import json
import os
import sys
import time

import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import build  # noqa: E402
import kitchen  # noqa: E402
import performance  # noqa: E402
import xsheet  # noqa: E402

PAD = 30          # pixels round a change (fibres, soft shadows, the lens's blur)
PAD_HAIR = 50     # round a change of her long hair (its fibres are 7 mm, about 40 px)
SEEN_WALL_Z = 0.020   # the back wall is seen above the table's far edge down to about here (0.025)


def movers(figs):
    """Everything that can move: the figures' parts and the chairs."""
    obs = [o for f in figs.values() for o in f.objects]
    for key in ('a', 'b'):
        pivot = bpy.data.objects.get(f'chair {key} pivot')
        if pivot is not None:
            obs += list(pivot.children)
    return obs


def snapshot(objs):
    """World positions of every vertex as the scene is posed now."""
    dg = bpy.context.evaluated_depsgraph_get()
    out = {}
    for ob in objs:
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        co = np.empty(len(me.vertices) * 3, np.float64)
        me.vertices.foreach_get('co', co)
        co = co.reshape(-1, 3)
        M = np.array(ev.matrix_world)
        out[ob.name] = co @ M[:3, :3].T + M[:3, 3]
        ev.to_mesh_clear()
    return out


def project(pts):
    sc = bpy.context.scene
    cam = sc.camera
    W, H = sc.render.resolution_x, sc.render.resolution_y
    dg = bpy.context.evaluated_depsgraph_get()
    P = np.array(cam.calc_matrix_camera(dg, x=W, y=H))
    V = np.array(cam.matrix_world.inverted())
    hom = np.c_[pts, np.ones(len(pts))]
    c = (P @ V @ hom.T).T
    ok = c[:, 3] > 1e-6
    ndc = c[ok, :3] / c[ok, 3:4]
    return (ndc[:, 0] + 1) / 2 * W, (1 - (ndc[:, 1] + 1) / 2) * H


def shadows(pts):
    """Where the bulb throws the shadows of `pts` that can be seen: on the table top, and on the wall
    above the table's far edge. (A shadow on the floor, or one the table already casts, is never in
    frame.)"""
    L = np.array(bpy.data.objects['bulb light'].location)
    zt = kitchen.TABLE_TOP
    x0, x1 = kitchen.TABLE_X
    y0, y1 = kitchen.TABLE_Y
    out = []
    dz = pts[:, 2] - L[2]
    below = dz < -1e-6
    t = np.where(below, (zt - L[2]) / np.where(below, dz, -1), np.inf)
    S = L + (pts - L) * t[:, None]
    on_table = below & (pts[:, 2] > zt) & (S[:, 0] > x0) & (S[:, 0] < x1) & (S[:, 1] > y0) & (S[:, 1] < y1)
    out.append(S[on_table])
    dy = pts[:, 1] - L[1]
    back = dy > 1e-6
    tw = np.where(back, (kitchen.WALL_Y - L[1]) / np.where(back, dy, 1), np.inf)
    Wp = L + (pts - L) * tw[:, None]
    # (a ray going down past the table's far edge, from above it, is stopped by the table)
    tz = np.where(back & below, (zt - L[2]) / np.where(below, dz, -1), np.inf)
    cross = L + (pts - L) * tz[:, None]
    blocked = (pts[:, 2] > zt) & (Wp[:, 2] < zt) & (cross[:, 1] < y1)
    out.append(Wp[back & ~on_table & ~blocked & (Wp[:, 2] > SEEN_WALL_Z) & (Wp[:, 2] < 0.4)])
    return np.concatenate(out) if out else np.zeros((0, 3))


def changed_region(s0, s1):
    """The pixel box (x0, y0, x1, y1; y down) holding everything that differs between two poses:
    the vertices that moved (where they were and where they are) and their shadows."""
    pts = []
    hair = False
    for name, b in s1.items():
        a = s0.get(name)
        if a is None or a.shape != b.shape:
            pts.append(b)
            continue
        moved = np.abs(a - b).max(axis=1) > 2e-6
        if moved.any():
            pts += [a[moved], b[moved]]
            hair = hair or 'long hair' in name or 'front hair' in name
    if not pts:
        return None
    P = np.concatenate(pts)
    if len(P) > 60000:
        P = P[:: len(P) // 60000 + 1]
    P = np.concatenate([P, shadows(P)])
    x, y = project(P)
    sc = bpy.context.scene
    W, H = sc.render.resolution_x, sc.render.resolution_y
    pad = PAD_HAIR if hair else PAD
    x0 = int(max(0, np.floor(x.min()) - pad))
    x1 = int(min(W, np.ceil(x.max()) + pad))
    y0 = int(max(0, np.floor(y.min()) - pad))
    y1 = int(min(H, np.ceil(y.max()) + pad))
    if x1 - x0 < 8 or y1 - y0 < 8:
        return None
    return x0, y0, x1, y1


def render_region(path, box):
    sc = bpy.context.scene
    r = sc.render
    W, H = r.resolution_x, r.resolution_y
    if box is None or box == (0, 0, W, H):
        r.use_border = False
    else:
        x0, y0, x1, y1 = box
        r.use_border, r.use_crop_to_border = True, True
        # (Blender truncates border × size to whole pixels: half a pixel in, so each edge lands on
        # its own pixel. Exactly on it, 452 rows came out as 451.)
        r.border_min_x, r.border_max_x = (x0 + 0.5) / W, min(1.0, (x1 + 0.5) / W)
        r.border_min_y, r.border_max_y = (H - y1 + 0.5) / H, min(1.0, (H - y0 + 0.5) / H)
    r.filepath = path
    bpy.ops.render.render(write_still=True)


def noisy_exr():
    """Regions as they come off the sensor: no denoiser, no dither, float, with the denoiser's
    albedo and normal passes (develop.py denoises each whole photograph once)."""
    sc = bpy.context.scene
    sc.cycles.use_denoising = False
    sc.render.dither_intensity = 0.0
    sc.view_layers[0].cycles.denoising_store_passes = True
    im = sc.render.image_settings
    im.media_type = 'MULTI_LAYER_IMAGE'     # (Blender 5: a multilayer EXR is a media type)
    im.file_format = 'OPEN_EXR_MULTILAYER'
    im.color_depth = '16'
    im.exr_codec = 'ZIP'


def main():
    opts = build.args()
    out = opts['out']
    draft = opts.get('draft')
    if '--res' not in sys.argv:
        opts['res'] = (640, 720) if draft else (1280, 1440)
    if '--samples' not in sys.argv:
        opts['samples'] = 16 if draft else 80
    os.makedirs(os.path.join(out, 'regions'), exist_ok=True)
    figs = build.setup(opts)
    sc = bpy.context.scene
    if draft:
        for ob in bpy.data.objects:
            for m in ob.modifiers:
                if m.type == 'PARTICLE_SYSTEM':
                    m.show_render = False
        sc.cycles.max_bounces = 4
    else:
        noisy_exr()
    ext = 'png' if draft else 'exr'
    performance.calibrate(figs)
    performance.resolve(figs)
    if not draft:
        build.warm_fibres(figs)
    a, b, frames, unique = xsheet.frames()
    order = sorted(unique.items(), key=lambda kv: kv[1])
    lo, hi = 0, len(order) - 1
    if opts.get('only'):
        lo, hi = (int(x) for x in str(opts['only']).split('-'))
    meta_path = os.path.join(out, 'regions.json')
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    vs = sc.view_settings
    meta.update({'size': list(opts['res']), 'fps': xsheet.FPS, 'frames': [u for _, _, u in frames], 'format': ext,
                 'view': {'transform': vs.view_transform, 'look': vs.look, 'exposure': vs.exposure, 'gamma': vs.gamma,
                          'display': sc.display_settings.display_device}})
    meta.setdefault('photos', {})
    objs = movers(figs)
    prev = None
    t_all = time.time()
    for (ia, ib), u in order:
        if u > hi:
            break
        da, db = a.drawings[ia], b.drawings[ib]
        pa = performance.mix(performance.A[da[0]], performance.A[da[1]], da[2])
        pb = performance.mix(performance.B[db[0]], performance.B[db[1]], db[2])
        performance.apply(figs, {'a': pa, 'b': pb})
        snap = snapshot(objs)
        path = os.path.join(out, 'regions', f'{u:04d}.{ext}')
        if u >= lo and not os.path.exists(path):
            box = None if prev is None else changed_region(prev, snap)
            if prev is not None and box is None:
                meta['photos'][str(u)] = {'box': None, 'a': list(da[:3]), 'b': list(db[:3])}
            else:
                t0 = time.time()
                render_region(path, box)
                W, H = opts['res']
                meta['photos'][str(u)] = {'box': list(box) if box else [0, 0, W, H], 'a': list(da[:3]), 'b': list(db[:3])}
                area = 1.0 if not box else (box[2] - box[0]) * (box[3] - box[1]) / (W * H)
                print(f'PHOTO {u:04d} {area * 100:5.1f}% of the frame  {time.time() - t0:6.1f}s  ({da[1]} {da[2]:.2f} | {db[1]} {db[2]:.2f})', flush=True)
            with open(meta_path, 'w') as fh:
                json.dump(meta, fh)
        prev = snap
    print(f'DONE {time.time() - t_all:.0f}s', flush=True)


if __name__ == '__main__':
    main()
