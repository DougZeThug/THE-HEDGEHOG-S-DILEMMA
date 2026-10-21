"""How "Things I Should Have Said" comes onto the white room's wall (docs/things.md): the wall draws
the goodbye itself, as the film did, and the film takes over from the drawing finished. Offline.

    python3 scripts/things/emergence.py FILM_DIR

FILM_DIR is story.py's full-size output (`things.mp4`, `sheet.json`). Writes, in
public/memories/things/:
- `film/scene(.webp, @low)`: the goodbye as finished, the film's first frame (FROM s into the
  drawing): the wall's poster (and the film's fallback).
- `film/lines(.webp, @low)`: the goodbye's pencil and charcoal lines alone (the doorway's
  construction, the contours), on nothing: the plaster and the room's writing show through.
- `film/order.webp` (lossless):
  - R: when each line is drawn (0..1 of `window.sketch`), each mark along its length, in the
    order and at the pace the film's own draw-on made them (story.py: film.draw_on).
  - G: when the tone comes (0..1 of `window.reveal`), each place when the film's hand first
    worked it; the paper the drawing never touched last.
- `film/film(.webm, .mp4, @low)`: the film from FROM s, silent.
- `manifest.json`: the variant's layers and its film entry.
And public/music/things-film.mp3: the film's sound from FROM s (foley.py, the eraser-only mix,
without the film's own small room: the white room is the room), and things-sound.json: what it
was made from.

The wall's window (src/world/MemoryWindow.ts) draws a line where R <= the sketch's progress and
the tone where G <= the reveal's. So on the wall the drawing goes on as it did on the sheet: the
construction, then each of them, tone and then lines; earlier marks (the room's own writing) stay
under it until the tone comes.
"""
import json
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import foley  # noqa: E402
from paper import PAPER_RGB, TOOLS, Sheet  # noqa: E402
from timeline import _apply_part  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'public', 'memories', 'things')
MUSIC = os.path.join(ROOT, 'public', 'music')
W, H = 1280, 1440
# The painting on the wall, in metres, and the part the wall shows first round its line (painting
# uv, y up: x0, y0, w, h): the doorway and her.
SIZE = (1.6, 1.8)
CROP = (0.16, 0.26, 0.66, 0.46)
# How far into the drawing the film takes over: the goodbye finished (story.py's draw-on is 0-6 s).
FROM = 6.0
# The timeline's clocks for the lines and the tone (src/memory/defs.ts, THINGS's window.sketch and
# window.reveal: tests/memory-defs.test.ts holds them to these): both the draw-on's own 6 s.
DRAWN = (1.5, 7.5, 'linear')
COLOURED = (1.5, 7.5, 'linear')
LINES = ('construct', 'contour', 'face')
INK = np.array([46, 44, 42], np.float32)        # the lines layer's colour (its alpha does the rest)


def footprint(sheet, m):
    """Where a mark lies on the sheet and how far along it each pixel is: (coverage, along, box)."""
    q = np.asarray(m['pts'], np.float32)
    if len(q) < 2:
        return None
    if m['kind'] == 'stroke':
        T = TOOLS[m['tool']]
        p = np.asarray(m.get('pressure') or [1.0], np.float32)
        p = np.interp(np.linspace(0, 1, len(q)), np.linspace(0, 1, len(p)), p) if len(p) > 1 else np.full(len(q), p[0], np.float32)
        width = (T['width'] * m.get('size', 1.0) * (T['wmin'] + (1 - T['wmin']) * p)).astype(np.float32)
        soft = T['soft']
    else:
        width = np.full(len(q), m['width'], np.float32)
        soft = 0.45
    mk, along, box = sheet._mask(q, width, soft)
    return None if mk is None else (mk, along, box)


def times(sheet, items, keep, t0, t1):
    """The clock fraction (0..1 of t0..t1) at which each pixel is first touched by a kept mark."""
    out = np.full((H, W), np.inf, np.float32)
    for a, b, m in items:
        if not keep(m) or m['kind'] == 'smudge':
            continue
        f = footprint(sheet, m)
        if f is None:
            continue
        mk, along, (x0, y0, x1, y1) = f
        t = a + np.clip(along, 0, 1) * (b - a)
        t = np.where(mk > 0.08, t, np.inf)
        out[y0:y1, x0:x1] = np.minimum(out[y0:y1, x0:x1], t)
    return np.clip((out - t0) / (t1 - t0), 0, 1), np.isfinite(out)


def sha256(path):
    import hashlib
    with open(path, 'rb') as fh:
        return hashlib.sha256(fh.read()).hexdigest()[:16]


def save_webp(path, img, lossless=False, quality=90):
    im = Image.fromarray(img)
    im.save(path + '.webp', lossless=lossless, quality=quality, method=6)


def main():
    film_dir = sys.argv[1]
    os.makedirs(os.path.join(OUT, 'film'), exist_ok=True)
    data = json.load(open(os.path.join(film_dir, 'sheet.json')))
    items = sorted([(it['t0'], it['t1'], it['mark']) for it in data['items']], key=lambda r: (r[0], r[1]))
    drawn = [r for r in items if r[0] < FROM + 1e-6 and r[1] <= FROM + 0.5 and r[2]['name'].startswith('goodbye/')]
    sheet = Sheet(W, H, 'things')
    # the lines alone, on nothing
    lines = Sheet(W, H, 'things')
    for a, b, m in drawn:
        if m['layer'] in LINES:
            _apply_part(lines, m, (0.0, 1.0))
    rgb = lines.render()
    dark = 1 - (rgb.mean(2) / PAPER_RGB.mean())
    alpha = np.clip(dark * 1.15, 0, 1)
    rgba = np.dstack([np.broadcast_to(INK, (H, W, 3)), alpha * 255]).astype(np.uint8)
    save_webp(os.path.join(OUT, 'film', 'lines'), rgba, quality=92)
    save_webp(os.path.join(OUT, 'film', 'lines@low'), cv2.resize(rgba, (W // 2, H // 2), interpolation=cv2.INTER_AREA), quality=90)
    # the order: R when each line is drawn, G when each place is first worked
    r, rhas = times(sheet, drawn, lambda m: m['layer'] in LINES, 0.0, FROM)
    g, ghas = times(sheet, drawn, lambda m: True, 0.0, FROM)
    r = np.where(rhas, r, 1.0)
    rng = np.random.default_rng(3)
    late = 0.85 + 0.15 * cv2.GaussianBlur(rng.random((H, W)).astype(np.float32), (0, 0), 30) * 4
    g = np.where(ghas, g, np.clip(late, 0, 1))
    order = np.dstack([np.round(r * 255), np.round(g * 255), np.zeros((H, W))]).astype(np.uint8)
    save_webp(os.path.join(OUT, 'film', 'order'), order, lossless=True)
    # the poster: the film's frame at FROM
    mp4 = os.path.join(film_dir, 'things.mp4')
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-ss', f'{FROM:.4f}', '-i', mp4, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                         capture_output=True, check=True).stdout
    poster = np.frombuffer(raw, np.uint8).reshape(H, W, 3)
    save_webp(os.path.join(OUT, 'film', 'scene'), poster, quality=90)
    save_webp(os.path.join(OUT, 'film', 'scene@low'), cv2.resize(poster, (W // 2, H // 2), interpolation=cv2.INTER_AREA), quality=88)
    # the film from FROM, silent, at both sizes and in both kinds
    base = os.path.join(OUT, 'film', 'film')
    for sfx, scale in (('', None), ('@low', '640:720')):
        vf = ['-vf', f'scale={scale}'] if scale else []
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', f'{FROM:.4f}', '-i', mp4, '-an', *vf, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36',
                        '-row-mt', '1', '-g', '48', '-pix_fmt', 'yuv420p', base + sfx + '.webm'], check=True)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', f'{FROM:.4f}', '-i', mp4, '-an', *vf, '-c:v', 'libx264', '-crf', '26', '-preset', 'slow', '-profile:v', 'high',
                        '-g', '48', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', base + sfx + '.mp4'], check=True)
    frames = int(subprocess.run(['ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0',
                                 base + '.mp4'], capture_output=True, text=True, check=True).stdout.strip())
    # the sound from FROM: the eraser and the latch, no room of its own
    snd = foley.foley(items, data['length'], [tuple(e) for e in data.get('events', [])], mix_name='eraser-only', with_room=False)
    snd = snd[int(FROM * foley.SR):]
    pcm = (np.clip(snd, -1, 1) * 32767).astype('<i2').tobytes()
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(foley.SR), '-ac', '2', '-i', '-', '-c:a', 'libmp3lame', '-b:a', '160k',
                    os.path.join(MUSIC, 'things-film.mp3')], input=pcm, check=True)
    # what the sound was made from (tests/film-scene.test.ts: change them and make it again)
    with open(os.path.join(MUSIC, 'things-sound.json'), 'w') as fh:
        json.dump({'story': sha256(os.path.join(HERE, 'story.py')), 'foley': sha256(os.path.join(HERE, 'foley.py'))}, fh, indent=1)
        fh.write('\n')
    manifest = {
        'size': list(SIZE), 'band': 0, 'pane': None, 'register': None, 'crop': list(CROP), 'plate': [W, H],
        'variants': {'film': [
            {'name': 'scene', 'kind': 'pigment', 'file': 'film/scene', 'source': 'drawn on a simulated sheet from a Blender reference (scripts/things/)'},
            {'name': 'lines', 'kind': 'sketch', 'file': 'film/lines', 'source': "the goodbye's lines, drawn on the wall in the film's own order (scripts/things/emergence.py)"},
        ]},
        'living': {'film': {'kind': 'film', 'film': 'film/film', 'fps': 24, 'frames': frames, 'order': 'film/order', 'immerse': True, 'edge': 'soft',
                            'orderClocks': {'drawn': list(DRAWN), 'coloured': list(COLOURED), 'lag': 0.0}}},
    }
    with open(os.path.join(OUT, 'manifest.json'), 'w') as fh:
        json.dump(manifest, fh, indent=2)
        fh.write('\n')
    print(f'frames {frames} ({frames / 24:.2f} s); lines {alpha.mean():.3f} mean alpha; order R lines {rhas.mean():.3f}, G worked {ghas.mean():.3f}')


if __name__ == '__main__':
    main()
