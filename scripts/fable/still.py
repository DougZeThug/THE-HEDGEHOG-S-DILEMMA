"""The pilot's stage and one composited still of it, the touch (style bible §4), built as depth planes
the way the renderer (pilot.py) builds every drawing, back to front:

  1. the back plate (sky, misty pine shore, water), graded per region to the reference's sampled
     night, a thin extra gauze of haze; the tissue moon with its halo;
  2. her reflection as a broad path of torn strips down the water, warm and broken;
  3. on the water: his reflection (the part of him over the water, mirrored at the waterline and
     broken by the ripples), the near bank's dark reflection, the back halves of the rings;
  4. the far bank: a torn-paper plane of earth behind his legs, rising to a low mound at the left as
     in panel 5 and falling into the water at the shore, grass and cattails along its top; the
     ground darkened where he sits on it;
  5. the fox, keyed off the card he was generated on, flipped to face right, shrunk, graded per
     material with gains taken from one pose (so every pose matches), placed by his hind feet and
     leaning with the bank; lit by the moon (key from broad matte normals, a rim where his edges
     face her), her warm light under his chin, the night's cool fill; the part of his paw below the
     waterline seen through the water; brass pins;
  6. the front halves of the rings and the bright line where his paw enters the water;
  7. the near bank: a torn-paper plane in front of his feet, its edge and grass just over them so
     they stand in the grass, his shadow falling toward us across it, its face dropping to the
     water in front;
  8. the branch, pushed aside and sprung up at the upper left; the near reeds, soft with depth.

Every piece comes from audition/fable/kit (art-ledger.json); cutouts are cached in kit/cache.
Writes OUT/touch-still.png (the 1920x1440 matte), touch-column.png (the 4:5 column),
beside-panel-5.jpg and still.json.

Usage: python -I scripts/fable/still.py OUT_DIR
"""
import json
import sys
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
KIT = ROOT / 'audition' / 'fable' / 'kit'
CACHE = KIT / 'cache'
CUT_V = 1  # bump when the keying or grading changes, to re-cut the cached pieces
W, H = 1920, 1440
COL_X, COL_W = (W - 1152) // 2, 1152  # the 4:5 column

SPEC = {
    'plate': 'k3-back-1', 'bank': 'k3-bank-1', 'reeds': 'k3-reeds-1', 'branch': 'k3-branch-1',
    'fox': 'k3-touch-1', 'moon_file': 'k2-moon-1',
    'grade_from': 'k3-touch-1',     # the pose whose materials set the grade for every pose
    'fox_scale': 0.16169,           # source px to matte px (780 px wide in the touch pose)
    'anchor_src': (2674, 2650),     # in every pose (flipped source px): the middle of his hind feet, on the ground
    'anchor_at': (846, 955),        # where that sits in the matte
    'lean': 2.0,                    # degrees clockwise about the anchor: the bank slopes to the water, and he with it
    'waterline': 958,               # the pond's surface at his depth
    'shore_x': 1058,                # where the bank ends at his depth: between his braced paw and his reaching paw
    'path_x': 1214,                 # the middle of her reflection
    'moon_at': (1100, 240), 'moon_d': 130,
    'horizon': 588,
    # the touch pose's pins (flipped source px): shoulder, elbow, hip, hock
    'pins_src': [(3440, 1200), (3560, 1880), (2560, 1800), (2240, 2440)],
    'pin_d_src': 80,
    # the reference's night, sampled (bible §2; panel 5 for the two banks)
    'targets': {'sky': '#2a3649', 'water': '#262d3a', 'far_bank': '#1f1914', 'near_bank': '#171210'},
    'fox_targets': {'orange': '#9a4214', 'cream': '#d8cfb6', 'charcoal': '#1d1613'},
    'moon_light': (1.0, 0.86, 0.62),
    # the banks, matte px. The far bank's top edge runs behind his legs and falls into the water at
    # the shore; the near bank's top edge runs just over his feet, then down the shore and back
    # along its face, where it meets the water in front.
    'far_bank': {'top': [(-20, 846), (200, 850), (380, 858), (560, 868), (720, 880), (860, 890), (960, 897),
                         (1010, 904), (1038, 918), (1054, 938), (1062, 958)],
                 'rest': [(1062, 1000), (-20, 1000)]},
    'near_bank': {'top': [(-20, 936), (250, 940), (450, 944), (650, 946), (744, 947), (850, 950), (947, 954),
                          (1010, 957), (1046, 960)],
                  'rest': [(1056, 966), (1058, 976), (1048, 988), (1030, 998), (1000, 1006), (960, 1012),
                           (900, 1010), (840, 1016), (760, 1014), (700, 1020), (620, 1018), (540, 1023),
                           (460, 1020), (380, 1026), (300, 1024), (200, 1028), (-20, 1030)]},
    # grass sown along each bank's top: (x0, x1, height range px, blades per 100 px, seed)
    'far_grass': [(380, 720, (48, 86), 7, 21), (720, 1040, (24, 42), 5, 22)],
    'near_grass': [(380, 1040, (14, 26), 4, 31)],
    'near_clumps': [(560, 22), (770, 26), (880, 24), (944, 20), (1020, 22)],  # (x, height): in front of his feet and tail
}

YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)


def hexrgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32) / 255


def lin(x):
    x = np.asarray(x, np.float32)
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4).astype(np.float32)


def srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * x ** (1 / 2.4) - 0.055).astype(np.float32)


def load(name):
    return np.asarray(Image.open(KIT / f'{name}.png').convert('RGB'), np.float32) / 255


@lru_cache(maxsize=48)
def noise(shape, scale, seed):
    """Paper-fibre noise: smoothed random fields at a few scales, 0..1 (cached, read-only)."""
    rng = np.random.default_rng(seed)
    acc = np.zeros(shape, np.float32)
    for k, wgt in ((scale, 0.6), (scale / 3, 0.3), (scale / 9, 0.1)):
        acc += cv2.GaussianBlur(rng.random(shape).astype(np.float32), (0, 0), max(0.6, k)) * wgt
    acc -= acc.min()
    acc /= max(acc.max(), 1e-6)
    acc.setflags(write=False)
    return acc


def unit_noise(shape, scale, seed):
    n = noise(shape, scale, seed)
    return (n - n.mean()) / max(n.std(), 1e-6)


def over(scene, rgb, a):
    return scene * (1 - a[..., None]) + rgb * a[..., None]


def place(img, a, ox, oy):
    """Put an RGB(A) piece onto the matte at (ox, oy), clipped."""
    big = np.zeros((H, W, img.shape[2]), np.float32)
    alpha = np.zeros((H, W), np.float32)
    x0, y0 = int(round(ox)), int(round(oy))
    hh, ww = a.shape
    sx0, sy0, dx0, dy0 = max(0, -x0), max(0, -y0), max(0, x0), max(0, y0)
    cw, ch = min(ww - sx0, W - dx0), min(hh - sy0, H - dy0)
    if cw > 0 and ch > 0:
        big[dy0:dy0 + ch, dx0:dx0 + cw] = img[sy0:sy0 + ch, sx0:sx0 + cw]
        alpha[dy0:dy0 + ch, dx0:dx0 + cw] = a[sy0:sy0 + ch, sx0:sx0 + cw]
    return big, alpha


def place_a(a, ox, oy):
    """An alpha alone onto the matte at (ox, oy), clipped."""
    alpha = np.zeros((H, W), np.float32)
    x0, y0 = int(round(ox)), int(round(oy))
    hh, ww = a.shape
    sx0, sy0, dx0, dy0 = max(0, -x0), max(0, -y0), max(0, x0), max(0, y0)
    cw, ch = min(ww - sx0, W - dx0), min(hh - sy0, H - dy0)
    if cw > 0 and ch > 0:
        alpha[dy0:dy0 + ch, dx0:dx0 + cw] = a[sy0:sy0 + ch, sx0:sx0 + cw]
    return alpha


def _cutout(name, key, band):
    f = load(name)
    if band:
        f = f[int(band[0] * f.shape[0]):int(band[1] * f.shape[0])]
    h, w = f.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    b = np.zeros((h, w), bool)
    b[:40], b[-40:], b[:, :40], b[:, -40:] = True, True, True, True
    A = np.stack([np.ones_like(xx), xx / w, yy / h, (xx / w) ** 2, (yy / h) ** 2, xx * yy / (w * h)], -1)
    card = np.empty_like(f)
    for c in range(3):
        coef, *_ = np.linalg.lstsq(A[b], f[..., c][b], rcond=None)
        card[..., c] = A @ coef
    if key == 'card':
        d = np.linalg.norm(cv2.cvtColor(f, cv2.COLOR_RGB2LAB) - cv2.cvtColor(card.astype(np.float32), cv2.COLOR_RGB2LAB), axis=-1)
        a = np.clip((d - 5) / 9, 0, 1)
    else:
        a = np.clip((cv2.GaussianBlur(card.mean(-1), (0, 0), 50) - f.mean(-1) - 0.12) / 0.2, 0, 1)
    core = (a > 0.5).astype(np.uint8)
    if key == 'card':  # one piece: the largest, holes filled
        n, lab_, stats, _ = cv2.connectedComponentsWithStats(core, 8)
        core = (lab_ == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
        fill = core.copy()
        cv2.floodFill(fill, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 1)
        core = core | (1 - fill)
        core = cv2.erode(core, np.ones((5, 5), np.uint8))
        a = cv2.GaussianBlur(core.astype(np.float32), (0, 0), 1.2)
    else:  # many thin blades: keep the soft luminance matte, without specks
        n, lab_, stats, _ = cv2.connectedComponentsWithStats(core, 8)
        big_ = np.isin(lab_, 1 + np.nonzero(stats[1:, cv2.CC_STAT_AREA] > 400)[0])
        a = a * cv2.dilate(big_.astype(np.uint8), np.ones((5, 5), np.uint8))
    fg = (f - (1 - a[..., None]) * card) / np.maximum(a[..., None], 1e-3)
    fg = np.clip(np.where(a[..., None] > 0.02, fg, 0), 0, 1)
    return fg, a


def cutout(name, key='card', band=None, flip=False):
    """A piece keyed off the ground it was generated on, opaque inside with a crisp paper edge, the
    ground taken back out of its edge pixels. key='card' fits the card as a smooth surface from the
    frame's border and keys by colour distance; key='dark' keys a dark piece off a light ground by
    luminance. band=(y0, y1) keeps only those rows (fractions of the height). Cached as RGBA."""
    tag = f'{name}-{key}' + (f'-{band[0]:.2f}-{band[1]:.2f}' if band else '') + f'-v{CUT_V}.png'
    f = CACHE / tag
    if f.exists():
        rgba = np.asarray(Image.open(f), np.float32) / 255
        fg, a = rgba[..., :3], rgba[..., 3]
    else:
        fg, a = _cutout(name, key, band)
        CACHE.mkdir(parents=True, exist_ok=True)
        Image.fromarray((np.dstack([fg, a]) * 255 + 0.5).astype(np.uint8), 'RGBA').save(f)
    if flip:
        fg, a = fg[:, ::-1], a[:, ::-1]
    return np.ascontiguousarray(fg), np.ascontiguousarray(a)


def grade_to(L, a, target):
    """One material, linear light: its median goes to the target."""
    sel = a > 0.9
    return L * (lin(hexrgb(target)) / np.maximum(np.median(L[sel], axis=0), 1e-4))


def fox_materials(fg):
    hsv = cv2.cvtColor(fg.astype(np.float32), cv2.COLOR_RGB2HSV)
    hue, sat, val = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    return {
        'orange': np.clip((sat - 0.35) / 0.2, 0, 1) * np.clip((val - 0.3) / 0.15, 0, 1) * ((hue < 45) | (hue > 340)),
        'cream': np.clip((0.35 - sat) / 0.15, 0, 1) * np.clip((val - 0.55) / 0.15, 0, 1),
        'charcoal': np.clip((0.32 - val) / 0.12, 0, 1),
    }


def fox_gains():
    """Per-material gains (linear light) that take the grading pose's medians to the targets, and
    the gain for pixels that are no one material. Every pose is graded with these, so a change of
    drawing never changes his colour."""
    f = CACHE / f"gains-{SPEC['grade_from']}-{SPEC['fox_scale']:.5f}-v{CUT_V}.json"
    if f.exists():
        d = json.loads(f.read_text())
        return {k: np.array(v, np.float32) for k, v in d.items()}
    fg, a = cutout(SPEC['grade_from'], flip=True)
    s = SPEC['fox_scale']
    fg = cv2.resize(fg, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    a = cv2.resize(a, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    L, inside, w = lin(fg), a > 0.9, fox_materials(fg)
    g = {k: lin(hexrgb(SPEC['fox_targets'][k])) / np.maximum(np.median(L[inside & (m > 0.8)], axis=0), 1e-4) for k, m in w.items()}
    gain, tot = sum(w[k][..., None] * g[k] for k in w), sum(w.values())
    some = (tot > 1e-3) & inside
    g['rest'] = np.median(gain[some] / tot[some][..., None], axis=0)
    CACHE.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps({k: [float(x) for x in v] for k, v in g.items()}))
    return g


def grade_fox(fg, gains):
    w = fox_materials(fg)
    gain = sum(w[k][..., None] * gains[k] for k in w)
    tot = sum(w.values())
    rest = tot < 1e-3
    gain[rest] = gains['rest']
    tot = np.where(rest, 1, tot)
    return lin(fg) * gain / tot[..., None]


def fox_piece(name):
    """The puppet in one pose at his size: cut out, flipped to face right, shrunk with area
    filtering, graded. Linear light and alpha; cached."""
    s = SPEC['fox_scale']
    f = CACHE / f'{name}-fox-{s:.5f}-v{CUT_V}.npz'
    if f.exists():
        d = np.load(f)
        return d['L'].astype(np.float32), d['A'].astype(np.float32)
    fg, a = cutout(name, flip=True)
    fgs = cv2.resize(fg, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    As = cv2.resize(a, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    L = grade_fox(fgs, fox_gains())
    np.savez_compressed(f, L=L.astype(np.float16), A=As.astype(np.float16))
    return L, As


def place_fox(L, A, at=None, lean=None, anchor_src=None):
    """A pose into the matte, premultiplied: the source anchor (his hind feet) to `at`, turned
    `lean` degrees clockwise about it. Returns linear light, alpha, and the 2x3 map from flipped
    source px to matte px."""
    s = SPEC['fox_scale']
    at = SPEC['anchor_at'] if at is None else at
    lean = SPEC['lean'] if lean is None else lean
    ax, ay = (SPEC['anchor_src'] if anchor_src is None else anchor_src)
    R = cv2.getRotationMatrix2D((ax * s, ay * s), -lean, 1.0)
    R[:, 2] += [at[0] - ax * s, at[1] - ay * s]
    pm = cv2.warpAffine(L * A[..., None], R, (W, H), flags=cv2.INTER_CUBIC)
    al = np.clip(cv2.warpAffine(A, R, (W, H), flags=cv2.INTER_CUBIC), 0, 1)
    Lw = np.clip(pm, 0, None) / np.maximum(al[..., None], 1e-4) * (al[..., None] > 1e-3)
    M = R.copy()
    M[:, :2] *= s
    return Lw, al, M


def plate():
    p = load(SPEC['plate'])
    p = cv2.resize(p, (W, H), interpolation=cv2.INTER_AREA)
    pl = lin(p)
    yy = YY
    regions = {'sky': yy < SPEC['horizon'] - 60, 'water': yy >= SPEC['horizon'] + 10}
    acc = np.zeros_like(pl)
    weight = np.zeros(pl.shape[:2], np.float32)
    for name, m in regions.items():
        g = lin(hexrgb(SPEC['targets'][name])) / np.maximum(np.median(pl[m], axis=0), 1e-4)
        acc[m] += g
        weight[m] += 1
    other = weight == 0
    acc[other] = (lin(hexrgb(SPEC['targets']['sky'])) / np.maximum(np.median(pl[regions['sky']], axis=0), 1e-4)) * 0.85  # the mist band, kept grey-blue and low
    weight[other] = 1
    gain = cv2.GaussianBlur(acc / weight[..., None], (0, 0), 40)
    out = pl * gain
    grey = out.mean(-1, keepdims=True)
    return grey + (out - grey) * 0.7  # the plate's teal pulled toward the reference's grey-blue


def haze(scene):
    """A thin tracing-paper gauze over the far shore (the plate has its own mist)."""
    hz = SPEC['horizon']
    band = np.exp(-((YY[:, :1] - (hz - 20)) / 80) ** 2) * 0.22
    a = np.clip(band * (0.75 + 0.5 * noise((H, W), 18, 7)), 0, 0.4)[..., None]
    return scene * (1 - a) + lin(np.array([0.36, 0.41, 0.52], np.float32)) * a


def moon_layer():
    """The tissue moon (linear light, alpha) and her halo, and the moon's small texture for the path."""
    moon = load(SPEC['moon_file'])
    md, (mx, my) = SPEC['moon_d'], SPEC['moon_at']
    k = md / (moon.shape[0] * 0.65)
    mm = cv2.resize(lin(moon) * np.array([1.0, 1.03, 1.12], np.float32), None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
    ma = cv2.resize(np.clip((moon.mean(-1) - 0.08) / 0.25, 0, 1), None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
    sky, skya = place(mm, ma, mx - ma.shape[1] / 2, my - ma.shape[0] / 2)
    halo = cv2.GaussianBlur(sky * skya[..., None], (0, 0), md * 0.6) * np.array([1.0, 0.85, 0.6], np.float32)
    return sky, skya, halo, mm


def path_strips(mm, push_at=None, push=60.0, seed=11):
    """Her reflection: a broad path of torn strips down the water (linear light, additive), the
    strips near `push_at` pushed outward as they break."""
    rng = np.random.default_rng(seed)
    tex = cv2.resize(mm, (400, 60), interpolation=cv2.INTER_AREA)
    path = np.zeros((H, W, 3), np.float32)
    pcx = SPEC['path_x']
    px, py = push_at if push_at is not None else (pcx, H * 2)
    y = SPEC['horizon'] + 12
    while y < H:
        t = (y - SPEC['horizon']) / (H - SPEC['horizon'])
        hgt = 8 + 26 * t
        for _ in range(rng.integers(1, 4)):
            wid = (90 + 520 * t) * rng.uniform(0.3, 1.0)
            cx = pcx + rng.normal(0, 26 + 80 * t)
            d = np.hypot(cx - px, y - py)
            p_ = push * np.exp(-d / 120)
            cx += (cx - px) / (abs(cx - px) + 1e-6) * p_
            yb = y + (y - py) / (abs(y - py) + 1e-6) * p_ * 0.25
            strip = cv2.resize(tex, (max(4, int(wid)), max(2, int(hgt))), interpolation=cv2.INTER_AREA)
            sh_, sw_ = strip.shape[:2]
            u = np.linspace(-1, 1, sw_)[None, :]
            v = np.linspace(-1, 1, sh_)[:, None]
            top_ = cv2.resize(rng.random((1, max(4, sw_ // 9))).astype(np.float32), (sw_, 1), interpolation=cv2.INTER_CUBIC)
            bot_ = cv2.resize(rng.random((1, max(4, sw_ // 9))).astype(np.float32), (sw_, 1), interpolation=cv2.INTER_CUBIC)
            taper = np.clip(1 - np.abs(u) ** 2.2, 0, 1) ** 0.6
            lo, hi_ = -0.2 - 0.8 * bot_ * taper, 0.2 + 0.8 * top_ * taper
            sa = np.clip((v - lo) * sh_ * 0.5, 0, 1) * np.clip((hi_ - v) * sh_ * 0.5, 0, 1) * (taper > 0.05)
            bright = 1.7 * (1 - 0.45 * t) * rng.uniform(0.65, 1.0)
            s_img, s_a = place(strip * bright, sa.astype(np.float32), cx - sw_ / 2, yb - sh_ / 2)
            path += s_img * s_a[..., None]
        y += hgt * 0.65 + 4 + 16 * t * rng.uniform(0.4, 1.6)
    path = cv2.GaussianBlur(path, (0, 0), 0.7)
    glow = cv2.GaussianBlur(path, (0, 0), 30) * 0.5  # the water around the path lit warm
    return (path + glow) * np.array([1.0, 0.9, 0.72], np.float32)


# ---------------------------------------------------------------------------------------------
# the banks

def edge_y(points, x):
    p = np.asarray(points, np.float32)
    return np.interp(x, p[:, 0], p[:, 1])


def torn(poly, seed, wobble=2.6):
    """A cut-paper piece: the polygon, its edge displaced by fibre noise (px), crisp to a pixel."""
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [np.round(np.asarray(poly, np.float32)).astype(np.int32)], 255)
    sd = cv2.distanceTransform(m, cv2.DIST_L2, 5) - cv2.distanceTransform(255 - m, cv2.DIST_L2, 5)
    sd += wobble * unit_noise((H, W), 14, seed) + 0.4 * unit_noise((H, W), 1.6, seed + 1)
    return np.clip(sd + 0.5, 0, 1).astype(np.float32)


def earth(target, x0, x1, seed):
    """The bank piece's dark earth paper, its inside cropped, mirrored into a tile over the frame and
    graded to the target (linear light)."""
    fg, _ = cutout(SPEC['bank'])
    crop = lin(fg[1420:2080, x0:x1])
    crop = cv2.resize(crop, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA)
    tile = np.concatenate([crop, crop[:, ::-1]], 1)
    tile = np.concatenate([tile, tile[::-1]], 0)
    reps = (H // tile.shape[0] + 1, W // tile.shape[1] + 1, 1)
    tex = np.tile(tile, reps)[:H, :W]
    tex = grade_to(tex, np.ones((H, W), np.float32), target)
    return tex * (1 + 0.12 * unit_noise((H, W), 6, seed)[..., None] * 0.5)


_BLADES = None


def blades():
    """The bank piece's grass, cut free of its slab: each blade or cattail a sprite (fg, alpha) with
    its root at the bottom; the card's soft shadow beside each blade keyed back out."""
    global _BLADES
    if _BLADES is not None:
        return _BLADES
    fg, a = cutout(SPEC['bank'])
    m = (a > 0.5).astype(np.uint8)
    slab = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (91, 91)))
    h, w = m.shape
    has = slab.any(0)
    top = cv2.GaussianBlur(np.where(has, np.argmax(slab, 0), h).astype(np.float32)[None], (0, 0), 15)[0]
    grass = (m > 0) & (np.arange(h)[:, None] < top[None] - 6)
    lum = fg.mean(-1)
    n, lab, st, _ = cv2.connectedComponentsWithStats(grass.astype(np.uint8), 8)
    out = []
    for i in range(1, n):
        x0, y0, ww, hh, area = st[i]
        if area < 4000 or hh < 150:
            continue
        sel = cv2.dilate((lab[y0:y0 + hh, x0:x0 + ww] == i).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
        al = a[y0:y0 + hh, x0:x0 + ww] * sel * np.clip((0.46 - lum[y0:y0 + hh, x0:x0 + ww]) / 0.06, 0, 1)
        out.append(al.astype(np.float32))
    _BLADES = out
    return out


def sow(top, spans, clumps=(), seed=0):
    """Grass stood along a bank's top edge: blades scaled to a height, flipped and leaning at random,
    in small clumps, each root sunk 4 px into the bank. Returns an alpha."""
    sprites = blades()
    acc = np.zeros((H, W), np.float32)

    def blade(x, hgt, rng):
        al = sprites[rng.integers(len(sprites))]
        k = hgt / al.shape[0]
        b = cv2.resize(al, (max(2, int(al.shape[1] * k)), max(2, int(hgt))), interpolation=cv2.INTER_AREA)
        if rng.random() < 0.5:
            b = b[:, ::-1]
        lean = rng.normal(0, 7)
        pad = int(hgt * 0.5) + 4
        b = cv2.copyMakeBorder(b, 0, 0, pad, pad, cv2.BORDER_CONSTANT, value=0)
        R = cv2.getRotationMatrix2D((b.shape[1] / 2, b.shape[0] - 1), lean, 1.0)
        b = cv2.warpAffine(b, R, (b.shape[1], b.shape[0]), flags=cv2.INTER_LINEAR)
        return place_a(b, x - b.shape[1] / 2, edge_y(top, x) + 4 - b.shape[0])

    rng = np.random.default_rng(seed)
    for (x0, x1, (h0, h1), per100, sd) in spans:
        r2 = np.random.default_rng(sd)
        x = x0 + r2.uniform(0, 30)
        while x < x1:
            for _ in range(r2.integers(1, 4)):
                pa = blade(x + r2.normal(0, 6), r2.uniform(h0, h1), r2)
                acc = acc + pa * (1 - acc)
            x += r2.exponential(100 / per100) + 8
    for (x, hgt) in clumps:
        for _ in range(3):
            pa = blade(x + rng.normal(0, 7), hgt * rng.uniform(0.75, 1.1), rng)
            acc = acc + pa * (1 - acc)
    return acc


def rim_light(a, strength):
    """Where a piece's edge faces the moon, a thin warm line of her light (linear light)."""
    mx, my = SPEC['moon_at']
    g = cv2.GaussianBlur(a, (0, 0), 2.0)
    gy, gx = np.gradient(g)
    n = np.stack([-gx, -gy], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True) + 1e-6
    L = np.stack([mx - XX, my - YY], -1)
    L /= np.linalg.norm(L, axis=-1, keepdims=True) + 1e-6
    r = np.clip((n * L).sum(-1), 0, 1) * np.clip(g * (1 - g) * 4, 0, 1) * a
    return r[..., None] * np.array(SPEC['moon_light'], np.float32) * strength


@lru_cache(maxsize=1)
def under_light():
    """Her path's warm light from below, strongest at the water by his paw (cached, read-only)."""
    cx, cy = SPEC['path_x'], SPEC['waterline'] + 32
    u = np.clip(1 - np.hypot((XX - cx) / 440, (YY - cy) / 320), 0, 1) ** 1.4
    u = (u * np.clip((YY - (cy - 400)) / 360, 0, 1)).astype(np.float32)
    u.setflags(write=False)
    return u


def banks():
    """The two bank planes, each (linear light, alpha), their grass sown along their tops."""
    far, near = SPEC['far_bank'], SPEC['near_bank']
    fa = torn(far['top'] + far['rest'], 41)
    fgr = sow(far['top'], SPEC['far_grass'], seed=5)
    tex = earth(SPEC['targets']['far_bank'], 600, 2400, 43)
    grass_col = lin(hexrgb(SPEC['targets']['far_bank'])) * 0.8
    f_rgb = over(tex, np.broadcast_to(grass_col, tex.shape), fgr)
    f_a = np.maximum(fa, fgr)
    f_rgb = f_rgb + rim_light(f_a, 0.10)

    na = torn(near['top'] + near['rest'], 51)
    ngr = sow(near['top'], SPEC['near_grass'], SPEC['near_clumps'], seed=6)
    tex = earth(SPEC['targets']['near_bank'], 2400, 4200, 53)
    top = edge_y(near['top'], XX[0])[None, :]
    bottom = bank_bottom(na)[None, :]
    lip = np.clip(1 - (YY - top) / (18 + 10 * noise((1, W), 30, 57)), 0, 1) ** 1.5  # its top, catching the moon
    face = np.clip((YY - top - 16) / 40, 0, 1)                                    # its face, darker going down
    wet = np.clip(1 - (bottom - YY) / 9, 0, 1)                                    # wet where it meets the water
    shade = (1 + 0.9 * lip[..., None] * np.array([1.15, 1.0, 0.8], np.float32)) * (1 - 0.4 * face - 0.3 * wet)[..., None]
    tex = tex * shade
    grass_col = lin(hexrgb(SPEC['targets']['near_bank'])) * 0.75
    n_rgb = over(tex, np.broadcast_to(grass_col, tex.shape), ngr)
    n_a = np.maximum(na, ngr)
    n_rgb = n_rgb * (1 + under_light()[..., None] * np.array([0.5, 0.33, 0.12], np.float32))
    n_rgb = n_rgb + rim_light(n_a, 0.07)
    return (f_rgb, f_a), (n_rgb, n_a)


def bank_bottom(a):
    """Per column, the lowest row of a piece (-1 where it has none)."""
    bottom = np.full(W, -1.0, np.float32)
    has = a > 0.5
    cols = has.any(0)
    bottom[cols] = H - 1 - np.argmax(has[::-1, cols], 0)
    sm = cv2.GaussianBlur(bottom[None], (0, 0), sigmaX=4, sigmaY=0.1)[0]  # the line the water meets, not each fibre
    return np.where(cols, sm, -1).astype(np.float32)


@lru_cache(maxsize=16)
def streaks(seed, sx=24, sy=1.5):
    """Horizontal ripple streaks, 0..1: the water's surface breaking what it reflects (cached)."""
    s = np.clip(0.5 + 0.25 * unit_noise((H, W), 3, seed), 0, 1)
    s = cv2.GaussianBlur(s, (0, 0), sigmaX=sx, sigmaY=sy)
    s = np.clip((s - s.mean()) / max(s.std(), 1e-6) * 0.25 + 0.5, 0, 1)
    s.setflags(write=False)
    return s


def bank_reflection(near_a, seed=61):
    """The water against the near bank: its dark reflection in front of it, broken into streaks,
    and a thin lap line of sky where water meets earth. Returns (darken, light)."""
    bottom = bank_bottom(near_a)
    cols = (bottom >= 0)[None, :]
    d = YY - bottom[None, :]
    m = np.exp(-np.clip(d, 0, None) / 30) * (d > 0) * cols
    dark = np.clip(m * (0.35 + 0.65 * streaks(seed)), 0, 1) * 0.6
    lap = np.exp(-((d - 1.8) / 1.1) ** 2) * cols * (0.4 + 0.6 * streaks(seed + 1, 6, 0.5))
    return dark, lap


# ---------------------------------------------------------------------------------------------
# the fox on the stage

def light_fox(big, alpha, under=1.0):
    """Moonlight from her (behind him): a broad key from the matte's normals, a rim where his edges
    face her, the night's cool fill, and her path's warm light from below (`under` of it)."""
    mx, my = SPEC['moon_at']

    def normals(sigma):
        g = cv2.GaussianBlur(alpha, (0, 0), sigma)
        gy, gx = np.gradient(g)
        n = np.stack([-gx, -gy], -1)
        return n / (np.linalg.norm(n, axis=-1, keepdims=True) + 1e-6), g
    Lx, Ly = mx - XX, my - YY
    ln = np.hypot(Lx, Ly) + 1e-6
    ldir = np.stack([Lx / ln, Ly / ln], -1)
    nb, gb = normals(28)
    key = np.clip((nb * ldir).sum(-1), 0, 1) * np.clip(1 - gb, 0, 1) * 2
    nr, gr = normals(2.5)
    rim = np.clip((nr * ldir).sum(-1), 0, 1) * np.clip(gr * (1 - gr) * 4, 0, 1)
    moonlight = np.array(SPEC['moon_light'], np.float32)
    lit = big * np.array([0.74, 0.78, 0.90], np.float32)
    lit += big * (np.clip(key, 0, 1)[..., None] * 0.8) * moonlight
    lit += rim[..., None] * moonlight * 1.2 * alpha[..., None]
    lit *= 1 + under * under_light()[..., None] * np.array([0.6, 0.4, 0.14], np.float32)
    return lit


def contact(alpha):
    """Where his paw crosses the waterline right of the shore: (x0, x1), or None if nothing touches."""
    yw, sx = int(SPEC['waterline']), int(SPEC['shore_x']) + 4
    xs = np.nonzero(alpha[yw, sx:] > 0.5)[0]
    return (sx + int(xs.min()), sx + int(xs.max())) if len(xs) else None


def submerge(lit, alpha, seed=91):
    """The part of him under the pond's surface (right of the shore, below the waterline): seen
    through the water, raised a little by refraction and wavering, murky, cooler, less there."""
    yw = SPEC['waterline']
    d = YY - yw
    my_ = (yw + np.clip(d, 0, None) / 0.78).astype(np.float32)
    mx_ = (XX + 0.9 * np.sin(d * 0.9 + 2 * unit_noise((H, W), 8, seed))).astype(np.float32)
    rl = cv2.remap(lit * alpha[..., None], mx_, my_, cv2.INTER_LINEAR, borderValue=0)
    ra = cv2.remap(alpha, mx_, my_, cv2.INTER_LINEAR, borderValue=0)
    rl, ra = cv2.GaussianBlur(rl, (0, 0), 0.8), cv2.GaussianBlur(ra, (0, 0), 0.8)
    rl = rl / np.maximum(ra[..., None], 1e-4)
    water = lin(hexrgb(SPEC['targets']['water']))
    murk = np.clip(d / 26, 0, 1)[..., None]  # deeper is murkier
    seen = (rl * np.array([0.55, 0.62, 0.75], np.float32)) * (1 - 0.5 * murk) + water * (0.25 + 0.3 * murk)
    sub = (np.clip((d + 1.2) / 2.4, 0, 1) * np.clip(XX - SPEC['shore_x'], 0, 1))[..., None]
    return lit * (1 - sub) + seen * sub, alpha * (1 - sub[..., 0]) + ra * 0.85 * sub[..., 0]


def reflection(lit, alpha, ring_at=None, seed=71):
    """His reflection (premultiplied linear light, alpha): what of him stands over the water,
    mirrored at the waterline, dark (he is lit from behind), swaying with the ripples, broken into
    streaks and by the rings. The banks, drawn after it, hide what they stand in front of."""
    yw = SPEC['waterline']
    d = YY - yw
    dx = 2.2 * np.sin(d * 0.42 + 2.5 * unit_noise((H, W), 20, seed)) * np.clip(d / 16, 0, 1)
    if ring_at is not None:
        rr = np.hypot(XX - ring_at[0], (YY - ring_at[1]) / 0.3)
        dx += 3.5 * np.sin(rr * 2 * np.pi / 18) * np.exp(-rr / 90)
    mx_, my_ = (XX + dx).astype(np.float32), (2 * yw - YY).astype(np.float32)
    pm = cv2.remap(lit * alpha[..., None], mx_, my_, cv2.INTER_LINEAR, borderValue=0)
    ra = cv2.remap(alpha, mx_, my_, cv2.INTER_LINEAR, borderValue=0)
    fade = np.exp(-np.clip(d, 0, None) / 170) * (d > 0) * (0.6 + 0.4 * streaks(seed + 1))
    pm = cv2.GaussianBlur(pm, (0, 0), sigmaX=0.8, sigmaY=1.6)
    ra = cv2.GaussianBlur(ra, (0, 0), sigmaX=0.8, sigmaY=1.6)
    # lit from behind, the side of him the water sees is in shadow: a dark shape, a little warm
    return pm * fade[..., None] * np.array([0.07, 0.06, 0.06], np.float32) * 0.7, ra * fade * 0.7


def rings(center, radii, strengths, front, width=2, seed=81):
    """Ripple rings on the water about `center` (an ellipse 0.3 as deep as wide): the near halves
    (front) or the far halves. Each ring a light crest with a dark trough just outside it, broken
    along its length; the far halves, facing her, catch more light. Returns (light, dark)."""
    light = np.zeros((H, W), np.float32)
    dark = np.zeros((H, W), np.float32)
    a0, a1 = (0, 180) if front else (180, 360)
    c = (int(round(center[0])), int(round(center[1])))
    for rad, s in zip(radii, strengths):
        if rad > 0 and s > 0:
            cv2.ellipse(light, c, (int(rad), max(1, int(rad * 0.3))), 0, a0, a1, float(s), width, cv2.LINE_AA)
            cv2.ellipse(dark, c, (int(rad) + 3, max(1, int((rad + 3) * 0.3))), 0, a0, a1, float(s), width, cv2.LINE_AA)
    brk = np.clip(0.55 + 0.35 * unit_noise((H, W), 5, seed), 0.1, 1)
    k = 0.75 if front else 1.2
    return cv2.GaussianBlur(light * brk, (0, 0), 0.9) * k, cv2.GaussianBlur(dark * brk, (0, 0), 1.2)


def meniscus(alpha):
    """The bright collar where his paw enters the water, hugging the paw's width."""
    yw = int(SPEC['waterline'])
    row = (alpha[yw] > 0.3).astype(np.float32) * (XX[0] > SPEC['shore_x'])
    prof = cv2.GaussianBlur(cv2.dilate(row[None], np.ones((1, 7), np.uint8)), (0, 0), sigmaX=3.5, sigmaY=0.1)[0]
    prof *= np.clip(0.55 + 0.45 * unit_noise((1, W), 2.5, 97), 0, 1)[0]
    return prof[None, :] * np.exp(-((YY - yw - 1.0) / 1.4) ** 2)


def ground_shadows(alpha, at=None, lean=None):
    """Where he sits: the ground darkened right at his feet (on the far bank), and his shadow cast
    toward us across the near bank (the moon is behind him), foreshortened."""
    ax, ay = SPEC['anchor_at'] if at is None else at
    t = np.tan(np.radians(SPEC['lean'] if lean is None else lean))
    foot = ay + (XX - ax) * t
    low = alpha * np.clip((YY - (foot - 28)) / 10, 0, 1)
    ao = np.clip(cv2.GaussianBlur(low, (0, 0), 9) * 1.4, 0, 1)
    d = np.clip(YY - foot, 0, None)
    src_y = foot - d / 0.28
    src_x = XX + d / 0.28 * 0.22
    cast = cv2.remap(alpha, src_x.astype(np.float32), src_y.astype(np.float32), cv2.INTER_LINEAR, borderValue=0) * (d > 0)
    cast = cv2.GaussianBlur(cast, (0, 0), 8)
    return ao, cast


def pins(comp, M, pins_src, pin_d_src):
    mx, my = SPEC['moon_at']
    pd = pin_d_src * SPEC['fox_scale']
    for (sx, sy) in pins_src:
        cx, cy = M @ np.array([sx, sy, 1.0], np.float32)
        r = pd / 2
        dd = np.hypot(XX - cx, YY - cy)
        disk = np.clip(r + 0.5 - dd, 0, 1)
        lx, ly = (mx - cx), (my - cy)
        l_ = np.hypot(lx, ly)
        hi = np.clip(1 - np.hypot(XX - (cx + lx / l_ * r * 0.4), YY - (cy + ly / l_ * r * 0.4)) / (r * 1.2), 0, 1)
        brass = lin(np.array([0.50, 0.40, 0.20], np.float32)) * (0.35 + 1.4 * hi[..., None] ** 1.5)
        ring = np.clip(r + 1.5 - dd, 0, 1) - disk
        comp = comp * (1 - disk[..., None]) + brass * disk[..., None]
        comp *= 1 - 0.5 * ring[..., None]
    return comp


def branch_layer(angle=-24, at=(COL_X - 260, -260)):
    brg, bra = cutout(SPEC['branch'], key='dark', flip=True)
    ys, xs = np.nonzero(bra > 0.5)
    brg, bra = brg[ys.min():ys.max() + 1, xs.min():xs.max() + 1], bra[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    k2 = 620 / brg.shape[1]
    brg = cv2.resize(brg, None, fx=k2, fy=k2, interpolation=cv2.INTER_AREA)
    bra = cv2.resize(bra, None, fx=k2, fy=k2, interpolation=cv2.INTER_AREA)
    M = cv2.getRotationMatrix2D((brg.shape[1] / 2, brg.shape[0] / 2), angle, 1.0)
    pad = (int(brg.shape[1] * 1.2), int(brg.shape[1] * 1.2))
    M[:, 2] += [(pad[0] - brg.shape[1]) / 2, (pad[1] - brg.shape[0]) / 2]
    brg = cv2.warpAffine(brg, M, pad, flags=cv2.INTER_CUBIC)
    bra = cv2.warpAffine(bra, M, pad, flags=cv2.INTER_CUBIC)
    return place(lin(brg) * 0.25, bra, at[0], at[1])


def reeds_layer():
    rfg, ra = cutout(SPEC['reeds'], key='dark', band=(0.22, 0.86))
    k3 = 560 / ra.shape[0]
    ra = cv2.resize(ra, None, fx=k3, fy=k3, interpolation=cv2.INTER_AREA)
    rw = ra.shape[1]
    left, right = ra[:, : rw // 2], ra[:, rw // 2:]
    _, la = place(np.zeros((*left.shape, 3), np.float32), left, COL_X - left.shape[1] * 0.55, H - left.shape[0] + 40)
    _, rra = place(np.zeros((*right.shape, 3), np.float32), right, COL_X + COL_W - right.shape[1] * 0.45, H - right.shape[0] + 30)
    near = cv2.GaussianBlur(np.maximum(la, rra), (0, 0), 3.5)
    return lin(np.array([0.035, 0.03, 0.035], np.float32)), near


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)

    # the fox first: where his paw meets the water places the rings and pushes the path
    L, A = fox_piece(SPEC['fox'])
    big, alpha, M = place_fox(L, A)
    span = contact(alpha)
    ring_at = ((span[0] + span[1]) / 2, SPEC['waterline'] + 1) if span else None
    lit = light_fox(big, alpha)

    # 1-2. the plate, the moon, her path
    scene = haze(plate())
    sky, skya, halo, mm = moon_layer()
    scene = over(scene, sky, skya) + halo * 0.8
    scene += path_strips(mm, push_at=ring_at)

    # 3. on the water: his reflection, the near bank's, the far halves of the rings
    (f_rgb, f_a), (n_rgb, n_a) = banks()
    rp, ra = reflection(lit, alpha, ring_at)
    scene = scene * (1 - ra[..., None]) + rp
    dark, lap = bank_reflection(n_a)
    ring_col = lin(np.array([0.9, 0.86, 0.78], np.float32))
    scene = scene * (1 - dark[..., None]) + lap[..., None] * ring_col * 0.12
    radii, strengths = (33, 52, 76, 104), (0.5, 0.45, 0.3, 0.16)
    if ring_at:
        li, dk = rings(ring_at, radii, strengths, front=False)
        scene = scene * (1 - 0.5 * dk[..., None]) + li[..., None] * ring_col

    # 4. the far bank, darkened where he sits
    ao, cast = ground_shadows(alpha)
    scene = over(scene, f_rgb * (1 - 0.6 * ao[..., None]), f_a)

    # 5. the fox, his paw in the water, his pins
    lit_s, alpha_s = submerge(lit, alpha)
    scene = over(scene, lit_s, alpha_s)
    scene = pins(scene, M, SPEC['pins_src'], SPEC['pin_d_src'])

    # 6. the near halves of the rings and the line where his paw enters (on the water, not on him)
    if ring_at:
        dry = (1 - alpha * (YY < SPEC['waterline']))[..., None]
        li, dk = rings(ring_at, radii, strengths, front=True)
        scene = scene * (1 - 0.5 * dk[..., None] * dry) + li[..., None] * ring_col * dry
        scene += meniscus(alpha)[..., None] * ring_col * 0.35

    # 7. the near bank over his feet, his shadow across it
    scene = over(scene, n_rgb * (1 - 0.45 * cast[..., None]), n_a)

    # 8. the branch and the near reeds
    br_img, br_a = branch_layer()
    scene = over(scene, br_img, br_a)
    reed_col, reed_a = reeds_layer()
    scene = over(scene, np.broadcast_to(reed_col, scene.shape), reed_a)

    img = srgb(scene)
    Image.fromarray((img * 255 + 0.5).astype(np.uint8)).save(out / 'touch-still.png')
    column = img[:, COL_X:COL_X + COL_W]
    Image.fromarray((column * 255 + 0.5).astype(np.uint8)).save(out / 'touch-column.png')
    ref = Image.open(ROOT / 'references/fable/Fox_and_Moon_Orange_Reference_v2.png').convert('RGB').crop((516, 513, 1021, 1016))
    ref = ref.resize((round(505 * H / 503), H), Image.LANCZOS)
    pair = Image.new('RGB', (ref.width + 24 + COL_W, H), (18, 20, 26))
    pair.paste(ref, (0, 0))
    pair.paste(Image.fromarray((column * 255 + 0.5).astype(np.uint8)), (ref.width + 24, 0))
    pair.save(out / 'beside-panel-5.jpg', quality=92)
    feet = [round(float(edge_y(SPEC['near_bank']['top'], x)), 1) for x in (744, 846, 947)]
    report = {'pieces': {k_: SPEC[k_] for k_ in ('plate', 'bank', 'reeds', 'branch', 'fox', 'moon_file')},
              'foxScale': SPEC['fox_scale'], 'anchor': SPEC['anchor_at'], 'lean': SPEC['lean'],
              'waterline': SPEC['waterline'], 'shore': SPEC['shore_x'], 'pawInWater': span,
              'ringsAt': ring_at, 'nearBankAtFeet': feet}
    (out / 'still.json').write_text(json.dumps(report, indent=1))
    print(report)


if __name__ == '__main__':
    main()
