"""How "Almost" comes through the white room's plaster: its first photograph in wool fibres, the
order they grow in, the order the colour follows, and the wall's copy of the film. Offline only.

    python3 scripts/almost/emergence.py STILL.png MASK.png [--variant film] [--film-frames N] [--out DIR]

STILL is the film's first photograph, whole: the open matte, 1280×1440 (`assemble.py --stills 0`).
MASK is masks.py's render of the same pose: R the two figures, G their hands and her folded cuff.

Writes, in public/memories/almost/:
- `<variant>/scene(.webp, @low)`: the first photograph, the wall's poster (and the film's fallback).
- `<variant>/fibres(.webp, @low)`: the picture in loose wool fibres, as if pushed through the
  plaster from behind. Each fibre follows an edge of the photograph (the lamp, the table, the
  window, the two of them) in the colour of the felt it belongs to. They are darkened enough to read on
  white plaster, and each casts a faint shadow on it.
- `<variant>/order.webp` (lossless):
  - R: when each fibre grows (0..1 of `window.sketch`), root to tip. The lamp comes first, near
    the words; the room follows; the two of them come late, and their hands last.
  - G: when the colour reaches each point (0..1 of `window.reveal`): one wash, out from under the
    lamp, never sooner than LAG seconds after its own fibres (the timeline's clocks).
- `manifest.json`: the variant's layers and its film entry.

The wall's window (src/world/MemoryWindow.ts) draws a fibre where R ≤ the sketch's progress and
colour where G ≤ the reveal's. On the way out the same order runs backwards: the two of them go
first, and the lamp is left a moment over the empty table.
"""
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'memories', 'almost')
# The painting on the wall, in metres: the film's open matte (1280×1440) at a scale where its part
# round the two of them is about as wide as the woodland's first part.
SIZE = (1.6, 1.8)
# The part the wall shows first round its line (painting uv, y up: x0, y0, w, h): the two of them,
# the lamp and the table between them.
CROP = (0.16, 0.30, 0.62, 0.50)
# Where the line is written (painting uv, y up): across the top of that part, by the lamp.
WORDS = (0.47, 0.76)
# The timeline's clocks for the fibres and the colour (src/memory/defs.ts, ALMOST's window.sketch
# and window.reveal: tests/memory-defs.test.ts holds them to these), and how long after its own
# fibres the colour may come at the soonest (s).
DRAWN = (1.5, 5.5, 'soft')
COLOURED = (5.0, 7.2, 'linear')
LAG = 0.4
FPS = 24


def soft_noise(rng, shape, sigma):
    n = cv2.GaussianBlur(rng.random(shape).astype(np.float32), (0, 0), sigma)
    return (n - n.min()) / (n.max() - n.min() + 1e-6)


def clock(kind):
    """A key's ease, Theatre's soft one or a straight one: the value at a fraction of the time, and
    the time at a fraction of the value (stroke-order.py's)."""
    if kind == 'linear':
        return (lambda x: x), (lambda y: y)
    s = np.linspace(0, 1, 2001)
    xs, ys = 1.5 * s * (1 - s) + s ** 3, 3 * s ** 2 - 2 * s ** 3
    return (lambda x: np.interp(x, xs, ys)), (lambda y: np.interp(y, ys, xs))


def edges(img):
    """The photograph's main edges, at a quarter of its width (felt's own texture smoothed away):
    a boolean map, and the edge's direction (radians, along it) at each pixel."""
    h, w = img.shape[:2]
    sw, sh = w // 4, h // 4
    small = cv2.resize(img, (sw, sh), interpolation=cv2.INTER_AREA)
    for _ in range(3):
        small = cv2.bilateralFilter(small, 7, 28, 5)
    lab = cv2.cvtColor(small, cv2.COLOR_BGR2LAB).astype(np.float32)
    gx = sum(cv2.Sobel(lab[..., c], cv2.CV_32F, 1, 0, ksize=3) * k for c, k in ((0, 1.0), (1, 1.6), (2, 1.6)))
    gy = sum(cv2.Sobel(lab[..., c], cv2.CV_32F, 0, 1, ksize=3) * k for c, k in ((0, 1.0), (1, 1.6), (2, 1.6)))
    grey = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    e = cv2.Canny(grey, 18, 46) > 0
    # colour edges the grey misses (rust jumper on brown wood)
    chroma = np.clip(np.hypot(lab[..., 1] - 128, lab[..., 2] - 128) * 2, 0, 255).astype(np.uint8)
    e |= cv2.Canny(chroma, 30, 70) > 0
    n, lab_, stats, _ = cv2.connectedComponentsWithStats(e.astype(np.uint8), connectivity=8)
    keep = np.zeros(n, bool)
    keep[1:] = stats[1:, cv2.CC_STAT_AREA] >= 10
    e = keep[lab_]
    along = np.arctan2(gy, gx) + np.pi / 2
    return e, along, (sw, sh)


def tone(bgr):
    """A fibre's colour from the felt's: as itself, but never lighter than reads on white plaster,
    nor darker than wool is, and a little more saturated."""
    lab = cv2.cvtColor(np.uint8([[bgr]]), cv2.COLOR_BGR2LAB).astype(np.float32)[0, 0]
    L = np.clip(lab[0] * 0.92, 60, 175)
    a = 128 + (lab[1] - 128) * 1.25
    b = 128 + (lab[2] - 128) * 1.25
    out = cv2.cvtColor(np.uint8([[[L, np.clip(a, 0, 255), np.clip(b, 0, 255)]]]), cv2.COLOR_LAB2BGR)[0, 0]
    return [int(x) for x in out]


def fibres(img, mask, rng):
    """The fibres: (points (n, 2) in photograph px, width px, colour BGR, its place for the order)."""
    H, W = img.shape[:2]
    e, along, (sw, sh) = edges(img)
    k = W / sw
    ys, xs = np.nonzero(e)
    pick = rng.random(len(xs)) < 0.55
    out = []
    smooth = cv2.GaussianBlur(img, (0, 0), 2.5)
    for x, y in zip(xs[pick], ys[pick]):
        cx, cy = (x + 0.5) * k + rng.normal(0, 1.4), (y + 0.5) * k + rng.normal(0, 1.4)
        th = along[y, x] + rng.normal(0, 0.32)
        out.append(fibre(smooth, mask, cx, cy, th, rng.uniform(13, 34), rng))
    # A few loose fibres laid over the two of them, the felt itself: its mass, not only its edges.
    # (Spread over everything, they read as clippings on the plaster.)
    fig = cv2.resize(mask[..., 2], (sw, sh), interpolation=cv2.INTER_AREA) / 255.0
    p = np.clip(0.0008 + 0.035 * fig, 0, 0.05)
    ys, xs = np.nonzero(rng.random((sh, sw)) < p)
    for x, y in zip(xs, ys):
        cx, cy = (x + rng.random()) * k, (y + rng.random()) * k
        out.append(fibre(smooth, mask, cx, cy, rng.uniform(0, np.pi), rng.uniform(9, 24), rng, loose=True))
    return out


def fibre(smooth, mask, cx, cy, th, length, rng, loose=False):
    H, W = smooth.shape[:2]
    d = np.array([np.cos(th), np.sin(th)])
    nrm = np.array([-d[1], d[0]])
    s = np.linspace(-0.5, 0.5, 14)
    bend = rng.normal(0, 0.22 if not loose else 0.4) * length
    wav = rng.uniform(0.3, 1.0) * np.sin(s * rng.uniform(5, 11) + rng.uniform(0, 6.3))
    pts = np.array([cx, cy]) + np.outer(s * length, d) + np.outer(bend * (s * s - 0.25) + wav, nrm)
    ix, iy = int(np.clip(cx, 0, W - 1)), int(np.clip(cy, 0, H - 1))
    col = tone(smooth[iy, ix].tolist())
    # (Which end is its root: random. It grows from there to its tip.)
    if rng.random() < 0.5:
        pts = pts[::-1]
    width = rng.uniform(1.1, 1.8) if not loose else rng.uniform(0.9, 1.4)
    return {'pts': pts, 'width': width, 'col': col, 'alpha': rng.uniform(0.78, 0.97) if not loose else rng.uniform(0.45, 0.7),
            'at': (cx, cy), 'figure': mask[iy, ix, 2] / 255.0, 'hand': mask[iy, ix, 1] / 255.0}


def draw(fs, T, rng):
    """The fibres drawn (RGBA, straight alpha) at twice the size and brought down, with their
    faint shadows on the plaster, and each pixel's R: when it grows (T where no fibre is)."""
    H, W = T.shape
    S = 2
    rgb = np.zeros((H * S, W * S, 3), np.float32)
    alpha = np.zeros((H * S, W * S), np.float32)
    shadow = np.zeros((H * S, W * S), np.float32)
    R = cv2.resize(T, (W * S, H * S), interpolation=cv2.INTER_LINEAR)
    # Earliest last, so it is what each pixel keeps (a pixel grows with its first fibre).
    for f in sorted(fs, key=lambda f: -f['t0']):
        p = (f['pts'] * S * 16).astype(np.int32)
        w = max(1, int(round(f['width'] * S)))
        n = len(p)
        for i in range(n - 1, 0, -1):
            r = f['t0'] + f['grow'] * i / (n - 1)
            cv2.line(R, tuple(p[i - 1]), tuple(p[i]), float(r), w + 2, cv2.LINE_8, shift=4)
    for f in fs:
        p = (f['pts'] * S * 16).astype(np.int32)
        w = max(1, int(round(f['width'] * S)))
        one = np.zeros((H * S, W * S), np.uint8)
        x0, y0 = np.floor(f['pts'].min(0) * S).astype(int) - 6
        x1, y1 = np.ceil(f['pts'].max(0) * S).astype(int) + 6
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, W * S), min(y1, H * S)
        if x1 <= x0 or y1 <= y0:
            continue
        cv2.polylines(one, [p], False, 255, w, cv2.LINE_AA, shift=4)
        a = one[y0:y1, x0:x1].astype(np.float32) / 255 * f['alpha']
        # (wool is never one colour along its length)
        c = np.array(f['col'], np.float32) * rng.uniform(0.9, 1.08)
        rgb[y0:y1, x0:x1] = rgb[y0:y1, x0:x1] * (1 - a[..., None]) + c * a[..., None]
        alpha[y0:y1, x0:x1] = alpha[y0:y1, x0:x1] * (1 - a) + a
        sh = np.zeros_like(a)
        sh[3:, 2:] = a[:-3, :-2]
        shadow[y0:y1, x0:x1] = np.maximum(shadow[y0:y1, x0:x1], sh)
    shadow = cv2.GaussianBlur(shadow, (0, 0), 2.2) * 0.32
    # the shadow lies under the fibres: black, where no fibre is
    out_a = alpha + shadow * (1 - alpha)
    out_rgb = rgb * (alpha / np.maximum(out_a, 1e-4))[..., None]
    rgba = np.dstack([out_rgb, out_a * 255])
    rgba = cv2.resize(rgba, (W, H), interpolation=cv2.INTER_AREA)
    # R: the earliest fibre over each pixel (its antialiased edge with it)
    R = cv2.erode(R, np.ones((3, 3), np.uint8))
    R = cv2.resize(R, (W, H), interpolation=cv2.INTER_AREA)
    return rgba, R


def main():
    a = sys.argv[1:]
    if len(a) < 2:
        raise SystemExit(__doc__)
    still, mask_path = a[0], a[1]
    opt = {a[i][2:]: a[i + 1] for i in range(2, len(a) - 1, 2)}
    variant = opt.get('variant', 'film')
    frames = int(opt.get('film-frames', 744))
    img = cv2.imread(still, cv2.IMREAD_COLOR)
    H, W = img.shape[:2]
    mask = cv2.resize(cv2.imread(mask_path, cv2.IMREAD_COLOR), (W, H), interpolation=cv2.INTER_LINEAR)
    rng = np.random.default_rng(7)
    fs = fibres(img, mask, rng)
    # When the fibres grow at each point: out from the words, the lamp near them first; the two of
    # them late, their hands last (a little noise, so the front is never a ring). Each fibre from
    # its root to its tip, a twentieth of the way.
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    ox, oy = WORDS[0] * W, (1 - WORDS[1]) * H
    reach = np.hypot(xx - ox, yy - oy)
    grain = cv2.resize(soft_noise(rng, (H // 8, W // 8), 3), (W, H), interpolation=cv2.INTER_LINEAR)
    fig = cv2.GaussianBlur(mask[..., 2].astype(np.float32) / 255, (0, 0), 6)
    hands = cv2.GaussianBlur(mask[..., 1].astype(np.float32) / 255, (0, 0), 10)
    T = 0.62 * reach / reach.max() + 0.16 * grain + 0.34 * fig + 0.28 * np.clip(hands * 2, 0, 1)
    T = (0.02 + 0.80 * (T - T.min()) / (T.max() - T.min())).astype(np.float32)
    for f in fs:
        x, y = f['at']
        f['t0'] = float(T[int(np.clip(y, 0, H - 1)), int(np.clip(x, 0, W - 1))])
        f['grow'] = 0.05
    rgba, R = draw(fs, T, rng)
    R = np.clip(R, 0, 1)
    # The colour: one wash out from under the lamp (the pool on the table between them), broken
    # softly; as much of the picture takes it in each moment as in any other (stroke-order.py).
    lx, ly = 0.47 * W, (1 - 0.62) * H
    G = np.hypot(xx - lx, (yy - ly) * 0.8)
    G = G / G.max() + 0.15 * (cv2.resize(soft_noise(rng, (H // 8, W // 8), 4), (W, H)) - 0.5)
    flat = G.ravel()
    rank = np.empty(flat.size, np.float32)
    rank[np.argsort(flat, kind='stable')] = np.arange(flat.size, dtype=np.float32) / (flat.size - 1)
    G = 0.12 + 0.82 * rank.reshape(G.shape)
    # never sooner than LAG s after its fibres (on the two clocks)
    _, drawn_at = clock(DRAWN[2])
    coloured_by, _ = clock(COLOURED[2])
    drawn = DRAWN[0] + (DRAWN[1] - DRAWN[0]) * drawn_at(cv2.GaussianBlur(R, (0, 0), 8))
    soonest = coloured_by(np.clip((drawn + LAG - COLOURED[0]) / (COLOURED[1] - COLOURED[0]), 0, 1))
    held = float(np.mean(soonest > G + 0.01))
    G = np.maximum(G, soonest)
    out = opt.get('out', OUT)
    d = os.path.join(out, variant)
    os.makedirs(d, exist_ok=True)
    # the poster
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    Image.fromarray(rgb).save(os.path.join(d, 'scene.webp'), 'WEBP', quality=90, method=6)
    Image.fromarray(rgb).resize((W // 2, H // 2), Image.LANCZOS).save(os.path.join(d, 'scene@low.webp'), 'WEBP', quality=88, method=6)
    # the fibres (RGBA, straight alpha: the runtime premultiplies when decoding)
    fib = np.clip(rgba, 0, 255).astype(np.uint8)
    fib = cv2.cvtColor(fib, cv2.COLOR_BGRA2RGBA)
    Image.fromarray(fib, 'RGBA').save(os.path.join(d, 'fibres.webp'), 'WEBP', quality=92, method=6)
    Image.fromarray(fib, 'RGBA').resize((W // 2, H // 2), Image.LANCZOS).save(os.path.join(d, 'fibres@low.webp'), 'WEBP', quality=90, method=6)
    order = (np.dstack([R, G, np.zeros_like(G)]) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(order, 'RGB').save(os.path.join(d, 'order.webp'), 'WEBP', lossless=True, method=6)
    path = os.path.join(out, 'manifest.json')
    manifest = json.load(open(path)) if os.path.exists(path) else {}
    manifest.update({'size': list(SIZE), 'band': 0, 'pane': None, 'register': None, 'crop': list(CROP), 'plate': [W, H]})
    src = 'photographed from the felt puppets in Blender (scripts/almost/)'
    manifest.setdefault('variants', {})[variant] = [
        {'name': 'scene', 'kind': 'pigment', 'file': f'{variant}/scene', 'source': src},
        {'name': 'fibres', 'kind': 'sketch', 'file': f'{variant}/fibres', 'source': src + ', its edges in wool fibres (emergence.py)'},
    ]
    manifest.setdefault('living', {})[variant] = {
        'kind': 'film', 'film': f'{variant}/film', 'fps': FPS, 'frames': frames, 'order': f'{variant}/order', 'immerse': True,
        'orderClocks': {'drawn': list(DRAWN), 'coloured': list(COLOURED), 'lag': LAG},
    }
    with open(path, 'w') as fh:
        json.dump(manifest, fh, indent=2)
        fh.write('\n')
    cover = float((fib[..., 3] > 40).mean())
    print(f'emergence: {len(fs)} fibres over {cover:.1%} of the picture; the colour held for its fibres over {held:.1%}; '
          f'R {R.min():.2f}..{R.max():.2f}, G {G.min():.2f}..{G.max():.2f}')


if __name__ == '__main__':
    main()
