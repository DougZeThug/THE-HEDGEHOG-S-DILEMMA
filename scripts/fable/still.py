"""One composited still of the pilot, the touch (style bible §4), built as depth planes the way the
renderer will build every drawing, back to front:

  1. the back plate (sky, misty pine shore, water), graded per region to the reference's sampled
     night, a thin extra gauze of haze;
  2. the tissue moon with its halo, and her reflection as a broad path of torn strips down the
     water, warm and broken, the strips nearest the paw pushed outward as they break; the rings;
  3. the bank, a cut-out piece of dark earth, its lip falling between his hind feet and his
     reaching paw, so the paw lands on the water; its contact shadow;
  4. the fox, keyed off the card he was generated on (a fitted card surface, colour distance, the
     largest piece, holes filled, eroded, opaque inside, the card taken out of the edges), flipped
     to face right, shrunk with area filtering, graded per material, lit by the moon (key from
     broad matte normals, a rim where his edges face her), her warm light under his chin, the
     night's cool fill; brass pins;
  5. the branch, pushed aside and sprung up at the upper left, a dark silhouette on the sky;
  6. the near reeds, soft with depth, in front of everything.

Every piece comes from audition/fable/kit (art-ledger.json). Writes OUT/touch-still.png (the
1920x1440 matte), touch-column.png (the 4:5 column), beside-panel-5.jpg and still.json.

Usage: python -I scripts/fable/still.py OUT_DIR
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
KIT = ROOT / 'audition' / 'fable' / 'kit'
W, H = 1920, 1440
COL_X, COL_W = (W - 1152) // 2, 1152  # the 4:5 column

SPEC = {
    'plate': 'k3-back-1', 'bank': 'k3-bank-1', 'reeds': 'k3-reeds-1', 'branch': 'k3-branch-1',
    'fox': 'k3-touch-1', 'moon_file': 'k2-moon-1',
    'paw_at': (1144, 950), 'fox_w': 780,          # where his front paw meets the water; his width
    'lip_x': 1040,                                 # the bank's right end, between his hind feet and his paw
    'moon_at': (1100, 240), 'moon_d': 130,
    'horizon': 588,
    # in the generated fox (flipped, source px): the front paw's tip, and the pins
    'paw_src': (4520, 2620),
    'pins_src': [(3440, 1200), (3560, 1880), (2560, 1800), (2240, 2440)],
    'pin_d_src': 80,
    # the reference's night, sampled (bible §2; panel 5 for the bank)
    'targets': {'sky': '#2a3649', 'water': '#262d3a', 'bank': '#161211'},
    'fox_targets': {'orange': '#9a4214', 'cream': '#d8cfb6', 'charcoal': '#1d1613'},
    'moon_light': (1.0, 0.86, 0.62),
}


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


def noise(shape, scale, seed):
    """Paper-fibre noise: smoothed random fields at a few scales, 0..1."""
    rng = np.random.default_rng(seed)
    acc = np.zeros(shape, np.float32)
    for k, wgt in ((scale, 0.6), (scale / 3, 0.3), (scale / 9, 0.1)):
        acc += cv2.GaussianBlur(rng.random(shape).astype(np.float32), (0, 0), max(0.6, k)) * wgt
    acc -= acc.min()
    return acc / max(acc.max(), 1e-6)


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


def cutout(name, key='card', band=None, flip=False):
    """A piece keyed off the ground it was generated on, opaque inside with a crisp paper edge, the
    ground taken back out of its edge pixels. key='card' fits the card as a smooth surface from the
    frame's border and keys by colour distance; key='dark' keys a dark piece off a light ground by
    luminance. band=(y0, y1) keeps only those rows (fractions of the height)."""
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
    if flip:
        fg, a = fg[:, ::-1], a[:, ::-1]
    return np.ascontiguousarray(fg), np.ascontiguousarray(a)


def grade_to(L, a, target):
    """One material, linear light: its median goes to the target."""
    sel = a > 0.9
    return L * (lin(hexrgb(target)) / np.maximum(np.median(L[sel], axis=0), 1e-4))


def grade_fox(fg, a):
    """Per material, in linear light: each material's median goes to its target, blended softly."""
    hsv = cv2.cvtColor(fg.astype(np.float32), cv2.COLOR_RGB2HSV)
    hue, sat, val = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    inside = a > 0.9
    w = {
        'orange': np.clip((sat - 0.35) / 0.2, 0, 1) * np.clip((val - 0.3) / 0.15, 0, 1) * ((hue < 45) | (hue > 340)),
        'cream': np.clip((0.35 - sat) / 0.15, 0, 1) * np.clip((val - 0.55) / 0.15, 0, 1),
        'charcoal': np.clip((0.32 - val) / 0.12, 0, 1),
    }
    L = lin(fg)
    gain = np.zeros_like(L)
    tot = np.zeros(a.shape, np.float32)
    for k, m in w.items():
        sel = inside & (m > 0.8)
        g = lin(hexrgb(SPEC['fox_targets'][k])) / np.maximum(np.median(L[sel], axis=0), 1e-4)
        gain += m[..., None] * g
        tot += m
    rest = tot < 1e-3
    gain[rest] = np.median(gain[~rest] / tot[~rest][..., None], axis=0)
    tot[rest] = 1
    return L * gain / tot[..., None]


def plate():
    p = load(SPEC['plate'])
    p = cv2.resize(p, (W, H), interpolation=cv2.INTER_AREA)
    pl = lin(p)
    hsv = cv2.cvtColor(p, cv2.COLOR_RGB2HSV)
    yy = np.arange(H)[:, None] * np.ones((1, W))
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
    yy = np.arange(H, dtype=np.float32)[:, None]
    hz = SPEC['horizon']
    band = np.exp(-((yy - (hz - 20)) / 80) ** 2) * 0.22
    a = np.clip(band * (0.75 + 0.5 * noise((H, W), 18, 7)), 0, 0.4)[..., None]
    return scene * (1 - a) + lin(np.array([0.36, 0.41, 0.52], np.float32)) * a


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    mx, my = SPEC['moon_at']
    px, py = SPEC['paw_at']

    # 1. the back plate
    scene = haze(plate())

    # 2. the moon, her reflection, the rings
    moon = load(SPEC['moon_file'])
    md = SPEC['moon_d']
    k = md / (moon.shape[0] * 0.65)
    mm = cv2.resize(lin(moon) * np.array([1.0, 1.03, 1.12], np.float32), None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
    ma = cv2.resize(np.clip((moon.mean(-1) - 0.08) / 0.25, 0, 1), None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
    sky, skya = place(mm, ma, mx - ma.shape[1] / 2, my - ma.shape[0] / 2)
    halo = cv2.GaussianBlur(sky * skya[..., None], (0, 0), md * 0.6) * np.array([1.0, 0.85, 0.6], np.float32)
    scene = scene * (1 - skya[..., None]) + sky * skya[..., None] + halo * 0.8

    rng = np.random.default_rng(11)
    tex = cv2.resize(mm, (400, 60), interpolation=cv2.INTER_AREA)
    path = np.zeros_like(scene)
    pcx = px + 70  # the paw falls on the path's near edge
    y = SPEC['horizon'] + 12
    while y < H:
        t = (y - SPEC['horizon']) / (H - SPEC['horizon'])
        hgt = 8 + 26 * t
        for _ in range(rng.integers(1, 4)):
            wid = (90 + 520 * t) * rng.uniform(0.3, 1.0)
            cx = pcx + rng.normal(0, 26 + 80 * t)
            d = np.hypot(cx - px, y - py)
            push = 60 * np.exp(-d / 120)
            cx += (cx - px) / (abs(cx - px) + 1e-6) * push
            yb = y + (y - py) / (abs(y - py) + 1e-6) * push * 0.25
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
    scene += (path + glow) * np.array([1.0, 0.9, 0.72], np.float32)
    rings = np.zeros((H, W), np.float32)
    for (r, aa) in ((30, 0.6), (56, 0.38), (86, 0.2)):
        cv2.ellipse(rings, (int(px), int(py + 6)), (r, int(r * 0.30)), 0, 0, 360, aa, 2, cv2.LINE_AA)
    scene += cv2.GaussianBlur(rings, (0, 0), 0.7)[..., None] * lin(np.array([0.9, 0.86, 0.78], np.float32))

    # 3. the bank, its lip between his hind feet and his paw
    bfg, ba = cutout(SPEC['bank'])
    ys, xs = np.nonzero(ba > 0.5)
    bfg, ba = bfg[ys.min():ys.max() + 1, xs.min():xs.max() + 1], ba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    bs = (SPEC['lip_x'] + 120) / bfg.shape[1]
    bfg = cv2.resize(bfg, None, fx=bs, fy=bs, interpolation=cv2.INTER_AREA)
    ba = cv2.resize(ba, None, fx=bs, fy=bs, interpolation=cv2.INTER_AREA)
    # its earth's top edge (below the grass) sits under his feet
    rows = np.nonzero((ba > 0.5).mean(axis=1) > 0.6)[0]
    top = rows[0] if len(rows) else 0
    bank_img, bank_a = place(grade_to(lin(bfg), ba, SPEC['targets']['bank']), ba, SPEC['lip_x'] - bfg.shape[1], py + 12 - top)

    # 4. the fox
    fg, a = cutout(SPEC['fox'], flip=True)
    ys, xs = np.nonzero(a > 0.5)
    s = SPEC['fox_w'] / (xs.max() - xs.min())
    fgs = cv2.resize(fg, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    As = cv2.resize(a, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    L = grade_fox(fgs, As)
    ox, oy = px - SPEC['paw_src'][0] * s, py - SPEC['paw_src'][1] * s
    big, alpha = place(L, As, ox, oy)

    def normals(sigma):
        g = cv2.GaussianBlur(alpha, (0, 0), sigma)
        gy, gx = np.gradient(g)
        n = np.stack([-gx, -gy], -1)
        return n / (np.linalg.norm(n, axis=-1, keepdims=True) + 1e-6), g
    Lx, Ly = mx - xx, my - yy
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
    under = np.clip(1 - np.hypot((xx - pcx) / 440, (yy - (py + 40)) / 320), 0, 1) ** 1.4
    under *= np.clip((yy - (py - 360)) / 360, 0, 1)
    lit *= 1 + under[..., None] * np.array([0.6, 0.4, 0.14], np.float32)

    # the bank goes down, then his contact shadow on it, then him
    comp = scene * (1 - bank_a[..., None]) + bank_img * bank_a[..., None]
    sh = cv2.GaussianBlur(np.roll(np.roll(alpha, 12, 0), -18, 1), (0, 0), 10)
    comp *= 1 - 0.5 * sh[..., None] * bank_a[..., None]
    comp = comp * (1 - alpha[..., None]) + lit * alpha[..., None]

    pd = SPEC['pin_d_src'] * s
    for (sx, sy) in SPEC['pins_src']:
        cx, cy = ox + sx * s, oy + sy * s
        r = pd / 2
        dd = np.hypot(xx - cx, yy - cy)
        disk = np.clip(r + 0.5 - dd, 0, 1)
        lx, ly = (mx - cx), (my - cy)
        l_ = np.hypot(lx, ly)
        hi = np.clip(1 - np.hypot(xx - (cx + lx / l_ * r * 0.4), yy - (cy + ly / l_ * r * 0.4)) / (r * 1.2), 0, 1)
        brass = lin(np.array([0.50, 0.40, 0.20], np.float32)) * (0.35 + 1.4 * hi[..., None] ** 1.5)
        ring = np.clip(r + 1.5 - dd, 0, 1) - disk
        comp = comp * (1 - disk[..., None]) + brass * disk[..., None]
        comp *= 1 - 0.5 * ring[..., None]

    # 5. the branch, sprung up and away at the upper left
    brg, bra = cutout(SPEC['branch'], key='dark', flip=True)
    ys, xs = np.nonzero(bra > 0.5)
    brg, bra = brg[ys.min():ys.max() + 1, xs.min():xs.max() + 1], bra[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    k2 = 620 / brg.shape[1]
    brg = cv2.resize(brg, None, fx=k2, fy=k2, interpolation=cv2.INTER_AREA)
    bra = cv2.resize(bra, None, fx=k2, fy=k2, interpolation=cv2.INTER_AREA)
    M = cv2.getRotationMatrix2D((brg.shape[1] / 2, brg.shape[0] / 2), -24, 1.0)
    pad = (int(brg.shape[1] * 1.2), int(brg.shape[1] * 1.2))
    M[:, 2] += [(pad[0] - brg.shape[1]) / 2, (pad[1] - brg.shape[0]) / 2]
    brg = cv2.warpAffine(brg, M, pad, flags=cv2.INTER_CUBIC)
    bra = cv2.warpAffine(bra, M, pad, flags=cv2.INTER_CUBIC)
    br_img, br_a = place(lin(brg) * 0.25, bra, COL_X - 260, -260)
    comp = comp * (1 - br_a[..., None]) + br_img * br_a[..., None]

    # 6. the near reeds, soft with depth
    rfg, ra = cutout(SPEC['reeds'], key='dark', band=(0.22, 0.86))
    k3 = 560 / ra.shape[0]
    ra = cv2.resize(ra, None, fx=k3, fy=k3, interpolation=cv2.INTER_AREA)
    rw = ra.shape[1]
    left, right = ra[:, : rw // 2], ra[:, rw // 2:]
    near = np.zeros((H, W), np.float32)
    _, la = place(np.zeros((*left.shape, 3), np.float32), left, COL_X - left.shape[1] * 0.55, H - left.shape[0] + 40)
    _, rra = place(np.zeros((*right.shape, 3), np.float32), right, COL_X + COL_W - right.shape[1] * 0.45, H - right.shape[0] + 30)
    near = np.maximum(la, rra)
    near = cv2.GaussianBlur(near, (0, 0), 3.5)
    comp = comp * (1 - near[..., None]) + lin(np.array([0.035, 0.03, 0.035], np.float32)) * near[..., None]

    img = srgb(comp)
    Image.fromarray((img * 255 + 0.5).astype(np.uint8)).save(out / 'touch-still.png')
    column = img[:, COL_X:COL_X + COL_W]
    Image.fromarray((column * 255 + 0.5).astype(np.uint8)).save(out / 'touch-column.png')
    ref = Image.open(ROOT / 'references/fable/Fox_and_Moon_Orange_Reference_v2.png').convert('RGB').crop((516, 513, 1021, 1016))
    ref = ref.resize((round(505 * H / 503), H), Image.LANCZOS)
    pair = Image.new('RGB', (ref.width + 24 + COL_W, H), (18, 20, 26))
    pair.paste(ref, (0, 0))
    pair.paste(Image.fromarray((column * 255 + 0.5).astype(np.uint8)), (ref.width + 24, 0))
    pair.save(out / 'beside-panel-5.jpg', quality=92)
    report = {'pieces': {k_: SPEC[k_] for k_ in ('plate', 'bank', 'reeds', 'branch', 'fox', 'moon_file')},
              'foxScale': round(float(s), 4), 'moonPx': md, 'paw': [px, py]}
    (out / 'still.json').write_text(json.dumps(report, indent=1))
    print(report)


if __name__ == '__main__':
    main()
