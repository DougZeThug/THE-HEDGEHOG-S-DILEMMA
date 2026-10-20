"""Develop "Almost": each photograph denoised whole, once, as a print is made from a negative.

    blender -b --factory-startup --python scripts/almost/develop.py -- DIR [--from N]

DIR is render.py's output: regions/NNNN.exr (noisy, with the denoiser's albedo and normal) and
regions.json. For each photograph, in order:
- its region is pasted into the noisy photograph before it. Nothing that stood still differs by a
  bit (same seed, no dither), so the paste is exact;
- the whole noisy photograph is denoised (OIDN with albedo and normal, prefiltered) and seen through
  the film's view (AgX), in Blender's compositor;
- the developed region is laid over the developed photograph before, feathered at its edge. Outside
  the region nothing differs at all: the denoiser saw the whole room, but it sets its exposure from
  each picture's brightness, and the room must not breathe with the figures. The edge is 30 px or
  more from anything that moved, where the two developments agree (it prints how closely).

Writes DIR/photos/NNNN.png, 16-bit, one for each photograph that has a region (assemble.py holds the
one before for the others, and makes the 8-bit frames). Re-running resumes after the last photograph
on disk; after re-rendering regions from N on, develop from N on (`--from N`).
"""
import json
import os
import sys
import time

import bpy
import numpy as np
import OpenImageIO as oiio

FEATHER = 10    # pixels: the region's edge fades into the photograph before
PASSES = {'image': 'Combined', 'albedo': 'Denoising Albedo', 'normal': 'Denoising Normal'}


def read_region(path):
    """The noisy image (RGBA), albedo and normal of a region: float32, rows from the top."""
    out = {}
    n = oiio.ImageBuf(path).nsubimages
    for sub in range(n):
        buf = oiio.ImageBuf(path, sub, 0)
        name = buf.spec().getattribute('name') or ''
        for key, layer in PASSES.items():
            if name.endswith('.' + layer):
                out[key] = np.asarray(buf.get_pixels(oiio.FLOAT), np.float32)
    missing = sorted(set(PASSES) - set(out))
    if missing:
        raise SystemExit(f'{path}: no {", ".join(missing)} (render it with render.py, not --draft)')
    return out


def fit(reg, w, h):
    """A region as its box (Blender can lose or add a row or a column at the border's edge)."""
    rh, rw = reg.shape[:2]
    if abs(rh - h) > 1 or abs(rw - w) > 1:
        raise SystemExit(f'region {rw}x{rh} on disk, box {w}x{h}')
    if rh == h - 1:
        reg = np.concatenate([reg[:1], reg], 0)
    elif rh == h + 1:
        reg = reg[:-1]
    if rw == w - 1:
        reg = np.concatenate([reg, reg[:, -1:]], 1)
    elif rw == w + 1:
        reg = reg[:, 1:]
    return reg


def feather_mask(box, W, H):
    x0, y0, x1, y1 = box
    m = np.ones((y1 - y0, x1 - x0), np.float32)
    ramp = (np.arange(FEATHER, dtype=np.float32) + 0.5) / FEATHER
    if x0 > 0:
        m[:, :FEATHER] *= ramp[None, :]
    if x1 < W:
        m[:, -FEATHER:] *= ramp[::-1][None, :]
    if y0 > 0:
        m[:FEATHER, :] *= ramp[:, None]
    if y1 < H:
        m[-FEATHER:, :] *= ramp[::-1][:, None]
    return m[..., None]


def darkroom(W, H, view):
    """The compositor as a darkroom: three images in, OIDN, the film's view out. Returns the images
    to fill. (No Render Layers node, so rendering runs the compositor alone.)"""
    sc = bpy.context.scene
    r = sc.render
    r.resolution_x, r.resolution_y, r.resolution_percentage = W, H, 100
    r.use_compositing = True
    r.compositor_device = 'CPU'           # (the GPU default needs a display: there is none here)
    r.compositor_denoise_device = 'CPU'
    r.compositor_precision = 'FULL'
    r.dither_intensity = 0.0
    vs = sc.view_settings
    vs.view_transform = view.get('transform', 'AgX')
    vs.look = view.get('look', 'None')
    vs.exposure = view.get('exposure', 0.0)
    vs.gamma = view.get('gamma', 1.0)
    sc.display_settings.display_device = view.get('display', 'sRGB')
    im = r.image_settings
    im.media_type = 'IMAGE'
    im.file_format = 'PNG'
    im.color_mode = 'RGB'
    im.color_depth = '16'
    im.compression = 15
    ng = bpy.data.node_groups.new('darkroom', 'CompositorNodeTree')
    ng.interface.new_socket(name='Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    den = ng.nodes.new('CompositorNodeDenoise')
    den.inputs['HDR'].default_value = True
    imgs = {}
    for key, socket in (('image', 'Image'), ('albedo', 'Albedo'), ('normal', 'Normal')):
        img = bpy.data.images.new(key, W, H, alpha=True, float_buffer=True)
        img.colorspace_settings.name = 'Non-Color' if key == 'normal' else 'Linear Rec.709'
        node = ng.nodes.new('CompositorNodeImage')
        node.image = img
        ng.links.new(node.outputs['Image'], den.inputs[socket])
        imgs[key] = img
    out = ng.nodes.new('NodeGroupOutput')
    ng.links.new(den.outputs['Image'], out.inputs['Image'])
    sc.compositing_node_group = ng
    return imgs


def develop(imgs, noisy, path):
    """Denoise one whole noisy photograph and write it through the view: float RGB, rows from the top."""
    for key, img in imgs.items():
        a = noisy[key]
        if a.shape[2] == 3:
            a = np.concatenate([a, np.ones_like(a[..., :1])], 2)
        img.pixels.foreach_set(np.ascontiguousarray(a[::-1]).ravel())
        img.update()
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return np.asarray(oiio.ImageBuf(path).get_pixels(oiio.FLOAT), np.float32)[..., :3]


def write16(path, img):
    H, W = img.shape[:2]
    buf = oiio.ImageBuf(oiio.ImageSpec(W, H, 3, oiio.UINT16))
    buf.set_pixels(oiio.ROI(0, W, 0, H, 0, 1, 0, 3), np.clip(img, 0, 1).astype(np.float32))
    if not buf.write(path):
        raise SystemExit(f'{path}: {buf.geterror()}')


def read16(path):
    return np.asarray(oiio.ImageBuf(path).get_pixels(oiio.FLOAT), np.float32)[..., :3]


def main():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not a:
        raise SystemExit(__doc__)
    d = a[0]
    opt = {a[i][2:]: a[i + 1] for i in range(1, len(a) - 1, 2)}
    meta = json.load(open(os.path.join(d, 'regions.json')))
    if meta.get('format') != 'exr':
        raise SystemExit('these regions were developed as they were rendered (--draft): assemble.py takes them as they are')
    W, H = meta['size']
    os.makedirs(os.path.join(d, 'photos'), exist_ok=True)
    n = max(int(k) for k in meta['photos']) + 1
    boxes = {}
    for u in range(n):
        info = meta['photos'].get(str(u))
        if info is None:
            raise SystemExit(f'photograph {u} is missing: render it first')
        boxes[u] = info['box']
    photo = lambda u: os.path.join(d, 'photos', f'{u:04d}.png')  # noqa: E731
    start = int(opt['from']) if 'from' in opt else next((u for u in range(n) if boxes[u] and not os.path.exists(photo(u))), n)
    if start >= n:
        print('nothing to develop', flush=True)
        return
    if start > 0 and not any(boxes[u] and os.path.exists(photo(u)) for u in range(start)):
        raise SystemExit(f'nothing developed before photograph {start}: develop from 0')
    imgs = darkroom(W, H, meta.get('view', {}))
    noisy, shown = None, None
    tmp = os.path.join(d, 'photos', 'developing.png')
    t_all = time.time()
    for u in range(n):
        box = boxes[u]
        if box is None:
            continue
        x0, y0, x1, y1 = box
        reg = read_region(os.path.join(d, 'regions', f'{u:04d}.exr'))
        if noisy is None:
            if (x1 - x0, y1 - y0) != (W, H):
                raise SystemExit('photograph 0 must be whole')
            noisy = {k: v.copy() for k, v in reg.items()}
        else:
            for k, v in reg.items():
                noisy[k][y0:y1, x0:x1] = fit(v, x1 - x0, y1 - y0)
        if u < start:
            if os.path.exists(photo(u)):
                shown = (u, photo(u))
            continue
        if isinstance(shown, tuple):
            shown = read16(shown[1])
        t0 = time.time()
        dev = develop(imgs, noisy, tmp)
        if shown is None:
            shown = dev
            note = 'whole'
        else:
            m = feather_mask(box, W, H)
            before = shown[y0:y1, x0:x1]
            after = dev[y0:y1, x0:x1]
            edge = (m[..., 0] > 0) & (m[..., 0] < 1)
            diff = np.abs(after - before).max(axis=2) * 255
            outside = np.ones((H, W), bool)
            outside[max(0, y0 - 40):y1 + 40, max(0, x0 - 40):x1 + 40] = False
            breathe = (np.abs(dev - shown).max(axis=2)[outside] * 255 > 0.5).mean() * 100
            shown = shown.copy()
            shown[y0:y1, x0:x1] = before * (1 - m) + after * m
            note = (f'edge {np.percentile(diff[edge], 99):.2f} p99 / {diff[edge].max():.2f} max levels;'
                    f' whole-frame denoise would have moved {breathe:.1f}% of the still room')
        write16(photo(u), shown)
        print(f'DEVELOPED {u:04d} {time.time() - t0:5.1f}s  {note}', flush=True)
    if os.path.exists(tmp):
        os.remove(tmp)
    print(f'DONE {time.time() - t_all:.0f}s', flush=True)


if __name__ == '__main__':
    main()
