"""
Cut the artist's woodland references into the living memory's layers (docs/memories.md,
docs/reviews/2026-10-woodland.md). Offline only; nothing here ships.

    python3 -I scripts/cut-woodland.py

Reads references/woodland/ (the artist's images):
    01-dusk.webp         the clearing at dusk, empty          -> the revisit, the dusk's colour and sky
    02-characters.webp   two people lying in grass, a sheet   -> the people
    04-day.webp          the clearing in afternoon, empty     -> the painting
Writes public/memories/woodland/<variant>/ and the manifest (every placement is written there, so
the runtime reads the same numbers this file cuts with):

  On the wall (MemoryWindow layers; `def.layers`):
    scene      the painting flattened (the people in it): the wall's fallback if the living scene
               can't be built
    sketch     the graphite the light finds first: the people's own linework strongest, then the
               trunks and the log, the near grass fainter, the clearing faintest
    light      the painted sun flecks, as light (white on black): warm light reaches the plaster
               before anything is drawn
  The living scene (afternoon):
    plate      the painting (opaque)
    maps       quarter size, lossless: R depth (0 far .. 1 near), G how much the breeze moves it
               (smooth: never a per-pixel phase), B grass (1) or leaves (0), A the sun flecks
    figures    the two people (an atlas: the body, then her forearm on its own row), unmixed from
               the sheet's ivory, light-matched to where they lie, with the clearing's grass over
               their lower edges and a contact shadow under them; under the forearm, the grass
               beside it mirrored, so it can slide back
    lids       an atlas: their eyelids shut, half shut (blinks are drawn on twos), and her sleeve
               (where her forearm goes under it)
    after      the same clearing later: the real dusk painting (01), nobody there, the grass
               where they lay still faintly pressed (no shape of them: a smoothing, a shade)
  On the wall, after the cut:
    sketch-after  the graphite of the empty clearing (the return never draws them again)
  The revisit (empty): the dusk painting on the wall, nobody in it, still; it stays in the wall.
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
REF = os.path.join(ROOT, 'references', 'woodland')
OUT = os.path.join(ROOT, 'public', 'memories', 'woodland')
W, H = 1672, 941  # the plate, as painted
WALL = {'': 1200, '@low': 768}  # the wall's layers (as the other memories')
LIVE = {'': 1672, '@low': 1280}  # the living scene's plate
METRES = 3.2  # the whole painting's width on the wall (half the wall, 16:9 like it)

# Where the sheet's top panel lies on the plate: sheet (x, y) -> plate (X0 + S x, Y0 + S y).
FIG_CROP = (0, 0, 1448, 505)
FIG_S = 0.64
# Their texture is finer than they're placed (a phone's low tier enlarges the painting ~1.8×).
FIG_T = 0.8
# Atlas rows are stacked top to bottom with this many transparent pixels between them.
GUTTER = 4
FIG_X0, FIG_Y0 = 360, 432
IVORY = np.array([249, 244, 234], np.float32) / 255

# The two people's outline on the sheet (generous: their bed of grass is kept, feathered).
FIG_POLY = [(38, 112), (45, 98), (75, 92), (120, 96), (135, 60), (165, 35), (205, 18), (260, 14), (300, 38), (318, 70), (330, 95), (360, 100), (395, 70), (430, 30), (480, 14), (530, 14), (575, 35), (605, 75), (612, 120), (650, 140), (700, 160), (745, 185), (770, 205), (820, 215), (900, 228), (980, 245), (1060, 272), (1130, 302), (1190, 330), (1250, 345), (1300, 338), (1360, 332), (1398, 348), (1402, 385), (1380, 410), (1320, 422), (1260, 428), (1180, 425), (1120, 412), (1040, 400), (1000, 395), (1002, 440), (985, 470), (940, 488), (880, 502), (780, 500), (680, 494), (590, 482), (500, 470), (430, 440), (360, 410), (300, 385), (240, 345), (170, 300), (110, 262), (70, 215), (48, 160)]
# The bodies alone (for the contact shadow and the light match), inside FIG_POLY.
BODY = [(60, 120), (120, 100), (150, 50), (220, 25), (300, 45), (320, 110), (400, 60), (480, 25), (560, 40), (600, 110), (700, 165), (790, 215), (980, 250), (1130, 310), (1250, 350), (1390, 345), (1395, 395), (1260, 420), (1130, 405), (1000, 395), (995, 455), (940, 480), (780, 490), (600, 470), (480, 455), (330, 395), (200, 320), (100, 240)]
# The lower contour (sheet px), where grass from the clearing lies over them.
FIG_UNDER = [(70, 215), (110, 262), (170, 300), (240, 345), (300, 385), (360, 410), (430, 440), (500, 470), (590, 482), (680, 494), (780, 500), (880, 502), (940, 488), (985, 470), (1002, 440), (1040, 400), (1120, 412), (1180, 425), (1260, 428), (1320, 422), (1380, 410)]

A_EYES = [(213, 87), (252, 80)]
B_EYES = [(502, 69), (539, 58)]

# Her forearm and hand: their own part (it slides back along itself toward the elbow, under her
# sleeve, and turns a little: docs/reviews/2026-10-woodland.md). Keyed by skin inside this.
LIMB_B = [(508, 249), (552, 253), (600, 280), (650, 312), (700, 345), (705, 392), (650, 392), (600, 340), (560, 312), (520, 280), (505, 255)]
LIMB_B_ELBOW = (528, 250)
LIMB_B_HAND = (650, 352)
# Where her sleeve is round the elbow (the forearm goes under it).
SLEEVE_BOX = (470, 168, 620, 262)

# What the puppet moves, as soft ellipses on the sheet (px, y down): centre, radii, angle, how soft
# the rim (a fraction of the radius: 1 = the whole ellipse a slope), the pivot it turns about, and
# which part it moves ('body' or 'limb'). The runtime sets each one's turn, swell and move.
DEFORMERS = [
    # Breath: the chests (a swell along their short axis, and a rise).
    ('chestA', (300, 245), (150, 82), 0.42, 0.6, None, 'body'),
    ('chestB', (585, 196), (115, 62), 0.30, 0.6, None, 'body'),
    # Heads: a roll at the neck, a lift with each breath.
    ('headA', (222, 82), (92, 82), 0.0, 0.45, (238, 152), 'body'),
    ('headB', (505, 66), (96, 70), 0.0, 0.45, (532, 126), 'body'),
    # Faces: the features sliding inside the head (a turn's start, not a rotation).
    ('faceA', (234, 96), (36, 40), 0.1, 1.0, None, 'body'),
    ('faceB', (521, 82), (32, 40), 0.2, 1.0, None, 'body'),
    # Eyes: the irises looking about (the eye's outline stays).
    ('eyeA1', A_EYES[0], (10, 6), 0.0, 0.85, None, 'body'),
    ('eyeA2', A_EYES[1], (10, 6), -0.15, 0.85, None, 'body'),
    ('eyeB1', B_EYES[0], (10, 6), -0.25, 0.85, None, 'body'),
    ('eyeB2', B_EYES[1], (10, 6), -0.3, 0.85, None, 'body'),
    # Hair, its loose ends only (the rest lies on the grass).
    ('hairA1', (232, 26), (58, 18), 0.0, 0.9, (232, 60), 'body'),
    ('hairA2', (148, 70), (30, 42), 0.3, 0.9, (190, 80), 'body'),
    ('hairA3', (290, 50), (26, 22), -0.4, 0.9, (260, 70), 'body'),
    ('hairB1', (415, 92), (32, 58), 0.2, 0.9, (460, 90), 'body'),
    ('hairB2', (600, 95), (22, 42), 0.0, 0.9, (575, 95), 'body'),
    ('hairB3', (512, 18), (48, 12), -0.1, 0.9, (512, 40), 'body'),
    # His hand in the grass (it answers hers; it twitches once while hers is stopped).
    ('handA', (572, 334), (44, 26), 0.6, 0.6, (545, 318), 'body'),
    # Her hand on her stomach (it rides her breath; lifts a little).
    ('palmB', (700, 226), (34, 20), -0.3, 0.7, (735, 222), 'body'),
    # Her crossed foot (it rocks at the ankle).
    ('footB', (1312, 385), (98, 62), -0.15, 0.5, (1226, 380), 'body'),
    # Her shoulder and her settling back into the grass.
    ('shoulderB', (500, 175), (70, 50), 0.3, 0.7, None, 'body'),
    ('settleB', (560, 170), (210, 140), 0.25, 0.7, None, 'body'),
    # Her forearm: all of it, rigidly (the ellipse covers the part).
    ('forearmB', (600, 310), (200, 200), 0.0, 0.01, LIMB_B_ELBOW, 'limb'),
]
SPLIT = 380  # sheet x between A and B (eyes left of it are A's)

# Plate polygons (plate px).
TRUNK_L = [(150, 0), (470, 0), (430, 100), (380, 200), (335, 330), (330, 450), (375, 545), (250, 545), (140, 520), (95, 455), (120, 350), (150, 200)]
TRUNK_R = [(1243, 0), (1300, 0), (1306, 180), (1336, 330), (1296, 345), (1266, 200)]
LOG = [(1178, 388), (1300, 383), (1500, 408), (1672, 428), (1672, 545), (1500, 522), (1300, 482), (1178, 470)]
ROCK_BL = [(0, 700), (150, 718), (240, 780), (282, 880), (262, 941), (0, 941)]
STONE_L = [(0, 560), (80, 575), (200, 628), (272, 680), (250, 702), (150, 690), (0, 642)]
ROCK_BR = [(1228, 862), (1330, 840), (1450, 850), (1520, 900), (1545, 941), (1220, 941)]
MOUNTAIN = [(840, 200), (850, 160), (960, 150), (1040, 135), (1100, 145), (1130, 200)]
SKY_BOX = (700, 0, 1272, 232)  # the canopy's gap
# The drifting sky: the gap and its surroundings (plate px: x0, y0, x1, y1), and how much is
# painted beyond its left edge for the clouds to drift in from (they drift right, ~2 px/s).
CLOUD_BOX = (680, 0, 1310, 240)
CLOUD_PAD = 110
# The near flowers that sway on their own stems: at most this many, the largest heads near us.
FLOWERS = 22

# The wall shows this part of the painting round the line first (painting uv, y up), then it spreads.
CROP = [0.23, 0.09, 0.5, 0.55]


def load(name):
    return Image.open(os.path.join(REF, name)).convert('RGB')


def arr(im):
    return np.asarray(im, np.float32) / 255.0


def img(a, mode=None):
    a = np.clip(a, 0, 1)
    return Image.fromarray((a * 255 + 0.5).astype(np.uint8), mode)


def poly_mask(size, polys, width=0):
    m = Image.new('L', size, 0)
    d = ImageDraw.Draw(m)
    for p in polys:
        if width:
            d.line(p + [p[0]], fill=255, width=width)
        else:
            d.polygon(p, fill=255)
    return arr(m)


def blur(a, r):
    """Gaussian blur (sigma `r` px) of a float image, edges reflected (FFT, so wide blurs are cheap)."""
    if r <= 0:
        return a
    if a.ndim == 3:
        return np.dstack([blur(a[..., i], r) for i in range(a.shape[2])])
    pad = int(min(3 * r + 2, min(a.shape) - 1))
    p = np.pad(a.astype(np.float64), pad, mode='reflect')
    fy = np.fft.fftfreq(p.shape[0])[:, None]
    fx = np.fft.rfftfreq(p.shape[1])[None, :]
    g = np.exp(-2 * (math.pi * r) ** 2 * (fx * fx + fy * fy))
    out = np.fft.irfft2(np.fft.rfft2(p) * g, s=p.shape)
    return out[pad:pad + a.shape[0], pad:pad + a.shape[1]].astype(np.float32)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def ellipse_weight(w, h, cx, cy, rx, ry, angle=0.0, edge=0.35):
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    ca, sa = math.cos(angle), math.sin(angle)
    dx, dy = x - cx, y - cy
    u = (dx * ca + dy * sa) / rx
    v = (-dx * sa + dy * ca) / ry
    return 1 - smooth(1 - edge, 1.0, np.sqrt(u * u + v * v))


def resize(a, w, h):
    """Area-correct resize of a float image (premultiplied when it has alpha)."""
    if a.ndim == 2:
        return np.asarray(Image.fromarray(a.astype(np.float32), 'F').resize((w, h), Image.LANCZOS), np.float32)
    return np.dstack([resize(a[..., i], w, h) for i in range(a.shape[2])])


# ---------------------------------------------------------------------------------------------
# The people


def limb_mask(straight, a):
    """Her forearm and hand (sheet scale, soft): skin inside LIMB_B, cleaned to one solid shape."""
    h, w = a.shape
    r, g, b = straight[..., 0], straight[..., 1], straight[..., 2]
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    # (Skin is redder than the sunlit grass beside it: the yellow blades have r ≈ g.)
    skin = (r - b > 0.17) & (r > g + 0.07) & (lum > 0.42) & (lum < 0.9) & (g - b > 0.05)
    m = (skin & (poly_mask((w, h), [LIMB_B]) > 0.5)).astype(np.float32)
    # Close the gaps between fingers' shading, then open away the specks in the grass.
    im = img(m)
    im = im.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
    im = im.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(5))
    m = arr(im) * (poly_mask((w, h), [LIMB_B]) > 0.5)
    # Keep the one big shape.
    lab, n = components(m > 0.5)
    if n:
        sizes = np.bincount(lab.ravel())[1:]
        m = (lab == (1 + int(np.argmax(sizes)))).astype(np.float32)
    return np.clip(blur(m, 0.7) * 1.15, 0, 1) * (a > 0.2)


def components(m):
    """4-connected components of a boolean mask."""
    from collections import deque
    h, w = m.shape
    lab = np.zeros((h, w), np.int32)
    n = 0
    for y0, x0 in zip(*np.nonzero(m)):
        if lab[y0, x0]:
            continue
        n += 1
        q = deque([(y0, x0)])
        lab[y0, x0] = n
        while q:
            y, x = q.popleft()
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and m[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = n
                    q.append((yy, xx))
    return lab, n


def reflect_fill(rgb, a, hole, usable):
    """Fill `hole` with what lies beside it, mirrored across its nearest usable edge (grass beside
    a forearm continues under it as grass, its blades mirrored, not smeared)."""
    h, w = hole.shape
    edge = usable & ~hole & (blur(hole.astype(np.float32), 1.2) > 0.02)
    ey, ex = np.nonzero(edge)
    hy, hx = np.nonzero(hole)
    out_rgb, out_a = rgb.copy(), a.copy()
    if not len(ey):
        return out_rgb, out_a
    for i in range(0, len(hy), 2048):
        py, px = hy[i:i + 2048, None], hx[i:i + 2048, None]
        d = (py - ey[None]) ** 2 + (px - ex[None]) ** 2
        k = np.argmin(d, 1)
        by, bx = ey[k], ex[k]
        sy = np.clip(2 * by - py[:, 0], 0, h - 1)
        sx = np.clip(2 * bx - px[:, 0], 0, w - 1)
        bad = hole[sy, sx]
        sy, sx = np.where(bad, by, sy), np.where(bad, bx, sx)
        out_rgb[py[:, 0], px[:, 0]] = rgb[sy, sx]
        out_a[py[:, 0], px[:, 0]] = a[sy, sx]
    return out_rgb, out_a


def light_match(plate, tw, th):
    """The plate's own light where the people lie (low frequency), relative to its mean over their
    bodies (0.85..1.10), over the sheet's top panel at `tw`×`th` px: the wide's people are lit by
    it, and so are the two-shot's (scripts/two-shot.py), so a cut between them keeps their light."""
    w, h = FIG_CROP[2] - FIG_CROP[0], FIG_CROP[3] - FIG_CROP[1]
    ph, pw = round(h * FIG_S), round(w * FIG_S)
    under = arr(plate)[FIG_Y0:FIG_Y0 + ph, FIG_X0:FIG_X0 + pw]
    lum = (under * [0.3, 0.59, 0.11]).sum(-1)
    body_small = resize(poly_mask((w, h), [BODY]), pw, ph)
    ref = (lum * body_small).sum() / max(body_small.sum(), 1)
    return resize(np.clip(blur(lum, 40 * FIG_S) / ref, 0.85, 1.10), tw, th)


def figures(sheet, plate):
    """The two people, cut from the sheet, unmixed, occluded, shadowed, light-matched, at their
    texture's scale (FIG_T of the sheet). Returns (body premultiplied RGBA, her forearm
    premultiplied RGBA, her sleeve (where the forearm goes under), straight sheet RGB, sheet
    alpha)."""
    top = arr(sheet.crop(FIG_CROP))
    h, w = top.shape[:2]
    d = np.sqrt(((top - IVORY) ** 2).sum(-1))
    key = smooth(0.035, 0.12, d)
    core = poly_mask((w, h), [FIG_POLY])
    bed = np.clip(np.maximum(core, blur(core, 14) * 1.6), 0, 1) * np.clip(blur(core, 22), 0, 1) ** 0.5
    a = key * np.clip(bed, 0, 1)
    # Choke one sheet pixel, then unmix the ivory the key left in the edge: C = (I − (1−α)·ivory) / α.
    a = np.asarray(img(a).filter(ImageFilter.MinFilter(3)), np.float32) / 255
    a = blur(a, 0.6)
    safe = np.maximum(a, 0.04)[..., None]
    straight = np.clip((top - (1 - safe) * IVORY) / safe, 0, 1)
    straight = np.where(a[..., None] > 0.04, straight, top)

    # Grass from the clearing over their lower edges: irregular curved blades leaning as the
    # painted grass leans (a little left), cut out of the people so the plate's grass shows.
    rng = np.random.default_rng(7)
    blades = Image.new('L', (w, h), 0)
    dr = ImageDraw.Draw(blades)
    pts = FIG_UNDER
    seg_len = [math.hypot(x1 - x0, y1 - y0) for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:])]
    total = sum(seg_len)
    s = rng.uniform(0, 12)
    while s < total:
        k, acc = 0, 0.0
        while acc + seg_len[k] < s:
            acc += seg_len[k]
            k += 1
        t = (s - acc) / seg_len[k]
        (x0, y0), (x1, y1) = pts[k], pts[k + 1]
        bx, by = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + rng.uniform(4, 14)
        size = rng.choice([0, 1, 2], p=[0.55, 0.32, 0.13])
        length = [rng.uniform(16, 30), rng.uniform(30, 46), rng.uniform(46, 64)][size]
        width = [2.2, 3.2, 4.4][size] * rng.uniform(0.8, 1.2)
        lean = rng.normal(-0.28, 0.18)
        bend = rng.normal(-0.12, 0.08)
        # A tapered quadratic curve, root to tip.
        left, right = [], []
        for i in range(9):
            u = i / 8
            cx = bx + (lean * u + bend * u * u) * length
            cy = by - u * length
            hw = width * (1 - u) ** 0.9
            left.append((cx - hw, cy))
            right.append((cx + hw, cy))
        dr.polygon(left + right[::-1], fill=255)
        s += rng.uniform(9, 28)
    cut = arr(blades.filter(ImageFilter.GaussianBlur(0.7)))
    a = np.clip(a * (1 - cut * 0.95), 0, 1)

    # Her forearm: its own part; under it, the grass beside it, mirrored (never her shirt or skin).
    limb = limb_mask(straight, a)
    hole = blur((limb > 0.05).astype(np.float32), 1.0) > 0.05
    r_, g_, b_ = straight[..., 0], straight[..., 1], straight[..., 2]
    lum_s = 0.3 * r_ + 0.59 * g_ + 0.11 * b_
    skin = (r_ - b_ > 0.15) & (r_ > g_ + 0.03) & (lum_s > 0.4)
    cream = (lum_s > 0.62) & (r_ - b_ < 0.14)
    body_rgb, body_a = reflect_fill(straight, a, hole, (a > 0.6) & ~skin & ~cream)
    body_rgb = blur(body_rgb, 0.4) * hole[..., None] + body_rgb * (1 - hole[..., None])
    x0, y0, x1, y1 = SLEEVE_BOX
    sleeve = np.zeros((h, w), np.float32)
    sleeve[y0:y1, x0:x1] = (cream & ~(limb > 0.5))[y0:y1, x0:x1]
    sleeve = np.clip(blur(sleeve, 1.0) * 1.4, 0, 1)

    th, tw = round(h * FIG_T), round(w * FIG_T)
    match = light_match(plate, tw, th)

    def small_of(rgb_, a_):
        # To the texture's scale, premultiplied, softened a little (the sheet's line is finer than the plate's).
        pm = np.dstack([rgb_ * a_[..., None], a_])
        out_ = np.clip(resize(pm, tw, th), 0, 1)
        out_ = blur(out_, 0.55 * FIG_T / FIG_S)
        out_[..., :3] *= match[..., None]
        return out_

    small = small_of(body_rgb, body_a)
    arm = small_of(straight, a * limb)

    # A contact shadow on the grass under them: away from the light (upper right), soft.
    body = resize(poly_mask((w, h), [BODY]), tw, th)
    k = FIG_T / FIG_S
    sh = np.roll(np.roll(body, round(5 * k), 0), -round(4 * k), 1)
    sh = blur(sh, 9 * k) * (1 - body * 0.6)
    sh_a = np.clip(sh * 0.3, 0, 0.3)
    sh_col = np.array([0.10, 0.13, 0.06])
    sa = small[..., 3]
    out = np.empty_like(small)
    out[..., :3] = small[..., :3] + sh_col * sh_a[..., None] * (1 - sa[..., None])
    out[..., 3] = sa + sh_a * (1 - sa)
    return out, arm, resize(sleeve, tw, th), straight, a


def lids(straight, a):
    """Their eyelids at texture scale, two drawings: shut, and half (the upper lid halfway down,
    the lash line across the middle of the eye). Returns (shut, half), premultiplied RGBA."""
    h, w = straight.shape[:2]
    th, tw = round(h * FIG_T), round(w * FIG_T)
    y = np.mgrid[0:h, 0:w][0].astype(np.float32)
    outs = []
    for half in (False, True):
        out = straight.copy()
        m_all = np.zeros((h, w), np.float32)
        for (ex, ey) in A_EYES + B_EYES:
            skin = np.median(straight[ey + 6:ey + 12, ex - 8:ex + 8].reshape(-1, 3), 0)  # the cheek (above is hair)
            m = ellipse_weight(w, h, ex, ey, 11, 7.5, 0, 0.5)
            if half:
                m = m * smooth(ey + 1.5, ey - 0.5, y)
            out = out * (1 - m[..., None]) + skin * m[..., None]
            lash = ellipse_weight(w, h, ex, ey + (0 if half else 2), 10, 1.6, 0.08, 0.6) * 0.85
            out = out * (1 - lash[..., None]) + np.array([0.24, 0.16, 0.12]) * lash[..., None]
            cover = ellipse_weight(w, h, ex, ey, 13, 9, 0, 0.4)
            if half:
                cover = cover * smooth(ey + 3.5, ey + 1.5, y)
            m_all = np.maximum(m_all, cover)
        pm = np.dstack([out * m_all[..., None], m_all])
        outs.append(np.clip(resize(pm, tw, th), 0, 1))
    return outs[0], outs[1]


def stack(rows):
    """Atlas rows, top to bottom, GUTTER transparent pixels between them."""
    w = rows[0].shape[1]
    gap = np.zeros((GUTTER, w, rows[0].shape[2]), np.float32)
    out = []
    for i, r in enumerate(rows):
        if i:
            out.append(gap)
        out.append(r)
    return np.concatenate(out, 0)


def graphite_of(rgb, strength, lo=0.18, hi=0.75):
    """Difference-of-Gaussians edges: soft pencil, 0..strength."""
    g = (rgb * [0.3, 0.59, 0.11]).sum(-1)
    e = np.clip((blur(g, 3.2) - blur(g, 1.0)) * 9.0, 0, 1)
    return smooth(lo, hi, e) * strength


def ink_lines(rgb):
    """The sheet's own linework: dark, with local contrast."""
    g = (rgb * [0.3, 0.59, 0.11]).sum(-1)
    contrast = blur(g, 2.5) - g
    return smooth(0.03, 0.12, contrast) * smooth(0.45, 0.25, g)


# ---------------------------------------------------------------------------------------------
# The plate


def plate_maps(day):
    a = arr(day)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    sky = (((b > g * 1.02) & (lum > 0.5)) | (lum > 0.8)) & (y < 232)
    sky = blur(sky.astype(np.float32), 1.5)
    mountain = poly_mask((W, H), [MOUNTAIN])
    still = np.clip(blur(poly_mask((W, H), [TRUNK_L, TRUNK_R, LOG, ROCK_BL, STONE_L, ROCK_BR]), 4) * 1.3, 0, 1)
    # Depth: far forest and sky, the trees round the clearing, the clearing coming toward us.
    depth = 0.15 + 0.25 * smooth(150, 430, y)
    depth = np.where(y > 430, 0.4 + 0.6 * smooth(430, 941, y), depth)
    depth = np.maximum(depth, poly_mask((W, H), [TRUNK_L]) * 0.62)
    depth = np.maximum(depth, poly_mask((W, H), [TRUNK_R]) * 0.5)
    depth = np.maximum(depth, poly_mask((W, H), [ROCK_BL, ROCK_BR, STONE_L]) * 0.95)
    depth = np.where((sky > 0.5) | (mountain > 0.5), 0.0, depth)
    depth = blur(depth, 24)
    # Sway: the canopy's edge against the sky and the near grass most; the clearing's fine grass
    # and the canopy's interior hardly at all (they shimmer in light, not in shape).
    near_sky = np.clip(blur(sky, 10) * 3, 0, 1) * (1 - sky)
    canopy = 0.25 * smooth(470, 380, y) + 0.75 * near_sky
    grass = smooth(560, 941, y) * 0.95 + 0.08
    grass = grass * smooth(420, 480, y)
    sway = np.maximum(canopy, grass) * (1 - still) * (1 - np.clip(sky * 1.5 + mountain, 0, 1))
    # Hardly at all within ~25 px of the two of them (blades would slide under his trousers).
    ph, pw = round(FIG_CROP[3] * FIG_S), round(FIG_CROP[2] * FIG_S)
    near = np.zeros((H, W), np.float32)
    near[FIG_Y0:FIG_Y0 + ph, FIG_X0:FIG_X0 + pw] = resize(poly_mask((FIG_CROP[2], FIG_CROP[3]), [BODY]), pw, ph)
    near = np.clip(blur(near, 14) * 3, 0, 1)
    sway = blur(sway, 10) * (1 - 0.9 * near)
    kind = smooth(400, 480, y)
    # The painted sun flecks (high-passed light), for the dapple.
    flecks = np.clip((lum - blur(lum, 14)) * 6.0, 0, 1) * smooth(0.45, 0.7, lum)
    flecks = blur(flecks, 2)
    return np.dstack([depth, sway, kind, flecks]), sky, lum


def dusk_parts(day, dusk, sky):
    """The evening's colour over the afternoon's, low frequency, per matte (normalised
    convolution, so the canopy beside the sky never takes the sky's orange)."""
    d, k = arr(day), arr(dusk)
    s = 24
    out = np.zeros_like(d)
    for m in (sky, 1 - sky):
        num = blur(k * m[..., None], s)
        den = blur(d * m[..., None], s)
        ratio = np.clip(num / np.maximum(den, 0.02), 0, 2)
        out += ratio * m[..., None]
    small = resize(out / 2.0, W // 16, H // 16)
    return np.clip(small, 0, 1)


def dusk_sky(dusk, sky):
    x0, y0, x1, y1 = SKY_BOX
    m = blur(sky, 1.0)[y0:y1, x0:x1]
    rgb = arr(dusk)[y0:y1, x0:x1]
    return np.dstack([rgb * m[..., None], m])


def pressed(dusk_rgb):
    """Where they lay, an hour later: the grass a little flatter (smoother) and a shade darker,
    softened and broken up so it is a place, not their outline."""
    th, tw = round(FIG_CROP[3] * FIG_S), round(FIG_CROP[2] * FIG_S)
    body = resize(poly_mask((FIG_CROP[2], FIG_CROP[3]), [BODY]), tw, th)
    m = np.zeros((H, W), np.float32)
    m[FIG_Y0:FIG_Y0 + th, FIG_X0:FIG_X0 + tw] = body
    # Below the heads only (no round shapes where faces were), soft, uneven.
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    m *= smooth(FIG_Y0 + 70, FIG_Y0 + 120, y + (x - FIG_X0) * 0.12)
    rng = np.random.default_rng(5)
    n = blur(rng.random((H, W)).astype(np.float32), 22)
    n = (n - n.min()) / max(1e-6, n.max() - n.min())
    m = blur(m, 16) * (0.55 + 0.9 * n)
    m = np.clip(m, 0, 1)
    flat = blur(dusk_rgb, 2.6)
    out = dusk_rgb * (1 - 0.6 * m[..., None]) + flat * (0.6 * m[..., None])
    return out * (1 - 0.13 * m[..., None])


def pencil_grey(path):
    """An artist's pencil drawing, painting-sized: its grey (0 black .. 1 the paper)."""
    return np.asarray(Image.open(path).convert('L').resize((W, H), Image.LANCZOS), np.float32) / 255


def pencil_without_them(g, where):
    """The artist's pencil drawing with the two of them taken out, for the way back (when the empty
    clearing goes into the wall) if `pencil-after.png` isn't drawn: where they lay (`where`, their
    cut-out on the plate, generously), the grass drawn beside them, mirrored across: no outline,
    no smudge, nobody there. (So the drawing doesn't change hands in the memory's last image: the
    skeptic's second review, 2026-10-17.)"""
    hole = blur(where.astype(np.float32), 6) > 0.03
    rgb, _ = reflect_fill(np.dstack([g, g, g]), np.ones_like(g), hole, ~hole)
    return rgb[..., 0]


def pencil_layer(g):
    """The artist's own pencil drawing of the composition (graphite on white paper; `g` its grey,
    from `pencil_grey`), as the wall's graphite layer: how dark the pencil is, laid as graphite
    (stand-in: `sketch_layer`, an edge filter of the painting)."""
    paper = np.percentile(g, 90)
    e = np.clip((paper - g) / max(paper - g.min(), 1e-3), 0, 1)
    e = smooth(0.05, 0.85, e) * 0.9
    graphite = np.array([0.33, 0.33, 0.35])
    return np.dstack([graphite * e[..., None], e])


def sketch_layer(poster_rgb, fig_lines):
    """Graphite with a hierarchy: the people's linework first, then the trees' and the log's
    contours, the near grass faint, the clearing fainter."""
    y = np.mgrid[0:H, 0:W][0].astype(np.float32)
    dog = graphite_of(poster_rgb, 1.0)
    near = smooth(640, 860, y)
    clearing = smooth(420, 520, y) * (1 - near)
    trees = 1 - smooth(380, 460, y)
    trunks = blur(poly_mask((W, H), [TRUNK_L, TRUNK_R, LOG, ROCK_BL, STONE_L]), 6)
    e = dog * (0.55 * near + 0.3 * clearing + 0.3 * trees + 0.5 * trunks)
    e = np.maximum(e, fig_lines)
    e = smooth(0.08, 0.8, e) * 0.9
    graphite = np.array([0.33, 0.33, 0.35])
    return np.dstack([graphite * e[..., None], e])


# ---------------------------------------------------------------------------------------------


def sky_mask(day):
    """Where the sky (and its clouds) shows through the canopy's gap, soft: not the leaves, not
    the mountain, not the far trees."""
    d = arr(day)
    r, g, b = d[..., 0], d[..., 1], d[..., 2]
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    y = np.mgrid[0:H, 0:W][0]
    blue = (b > g - 0.01) & (b > r - 0.12) & (lum > 0.55)
    cloud = (lum > 0.68) & (r >= g - 0.02) & (g >= b - 0.06) & (r - b < 0.3) & (g - b < 0.2)
    leaf = (g > b + 0.06) & (g > r - 0.08) & (lum < 0.75)
    m = (blue | cloud) & ~leaf & (lum > 0.45) & (y < 215)
    # The mountain by its own colour (its ridge as painted), and its polygon.
    ridge = (y > 120) & (lum < 0.72) & (b >= r - 0.03)
    m = m & ~ridge & (poly_mask((W, H), [MOUNTAIN]) < 0.5)
    x0, y0, x1, y1 = CLOUD_BOX
    box = np.zeros((H, W), bool)
    box[y0:y1, x0:x1] = True
    m = (m & box).astype(np.float32)
    # Close pinholes in the clouds, keep the leaves' edges.
    im = img(m).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    return blur(arr(im), 0.6)


def sky_mask_dusk(dusk):
    """The same in the dusk painting, whose leaves aren't quite where the afternoon's are (laid in
    through the afternoon's matte, the evening sky showed leaf-shaped halos where they differ: the
    directors' film review, 2026-10-18): its leaves dark, or yellow-brown with little blue; its sky
    pink, orange and purple; its mountain a dark blue."""
    d = arr(dusk)
    r, g, b = d[..., 0], d[..., 1], d[..., 2]
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    y = np.mgrid[0:H, 0:W][0]
    leaf = ((b < g - 0.05) & (lum < 0.42)) | (lum < 0.24)
    # (Above the ridge, as the afternoon's: below it, the glow between the far treetops isn't sky
    # that drifts.)
    m = ~leaf & (lum > 0.28) & (y < 172) & (poly_mask((W, H), [MOUNTAIN]) < 0.5)
    x0, y0, x1, y1 = CLOUD_BOX
    box = np.zeros((H, W), bool)
    box[y0:y1, x0:x1] = True
    m = (m & box).astype(np.float32)
    im = img(m).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
    return blur(arr(im), 0.6)


def save_skies(day, dusk, a):
    """The sky's matte (R the afternoon's, G the evening's) and the two skies that drift behind
    the leaves, each filled under its own painting's leaves."""
    smask, dmask = sky_mask(day), sky_mask_dusk(dusk)
    x0, y0, x1, y1 = CLOUD_BOX
    save(np.dstack([smask[y0:y1, x0:x1], dmask[y0:y1, x0:x1], smask[y0:y1, x0:x1]]), os.path.join(a, 'sky-mask.webp'), {'': W}, lossless=True)
    save(clouds(arr(day), smask), os.path.join(a, 'clouds.webp'), {'': W}, q=90)
    save(clouds(arr(dusk), dmask), os.path.join(a, 'clouds-after.webp'), {'': W}, q=90)
    return smask


def clouds(plate_rgb, mask):
    """The sky in the gap as its own layer, filled where the leaves and mountain hide it (so it can
    drift behind them) and painted on CLOUD_PAD px further left (where it drifts in from)."""
    x0, y0, x1, y1 = CLOUD_BOX
    rgb = plate_rgb[y0:y1, x0:x1]
    m = mask[y0:y1, x0:x1]
    pad = CLOUD_PAD
    rgb = np.concatenate([np.zeros((rgb.shape[0], pad, 3), np.float32), rgb], 1)
    m = np.concatenate([np.zeros((m.shape[0], pad), np.float32), m], 1)
    sure = (m > 0.6).astype(np.float32)
    # Behind the leaves, the plain sky of that height: each row's own colour (its median where it
    # shows, the nearest row's where it doesn't, softened down the rows), so what drifts out from
    # behind a leaf is sky, never a grey average.
    rows = np.zeros((rgb.shape[0], 3), np.float32)
    seen = np.zeros(rgb.shape[0], bool)
    for i in range(rgb.shape[0]):
        k = sure[i] > 0.5
        if k.sum() > 8:
            rows[i] = np.median(rgb[i][k], 0)
            seen[i] = True
    idx = np.nonzero(seen)[0]
    for i in range(rgb.shape[0]):
        if not seen[i]:
            rows[i] = rows[idx[np.argmin(np.abs(idx - i))]]
    rows = np.stack([blur(np.tile(rows[:, c:c + 1], (1, 8)), 6)[:, 0] for c in range(3)], 1)
    plain = np.broadcast_to(rows[:, None, :], rgb.shape)
    # Near what shows, its own colour carried a few pixels in (no seam at a leaf's edge).
    num = blur(rgb * sure[..., None], 4)
    den = blur(sure, 4)[..., None]
    near = np.clip(den * 3, 0, 1)
    fill = plain * (1 - near) + (num / np.maximum(den, 1e-4)) * near
    out = rgb * sure[..., None] + fill * (1 - sure[..., None])
    return np.clip(out, 0, 1)


def flower_heads(day):
    """The near flowers' heads (plate px): centre and radius, the largest FLOWERS of them, and a
    soft mask of them all. Keyed by colour only near each head (the sunlit grass is as yellow)."""
    d = arr(day)
    r, g, b = d[..., 0], d[..., 1], d[..., 2]
    y = np.mgrid[0:H, 0:W][0]
    yel = (r > 0.68) & (g > 0.58) & (r > g + 0.03) & (b < 0.62) & (r - b > 0.2) & (y > 600)
    m = blur(yel.astype(np.float32), 2.0) > 0.12
    # Not where the two of them lie (the flowers are drawn over them).
    ph, pw = round(FIG_CROP[3] * FIG_S), round(FIG_CROP[2] * FIG_S)
    under = np.zeros((H, W), np.float32)
    under[FIG_Y0:FIG_Y0 + ph, FIG_X0:FIG_X0 + pw] = resize(poly_mask((FIG_CROP[2], FIG_CROP[3]), [FIG_POLY]), pw, ph)
    m &= blur(under, 6) < 0.05
    lab, n = components(m)
    heads = []
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i)
        if len(ys) < 150 or len(ys) > 2200:
            continue
        hh, ww = ys.max() - ys.min() + 1, xs.max() - xs.min() + 1
        if max(hh, ww) > 70 or max(hh, ww) > 2.2 * min(hh, ww):
            continue
        heads.append((len(ys), float(xs.mean()), float(ys.mean()), 0.5 * max(hh, ww) + 3, i))
    heads.sort(reverse=True)
    heads = heads[:FLOWERS]
    mask = np.zeros((H, W), np.float32)
    for _, cx, cy, rad, i in heads:
        own = (lab == i).astype(np.float32)
        own = arr(img(own).filter(ImageFilter.MaxFilter(5)))
        mask = np.maximum(mask, own)
    mask = np.clip(blur(mask, 1.0) * 1.3, 0, 1)
    return [(cx, cy, rad) for _, cx, cy, rad, _ in heads], mask


def under_flowers(plate_rgb, mask):
    """The grass behind the flower heads: the grass 38 px below each, cloned up (a blurred fill
    shows on grass this fine)."""
    y = np.mgrid[0:H, 0:W][0][..., None]
    src = np.where(y < H - 38, np.roll(plate_rgb, -38, 0), np.roll(plate_rgb, 38, 0))
    k = np.clip(blur(mask, 2.0) * 1.6, 0, 1)[..., None]
    return plate_rgb * (1 - k) + src * k


def save(a, path, sizes, lossless=False, q=90):
    """`a`: HxWx{3,4} floats (RGBA premultiplied is stored straight, as WebP wants)."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if a.shape[2] == 4:
        al = a[..., 3:4]
        st = np.where(al > 1e-3, a[..., :3] / np.maximum(al, 1e-3), 0)
        im = img(np.dstack([st, a[..., 3]]), 'RGBA')
    else:
        im = img(a, 'RGB')
    base, _ = os.path.splitext(path)
    for suffix, width in sizes.items():
        k = width / W
        tw = max(1, round(im.width * k))
        out = im if tw == im.width else im.resize((tw, max(1, round(im.height * k))), Image.LANCZOS)
        out.save(base + suffix + '.webp', 'WEBP', lossless=lossless, quality=q, method=6)


def flatten(plate, fig):
    p = arr(plate).copy()
    th, tw = fig.shape[:2]
    reg = p[FIG_Y0:FIG_Y0 + th, FIG_X0:FIG_X0 + tw]
    reg[:] = reg * (1 - fig[..., 3:4]) + fig[..., :3]
    return p


def main():
    day, dusk, sheet = load('04-day.webp'), load('01-dusk.webp'), load('02-characters.webp')
    # The dusk plate sits ~2 px left of the day plate (gradient correlation, best at +2).
    dusk = dusk.transform(dusk.size, Image.AFFINE, (1, 0, -2, 0, 1, 0), resample=Image.BICUBIC)

    if sys.argv[1:] == ['--skies']:
        # Only the skies and their matte (everything else as it was cut).
        save_skies(day, dusk, os.path.join(OUT, 'afternoon'))
        return
    maps, sky, lum = plate_maps(day)
    fig, arm, sleeve, straight, fa = figures(sheet, day)
    th, tw = fig.shape[:2]
    shut, half = lids(straight, fa)
    # The people as they are first drawn (the forearm over the body), at the plate's scale.
    ph, pw = round(FIG_CROP[3] * FIG_S), round(FIG_CROP[2] * FIG_S)
    posed = np.clip(resize(arm + fig * (1 - arm[..., 3:4]), pw, ph), 0, 1)
    lines = ink_lines(straight) * (fa > 0.5)
    fig_lines = np.clip(resize(np.maximum(lines, graphite_of(straight, 0.6) * fa), pw, ph), 0, 1)
    poster = flatten(day, posed)
    lines_plate = np.zeros((H, W), np.float32)
    lines_plate[FIG_Y0:FIG_Y0 + ph, FIG_X0:FIG_X0 + pw] = fig_lines

    a = os.path.join(OUT, 'afternoon')
    e = os.path.join(OUT, 'empty')
    # The wall's layers.
    save(np.dstack([poster, np.ones((H, W))]), os.path.join(a, 'scene.webp'), WALL)
    # (The artist's pencil drawing where there is one: references/woodland/drawings/pencil.png;
    # for the way back, pencil-after.png, or that drawing with the two of them taken out.)
    pencil = os.path.join(REF, 'drawings', 'pencil.png')
    pencil_after = os.path.join(REF, 'drawings', 'pencil-after.png')
    drawn = pencil_grey(pencil) if os.path.exists(pencil) else None
    where = np.zeros((H, W), np.float32)
    where[FIG_Y0:FIG_Y0 + ph, FIG_X0:FIG_X0 + pw] = posed[:H - FIG_Y0, :W - FIG_X0, 3]
    drawn_after = pencil_grey(pencil_after) if os.path.exists(pencil_after) else pencil_without_them(drawn, where) if drawn is not None else None
    save(pencil_layer(drawn) if drawn is not None else sketch_layer(poster, lines_plate), os.path.join(a, 'sketch.webp'), WALL)
    light = np.clip(maps[..., 3] * 1.4 + 0.25 * smooth(0.55, 0.8, lum) * smooth(400, 520, np.mgrid[0:H, 0:W][0]), 0, 1)
    save(np.dstack([light, light, light]), os.path.join(a, 'light.webp'), WALL)
    # The living scene.
    heads, fmask = flower_heads(day)
    save(under_flowers(arr(day), fmask), os.path.join(a, 'plate.webp'), LIVE, q=92)
    save(np.dstack([arr(day) * fmask[..., None], fmask]), os.path.join(a, 'flowers.webp'), LIVE, q=92)
    smask = save_skies(day, dusk, a)
    x0, y0, x1, y1 = CLOUD_BOX
    save(maps.clip(0, 1), os.path.join(a, 'maps.webp'), {'': W // 4}, lossless=True)
    # Atlases (rows top to bottom): the body, her forearm; her lids shut, half, and her sleeve.
    save(stack([fig, arm]), os.path.join(a, 'figures.webp'), LIVE, q=92)
    occ = np.dstack([sleeve, sleeve, sleeve, sleeve])
    save(stack([shut, half, occ]), os.path.join(a, 'lids.webp'), LIVE, q=92)
    # After the cut: the same place at dusk, nobody there.
    after = pressed(arr(dusk))
    save(after, os.path.join(a, 'after.webp'), LIVE, q=92)
    save(pencil_layer(drawn_after) if drawn_after is not None else sketch_layer(after, np.zeros((H, W), np.float32)), os.path.join(a, 'sketch-after.webp'), WALL)
    # The revisit: the dusk painting itself, nobody in it.
    save(np.dstack([arr(dusk), np.ones((H, W))]), os.path.join(e, 'scene.webp'), WALL)
    dl = (arr(dusk) * [0.3, 0.59, 0.11]).sum(-1)
    save(pencil_layer(drawn_after) if drawn_after is not None else sketch_layer(arr(dusk), np.zeros((H, W), np.float32)), os.path.join(e, 'sketch.webp'), WALL)
    dlight = np.clip((dl - blur(dl, 14)) * 4.0, 0, 1) * smooth(0.35, 0.6, dl) * 0.6
    save(np.dstack([dlight, dlight, dlight]), os.path.join(e, 'light.webp'), WALL)

    # Everything the runtime places, in painting uv (y up), figure uv (y up) or metres.
    def fuv(p):
        return [round(p[0] / FIG_CROP[2], 5), round(1 - p[1] / FIG_CROP[3], 5)]

    def fr(r):
        return [round(r[0] / FIG_CROP[2], 5), round(r[1] / FIG_CROP[3], 5)]

    deformers = []
    for name, c, r, angle, edge, pivot, part in DEFORMERS:
        deformers.append({'name': name, 'c': fuv(c), 'r': fr(r), 'angle': -angle, 'edge': edge,
                          'pivot': fuv(pivot or c), 'part': part})
    ex, ey = LIMB_B_ELBOW
    hx, hy = LIMB_B_HAND
    ln = math.hypot(hx - ex, hy - ey)
    ys, xs = np.nonzero(arm[..., 3] > 0.01)
    pad = 6
    box = [(xs.min() - pad) / tw, 1 - (ys.max() + pad) / th, (xs.max() + pad) / tw, 1 - (ys.min() - pad) / th]
    limb = {
        # The part's extent (figure uv: u0, v0, u1, v1); along it, toward the elbow (figure uv, unit in sheet px).
        'box': [round(float(v), 5) for v in box],
        'axis': [round((ex - hx) / ln, 5), round(-(ey - hy) / ln, 5)],
    }
    place = [FIG_X0 / W, 1 - (FIG_Y0 + ph) / H, pw / W, ph / H]
    living = {
        'afternoon': {
            # (No gradual dusk: the evening arrives with the cut, as its own painting. `grade` and
            # `sky` (dusk_parts, dusk_sky) stay available to a scene whose light should change.)
            'plate': 'afternoon/plate', 'maps': 'afternoon/maps', 'grade': None, 'sky': None,
            'figures': {
                'file': 'afternoon/figures', 'lids': 'afternoon/lids',
                # Each atlas row's height and the gap between rows (texture pixels).
                'pixels': [tw, th], 'gutter': GUTTER,
                'place': [round(v, 5) for v in place], 'split': round(SPLIT / FIG_CROP[2], 5),
                'deformers': deformers, 'limb': limb,
            },
            'after': 'afternoon/after',
            # The near flowers on their stems (painting uv, y up: head centre, radius as a
            # fraction of the width), their heads (cut out of the plate, which has grass there).
            'flowers': {'file': 'afternoon/flowers', 'heads': [[round(cx / W, 5), round(1 - cy / H, 5), round(rad / W, 5)] for cx, cy, rad in heads]},
            # The sky in the gap, drifting behind the leaves: where it shows (painting uv box),
            # and the layers (the afternoon's, the evening's), each CLOUD_PAD px wider on the left.
            'clouds': {'mask': 'afternoon/sky-mask', 'file': 'afternoon/clouds', 'after': 'afternoon/clouds-after',
                       'box': [x0 / W, 1 - y1 / H, (x1 - x0) / W, (y1 - y0) / H], 'pad': round(CLOUD_PAD / (x1 - x0 + CLOUD_PAD), 5)},
            'immerse': True,
        },
        # The revisit stays in the wall, as any memory: the dusk painting, still.
        'empty': None,
    }
    layer = lambda v, n, k: {'name': n, 'kind': k, 'file': f'{v}/{n}', 'source': 'cut from the artist\'s references'}
    manifest = {
        'size': [METRES, round(METRES * H / W, 4)],
        'band': 0,
        'pane': None,
        'register': None,
        'crop': CROP,
        'plate': [W, H],
        'variants': {v: [layer(v, 'scene', 'pigment'), layer(v, 'sketch', 'sketch'), dict(layer(v, 'sketch-after', 'sketch'), file=f'{v}/sketch-after' if v == 'afternoon' else 'empty/sketch'), layer(v, 'light', 'light')] for v in ('afternoon', 'empty')},
        'living': living,
    }
    # The drawing's order (scripts/stroke-order.py) and the two-shot with her head's redrawing
    # (scripts/two-shot.py: `near`, and `figures.heads` below) are made by their own scripts: kept
    # as they are.
    try:
        with open(os.path.join(OUT, 'manifest.json')) as f:
            before = json.load(f)['living']['afternoon']
        for k in ('order', 'orderClocks', 'near'):
            if before.get(k):
                living['afternoon'][k] = before[k]
        if before.get('figures', {}).get('heads'):
            living['afternoon']['figures']['heads'] = before['figures']['heads']
    except (OSError, KeyError, ValueError, TypeError):
        pass
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')
    print('cut: woodland/afternoon, woodland/empty')


if __name__ == '__main__':
    main()
