"""The pond (panel 2 of the orange reference), cut into paper layers for the render bake-off.

Both routes (comp.py, the 2D compositor; stage.py, Blender EEVEE) read what this writes, so they
start from the same paper. Coordinates are the panel's own pixels (505×503); every layer is
written at S× with the panel-pixel origin of its box, in pieces.json.

What it makes:
- plate: the far side (sky, trees, far water, the left bushes), painted in where the fox and the
  right reeds were;
- bank, water: the shelf he lies on (painted in under him) and the near water (her reflection
  cloned out, so it can be laid back on as its own layer);
- reeds_r: the right reeds, keyed off the water; reeds_f: new cut-paper blades for him to hide
  under, made in the reference's manner;
- the fox in six pieces at their split pins (tail, ears, body, foreleg, head), with brass pins and a
  mud state;
- moon_refl (and a soft copy): her reflection as the panel paints it, broken bands and glow;
  creep strips; haze gauze; the shaft;
- for every cut piece, a normal map baked from its matte (the cut edge tilted outward), so either
  renderer can light the paper's edge from the side the moon is on.

Usage: python -I scripts/fable/cut.py [OUT]   (default test-output/fable/pieces)
"""
import json
import math
import os
import sys

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REF = os.path.join(ROOT, 'references', 'fable', 'Fox_and_Moon_Orange_Reference_v2.png')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'test-output', 'fable', 'pieces')

PANELS = {2: (516, 0, 1021, 503)}  # inside the reference's gutters
S = 1440 / 503  # panel px → frame px (the frame is the panel's height at 1440)
EDGE = 2.5  # the cut edge's bevel, in panel px
RNG = np.random.default_rng(20261031)

# The fox in panel 2, at his split pins (panel px). Order is back to front.
FOX = {
    'tail': [(45, 245), (50, 237), (57, 229), (65, 222), (76, 216), (90, 211), (105, 207), (120, 205), (135, 205),
             (150, 203), (162, 201), (170, 208), (169, 224), (162, 238), (140, 242), (120, 245), (100, 248),
             (80, 250), (65, 250), (52, 249)],  # generous at the white tip, whose fur is spiked
    'ear_far': [(294, 214), (300, 200), (307, 188), (312, 181), (314, 195), (315, 210), (312, 223)],
    'ear_near': [(271, 215), (276, 195), (280, 178), (283, 169), (287, 180), (292, 196), (298, 214)],
    'body': [(158, 214), (160, 201), (170, 192), (180, 187), (190, 185), (200, 183), (210, 183), (220, 185),
             (230, 187), (240, 191), (250, 196), (260, 201), (267, 206), (272, 211), (276, 220), (272, 234),
             (262, 241), (250, 240), (238, 238), (226, 247), (205, 247), (185, 245), (166, 243), (158, 236)],
    'foreleg': [(224, 240), (232, 235), (244, 236), (252, 242), (262, 248), (280, 252), (298, 256), (314, 262),
                (322, 268), (316, 273), (300, 270), (282, 265), (262, 259), (244, 255), (230, 251)],
    'head': [(256, 214), (266, 206), (276, 214), (290, 213), (300, 215), (310, 221), (319, 232), (323, 243),
             (327, 253), (331, 262), (334, 268), (328, 272), (318, 268), (305, 263), (290, 258), (277, 252),
             (264, 247), (254, 240), (251, 226)],
}
FOX_ORDER = ['tail', 'ear_far', 'ear_near', 'body', 'foreleg', 'head']
PARENT = {'tail': 'body', 'ear_far': 'head', 'ear_near': 'head', 'foreleg': 'body', 'head': 'body', 'body': None}
PIVOT = {'tail': (164, 216), 'ear_far': (304, 216), 'ear_near': (284, 213), 'foreleg': (237, 240),
         'head': (260, 226), 'body': (215, 232)}
PINS = [(164, 216), (237, 240), (260, 226), (192, 213)]  # tail, shoulder, neck, haunch (as in the panel)

BANK = [(0, 236), (30, 236), (50, 244), (100, 249), (160, 241), (225, 249), (262, 259), (300, 267), (325, 272),
        (340, 273), (352, 279), (350, 291), (320, 297), (250, 301), (150, 301), (60, 299), (0, 301)]
WATER = [(0, 296), (150, 299), (250, 299), (318, 294), (348, 287), (380, 280), (430, 276), (505, 276),
         (505, 503), (0, 503)]
REEDS_R = [(352, 128), (505, 128), (505, 300), (352, 300)]  # where the right reeds are keyed
REFL = (333, 364, 72, 66)  # the moon's reflection in panel 2: centre, radii


def panel(n):
    x0, y0, x1, y1 = PANELS[n]
    return np.asarray(Image.open(REF).convert('RGB').crop((x0, y0, x1, y1))).astype(np.float32) / 255


def up(a):
    h, w = a.shape[:2]
    return np.clip(cv2.resize(a, (round(w * S), round(h * S)), interpolation=cv2.INTER_LANCZOS4), 0, 1)


def mask(shape, polys, ss=4):
    """Antialiased polygon matte at frame scale (shape is the frame-px h, w)."""
    h, w = shape
    m = np.zeros((h * ss, w * ss), np.uint8)
    for p in polys:
        pts = np.round(np.array(p, np.float64) * S * ss).astype(np.int32)
        cv2.fillPoly(m, [pts], 255, lineType=cv2.LINE_8)
    return cv2.resize(m, (w, h), interpolation=cv2.INTER_AREA).astype(np.float32) / 255


def noise(h, w, scale, octaves=4, seed=0):
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        s = max(1, int(scale / 2 ** o))
        g = rng.standard_normal((h // s + 2, w // s + 2)).astype(np.float32)
        out += amp * cv2.resize(g, (w + 2 * s, h + 2 * s), interpolation=cv2.INTER_CUBIC)[s:s + h, s:s + w]
        tot += amp
        amp *= 0.5
    out /= tot
    return out / (out.std() + 1e-6)


def grain(h, w, seed):
    """Paper tooth at one physical scale for every layer: fibre and fine pulp."""
    return 1 + 0.035 * noise(h, w, 3 * S / 2.86, 3, seed) + 0.02 * noise(h, w, 18 * S / 2.86, 3, seed + 1)


def inpaint(rgb, hole, r=7, grow=12):
    u8 = (np.clip(rgb, 0, 1) * 255).astype(np.uint8)
    m = (hole > 0.02).astype(np.uint8) * 255
    m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * grow + 1, 2 * grow + 1)))
    return cv2.inpaint(u8, m, r, cv2.INPAINT_TELEA).astype(np.float32) / 255, m.astype(np.float32) / 255


def row_clone(dst, src, hole, rows, cols, band):
    """Fill a hole in horizontally banded scenery (sky, far water, far shore) from a clean band of
    the same rows, mirror-tiled across: the bands carry straight through, with their own texture."""
    out = dst.copy()
    bx0, bx1 = [round(v * S) for v in band]
    bw = bx1 - bx0
    y0, y1 = [round(v * S) for v in rows]
    x0, x1 = [round(v * S) for v in cols]
    xs = np.arange(x0, x1)
    k = (xs - x0) % (2 * bw)
    sx = bx0 + np.where(k < bw, k, 2 * bw - 1 - k)
    fill = src[y0:y1][:, sx]
    m = cv2.GaussianBlur(hole, (0, 0), 3)[y0:y1, x0:x1, None]
    out[y0:y1, x0:x1] = out[y0:y1, x0:x1] * (1 - m) + fill * m
    return out


def edge_normal(alpha):
    """Tangent-space normal map: the cut edge's outer EDGE px tilted outward (OpenGL, green up)."""
    band = EDGE * S
    inside = (alpha > 0.5).astype(np.uint8)
    d = cv2.distanceTransform(inside, cv2.DIST_L2, 5).astype(np.float32)
    soft = cv2.GaussianBlur(alpha, (0, 0), band * 0.6)
    gx = cv2.Sobel(soft, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(soft, cv2.CV_32F, 0, 1, ksize=3)
    g = np.sqrt(gx * gx + gy * gy) + 1e-6
    tilt = np.clip(1 - d / band, 0, 1) ** 1.5 * 0.85
    nx, ny = -gx / g * tilt, gy / g * tilt  # outward; image y runs down, the map's green runs up
    nz = np.sqrt(np.clip(1 - nx * nx - ny * ny, 0, 1))
    return np.dstack([nx * 0.5 + 0.5, ny * 0.5 + 0.5, nz * 0.5 + 0.5])


def box_of(alpha, pad=10):
    ys, xs = np.nonzero(alpha > 0.002)
    y0, y1 = max(ys.min() - pad, 0), min(ys.max() + pad + 1, alpha.shape[0])
    x0, x1 = max(xs.min() - pad, 0), min(xs.max() + pad + 1, alpha.shape[1])
    return x0, y0, x1, y1


LAYERS = []


def save(name, rgb, alpha, z, kind, normal=False, crop=True, **extra):
    x0, y0, x1, y1 = map(int, box_of(alpha) if crop else (0, 0, alpha.shape[1], alpha.shape[0]))
    rgba = np.dstack([rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1]])
    Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(os.path.join(OUT, name + '.png'))
    rec = {'name': name, 'file': name + '.png', 'origin': [x0 / S, y0 / S], 'size_px': [x1 - x0, y1 - y0], 'z': z,
           'kind': kind}
    if normal:
        n = edge_normal(alpha)[y0:y1, x0:x1]
        Image.fromarray((np.clip(n, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB').save(os.path.join(OUT, name + '.n.png'))
        rec['normal'] = name + '.n.png'
    rec.update(extra)
    LAYERS.append(rec)
    return rec


def gray(name, a):
    Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'L').save(os.path.join(OUT, name + '.png'))


def blade(base, height, lean, width, curve):
    """A cut-paper reed blade: a tapered, curving strip (panel px)."""
    bx, by = base
    left, right = [], []
    for i in range(13):
        t = i / 12
        x = bx + lean * t + curve * t * t
        y = by - height * t
        half = width * (1 - t) ** 0.8 / 2 + 0.25
        left.append((x - half, y))
        right.append((x + half, y))
    return left + right[::-1]


def main():
    os.makedirs(OUT, exist_ok=True)
    P = up(panel(2))
    H, W = P.shape[:2]
    G = grain(H, W, 11)

    # The fox's pieces (grown a little, so each keeps the painted rim) and his whole matte.
    grow = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    fox_alpha = {k: cv2.dilate(mask((H, W), [FOX[k]]), grow) for k in FOX}
    fox_all = np.clip(sum(fox_alpha.values()), 0, 1)
    keyed = mask((H, W), [REEDS_R])
    lum = P.mean(2)
    reeds_r = keyed * np.clip((0.205 - lum) / 0.07, 0, 1)
    reeds_r *= 1 - mask((H, W), [[(352, 252), (505, 252), (505, 282), (352, 282)]])  # not the far bank strip
    reeds_r = cv2.GaussianBlur(reeds_r, (0, 0), 0.6)

    # Plate: the far side, painted in under everything cut from it. Behind his head and paw the
    # scenery is horizontal bands (sky, far water, the far shore), carried in from the clean band
    # between his nose and the right reeds.
    hole = np.clip(fox_all + reeds_r * 1.2, 0, 1)
    plate, grown = inpaint(P, hole, r=9)
    plate = row_clone(plate, P, grown, rows=(150, 282), cols=(222, 352), band=(337, 353))
    save('plate', plate * G[..., None], np.ones((H, W), np.float32), 0, 'set', crop=False)

    # Bank, painted in under him.
    bank_rgb, _ = inpaint(P, fox_all, r=7, grow=18)
    bank_a = mask((H, W), [BANK])
    save('bank', bank_rgb * G[..., None], bank_a, 60, 'set', normal=True)

    # Her reflection, taken from the panel itself (its broken bands and glow), and the water with it
    # cloned out from the water to its left.
    cx, cy, rx, ry = REFL
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32) / S
    oval = np.clip((1.0 - np.sqrt(((xx - cx) / (rx + 16)) ** 2 + ((yy - cy) / (ry + 14)) ** 2)) * 8, 0, 1)
    lum = P.mean(2)
    refl_a = np.clip((lum - 0.21) / 0.32, 0, 1) ** 1.2 * oval * mask((H, W), [WATER])
    src_off = round(195 * S)
    clone_m = (np.clip(oval * 2, 0, 1) * 255).astype(np.uint8)
    ys, xs = np.nonzero(clone_m)
    centre = (int((xs.min() + xs.max()) / 2), int((ys.min() + ys.max()) / 2))
    src = np.roll((np.clip(P, 0, 1) * 255).astype(np.uint8), src_off, axis=1)
    water = cv2.seamlessClone(src, (np.clip(P, 0, 1) * 255).astype(np.uint8), clone_m, centre,
                              cv2.NORMAL_CLONE).astype(np.float32) / 255
    water_a = mask((H, W), [WATER])
    save('water', water * G[..., None], water_a, 120, 'set', water_line=296)

    # The right reeds, standing in the water.
    save('reeds_r', P * 0.95, reeds_r, 135, 'set', normal=True)

    # New reeds for him to hide under: blades in the reference's manner, on the bank at the left,
    # thick at the back and thinning toward where he lies, a few with cattail heads.
    blades, heads = [], []
    x = 6.0
    while x < 190:
        h = RNG.uniform(60, 125) * (1.0 if x < 120 else 0.75)
        lean, curve = RNG.uniform(-6, 26), RNG.uniform(-22, 20)
        blades.append(blade((x, 254 + RNG.uniform(-4, 4)), h, lean, RNG.uniform(3.0, 6.5), curve))
        if RNG.random() < 0.25:
            tx, ty = x + lean + curve, 254 - h
            heads.append([(tx + 2.4 * math.cos(a), ty + 13 + 9 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 20)])
        x += RNG.uniform(5, 13) * (1.0 if x < 110 else 1.9)
    rf_a = mask((H, W), blades + heads)
    shade = 0.75 + 0.25 * np.clip(noise(H, W, 30, 2, 5) * 0.5 + 0.5, 0, 1)
    rf_rgb = np.dstack([0.075 * shade, 0.062 * shade, 0.05 * shade]) * G[..., None]
    save('reeds_f', rf_rgb, rf_a, 105, 'set', normal=True)

    # The fox, his pins and his mud.
    fox_rgb = P * (0.985 + 0.015 * G[..., None])
    for k in FOX_ORDER:
        z = {'tail': 92, 'ear_far': 93, 'ear_near': 94, 'body': 95, 'foreleg': 97, 'head': 98}[k]
        save('fox_' + k, fox_rgb, fox_alpha[k], z, 'fox', normal=True, piece=k, parent=PARENT[k], pivot=PIVOT[k])
    pin_a = mask((H, W), [[(x + 2.6 * math.cos(a), y + 2.6 * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 24)]
                          for x, y in PINS])
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    lit = np.zeros((H, W), np.float32)
    for x, y in PINS:
        lit += np.exp(-(((xx / S - x - 0.9) ** 2 + (yy / S - y + 0.9) ** 2) / 1.6))
    brass = np.dstack([0.36 + 0.5 * lit, 0.25 + 0.38 * lit, 0.10 + 0.18 * lit])
    pin_parent = {PINS[0]: 'tail', PINS[1]: 'foreleg', PINS[2]: 'head', PINS[3]: 'body'}
    for (x, y), par in pin_parent.items():
        one = pin_a * mask((H, W), [[(x - 4, y - 4), (x + 4, y - 4), (x + 4, y + 4), (x - 4, y + 4)]])
        save(f'pin_{par}', brass, one, 99, 'fox', normal=True, piece='pin', parent=par, pivot=(x, y))
    belly = mask((H, W), [[(160, 232), (262, 236), (322, 262), (322, 276), (160, 250)]])
    mud_a = np.clip(noise(H, W, 9, 3, 21) * 0.9 + 0.2, 0, 1) * belly * 0.85
    mud_rgb = np.dstack([0.16 + 0 * mud_a, 0.11 + 0 * mud_a, 0.07 + 0 * mud_a]) * G[..., None]
    save('mud', mud_rgb, mud_a, 98.5, 'fox', piece='mud', parent='body', pivot=PIVOT['body'])

    # The moon's reflection, as the panel paints it (its colour lifted to ivory where it is thin).
    ivory = np.array([0.98, 0.92, 0.74], np.float32)
    refl_rgb = P * 0.55 + ivory * 0.45 * np.clip(refl_a * 1.4, 0, 1)[..., None]
    save('moon_refl', refl_rgb * G[..., None], refl_a, 121, 'glow')
    save('moon_refl_soft', cv2.GaussianBlur(refl_rgb, (0, 0), 3 * S),
         cv2.GaussianBlur(refl_a, (0, 0), 4.5 * S) * 0.9, 121, 'glow')

    # Her light creeping toward his bank: paper strips laid one at a time.
    for i in range(6):
        t = i / 5
        x = cx - rx * 0.9 - t * 95
        y = 300 + t * -4 + RNG.uniform(-1.5, 1.5)
        L = RNG.uniform(16, 26) * (1 - 0.4 * t)
        strip = [(x - L / 2, y - 1.0), (x + L / 2, y - 1.3), (x + L / 2 + 1, y + 0.9), (x - L / 2 - 1, y + 1.2)]
        sa = mask((H, W), [strip])
        save(f'creep_{i}', np.dstack([0.98 + 0 * sa, 0.9 + 0 * sa, 0.7 + 0 * sa]) * G[..., None], sa, 122, 'glow',
             order=i)

    # Haze gauze and the shaft (greyscale masks, frame size).
    gray('haze', np.clip(0.8 + 0.08 * noise(H, W, 160, 3, 41), 0, 1))  # gauze, not cloud
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32) / S
    ang = math.radians(-32)  # from the upper right, as panel 3
    u = (xx - 470) * math.cos(ang) - (yy + 40) * math.sin(ang)
    v = (xx - 470) * math.sin(ang) + (yy + 40) * math.cos(ang)
    width = 120 + 0.35 * np.maximum(-u, 0)
    shaft = np.exp(-(v / width) ** 2 * 2.2) * np.clip(1 - np.maximum(-u, 0) / 900, 0, 1)
    shaft *= 0.85 + 0.15 * np.clip(noise(H, W, 60, 2, 43), -2, 2)
    gray('shaft', np.clip(shaft, 0, 1))

    json.dump({'scale': S, 'panel': [505, 503], 'frame_px': [W, H], 'water_line': 296, 'refl': REFL,
               'layers': LAYERS}, open(os.path.join(OUT, 'pieces.json'), 'w'), indent=1)
    print(f'{len(LAYERS)} layers at {W}x{H}: {OUT}')


if __name__ == '__main__':
    main()
