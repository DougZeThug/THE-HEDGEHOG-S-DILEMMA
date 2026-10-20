"""Assemble "Almost" from its photographs: the film, its crops and its stills.

    python3 scripts/almost/assemble.py DIR [--wide OUT.mp4] [--tall OUT.mp4] [--stills N,N,...] [--audio WAV]
                                           [--web DIR]

DIR is render.py's output:
- a final render: the photographs `develop.py` made of it, DIR/photos/NNNN.png (16-bit);
- a draft (--draft): regions/NNNN.png, each the one before it with its region pasted in, the
  region's outer edge feathered into the photograph before, where nothing changed.

Frames follow the exposure sheet (24 fps), so a held photograph is the same picture. They are made
8-bit with a dither that is the same in every frame, so what stands still stays the same to the bit.

The crops:
- `--wide`: the 16:9 band across the middle of the open matte;
- `--tall`: the 9:16 crop round the two figures, for upright phones.

`--stills` writes those photographs whole, as DIR/stills/NNNN.png.

`--web DIR` writes the white room's copies of the whole open matte, silent (its sound is two cues):
DIR/film.webm (VP9) and DIR/film.mp4 (H.264), and the phone set at half size (film@low.*). A
keyframe where a new photograph begins, about a second apart, keeps seeking cheap (the room pauses
and seeks the film when it is held); none inside a hold, where it would make the still room pulse.
"""
import json
import os
import subprocess
import sys

import cv2
import numpy as np

FEATHER = 10
FIGURES_X = 0.5         # between their faces, under the lamp (for the upright crop: her beanie and his elbow both in)


def crops(W, H):
    bh = int(round(W * 9 / 16 / 2)) * 2
    wide = (0, (H - bh) // 2, W, (H - bh) // 2 + bh)
    tw = int(round(H * 9 / 16 / 2)) * 2
    cx = int(round(W * FIGURES_X))
    x0 = max(0, min(W - tw, cx - tw // 2))
    tall = (x0, 0, x0 + tw, H)
    return {'wide': wide, 'tall': tall}


def feather_mask(box, W, H):
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    m = np.ones((h, w), np.float32)
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


def fit(reg, w, h, u):
    """A region as its box. (Before render.py placed its border half a pixel in, Blender's
    truncation could lose the box's top row or right column, or add a row below or a column to
    the left: one pixel, inside the feather, put right here.)"""
    rh, rw = reg.shape[:2]
    if abs(rh - h) > 1 or abs(rw - w) > 1:
        raise SystemExit(f'region {u}: {rw}x{rh} on disk, box {w}x{h}')
    if rh == h - 1:
        reg = np.concatenate([reg[:1], reg], 0)
    elif rh == h + 1:
        reg = reg[:-1]
    if rw == w - 1:
        reg = np.concatenate([reg, reg[:, -1:]], 1)
    elif rw == w + 1:
        reg = reg[:, 1:]
    return reg


def photos(d, meta):
    """Yield (index, photograph) in order: float BGR, 0-255. A photograph without a region is the one
    before it."""
    W, H = meta['size']
    cur = None
    n = max(int(k) for k in meta['photos']) + 1
    developed = meta.get('format') == 'exr'
    for u in range(n):
        info = meta['photos'].get(str(u))
        if info is None:
            raise SystemExit(f'photograph {u} is missing: render it first')
        box = info['box']
        if box is not None and developed:
            path = os.path.join(d, 'photos', f'{u:04d}.png')
            if not os.path.exists(path):
                raise SystemExit(f'photograph {u} is not developed: run develop.py')
            cur = cv2.imread(path, cv2.IMREAD_UNCHANGED)[..., :3].astype(np.float32) / 257.0
        elif box is not None:
            reg = cv2.imread(os.path.join(d, 'regions', f'{u:04d}.png'), cv2.IMREAD_UNCHANGED)
            if reg.shape[2] == 4:
                reg = reg[..., :3]
            x0, y0, x1, y1 = box
            reg = fit(reg, x1 - x0, y1 - y0, u)
            if cur is None:
                if (x1 - x0, y1 - y0) != (W, H):
                    raise SystemExit('photograph 0 must be whole')
                cur = reg.astype(np.float32)
            else:
                m = feather_mask(box, W, H)
                cur = cur.copy()
                cur[y0:y1, x0:x1] = cur[y0:y1, x0:x1] * (1 - m) + reg.astype(np.float32) * m
        yield u, cur


# BT.709 both ways: converted with its matrix, and tagged so (FFmpeg converts with BT.601 unless
# told, and browsers decode untagged HD video as BT.709: the colours shift).
TAGS = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv']


def encoder(path, w, h, fps, audio=None, scale=None):
    vf = ['scale=out_color_matrix=bt709:out_range=tv', 'format=yuv420p']
    if scale:
        vf[0] = f'scale={scale[0]}:{scale[1]}:flags=lanczos:out_color_matrix=bt709:out_range=tv'
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{w}x{h}', '-r', str(fps), '-i', '-']
    if audio:
        cmd += ['-i', audio, '-c:a', 'aac', '-b:a', '192k', '-shortest']
    cmd += ['-vf', ','.join(vf), '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-r', str(fps), *TAGS, '-movflags', '+faststart', path]
    return subprocess.Popen(cmd, stdin=subprocess.PIPE)


def keyframes(frames, fps):
    """Where the web files start a keyframe (s): only where a new photograph begins, at least a
    second apart. (A keyframe inside a hold encodes the still room afresh, and it pulsed once a
    second through a film that is half holds: the skeptic's review, 2026-10-20.)"""
    out, last = [0], 0
    for f in range(1, len(frames)):
        if frames[f] != frames[f - 1] and f - last >= fps:
            out.append(f)
            last = f
    return [f / fps for f in out]


def web_encoders(d, w, h, fps, keys):
    """The white room's four copies (src/memory/living/FilmScene.ts plays whichever the browser can),
    keyframes at `keys` (s) and nowhere else."""
    os.makedirs(d, exist_ok=True)
    out = []
    kf = ['-g', '100000', '-force_key_frames', ','.join(f'{t:.4f}' for t in keys)]
    for suffix, (ww, hh) in (('', (w, h)), ('@low', (w // 2, h // 2))):
        base = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{w}x{h}', '-r', str(fps), '-i', '-',
                '-vf', f'scale={ww}:{hh}:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p', '-an', '-r', str(fps), *kf, *TAGS]
        vp9 = base + ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '31' if not suffix else '33', '-row-mt', '1', '-tile-columns', '2',
                      '-deadline', 'good', '-cpu-used', '2', os.path.join(d, f'film{suffix}.webm')]
        h264 = base + ['-c:v', 'libx264', '-crf', '20' if not suffix else '22', '-preset', 'slow', '-profile:v', 'high', '-level', '4.0',
                       '-sc_threshold', '0', '-movflags', '+faststart', os.path.join(d, f'film{suffix}.mp4')]
        out += [subprocess.Popen(vp9, stdin=subprocess.PIPE), subprocess.Popen(h264, stdin=subprocess.PIPE)]
    return out


def main():
    a = sys.argv[1:]
    d = a[0]
    opt = {a[i][2:]: a[i + 1] for i in range(1, len(a) - 1, 2)}
    meta = json.load(open(os.path.join(d, 'regions.json')))
    W, H = meta['size']
    fps = meta['fps']
    frames = meta['frames']
    C = crops(W, H)
    outs = {}
    for name in ('wide', 'tall'):
        if name in opt:
            x0, y0, x1, y1 = C[name]
            scale = (720, 1280) if name == 'tall' and (x1 - x0) > 720 else None
            outs[name] = (encoder(opt[name], x1 - x0, y1 - y0, fps, opt.get('audio'), scale), C[name])
    webs = web_encoders(opt['web'], W, H, fps, keyframes(frames, fps)) if 'web' in opt else []
    stills = {int(x) for x in opt.get('stills', '').split(',') if x}
    if stills:
        os.makedirs(os.path.join(d, 'stills'), exist_ok=True)
    dither = np.random.default_rng(7).random((H, W, 1), np.float32)
    gen = photos(d, meta)
    u, cur = next(gen)
    img = np.clip(np.floor(cur + dither), 0, 255).astype(np.uint8)
    if u in stills:
        cv2.imwrite(os.path.join(d, 'stills', f'{u:04d}.png'), img)
    for f in frames:
        while u < f:
            u, cur = next(gen)
            img = np.clip(np.floor(cur + dither), 0, 255).astype(np.uint8)
            if u in stills:
                cv2.imwrite(os.path.join(d, 'stills', f'{u:04d}.png'), img)
        for p, (x0, y0, x1, y1) in outs.values():
            p.stdin.write(np.ascontiguousarray(img[y0:y1, x0:x1]).tobytes())
        whole = img.tobytes() if webs else None
        for p in webs:
            p.stdin.write(whole)
    for p in [q for q, _ in outs.values()] + webs:
        p.stdin.close()
        p.wait()
    print('assembled', len(frames), 'frames', {k: v[1] for k, v in outs.items()})


if __name__ == '__main__':
    main()
