"""How "Almost" comes through the white room's plaster: its first photograph in wool fibres, the
order they grow in, the order the colour follows, and the wall's copy of the film. Offline only.

    python3 scripts/almost/emergence.py STILL.png MASK.png [--variant film] [--film-frames N] [--out DIR]

(N defaults to the exposure sheet's length.)

STILL is the film's first photograph, whole: the open matte, 1280×1440 (`assemble.py --stills 0`).
MASK is masks.py's render of the same pose: R the two figures, G their hands and her folded cuff.

Writes, in public/memories/almost/:
- `<variant>/scene(.webp, @low)`: the first photograph, the wall's poster (and the film's fallback).
- `<variant>/fibres(.webp, @low)`: the picture in loose wool, as if pushed through the plaster from
  behind: fine strands felted over the whole of it, each in the colour under it made paler, lying
  every way with a little curl, thickest where the picture has mass. Each casts a faint shadow.
- `<variant>/order.webp` (lossless):
  - R: when each fibre grows (0..1 of `window.sketch`), root to tip. The lamp comes first, near
    the words; the room follows; the two of them come late, and their hands last.
  - G: when the colour reaches each point (0..1 of `window.reveal`): through the wool, where it has
    grown, a soft wash never sooner than LAG seconds after its own fibres (the timeline's clocks).
- `manifest.json`: the variant's layers and its film entry.

The wall's window (src/world/MemoryWindow.ts) draws a fibre where R ≤ the sketch's progress and
colour where G ≤ the reveal's. On the way out nothing runs backwards: the colour sinks into the
wool all at once, then the wool into the plaster (the layers' opacities on the timeline). (Run
backwards, the two of them went first and left the lamp over an empty table: the woodland's ending
again, and a story the brief does not tell.)
"""
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import xsheet  # noqa: E402

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


def tone(bgr, lift):
    """A fibre's colour from the picture's: paler, as wool catching the light is (`lift` of the way
    to white), but never so pale it is lost on white plaster, nor darker than wool is."""
    lab = cv2.cvtColor(np.uint8([[bgr]]), cv2.COLOR_BGR2LAB).astype(np.float32)[0, 0]
    L = np.clip(lab[0] + (255 - lab[0]) * lift, 70, 196)
    a = 128 + (lab[1] - 128) * 1.1
    b = 128 + (lab[2] - 128) * 1.1
    out = cv2.cvtColor(np.uint8([[[L, np.clip(a, 0, 255), np.clip(b, 0, 255)]]]), cv2.COLOR_LAB2BGR)[0, 0]
    return [int(x) for x in out]


def fibres(img, mask, rng):
    """The picture as loose wool: fine strands felted over the whole of it, each in the colour of the
    felt or the wood or the night under it, paler, lying every way with a little curl, as roving
    does; thicker where the picture has mass (its darks and its colours), thinnest on the lamp's
    glow. (Strands laid along its edges read as a drawing filter, worms drawn round its shapes: the
    skeptic's review, 2026-10-20.) Returns [{pts, width, col, alpha, at, figure, hand}]."""
    H, W = img.shape[:2]
    smooth = cv2.GaussianBlur(img, (0, 0), 3.0)
    lab = cv2.cvtColor(smooth, cv2.COLOR_BGR2LAB).astype(np.float32)
    mass = 0.55 * (1 - lab[..., 0] / 255) + 0.45 * np.clip(np.hypot(lab[..., 1] - 128, lab[..., 2] - 128) / 40, 0, 1)
    mass = cv2.GaussianBlur(mass, (0, 0), 12)
    flow = soft_noise(rng, (H // 24, W // 24), 2.0)
    flow = cv2.resize(flow, (W, H), interpolation=cv2.INTER_LINEAR) * 2 * np.pi
    # a jittered grid, kept in proportion to the picture's mass
    step = 4.2
    gy, gx = np.mgrid[0:H:step, 0:W:step]
    gx = np.clip(gx.ravel() + rng.uniform(0, step, gx.size), 0, W - 1)
    gy = np.clip(gy.ravel() + rng.uniform(0, step, gy.size), 0, H - 1)
    ix, iy = gx.astype(int), gy.astype(int)
    keep = rng.random(gx.size) < 0.18 + 0.82 * mass[iy, ix]
    out = []
    for x, y in zip(gx[keep], gy[keep]):
        out.append(fibre(smooth, mask, x, y, flow[int(y), int(x)] + rng.normal(0, 0.55), rng.uniform(7, 19), rng))
    return out


def fibre(smooth, mask, cx, cy, th, length, rng):
    H, W = smooth.shape[:2]
    d = np.array([np.cos(th), np.sin(th)])
    nrm = np.array([-d[1], d[0]])
    s = np.linspace(-0.5, 0.5, 10)
    bend = rng.normal(0, 0.3) * length
    wav = rng.uniform(0.2, 0.7) * np.sin(s * rng.uniform(5, 11) + rng.uniform(0, 6.3))
    pts = np.array([cx, cy]) + np.outer(s * length, d) + np.outer(bend * (s * s - 0.25) + wav, nrm)
    ix, iy = int(np.clip(cx, 0, W - 1)), int(np.clip(cy, 0, H - 1))
    col = tone(smooth[iy, ix].tolist(), rng.uniform(0.18, 0.42))
    # (Which end is its root: random. It grows from there to its tip.)
    if rng.random() < 0.5:
        pts = pts[::-1]
    return {'pts': pts, 'width': rng.uniform(0.6, 1.0), 'col': col, 'alpha': rng.uniform(0.55, 0.85),
            'at': (cx, cy), 'figure': mask[iy, ix, 2] / 255.0, 'hand': mask[iy, ix, 1] / 255.0}


def draw(fs, T, rng):
    """The fibres drawn (RGBA, straight alpha) at twice the size and brought down, each with a faint
    shadow on the plaster (a strand standing off it, not a drawn line), and each pixel's R: when it
    grows (T where no fibre is)."""
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
        w = max(1, int(round(f['width'] * S)))
        x0, y0 = np.floor(f['pts'].min(0) * S).astype(int) - 4
        x1, y1 = np.ceil(f['pts'].max(0) * S).astype(int) + 4
        cx0, cy0, cx1, cy1 = max(x0, 0), max(y0, 0), min(x1, W * S), min(y1, H * S)
        if cx1 <= cx0 or cy1 <= cy0:
            continue
        one = np.zeros((y1 - y0, x1 - x0), np.uint8)
        cv2.polylines(one, [((f['pts'] * S - [x0, y0]) * 16).astype(np.int32)], False, 255, w, cv2.LINE_AA, shift=4)
        a = one[cy0 - y0:cy1 - y0, cx0 - x0:cx1 - x0].astype(np.float32) / 255 * f['alpha']
        # (wool is never one colour along its length)
        c = np.array(f['col'], np.float32) * rng.uniform(0.94, 1.06)
        rgb[cy0:cy1, cx0:cx1] = rgb[cy0:cy1, cx0:cx1] * (1 - a[..., None]) + c * a[..., None]
        alpha[cy0:cy1, cx0:cx1] = alpha[cy0:cy1, cx0:cx1] * (1 - a) + a
        sh = np.zeros_like(a)
        sh[2:, 1:] = a[:-2, :-1]
        shadow[cy0:cy1, cx0:cx1] = np.maximum(shadow[cy0:cy1, cx0:cx1], sh)
    shadow = cv2.GaussianBlur(shadow, (0, 0), 1.6) * 0.12
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
    frames = int(opt.get('film-frames', xsheet.sheet()[2]))
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
    # (their late wool is a soft lateness round them, never their outline left as a blank in the
    # wool: a person-shaped hole, which the woodland's reviews ruled out)
    fig = cv2.GaussianBlur(mask[..., 2].astype(np.float32) / 255, (0, 0), 24)
    hands = cv2.GaussianBlur(mask[..., 1].astype(np.float32) / 255, (0, 0), 18)
    T = 0.62 * reach / reach.max() + 0.16 * grain + 0.08 * fig + 0.22 * np.clip(hands * 3, 0, 1)
    T = (0.02 + 0.80 * (T - T.min()) / (T.max() - T.min())).astype(np.float32)
    for f in fs:
        x, y = f['at']
        f['t0'] = float(T[int(np.clip(y, 0, H - 1)), int(np.clip(x, 0, W - 1))])
        f['grow'] = 0.05
    rgba, R = draw(fs, T, rng)
    R = np.clip(R, 0, 1)
    # The colour comes through the fuzz: where the wool has grown, a moment later, softly (the order
    # of the fibres, blurred wide, with nothing ragged in it: a wash out from the lamp with a broken
    # edge read as a hole burning through the wall: the skeptic's review). As much of the picture
    # takes it in each moment as in any other (stroke-order.py).
    G = cv2.GaussianBlur(R, (0, 0), 48) + 0.04 * (cv2.resize(soft_noise(rng, (H // 16, W // 16), 2), (W, H)) - 0.5)
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
