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
- where their shadows fall: a ray from each light that casts one (the bulb, the night window, the
  bounce off the wall, the card under her hat) through each, to the first thing it meets;
- padded (more where her long hair moved: its fibres are 7 mm);
- then grown until its border is still: a side whose outer ring differs from the photograph beneath
  (luminance, blurred 9 px: RING_FRAC of it by more than RING_REL, or its 99th percentile by
  RING_P99) is moved out GROW px and the region rendered again, up to GROW_TRIES times. (Shadows
  were found only on the table top and the back wall: his raised hand's shadow on her face was left
  frozen behind a straight edge through the reach, and her head's on her chest through the last
  hold: the technical artist's review of the final render, 2026-10-21.)

**What a photograph is made of.** It is rendered with the same fixed seed and no dither, and
written noisy: DIR/regions/NNNN.exr (the image and the denoiser's albedo and normal), with its place
in DIR/regions.json. Pasted into the photograph before it, what stood still differs only by the
noise (not bit for bit: that was measured false), which the denoiser takes out. `develop.py` pastes
them in order and denoises each whole photograph once. (Each region denoised alone re-made the room
round it every photograph, so the room shimmered in rectangles: the technical artist's review,
2026-10-20.) `assemble.py` lays the developed photographs out by the exposure sheet.

**The fibres.** They are grown once, at the rest pose, before the first photograph (a tiny warm-up
render), so every run grows the same fibres.

Re-running resumes: regions already on disk are kept. A region depends on the photograph before
it, so change a pose and render again from that photograph on, into a fresh directory: a region
file left on disk is used as it is, whatever the sheet now says it shows. (Renumbered, the sheet
would have pasted old drawings into the new film: the technical artist's review, 2026-10-21.)
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
# The region's border must be still (see the docstring); measured on this film: these flag every
# seamed side and no clean one (the technical artist's review, 2026-10-21)
RING = 12
RING_REL, RING_FRAC, RING_P99 = 0.05, 0.08, 0.25
GROW, GROW_TRIES = 96, 4
# The lights whose shadows can be seen move (build.lights; the ceiling's falls with the bulb's)
CASTERS = ('bulb light', 'window light', 'bounce light', 'face card')
SHADOW_SAMPLES = 4000


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
    """Where the lights throw the shadows of `pts`: from each light that casts one, a ray through
    each point to the first thing it meets beyond it (a sample of the points: a shadow is soft)."""
    sc = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()
    if len(pts) > SHADOW_SAMPLES:
        pts = pts[:: len(pts) // SHADOW_SAMPLES + 1]
    out = []
    for name in CASTERS:
        ob = bpy.data.objects.get(name)
        if ob is None:
            continue
        L = Vector(ob.matrix_world.translation)
        for p in pts:
            d = Vector(p) - L
            n = d.length
            if n < 1e-6:
                continue
            d /= n
            hit, loc, _, _, _, _ = sc.ray_cast(dg, Vector(p) + d * 1e-4, d, distance=2.0)
            if hit:
                out.append(loc[:])
    return np.array(out) if out else np.zeros((0, 3))


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


def combined(path):
    """The noisy image (RGB, float) of a region on disk, rows from the top."""
    import OpenImageIO as oiio
    inp = oiio.ImageInput.open(path)
    sub, idx = 0, 0
    while inp.seek_subimage(sub, 0):
        if (inp.spec().getattribute('name') or '').endswith('.Combined'):
            idx = sub
        sub += 1
    inp.close()
    return np.asarray(oiio.ImageBuf(path, idx, 0).get_pixels(oiio.FLOAT))[..., :3]


def fit(reg, w, h):
    """A region as its box (Blender's border may be a pixel off: develop.py's)."""
    rh, rw = reg.shape[:2]
    if rh == h - 1:
        reg = np.concatenate([reg[:1], reg], 0)
    elif rh == h + 1:
        reg = reg[:-1]
    if rw == w - 1:
        reg = np.concatenate([reg, reg[:, -1:]], 1)
    elif rw == w + 1:
        reg = reg[:, 1:]
    return reg


def _blur(a, k=9):
    c = np.cumsum(np.cumsum(np.pad(a, ((k // 2 + 1, k // 2), (k // 2 + 1, k // 2)), mode='edge'), 0), 1)
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)


def moving_sides(reg, under, box, W, H):
    """The sides of a region whose outer ring differs from the photograph beneath it: the change
    runs on across them."""
    lum = np.array([0.2126, 0.7152, 0.0722])
    a, b = _blur(reg @ lum), _blur(under @ lum)
    rel = np.abs(a - b) / np.maximum(b, 1e-3)
    x0, y0, x1, y1 = box
    out = []
    for side, sl, live in (('top', (slice(0, RING), slice(None)), y0 > 0), ('bottom', (slice(-RING, None), slice(None)), y1 < H),
                           ('left', (slice(None), slice(0, RING)), x0 > 0), ('right', (slice(None), slice(-RING, None)), x1 < W)):
        if live:
            r = rel[sl]
            if np.mean(r > RING_REL) >= RING_FRAC or np.percentile(r, 99) >= RING_P99:
                out.append(side)
    return out


def grown(box, sides, W, H):
    x0, y0, x1, y1 = box
    if 'left' in sides:
        x0 = max(0, x0 - GROW)
    if 'right' in sides:
        x1 = min(W, x1 + GROW)
    if 'top' in sides:
        y0 = max(0, y0 - GROW)
    if 'bottom' in sides:
        y1 = min(H, y1 + GROW)
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
    W, H = opts['res']
    # the photograph as it stands, noisy (the regions pasted in order): what a new region's border
    # is held to
    noisy = None
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
                box = box or (0, 0, W, H)
                render_region(path, box)
                tries = 0
                if not draft and noisy is not None:
                    while True:
                        x0, y0, x1, y1 = box
                        reg = fit(combined(path), x1 - x0, y1 - y0)
                        sides = moving_sides(reg, noisy[y0:y1, x0:x1], box, W, H)
                        if not sides or tries >= GROW_TRIES:
                            break
                        print(f'  photo {u:04d}: the change runs on across its {", ".join(sides)}: grown {GROW} px', flush=True)
                        box = grown(box, sides, W, H)
                        render_region(path, box)
                        tries += 1
                meta['photos'][str(u)] = {'box': list(box), 'a': list(da[:3]), 'b': list(db[:3])}
                area = (box[2] - box[0]) * (box[3] - box[1]) / (W * H)
                print(f'PHOTO {u:04d} {area * 100:5.1f}% of the frame  {time.time() - t0:6.1f}s  ({da[1]} {da[2]:.2f} | {db[1]} {db[2]:.2f})'
                      + (f'  grown {tries}x' if tries else ''), flush=True)
            with open(meta_path, 'w') as fh:
                json.dump(meta, fh)
        # paste what this photograph is into the noisy photograph
        if not draft:
            info = meta['photos'].get(str(u))
            if info and info['box'] and os.path.exists(path):
                x0, y0, x1, y1 = info['box']
                reg = fit(combined(path), x1 - x0, y1 - y0)
                if noisy is None:
                    noisy = np.zeros((H, W, 3), np.float32)
                noisy[y0:y1, x0:x1] = reg
        prev = snap
    print(f'DONE {time.time() - t_all:.0f}s', flush=True)


if __name__ == '__main__':
    main()
