"""Photograph "Almost" as a stop-motion stage is photographed. The camera and the lights never move,
so each photograph only needs the part of the picture that changed since the last one.

    blender -b --factory-startup --python scripts/almost/render.py -- --out DIR [options]

    --res WxH       the open-matte frame (default 1280x1440). Both crops come from the same
                    photographs: a 16:9 band for wide screens and a 9:16 crop for upright phones.
    --samples N     (default 80)
    --draft         blocking: no fibres, 16 samples, half size, denoised regions as PNG
    --only A-B      photographs A..B only (in order of first use)
    --plan          render nothing: print each photograph's region and what the whole would cost
    --regrow        render again, wider, the region sides `develop.py` found seamed (DIR/seams.json)

**Photograph 0** is rendered whole.

**Each later photograph** renders only the region where anything changed since the one before:
- the vertices that moved, where they were and where they are;
- where their shadows fall: a ray from each light that casts one (the bulb, the night window, the
  bounce off the wall, the card under her hat) through each, to the first thing it meets, kept if
  the lens sees that place, it is in the picture, and the shadow there is still sharp enough to see
  (its blur, the light's size times how far it falls beyond the point over how far the light is
  before it, under PENUMBRA). (Shadows were found only on the table top and the back wall: his
  raised hand's shadow on her face was left frozen behind a straight edge through the reach, and
  her head's on her chest through the last hold: the technical artist's review of the final
  render, 2026-10-21. Every ray to whatever it met grew each region to the whole frame: the window's
  and the bounce's shadows of his head on the floor under the table and beyond the picture.)
- padded (more where her long hair moved: its fibres are 7 mm).

**Seams.** `develop.py` checks every pasted region against the photograph before it, denoised, and
lists the sides where they disagree in DIR/seams.json; `--regrow` renders those photographs again
with those sides GROW px further out (kept in regions.json), and `develop.py --from N` develops
them. (A test of the noisy region's own border against the photograph beneath, at render time,
caught 17 of the 32 seamed sides of the last render and flagged 9 of its 444 clean ones: the noise
is as large as a faint seam, so it was taken out.)

**What a photograph is made of.** It is rendered with the same fixed seed and no dither, and
written noisy: DIR/regions/NNNN.exr (the image and the denoiser's albedo and normal), with its place
in DIR/regions.json. Pasted into the photograph before it, what stood still differs only by the
noise (not bit for bit: that was measured false), which the denoiser takes out. `develop.py` pastes
them in order and denoises each whole photograph once. (Each region denoised alone re-made the room
round it every photograph, so the room shimmered in rectangles: the technical artist's review,
2026-10-20.) `assemble.py` lays the developed photographs out by the exposure sheet.

**The fibres.** They are grown once, at the rest pose, before the first photograph (a tiny warm-up
render), so every run grows the same fibres.

Re-running resumes: regions already on disk are kept, each with a hash of its two drawings and of
the scripts that make the set, the puppets and the poses (MAKERS). One made from anything else
stops the run: change a pose and render into a fresh directory. (Renumbered, the sheet would have pasted old drawings into the new
film: the technical artist's review, 2026-10-21.)
"""
import hashlib
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
GROW = 96         # pixels a seamed side moves out (--regrow)
# The lights whose shadows can be seen move (build.lights; the ceiling's falls with the bulb's)
CASTERS = ('bulb light', 'window light', 'bounce light', 'face card')
# Every moved point casts its ray (up to 60000). At 4000, a region's far side depended on which
# points the stride took: growing the fibres first moved photograph 1's left edge from 98 to 214.
SHADOW_SAMPLES = 60000
PENUMBRA = 0.03   # m: a shadow blurred wider than this (twice a hand) is lost in the light round it
# Seconds a region takes: a fixed cost (the scene, the fibres) and the frame's area (the last render)
COST_FIXED, COST_FRAME = 30.0, 400.0


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
    w = np.where(c[:, 3] > 1e-6, c[:, 3], np.nan)    # (behind the lens: nowhere in the picture)
    ndc = c[:, :3] / w[:, None]
    return (ndc[:, 0] + 1) / 2 * W, (1 - (ndc[:, 1] + 1) / 2) * H


def light_size(li):
    """A light's breadth (m): what blurs its shadows."""
    if li.type == 'AREA':
        return max(li.size, li.size_y) if li.shape in ('RECTANGLE', 'ELLIPSE') else li.size
    return 2 * li.shadow_soft_size


def shadows(pts):
    """Where the lights throw the shadows of `pts` that the lens can see: from each light that casts
    one, a ray through each point (a sample of them) to the first thing it meets beyond it, no
    further than its shadow stays sharp (PENUMBRA), kept if nothing stands between that place and
    the lens and it is in the picture."""
    sc = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()
    eye = Vector(sc.camera.matrix_world.translation)
    W, H = sc.render.resolution_x, sc.render.resolution_y
    if len(pts) > SHADOW_SAMPLES:
        pts = pts[:: len(pts) // SHADOW_SAMPLES + 1]
    out = []
    for name in CASTERS:
        ob = bpy.data.objects.get(name)
        if ob is None:
            continue
        L = Vector(ob.matrix_world.translation)
        size = light_size(ob.data)
        for p in pts:
            p = Vector(p)
            d = p - L
            n = d.length
            if n < 1e-6:
                continue
            d /= n
            hit, loc, _, _, _, _ = sc.ray_cast(dg, p + d * 1e-4, d, distance=PENUMBRA * n / max(size, 1e-4))
            if not hit:
                continue
            v = loc - eye
            m = v.length
            hidden = sc.ray_cast(dg, eye, v / m, distance=m - 5e-4)[0]
            if not hidden:
                out.append(loc[:])
    if not out:
        return np.zeros((0, 3))
    P = np.array(out)
    x, y = project(P)
    return P[(x >= 0) & (x < W) & (y >= 0) & (y < H)]


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
    x, y = x[np.isfinite(x)], y[np.isfinite(y)]
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


def grown(box, grow, W, H):
    """A box moved out on its sides by `grow` ({side: pixels})."""
    x0, y0, x1, y1 = box
    return (max(0, x0 - grow.get('left', 0)), max(0, y0 - grow.get('top', 0)),
            min(W, x1 + grow.get('right', 0)), min(H, y1 + grow.get('bottom', 0)))


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


# The scripts that make the set, the puppets and their poses: a region is kept on a later run only
# if they and its two drawings are what they were. (A hash of the posed numbers was too exact: the
# touch's solve differs by up to 0.1 mm, half a pixel, from one run to the next.)
MAKERS = ('build.py', 'kitchen.py', 'lib.py', 'performance.py', 'puppets.py')


def made_key(da, db, makers):
    """What a photograph was made from, as a short hash: its two drawings, and the scripts'."""
    return hashlib.sha1((json.dumps([list(da[:3]), list(db[:3])]) + makers).encode()).hexdigest()[:12]


def main():
    opts = build.args()
    out = opts['out']
    draft = opts.get('draft')
    plan = opts.get('plan')
    if '--res' not in sys.argv:
        opts['res'] = (640, 720) if draft else (1280, 1440)
    if '--samples' not in sys.argv:
        opts['samples'] = 16 if draft else 80
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
    if not draft and not plan:
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
    if not plan:
        os.makedirs(os.path.join(out, 'regions'), exist_ok=True)
    if opts.get('regrow'):
        # the sides develop.py found seamed, each GROW px further out than before (kept with the
        # photograph, so a later run renders it as wide)
        seams_path = os.path.join(out, 'seams.json')
        if not os.path.exists(seams_path):
            raise SystemExit('no seams.json: develop.py lists the seamed sides')
        regrow = {}
        for row in json.load(open(seams_path)):
            regrow.setdefault(int(row['photo']), set()).add(row['side'])
        for u, sides in regrow.items():
            g = meta['photos'][str(u)].setdefault('grow', {})
            for side in sides:
                g[side] = g.get(side, 0) + GROW
            path = os.path.join(out, 'regions', f'{u:04d}.{ext}')
            if os.path.exists(path):
                os.remove(path)
        os.replace(seams_path, os.path.join(out, 'seams.regrown.json'))
        with open(meta_path, 'w') as fh:
            json.dump(meta, fh)
        lo, hi = min(regrow), max(regrow)
        print(f'REGROW {", ".join(f"{u:04d} {"/".join(sorted(regrow[u]))}" for u in sorted(regrow))}', flush=True)
    makers = hashlib.sha1(b''.join(open(os.path.join(HERE, f), 'rb').read() for f in MAKERS)).hexdigest()
    objs = movers(figs)
    prev = None
    W, H = opts['res']
    t_all, cost = time.time(), 0.0
    for (ia, ib), u in order:
        if u > hi:
            break
        da, db = a.drawings[ia], b.drawings[ib]
        pa = performance.mix(performance.A[da[0]], performance.A[da[1]], da[2])
        pb = performance.mix(performance.B[db[0]], performance.B[db[1]], db[2])
        performance.apply(figs, {'a': pa, 'b': pb})
        snap = snapshot(objs)
        path = os.path.join(out, 'regions', f'{u:04d}.{ext}')
        key = made_key(da, db, makers)
        info = meta['photos'].get(str(u), {})
        if not plan and os.path.exists(path) and info.get('made', key) != key:
            # (a region is pasted over the photograph before it: one of another pose, kept, would
            # put an old drawing into the film)
            raise SystemExit(f'photograph {u} on disk was made from other drawings or scripts than now: render into a fresh directory')
        if u >= lo and (plan or not os.path.exists(path)):
            box = None if prev is None else changed_region(prev, snap)
            if prev is not None and box is None:
                info = {'box': None, 'a': list(da[:3]), 'b': list(db[:3]), 'made': key}
                if plan:
                    print(f'PLAN {u:04d}   held', flush=True)
            else:
                box = grown(box or (0, 0, W, H), info.get('grow', {}), W, H)
                area = (box[2] - box[0]) * (box[3] - box[1]) / (W * H)
                t0 = time.time()
                if plan:
                    cost += COST_FIXED + COST_FRAME * area
                    print(f'PLAN {u:04d} {area * 100:5.1f}% of the frame  {list(box)}  ({da[1]} {da[2]:.2f} | {db[1]} {db[2]:.2f})', flush=True)
                else:
                    render_region(path, box)
                info = {'box': list(box), 'a': list(da[:3]), 'b': list(db[:3]), 'made': key,
                        **({'grow': info['grow']} if info.get('grow') else {})}
                if not plan:
                    print(f'PHOTO {u:04d} {area * 100:5.1f}% of the frame  {time.time() - t0:6.1f}s  ({da[1]} {da[2]:.2f} | {db[1]} {db[2]:.2f})'
                          + (f'  wider: {info["grow"]}' if info.get('grow') else ''), flush=True)
            if not plan:
                meta['photos'][str(u)] = info
                with open(meta_path, 'w') as fh:
                    json.dump(meta, fh)
        prev = snap
    if plan:
        print(f'PLAN about {cost / 3600:.1f} h to render photographs {lo}-{hi}', flush=True)
    print(f'DONE {time.time() - t_all:.0f}s', flush=True)


if __name__ == '__main__':
    main()
