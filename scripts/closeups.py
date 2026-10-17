"""
The woodland's close-ups (shots 4, 5, 6 of the artist's shot list; docs/reviews/2026-10-woodland.md)
from the artist's drawings. Offline only; what it writes ships.

    pip install --user opencv-python-headless   (once)
    python3 scripts/closeups.py [c4 c5 c6] [--flip DIR]
    python3 scripts/closeups.py --selftest       (a made-up set, redrawn as an image tool does)

A close-up is drawn animation: held drawings, cut on the timeline's keys (`scene.cel` in
src/memory/defs.ts), never warped or mixed between (a face warped from one drawing toward the
next tears: the skeptic's review, 2026-10-17). Reads each shot's drawings from
references/woodland/drawings/ (named as in references/woodland/kit/README.md). The first is the
shot's base; any after it may be missing (the timeline then holds the one before). Without its
first drawing, a shot is the character sheet's own close-up panel, held: a stand-in.

Writes public/memories/woodland/afternoon/<shot>-base.webp (the first drawing, opaque),
<shot>-wind.webp (where the engine's wind may move its grass: a small map, one size) and
<shot>-cels.webp (every later drawing, cut to the part of the frame that changes: an atlas), the
drawings with @low, and the shot's entry in the art manifest.
--flip writes each shot's drawings as a 12 fps GIF to DIR, to check by eye that they match (line
weight, softness, colour) before they ship.

How the drawings are prepared:
  1. Each is lined up with the base (the image tool redraws the whole picture a little each time:
     a homography fitted, coarse to fine, to what didn't change). One that won't line up is
     refused: it would jump. Then it is matched to the base's colour.
  2. Each is cut where it really differs from the base (a region round the change, tightly
     feathered), forgiving a line the image tool redrew a pixel or two off. Everywhere else the
     base shows, so what didn't move never boils. Only inside the shot's `allow` box; a drawing
     whose change covers more than a fifth of the frame is refused (it was redrawn, not edited).
  3. The wind leaves the grass near anything that changes alone (it would shear at the cut).
"""
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DRAW = os.path.join(ROOT, 'references', 'woodland', 'drawings')
SHEET = os.path.join(ROOT, 'references', 'woodland', '02-characters.webp')
OUT = os.path.join(ROOT, 'public', 'memories', 'woodland', 'afternoon')
MANIFEST = os.path.join(ROOT, 'public', 'memories', 'woodland', 'manifest.json')
W, H = 1920, 1080
LOW = 1280 / 1920
# The largest atlas a phone is sure to take (px, either side).
ATLAS_MAX = 4096
# The most of the frame one drawing may change (more: it was redrawn, not edited).
MOST = 0.22
# The wind map's size (it is smooth).
WIND = (480, 270)

# Each shot: its drawings in the timeline's order (`scene.cel` 0 is the first: keep the two lists
# in step); what stays central on an upright screen (frame fractions, y down); whose breathing
# lifts the chest and where the chest is (x, y, rx, ry: frame fractions, y down). Once the
# drawings are in: a crop of them that matches the shots' eyelines (x, y, w: fractions of a
# drawing; its height follows at 16:9) and where they may differ from the base (x0, y0, x1, y1;
# outside it the base's is kept: the image tool redraws what it wasn't asked to; the kit's
# framing: his head in the left half, hers in the right, her hand coming in from the right). The
# chests and crops are set by eye on the real drawings.
SHOTS = {
    'c4': {
        'drawings': ['c4-start', 'c4-eyes', 'c4-mid', 'c4-end'],
        'focus': (0.35, 0.38),
        'breath': 'a',
        'chest': (0.42, 0.98, 0.34, 0.2),
        'crop': None,
        'allow': (0.0, 0.0, 0.62, 1.0),
    },
    'c5': {
        'drawings': ['c5-start', 'c5-eyes', 'c5-mid', 'c5-end', 'c5-end-half', 'c5-end-shut'],
        'focus': (0.65, 0.38),
        'breath': 'b',
        'chest': (0.58, 0.98, 0.34, 0.2),
        'crop': None,
        'allow': (0.38, 0.0, 1.0, 1.0),
    },
    'c6': {
        'drawings': ['c6-start', 'c6-mid', 'c6-end'],
        'focus': (0.5, 0.5),
        'breath': None,
        'chest': None,
        'crop': None,
        'allow': (0.35, 0.0, 1.0, 1.0),
    },
}

# Until a shot's first drawing is in: the sheet's own close-up panel (x0, y0, x1, y1, inside its
# border), held; the face and the chest in it (panel fractions, y down; the chest's x, y, rx, ry).
STANDIN = {
    'c4': {'panel': (540, 542, 800, 783), 'face': (0.55, 0.3), 'chest': (0.45, 0.68, 0.35, 0.22)},
    'c5': {'panel': (802, 542, 1076, 783), 'face': (0.45, 0.25), 'chest': (0.52, 0.62, 0.32, 0.2)},
    'c6': {'panel': (1093, 532, 1424, 756), 'face': (0.5, 0.5), 'chest': None},
}


def load(path):
    return np.asarray(Image.open(path).convert('RGB'), np.float32) / 255


def find(stem):
    """A drawing's file, whatever the image tool saved it as."""
    for ext in ('.png', '.webp', '.jpg', '.jpeg'):
        p = os.path.join(DRAW, stem + ext)
        if os.path.exists(p):
            return p
    return None


def fit(img, w=W, h=H):
    """Cover a w×h frame (centre crop), area-correct."""
    ih, iw = img.shape[:2]
    k = max(w / iw, h / ih)
    nw, nh = max(w, round(iw * k)), max(h, round(ih * k))
    big = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA if k < 1 else cv2.INTER_LANCZOS4)
    x0, y0 = (nw - w) // 2, (nh - h) // 2
    return np.ascontiguousarray(big[y0:y0 + h, x0:x0 + w])


def contain(img, w=W, h=H):
    """Fit the whole of `img` in a w×h frame, its sides filled with a soft, out-of-focus stretch
    of itself (for the sheet's square-ish panels). Returns it and where the panel is (x, y, w, h px)."""
    ih, iw = img.shape[:2]
    k = min(w / iw, h / ih)
    nw, nh = round(iw * k), round(ih * k)
    fg = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_LANCZOS4)
    bg = cv2.GaussianBlur(cv2.resize(img, (w, h), interpolation=cv2.INTER_LINEAR), (0, 0), 28)
    out = bg.copy()
    x0, y0 = (w - nw) // 2, (h - nh) // 2
    # Feather the panel's edges into the soft surround.
    m = np.zeros((nh, nw), np.float32)
    m[12:-12, 12:-12] = 1
    m = cv2.GaussianBlur(m, (0, 0), 10)[..., None]
    out[y0:y0 + nh, x0:x0 + nw] = fg * m + out[y0:y0 + nh, x0:x0 + nw] * (1 - m)
    return out, (x0, y0, nw, nh)


def gray(img):
    return cv2.cvtColor((np.clip(img, 0, 1) * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)


def differs(a, b, reach=2):
    """How far two lined-up drawings differ at each point (0..1), forgiving a line redrawn up to
    `reach` px off: a point differs only as far as it falls outside the other's colours round it
    (and the other way round)."""
    k = np.ones((2 * reach + 1, 2 * reach + 1), np.uint8)

    def outside(x, y):
        return np.maximum(cv2.erode(y, k) - x, x - cv2.dilate(y, k)).clip(0).max(-1)

    return np.maximum(outside(a, b), outside(b, a))


def changed(a, b, grow=25, soft=18, least=900, whole=False):
    """Where two lined-up drawings differ (a soft mask, 0..1): regions only (a face, a hand, an
    eye), not the image tool's speckle, its redrawn lines or scattered blades. `whole`: each region
    made one piece (a turned head differs at its features and edges, not across its cheek; it is
    cut whole)."""
    d = differs(cv2.GaussianBlur(a, (0, 0), 1.2), cv2.GaussianBlur(b, (0, 0), 1.2))
    # (Not at the frame's very edge: a drawing lined up has a sliver of nothing there.)
    e = 12
    d[:e], d[-e:], d[:, :e], d[:, -e:] = 0, 0, 0, 0
    m = (d > 0.07).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m)
    keep = np.zeros_like(m)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] > least:
            keep[lab == i] = 1
    if whole:
        # The differences near each other are one thing (its features, its outline): its hull. A
        # speck on its own, far smaller than the change, is the image tool's, not the drawing's.
        near = cv2.dilate(keep, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (81, 81)))
        n2, lab2 = cv2.connectedComponents(near)
        groups = [np.nonzero((lab2 == i) & (keep > 0)) for i in range(1, n2)]
        most = max((len(g[0]) for g in groups), default=0)
        solid = np.zeros_like(keep)
        for ys, xs in groups:
            if len(xs) >= max(300, 0.05 * most):
                cv2.fillConvexPoly(solid, cv2.convexHull(np.stack([xs, ys], 1).astype(np.int32)), 1)
        keep = solid
    keep = cv2.dilate(keep, np.ones((grow, grow), np.uint8))
    return np.clip(cv2.GaussianBlur(keep.astype(np.float32), (0, 0), soft) * 1.4, 0, 1)


def register(img, base):
    """Line `img` up with `base`: a homography (ECC) fitted at a quarter size, then refined at
    half size on what didn't change. Returns it and how well it lines up (correlation, 0..1)."""
    Wm = np.eye(3, dtype=np.float32)
    crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 120, 1e-6)
    cc = 0.0
    for s, masked in ((0.25, False), (0.5, True)):
        S = np.diag([s, s, 1]).astype(np.float32)
        Si = np.linalg.inv(S)
        b = cv2.resize(gray(base), None, fx=s, fy=s, interpolation=cv2.INTER_AREA).astype(np.float32)
        a = cv2.resize(gray(img), None, fx=s, fy=s, interpolation=cv2.INTER_AREA).astype(np.float32)
        mask = None
        if masked:
            now = cv2.warpPerspective(img, Wm, (W, H), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REFLECT)
            mask = cv2.resize(((1 - changed(now, base)) > 0.5).astype(np.uint8), (b.shape[1], b.shape[0]), interpolation=cv2.INTER_NEAREST)
        try:
            cc, w = cv2.findTransformECC(b, a, (S @ Wm @ Si).astype(np.float32), cv2.MOTION_HOMOGRAPHY, crit, mask, 5)
        except cv2.error:
            return img, 0.0
        # (It maps the base's points to the drawing's.)
        Wm = (Si @ w @ S).astype(np.float32)
    out = cv2.warpPerspective(img, Wm, (W, H), flags=cv2.INTER_LANCZOS4 | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REFLECT)
    return np.clip(out, 0, 1), float(cc)


def match_colour(img, ref, where):
    """Mean and spread of each Lab channel matched to `ref`, over `where` (what didn't change)."""
    a = cv2.cvtColor(img, cv2.COLOR_RGB2LAB)
    b = cv2.cvtColor(ref, cv2.COLOR_RGB2LAB)
    m = where > 0.5
    if m.sum() < 1000:
        return img
    for c in range(3):
        am, asd = a[..., c][m].mean(), a[..., c][m].std() + 1e-4
        bm, bsd = b[..., c][m].mean(), b[..., c][m].std() + 1e-4
        a[..., c] = (a[..., c] - am) * (bsd / asd) + bm
    return np.clip(cv2.cvtColor(a, cv2.COLOR_LAB2RGB), 0, 1)


def grass_of(img):
    """Where it is grass (green, yellow-green), soft."""
    hsv = cv2.cvtColor((np.clip(img, 0, 1) * 255).astype(np.uint8), cv2.COLOR_RGB2HSV).astype(np.float32)
    h, s, v = hsv[..., 0], hsv[..., 1] / 255, hsv[..., 2] / 255
    g = ((h > 22) & (h < 80) & (s > 0.25) & (v > 0.15)).astype(np.float32)
    g = cv2.morphologyEx(g, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    return cv2.GaussianBlur(g, (0, 0), 6)


def box(b, soft=12):
    """A feathered box (x0, y0, x1, y1: frame fractions, y down), or everywhere."""
    if not b:
        return np.ones((H, W), np.float32)
    m = np.zeros((H, W), np.float32)
    m[round(b[1] * H):round(b[3] * H), round(b[0] * W):round(b[2] * W)] = 1
    return cv2.GaussianBlur(m, (0, 0), soft)


def save(rgb, alpha, path, q=92):
    """WebP, full size and @low: opaque, or with a straight alpha (coverage). Colour and alpha
    are resized apart (never premultiplied), so neither bleeds into the other."""
    rgb8 = Image.fromarray((np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB')
    a8 = None if alpha is None else Image.fromarray((np.clip(alpha, 0, 1) * 255 + 0.5).astype(np.uint8), 'L')
    for sfx, k in (('', 1.0), ('@low', LOW)):
        c, a = rgb8, a8
        if k != 1.0:
            size = (max(1, round(rgb8.width * k)), max(1, round(rgb8.height * k)))
            c = rgb8.resize(size, Image.LANCZOS)
            a = None if a8 is None else a8.resize(size, Image.LANCZOS)
        im = c.copy()
        if a is not None:
            im.putalpha(a)
        im.save(path + sfx + '.webp', 'WEBP', quality=q, method=6)


def save_wind(m, path):
    """Where the wind may move the grass (0..1): a small opaque map, one size, lossless (a map,
    not colour: nothing a decoder does to an alpha can touch it)."""
    g = (np.clip(cv2.resize(m, WIND, interpolation=cv2.INTER_AREA), 0, 1) * 255 + 0.5).astype(np.uint8)
    Image.fromarray(np.dstack([g, g, g]), 'RGB').save(path + '.webp', 'WEBP', lossless=True, method=6)


def prepare(shot):
    """The shot's drawings that are there, cropped, lined up with its base and colour-matched:
    {name: image}; or None if its first drawing isn't there yet."""
    names = shot['drawings']
    if not find(names[0]):
        return None

    def read(stem):
        img = load(find(stem))
        if shot['crop']:
            x, y, w = shot['crop']
            ih, iw = img.shape[:2]
            cw = round(w * iw)
            ch = round(cw * H / W)
            x0, y0 = round(x * iw), round(y * ih)
            img = img[y0:y0 + ch, x0:x0 + cw]
        return fit(img)

    base = read(names[0])
    out = {names[0]: base}
    for k in names[1:]:
        if not find(k):
            print(f'  {k}: not drawn yet (the timeline holds the one before)')
            continue
        img, cc = register(read(k), base)
        if cc < 0.9:
            print(f'  {k}: refused: it doesn\'t line up with {names[0]} (correlation {cc:.3f}); make it again from {names[0]}')
            continue
        out[k] = match_colour(img, base, 1 - changed(img, base))
        print(f'  {k}: lined up (correlation {cc:.3f})')
    return out


def flip(frames, path, width=640):
    """The drawings in order as a 12 fps GIF, looping: the first and last held a second, the others half that."""
    ims = []
    for i, f in enumerate(frames):
        im = Image.fromarray((np.clip(f, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB')
        im = im.resize((width, round(width * H / W)), Image.LANCZOS).quantize(colors=255, method=Image.Quantize.MEDIANCUT)
        hold = 12 if i in (0, len(frames) - 1) else 6
        ims.extend([im] * hold)
    ims[0].save(path, save_all=True, append_images=ims[1:], duration=round(1000 / 12), loop=0, disposal=1)


def render(name, flips=None):
    shot = SHOTS[name]
    names = shot['drawings']
    path = os.path.join(OUT, name)
    entry = {'file': f'afternoon/{name}', 'names': names, 'breath': shot['breath']}
    drawn = prepare(shot)
    if drawn is None:
        s = STANDIN[name]
        x0, y0, x1, y1 = s['panel']
        base, (px, py, pw, ph) = contain(load(SHEET)[y0:y1, x0:x1])
        fx, fy = (px + s['face'][0] * pw) / W, (py + s['face'][1] * ph) / H
        chest = None
        if s['chest']:
            cx, cy, rx, ry = s['chest']
            chest = [round((px + cx * pw) / W, 4), round(1 - (py + cy * ph) / H, 4), round(rx * pw / W, 4), round(ry * ph / H, 4)]
        save(base, None, path + '-base')
        save_wind(grass_of(base), path + '-wind')
        for f in ('-cels.webp', '-cels@low.webp'):
            if os.path.exists(path + f):
                os.remove(path + f)
        entry.update({'cells': [-1] + [None] * (len(names) - 1), 'grid': [0, 0], 'rect': [0, 0, 0, 0],
                      'focus': [round(fx, 4), round(1 - fy, 4)], 'chest': chest, 'standin': True})
        print(f'{name}: a stand-in (the sheet\'s panel, held): {names[0]} isn\'t drawn yet')
        if flips:
            flip([base], os.path.join(flips, f'{name}.gif'))
        return entry
    base = drawn[names[0]]
    allow = box(shot['allow'])
    # Where each later drawing really differs from the base (refused if that is most of it).
    regions = {}
    for k in names[1:]:
        if k in drawn:
            r = changed(drawn[k], base, grow=11, soft=3, least=250, whole=True) * allow
            cover = float((r > 0.5).mean())
            if cover > MOST:
                print(f'  {k}: refused: it changes {cover:.0%} of the frame (redrawn, not edited); make it again from {names[0]}, changing only what the kit asks')
                del drawn[k]
            elif r.max() > 0.5:
                regions[k] = r
                print(f'  {k}: changes {cover:.1%} of the frame')
    union = np.zeros((H, W), np.float32)
    for r in regions.values():
        union = np.maximum(union, r)
    # The wind leaves the grass alone near anything that changes.
    calm = np.clip(cv2.GaussianBlur(cv2.dilate((union > 0.02).astype(np.uint8), np.ones((61, 61), np.uint8)).astype(np.float32), (0, 0), 24) * 1.3, 0, 1)
    save(base, None, path + '-base')
    save_wind(grass_of(base) * (1 - calm), path + '-wind')
    cx, cy, rx, ry = shot['chest'] or (0, 0, 0, 0)
    entry.update({'focus': [shot['focus'][0], round(1 - shot['focus'][1], 4)],
                  'chest': [cx, round(1 - cy, 4), rx, ry] if shot['chest'] else None, 'standin': False})
    cells = [-1 if k == names[0] else (None if k not in drawn else -1) for k in names]
    if not regions:
        entry.update({'cells': cells, 'grid': [0, 0], 'rect': [0, 0, 0, 0]})
        print(f'{name}: {len(drawn)} drawings, none different from {names[0]}')
        return entry
    # One cell round everything that changes; each drawing in it, cut where it differs.
    pad = 6
    ys, xs = np.nonzero(union > 0.02)
    x0, x1 = max(0, xs.min() - pad), min(W, xs.max() + pad + 1)
    y0, y1 = max(0, ys.min() - pad), min(H, ys.max() + pad + 1)
    cw, ch = x1 - x0, y1 - y0
    order = [k for k in names if k in regions]
    n = len(order)
    cols = min(range(1, n + 1), key=lambda c: max(c * cw, -(-n // c) * ch))
    rows = -(-n // cols)
    k = min(1.0, ATLAS_MAX / max(cols * cw, rows * ch))
    sw, sh = max(1, round(cw * k)), max(1, round(ch * k))
    rgb = np.zeros((rows * sh, cols * sw, 3), np.float32)
    alpha = np.zeros((rows * sh, cols * sw), np.float32)
    for i, name_ in enumerate(order):
        r, c = divmod(i, cols)
        img = drawn[name_][y0:y1, x0:x1]
        a = regions[name_][y0:y1, x0:x1]
        if k < 1:
            img = cv2.resize(img, (sw, sh), interpolation=cv2.INTER_AREA)
            a = cv2.resize(a, (sw, sh), interpolation=cv2.INTER_AREA)
        rgb[r * sh:(r + 1) * sh, c * sw:(c + 1) * sw] = img
        alpha[r * sh:(r + 1) * sh, c * sw:(c + 1) * sw] = a
        cells[names.index(name_)] = i
    save(rgb, alpha, path + '-cels')
    entry.update({
        'cells': cells,
        # The atlas's columns and rows; the part of the frame its cells cover (frame uv, y up).
        'grid': [cols, rows],
        'rect': [round(x0 / W, 5), round(1 - y1 / H, 5), round(cw / W, 5), round(ch / H, 5)],
    })
    print(f'{name}: {len(drawn)} of {len(names)} drawings; {n} cels of {cw}×{ch} px in a {cols}×{rows} atlas' + (f' (at {k:.2f})' if k < 1 else ''))
    if flips:
        shown = []
        for i, key in enumerate(names):
            j = i
            while j > 0 and cells[j] is None:
                j -= 1
            img = base
            if cells[j] is not None and cells[j] >= 0:
                a = regions[names[j]][..., None]
                img = base * (1 - a) + drawn[names[j]] * a
            shown.append(img)
        flip(shown, os.path.join(flips, f'{name}.gif'))
    return entry


def selftest():
    """A made-up set for shot 5 from the sheet's panel, redrawn as an image tool does (every line
    re-rendered a pixel or so off, the whole picture moved, zoomed and tinted a little), with real
    changes (the eyes, the head, a blink): the cut must stay round the changes."""
    import tempfile
    global DRAW, OUT
    rng = np.random.default_rng(7)
    tmp = tempfile.mkdtemp(prefix='closeups-')
    DRAW, OUT = os.path.join(tmp, 'draw'), os.path.join(tmp, 'out')
    os.makedirs(DRAW)
    os.makedirs(OUT)
    x0, y0, x1, y1 = STANDIN['c5']['panel']
    start, _ = contain(load(SHEET)[y0:y1, x0:x1])

    def boil(img, amp=1.5):
        f = [cv2.GaussianBlur(rng.standard_normal((H, W)).astype(np.float32), (0, 0), 24) for _ in range(2)]
        f = [d * amp / (d.std() + 1e-6) for d in f]
        gx, gy = np.meshgrid(np.arange(W, dtype=np.float32), np.arange(H, dtype=np.float32))
        out = cv2.remap(img, gx + f[0], gy + f[1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        return np.clip(out + 0.35 * (out - cv2.GaussianBlur(out, (0, 0), 1.0)), 0, 1)

    def redraw(img, dx, dy, k, cast=(1.03, 1.0, 0.97)):
        M = np.float32([[k, 0, dx + (1 - k) * W / 2], [0, k, dy + (1 - k) * H / 2]])
        return np.clip(cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT) * np.float32(cast), 0, 1)

    def local(img, cx, cy, r, f):
        m = np.zeros((H, W), np.float32)
        cv2.circle(m, (cx, cy), r, 1, -1)
        m = cv2.GaussianBlur(m, (0, 0), r * 0.15)[..., None]
        return img * (1 - m) + f(img) * m

    eyes = local(start, 1140, 260, 70, lambda im: cv2.warpAffine(im, np.float32([[1, 0, 7], [0, 1, 0]]), (W, H), borderMode=cv2.BORDER_REFLECT))
    end = local(eyes, 1140, 300, 190, lambda im: cv2.warpAffine(im, cv2.getRotationMatrix2D((1140, 420), 5, 1.0), (W, H), borderMode=cv2.BORDER_REFLECT))
    shut = end.copy()
    shut[245:275, 1080:1200] = shut[290:320, 1080:1200]
    for name, img in (('c5-start', start), ('c5-eyes', redraw(boil(eyes), 4, -3, 1.012)), ('c5-end', redraw(boil(end), 2, 2, 0.99)), ('c5-end-shut', redraw(boil(shut), -3, 1, 1.008))):
        Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(DRAW, name + '.png'))
    e = render('c5')
    r = e['rect']
    cover = r[2] * r[3]
    ok = [c for c in e['cells'][1:] if c is not None and c >= 0]
    print(f'selftest: {len(ok)} of 3 drawings kept; the cut covers {cover:.0%} of the frame (at most 15%)')
    if len(ok) != 3 or cover > 0.15:
        sys.exit(1)


def main():
    args = sys.argv[1:]
    if args == ['--selftest']:
        return selftest()
    flips = None
    if '--flip' in args:
        i = args.index('--flip')
        flips = args[i + 1]
        del args[i:i + 2]
        os.makedirs(flips, exist_ok=True)
    names = args or list(SHOTS)
    with open(MANIFEST) as f:
        manifest = json.load(f)
    lm = manifest['living']['afternoon']
    have = {c['file']: c for c in lm.get('closeups', [])}
    os.makedirs(OUT, exist_ok=True)
    for name in names:
        have[f'afternoon/{name}'] = render(name, flips)
    lm.pop('clips', None)
    lm['closeups'] = [have[f'afternoon/{k}'] for k in SHOTS if f'afternoon/{k}' in have]
    with open(MANIFEST, 'w') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')


if __name__ == '__main__':
    main()
