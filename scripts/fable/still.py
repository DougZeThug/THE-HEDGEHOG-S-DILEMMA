"""One composited still of the pilot, the touch (style bible §4: shown to the artist beside panel 5
before any rig is built). Every step is one the renderer will do on every drawing:

  - the set plate, framed closer (a window into the 4K plate), graded per region to the
    reference's sampled night (sky, water, bank; black card darkened with them);
  - a tracing-paper haze over the far shore (Norstein: haze is a paper plane, never a blur);
  - the fox, keyed off the flat card it was generated on: the card is fitted as a smooth surface
    from the frame's border, the matte comes from colour distance to it, the largest piece is kept,
    holes are filled, the edge is eroded and the card colour taken back out of the edge pixels
    (F = (I - (1 - a) B) / a), so no pale halo;
  - flipped to face right as the reference does, shrunk with area filtering to its screen size,
    graded per material (burnt orange, cream, charcoal) to the reference's palette;
  - lit: the moon as key, modelled from the matte's broad normals, a rim on the edges facing her,
    her warm light from the water under his chin and chest, and the night's cool fill;
  - matte domed brass pins at the agreed joints, lit from the moon's side;
  - a soft contact shadow on the bank;
  - the tissue moon, graded to ivory, with its halo; her reflection as a path of broken strips down
    the water, as panel 5 paints it, the strips nearest the paw pushed outward as they break; the
    first two ripple rings;
  - near reeds of black card, soft with depth, in front of everything.

Writes OUT/touch-still.png (the 1920x1440 matte), touch-column.png (the 4:5 column) and
beside-panel-5.jpg (the column beside the reference's panel 5), and still.json.

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
    'plate': 'k2-set-1', 'fox': 'k2-touch-1', 'moon_file': 'k2-moon-1',
    # the plate's window (plate px, 4:3): about 1.45x closer than the whole plate
    'window': (914, 513, 3300),
    # the paw's point on the water and the fox's width, in matte px
    'paw_at': (1144, 950), 'fox_w': 760,
    'moon_at': (1100, 250), 'moon_d': 130,
    'horizon': 609,
    # in the generated fox (flipped, source px): where the reaching paw meets the water, and the pins
    'paw_src': (4900, 2635),
    'pins_src': [(2760, 1720), (3840, 2000), (2160, 2000), (2080, 2500)],
    'pin_d_src': 80,
    # the reference's night, sampled (bible §2; panel 5 for the bank)
    'targets': {'sky': '#2a3649', 'water': '#29303d', 'bank': '#161211'},
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
        n = rng.random(shape).astype(np.float32)
        acc += cv2.GaussianBlur(n, (0, 0), max(0.6, k)) * wgt
    acc -= acc.min()
    return acc / max(acc.max(), 1e-6)


def plate():
    p = load(SPEC['plate'])
    x0, y0, cw = SPEC['window']
    ch = cw * 3 // 4
    p = cv2.resize(p[y0:y0 + ch, x0:x0 + cw], (W, H), interpolation=cv2.INTER_AREA)
    pl = lin(p)
    hsv = cv2.cvtColor(p, cv2.COLOR_RGB2HSV)
    hue, sat, val = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    yy = np.arange(H)[:, None]
    blue = (hue > 190) & (hue < 280) & (val > 0.12)
    regions = {'sky': blue & (yy < SPEC['horizon']), 'water': blue & (yy >= SPEC['horizon']),
               'bank': (hue < 50) & (sat > 0.15) & (val > 0.1)}
    acc = np.zeros_like(pl)
    weight = np.zeros(pl.shape[:2], np.float32)
    for name, m in regions.items():
        g = lin(hexrgb(SPEC['targets'][name])) / np.maximum(np.median(pl[m], axis=0), 1e-4)
        acc[m] += g
        weight[m] += 1
    other = weight == 0
    acc[other] = np.median(acc[~other], axis=0) * 0.8
    weight[other] = 1
    gain = cv2.GaussianBlur(acc / weight[..., None], (0, 0), 6)
    return pl * gain


def haze(scene):
    """A tracing-paper gauze over the far shore: densest just above the waterline, thinning upward
    and onto the near water, with the paper's own fibre."""
    yy = np.arange(H, dtype=np.float32)[:, None]
    hz = SPEC['horizon']
    band = np.exp(-((yy - (hz - 30)) / 95) ** 2) * 0.55 + np.exp(-((yy - hz) / 40) ** 2) * 0.25
    fib = 0.75 + 0.5 * noise((H, W), 18, 7)
    a = np.clip(band * fib, 0, 0.75)[..., None] * np.ones((1, W, 1), np.float32)
    colour = lin(np.array([0.36, 0.41, 0.52], np.float32))
    return scene * (1 - a) + colour * a


def fox():
    f = load(SPEC['fox'])
    h, w = f.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    b = np.zeros((h, w), bool)
    b[:40], b[-40:], b[:, :40], b[:, -40:] = True, True, True, True
    A = np.stack([np.ones_like(xx), xx / w, yy / h, (xx / w) ** 2, (yy / h) ** 2, xx * yy / (w * h)], -1)
    card = np.empty_like(f)
    for c in range(3):
        coef, *_ = np.linalg.lstsq(A[b], f[..., c][b], rcond=None)
        card[..., c] = A @ coef
    d = np.linalg.norm(cv2.cvtColor(f, cv2.COLOR_RGB2LAB) - cv2.cvtColor(card.astype(np.float32), cv2.COLOR_RGB2LAB), axis=-1)
    a = np.clip((d - 5) / 9, 0, 1)
    core = (a > 0.5).astype(np.uint8)
    n, lab_, stats, _ = cv2.connectedComponentsWithStats(core, 8)
    keep = (lab_ == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    fill = keep.copy()
    cv2.floodFill(fill, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 1)
    keep = keep | (1 - fill)
    keep = cv2.erode(keep, np.ones((5, 5), np.uint8))
    # Cut paper has a crisp edge and is opaque inside: the matte is the filled core, softened only
    # at its boundary (a partial matte inside the cream let the card show through as grey speck).
    a = cv2.GaussianBlur(keep.astype(np.float32), (0, 0), 1.2)
    fg = (f - (1 - a[..., None]) * card) / np.maximum(a[..., None], 1e-3)
    fg = np.clip(np.where(a[..., None] > 0.02, fg, 0), 0, 1)
    return np.ascontiguousarray(fg[:, ::-1]), np.ascontiguousarray(a[:, ::-1])  # face right


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


def place(img, a, ox, oy):
    big = np.zeros((H, W, img.shape[2]), np.float32)
    alpha = np.zeros((H, W), np.float32)
    x0, y0 = int(round(ox)), int(round(oy))
    hh, ww = a.shape
    sx0, sy0, dx0, dy0 = max(0, -x0), max(0, -y0), max(0, x0), max(0, y0)
    cw, ch = min(ww - sx0, W - dx0), min(hh - sy0, H - dy0)
    big[dy0:dy0 + ch, dx0:dx0 + cw] = img[sy0:sy0 + ch, sx0:sx0 + cw]
    alpha[dy0:dy0 + ch, dx0:dx0 + cw] = a[sy0:sy0 + ch, sx0:sx0 + cw]
    return big, alpha


def reeds(seed=3):
    """Near reeds of black card at the bottom left and the right edge, soft with depth."""
    rng = np.random.default_rng(seed)
    m = np.zeros((H, W), np.float32)
    for x0, n, lean in ((470, 8, 0.10), (1500, 6, -0.12)):
        for _ in range(n):
            bx = x0 + rng.normal(0, 70)
            top = H * rng.uniform(0.58 if x0 < 1000 else 0.66, 0.86)
            w0 = rng.uniform(9, 16)
            bend = rng.uniform(-60, 60) + lean * (H - top)
            pts_l, pts_r = [], []
            for t in np.linspace(0, 1, 24):
                y = H + 10 - t * (H + 10 - top)
                x = bx + bend * t ** 2
                hw = w0 * (1 - t) ** 0.8 + 0.6
                pts_l.append((x - hw, y))
                pts_r.append((x + hw, y))
            poly = np.array(pts_l + pts_r[::-1], np.int32)
            cv2.fillPoly(m, [poly], 1.0, cv2.LINE_AA)
    return cv2.GaussianBlur(m, (0, 0), 3.5)


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    scene = haze(plate())
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    mx, my = SPEC['moon_at']
    px, py = SPEC['paw_at']

    # The moon and its halo.
    moon = load(SPEC['moon_file'])
    md = SPEC['moon_d']
    k = md / (moon.shape[0] * 0.65)
    mm = cv2.resize(lin(moon) * np.array([1.0, 1.03, 1.12], np.float32), None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
    ma = cv2.resize(np.clip((moon.mean(-1) - 0.08) / 0.25, 0, 1), None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
    sky, skya = place(mm, ma, mx - ma.shape[1] / 2, my - ma.shape[0] / 2)
    halo = cv2.GaussianBlur(sky * skya[..., None], (0, 0), md * 0.6) * np.array([1.0, 0.85, 0.6], np.float32)
    scene = scene * (1 - skya[..., None]) + sky * skya[..., None] + halo * 0.8

    # Her reflection: a path of broken strips down the water under her, the nearest to the paw
    # pushed outward as they begin to break (panel 5 paints it so).
    rng = np.random.default_rng(11)
    tex = cv2.resize(mm, (400, 60), interpolation=cv2.INTER_AREA)
    path = np.zeros_like(scene)
    pcx = px + 60  # the paw falls on the path's near edge
    y = SPEC['horizon'] + 14
    row = 0
    while y < H:
        t = (y - SPEC['horizon']) / (H - SPEC['horizon'])
        hgt = 7 + 24 * t
        for _ in range(rng.integers(1, 3)):
            wid = (70 + 420 * t) * rng.uniform(0.3, 1.0)
            cx = pcx + rng.normal(0, 20 + 70 * t)
            d = np.hypot(cx - px, y - py)
            push = 46 * np.exp(-d / 110)
            cx += (cx - px) / (abs(cx - px) + 1e-6) * push
            yb = y + (y - py) / (abs(y - py) + 1e-6) * push * 0.25
            strip = cv2.resize(tex, (max(4, int(wid)), max(2, int(hgt))), interpolation=cv2.INTER_AREA)
            # each strip a torn sliver: rounded ends, a ragged top and bottom
            sh_, sw_ = strip.shape[:2]
            u = np.linspace(-1, 1, sw_)[None, :]
            v = np.linspace(-1, 1, sh_)[:, None]
            top_ = cv2.resize(rng.random((1, max(4, sw_ // 9))).astype(np.float32), (sw_, 1), interpolation=cv2.INTER_CUBIC)
            bot_ = cv2.resize(rng.random((1, max(4, sw_ // 9))).astype(np.float32), (sw_, 1), interpolation=cv2.INTER_CUBIC)
            taper = np.clip(1 - np.abs(u) ** 2.2, 0, 1) ** 0.6
            lo, hi_ = -0.2 - 0.8 * bot_ * taper, 0.2 + 0.8 * top_ * taper
            sa = np.clip((v - lo) * sh_ * 0.5, 0, 1) * np.clip((hi_ - v) * sh_ * 0.5, 0, 1) * (taper > 0.05)
            bright = 1.25 * (1 - 0.55 * t) * rng.uniform(0.7, 1.0)
            s_img, s_a = place(strip * bright, sa, cx - strip.shape[1] / 2, yb - strip.shape[0] / 2)
            path += s_img * s_a[..., None]
        y += hgt * 0.7 + 5 + 18 * t * rng.uniform(0.4, 1.6)
        row += 1
    path = cv2.GaussianBlur(path, (0, 0), 0.7)
    scene += path * np.array([1.0, 0.92, 0.75], np.float32)

    # Grass along the bank's lip and a stand of reeds just past him, black card on his plane.
    grass = np.zeros((H, W), np.float32)
    g_rng = np.random.default_rng(5)
    for gx in np.r_[g_rng.uniform(420, 980, 26), g_rng.uniform(1250, 1420, 9)]:
        base = (py + 8) if gx < 1100 else (py - 40)
        tall = g_rng.uniform(25, 70) if gx < 1100 else g_rng.uniform(140, 330)
        lean_ = g_rng.normal(0, 0.25) * tall
        wd = g_rng.uniform(2.5, 4.5) if gx < 1100 else g_rng.uniform(4, 7)
        pts = [(gx - wd, base), (gx + lean_ * 0.4, base - tall * 0.6), (gx + lean_, base - tall), (gx + wd, base)]
        cv2.fillPoly(grass, [np.array(pts, np.int32)], 1.0, cv2.LINE_AA)
    grass = cv2.GaussianBlur(grass, (0, 0), 0.8)
    scene = scene * (1 - grass[..., None]) + lin(np.array([0.05, 0.045, 0.05], np.float32)) * grass[..., None]

    # The fox at his size and place.
    fg, a = fox()
    ys, xs = np.nonzero(a > 0.5)
    s = SPEC['fox_w'] / (xs.max() - xs.min())
    fgs = cv2.resize(fg, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    As = cv2.resize(a, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    L = grade_fox(fgs, As)
    ox, oy = px - SPEC['paw_src'][0] * s, py - SPEC['paw_src'][1] * s
    big, alpha = place(L, As, ox, oy)

    # Light on the fox: the moon as key, modelled from broad normals of his matte; a rim where his
    # edges face her; her warm light from the water under his chin and chest; the cool night fill.
    def normals(sigma):
        g = cv2.GaussianBlur(alpha, (0, 0), sigma)
        gy, gx = np.gradient(g)
        n = np.stack([-gx, -gy], -1)
        return n / (np.linalg.norm(n, axis=-1, keepdims=True) + 1e-6), g
    Lx, Ly = mx - xx, my - yy
    ln = np.hypot(Lx, Ly) + 1e-6
    ldir = np.stack([Lx / ln, Ly / ln], -1)
    nb, gb = normals(28)
    key = np.clip((nb * ldir).sum(-1), 0, 1) * np.clip(1 - gb, 0, 1) * 2  # brighter toward the lit side
    nr, gr = normals(2.5)
    rim = np.clip((nr * ldir).sum(-1), 0, 1) * np.clip(gr * (1 - gr) * 4, 0, 1)
    moonlight = np.array(SPEC['moon_light'], np.float32)
    lit = big * np.array([0.74, 0.78, 0.90], np.float32)
    lit += big * (np.clip(key, 0, 1)[..., None] * 0.8) * moonlight
    lit += rim[..., None] * moonlight * 1.2 * alpha[..., None]
    under = np.clip(1 - np.hypot((xx - pcx) / 420, (yy - (py + 40)) / 300), 0, 1) ** 1.4
    under *= np.clip((yy - (py - 330)) / 330, 0, 1)
    lit *= 1 + under[..., None] * np.array([0.55, 0.36, 0.12], np.float32)

    # The contact shadow, away from the moon, soft, on the bank.
    sh = cv2.GaussianBlur(np.roll(np.roll(alpha, 12, 0), -18, 1), (0, 0), 10)
    scene *= 1 - 0.5 * sh[..., None] * (yy[..., None] > py - 160)

    # The rings: thin glassine ellipses round the paw, light caught on their crests.
    rings = np.zeros((H, W), np.float32)
    for (r, aa) in ((30, 0.6), (56, 0.38), (86, 0.2)):
        cv2.ellipse(rings, (int(px), int(py + 6)), (r, int(r * 0.30)), 0, 0, 360, aa, 2, cv2.LINE_AA)
    scene += cv2.GaussianBlur(rings, (0, 0), 0.7)[..., None] * lin(np.array([0.9, 0.86, 0.78], np.float32))

    comp = scene * (1 - alpha[..., None]) + lit * alpha[..., None]

    # Brass pins: matte domes about 1/12 of his head, lit from the moon's side.
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
        ring = np.clip(r + 1.5 - dd, 0, 1) - disk  # a dark lip where the dome meets the paper
        comp = comp * (1 - disk[..., None]) + brass * disk[..., None]
        comp *= 1 - 0.5 * ring[..., None]

    # Near reeds in front of everything, black card, soft with depth.
    rd = reeds()
    comp = comp * (1 - rd[..., None]) + lin(np.array([0.035, 0.035, 0.045], np.float32)) * rd[..., None]

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
    report = {'foxScale': round(float(s), 4), 'headPx': round(float(980 * s), 1), 'moonPx': md, 'paw': [px, py]}
    (out / 'still.json').write_text(json.dumps(report, indent=1))
    print(report)


if __name__ == '__main__':
    main()
