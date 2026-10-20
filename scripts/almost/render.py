"""Photograph "Almost" as a stop-motion stage is photographed. The camera and the lights never move,
so each photograph only needs the part of the picture that changed since the last one.

    blender -b --factory-startup --python scripts/almost/render.py -- --out DIR [options]

    --res WxH       the open-matte frame (default 1280x1440). Both crops come from the same
                    photographs: a 16:9 band for wide screens and a 9:16 crop for upright phones.
    --samples N     (default 96)
    --draft         blocking: no fibres, 16 samples, half size
    --only A-B      photographs A..B only (in order of first use)

**Photograph 0** is rendered whole.

**Each later photograph** renders only the region where anything changed since the one before:
- the moving parts, both before and after;
- their shadows on the table, the floor and the wall;
- padded.

It is rendered with the same fixed seed, so nothing that stood still differs. It is written to
DIR/regions/NNNN.png, with its place in DIR/regions.json. `assemble.py` pastes the regions in order
into whole photographs, then lays the frames out by the exposure sheet.

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

PAD = 26          # pixels round a change (fibres, soft shadows, the lens's blur, the denoiser's reach)


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
    """Where the bulb throws the shadows of `pts`: on the table top, else the floor, and the wall."""
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
    tf = np.where(below, (0.0 - L[2]) / np.where(below, dz, -1), np.inf)
    F = L + (pts - L) * tf[:, None]
    out.append(F[below & ~on_table])
    dy = pts[:, 1] - L[1]
    back = dy > 1e-6
    tw = np.where(back, (kitchen.WALL_Y - L[1]) / np.where(back, dy, 1), np.inf)
    Wp = L + (pts - L) * tw[:, None]
    out.append(Wp[back & (Wp[:, 2] > 0) & (Wp[:, 2] < 0.4)])
    return np.concatenate(out) if out else np.zeros((0, 3))


def changed_region(s0, s1):
    """The pixel box (x0, y0, x1, y1; y down) holding everything that differs between two poses."""
    pts = []
    for name, b in s1.items():
        a = s0.get(name)
        if a is None or a.shape != b.shape:
            pts.append(b)
            continue
        if np.abs(a - b).max() > 2e-6:
            pts += [a, b]
    if not pts:
        return None
    P = np.concatenate(pts)
    if len(P) > 60000:
        P = P[:: len(P) // 60000 + 1]
    P = np.concatenate([P, shadows(P)])
    x, y = project(P)
    sc = bpy.context.scene
    W, H = sc.render.resolution_x, sc.render.resolution_y
    x0 = int(max(0, np.floor(x.min()) - PAD))
    x1 = int(min(W, np.ceil(x.max()) + PAD))
    y0 = int(max(0, np.floor(y.min()) - PAD))
    y1 = int(min(H, np.ceil(y.max()) + PAD))
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


def main():
    opts = build.args()
    out = opts['out']
    draft = opts.get('draft')
    if '--res' not in sys.argv:
        opts['res'] = (640, 720) if draft else (1280, 1440)
    if '--samples' not in sys.argv:
        opts['samples'] = 16 if draft else 96
    os.makedirs(os.path.join(out, 'regions'), exist_ok=True)
    figs = build.setup(opts)
    sc = bpy.context.scene
    if draft:
        for ob in bpy.data.objects:
            for m in ob.modifiers:
                if m.type == 'PARTICLE_SYSTEM':
                    m.show_render = False
        sc.cycles.max_bounces = 4
    performance.calibrate(figs)
    performance.resolve(figs)
    a, b, frames, unique = xsheet.frames()
    order = sorted(unique.items(), key=lambda kv: kv[1])
    lo, hi = 0, len(order) - 1
    if opts.get('only'):
        lo, hi = (int(x) for x in str(opts['only']).split('-'))
    meta_path = os.path.join(out, 'regions.json')
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    meta.update({'size': list(opts['res']), 'fps': xsheet.FPS, 'frames': [u for _, _, u in frames]})
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
        path = os.path.join(out, 'regions', f'{u:04d}.png')
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
