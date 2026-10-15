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
    figures    the two people, unmixed from the sheet's ivory, light-matched to where they lie,
               with the clearing's grass over their lower edges and a contact shadow under them
    lids       their eyes shut, for the blinks (alpha: where an eye is)
    fsketch    the people as graphite (kept for the artist: not drawn since the ending became a cut)
    after      the same clearing later: the real dusk painting (01), nobody there, the grass
               where they lay still faintly pressed (no shape of them: a smoothing, a shade)
  On the wall, after the cut:
    sketch-after  the graphite of the empty clearing (the return never draws them again)
  The revisit (empty): the dusk painting on the wall, nobody in it, still; it stays in the wall.
"""
import json
import math
import os

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
FIG_X0, FIG_Y0 = 360, 432
IVORY = np.array([249, 244, 234], np.float32) / 255

# The two people's outline on the sheet (generous: their bed of grass is kept, feathered).
FIG_POLY = [(38, 112), (45, 98), (75, 92), (120, 96), (135, 60), (165, 35), (205, 18), (260, 14), (300, 38), (318, 70), (330, 95), (360, 100), (395, 70), (430, 30), (480, 14), (530, 14), (575, 35), (605, 75), (612, 120), (650, 140), (700, 160), (745, 185), (770, 205), (820, 215), (900, 228), (980, 245), (1060, 272), (1130, 302), (1190, 330), (1250, 345), (1300, 338), (1360, 332), (1398, 348), (1402, 385), (1380, 410), (1320, 422), (1260, 428), (1180, 425), (1120, 412), (1040, 400), (1000, 395), (1002, 440), (985, 470), (940, 488), (880, 502), (780, 500), (680, 494), (590, 482), (500, 470), (430, 440), (360, 410), (300, 385), (240, 345), (170, 300), (110, 262), (70, 215), (48, 160)]
# The bodies alone (for the contact shadow and the light match), inside FIG_POLY.
BODY = [(60, 120), (120, 100), (150, 50), (220, 25), (300, 45), (320, 110), (400, 60), (480, 25), (560, 40), (600, 110), (700, 165), (790, 215), (980, 250), (1130, 310), (1250, 350), (1390, 345), (1395, 395), (1260, 420), (1130, 405), (1000, 395), (995, 455), (940, 480), (780, 490), (600, 470), (480, 455), (330, 395), (200, 320), (100, 240)]
# The lower contour (sheet px), where grass from the clearing lies over them.
FIG_UNDER = [(70, 215), (110, 262), (170, 300), (240, 345), (300, 385), (360, 410), (430, 440), (500, 470), (590, 482), (680, 494), (780, 500), (880, 502), (940, 488), (985, 470), (1002, 440), (1040, 400), (1120, 412), (1180, 425), (1260, 428), (1320, 422), (1380, 410)]

# Their anatomy on the sheet (read off zoomed crops): what the shader turns, swells and moves.
ANATOMY = {
    'chestA': {'c': (300, 245), 'r': (150, 82), 'angle': 0.42},
    'chestB': {'c': (585, 196), 'r': (115, 62), 'angle': 0.30},
    'headA': {'c': (222, 82), 'r': (92, 82), 'pivot': (238, 152)},
    'headB': {'c': (505, 66), 'r': (96, 70), 'pivot': (532, 126)},
    'handA': {'elbow': (440, 252), 'hand': (578, 326), 'radius': 24},
    'handB': {'elbow': (538, 262), 'hand': (636, 352), 'radius': 26},
    'shoulderB': {'c': (500, 175), 'r': (70, 50), 'angle': 0.3},
    'settleB': {'c': (560, 170), 'r': (210, 140), 'angle': 0.25},
    'hairA': {'c': (215, 50), 'r': (120, 60), 'angle': 0.0},
    'hairB': {'c': (470, 70), 'r': (130, 75), 'angle': 0.2},
}
A_EYES = [(213, 86), (253, 82)]
B_EYES = [(502, 68), (541, 58)]
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


def figures(sheet, plate):
    """The two people, cut from the sheet, unmixed, occluded, shadowed, light-matched, at the
    size they are drawn on the plate. Returns (premultiplied RGBA at plate scale, straight sheet
    RGB, sheet alpha)."""
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

    # Light-match: the plate's own light where they lie (low frequency), relative to its mean there.
    th, tw = round(h * FIG_S), round(w * FIG_S)
    under = arr(plate)[FIG_Y0:FIG_Y0 + th, FIG_X0:FIG_X0 + tw]
    lum = (under * [0.3, 0.59, 0.11]).sum(-1)
    body_small = resize(poly_mask((w, h), [BODY]), tw, th)
    ref = (lum * body_small).sum() / max(body_small.sum(), 1)
    match = np.clip(blur(lum, 40 * FIG_S) / ref, 0.85, 1.10)

    # To the plate's scale, premultiplied, softened a little (the sheet's line is finer than the plate's).
    pm = np.dstack([straight * a[..., None], a])
    small = np.clip(resize(pm, tw, th), 0, 1)
    small = blur(small, 0.55)
    small[..., :3] *= match[..., None]

    # A contact shadow on the grass under them: away from the light (upper right), soft.
    body = resize(poly_mask((w, h), [BODY]), tw, th)
    sh = np.roll(np.roll(body, 5, 0), -4, 1)
    sh = blur(sh, 9) * (1 - body * 0.6)
    sh_a = np.clip(sh * 0.3, 0, 0.3)
    sh_col = np.array([0.10, 0.13, 0.06])
    sa = small[..., 3]
    out = np.empty_like(small)
    out[..., :3] = small[..., :3] + sh_col * sh_a[..., None] * (1 - sa[..., None])
    out[..., 3] = sa + sh_a * (1 - sa)
    return out, straight, a


def lids(straight, a):
    """Closed eyelids at plate scale: the skin above each eye drawn over it, with a lash line."""
    out = straight.copy()
    h, w = straight.shape[:2]
    m_all = np.zeros((h, w), np.float32)
    for (ex, ey) in A_EYES + B_EYES:
        skin = np.median(straight[ey - 16:ey - 9, ex - 10:ex + 10].reshape(-1, 3), 0)
        m = ellipse_weight(w, h, ex, ey, 11, 7.5, 0, 0.5)
        out = out * (1 - m[..., None]) + skin * m[..., None]
        lash = ellipse_weight(w, h, ex, ey + 2, 10, 1.6, 0.08, 0.6) * 0.85
        out = out * (1 - lash[..., None]) + np.array([0.24, 0.16, 0.12]) * lash[..., None]
        m_all = np.maximum(m_all, ellipse_weight(w, h, ex, ey, 13, 9, 0, 0.4))
    th, tw = round(h * FIG_S), round(w * FIG_S)
    pm = np.dstack([out * m_all[..., None], m_all])
    return np.clip(resize(pm, tw, th), 0, 1)


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
    sway = blur(sway, 10)
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

    maps, sky, lum = plate_maps(day)
    fig, straight, fa = figures(sheet, day)
    th, tw = fig.shape[:2]
    lid = lids(straight, fa)
    lines = ink_lines(straight) * (fa > 0.5)
    fig_lines = np.clip(resize(np.maximum(lines, graphite_of(straight, 0.6) * fa), tw, th), 0, 1)
    graphite = np.array([0.30, 0.30, 0.32])
    fsk_a = smooth(0.1, 0.8, fig_lines) * 0.95
    fsketch = np.dstack([graphite * fsk_a[..., None], fsk_a])
    poster = flatten(day, fig)
    lines_plate = np.zeros((H, W), np.float32)
    lines_plate[FIG_Y0:FIG_Y0 + th, FIG_X0:FIG_X0 + tw] = fig_lines

    a = os.path.join(OUT, 'afternoon')
    e = os.path.join(OUT, 'empty')
    # The wall's layers.
    save(np.dstack([poster, np.ones((H, W))]), os.path.join(a, 'scene.webp'), WALL)
    save(sketch_layer(poster, lines_plate), os.path.join(a, 'sketch.webp'), WALL)
    light = np.clip(maps[..., 3] * 1.4 + 0.25 * smooth(0.55, 0.8, lum) * smooth(400, 520, np.mgrid[0:H, 0:W][0]), 0, 1)
    save(np.dstack([light, light, light]), os.path.join(a, 'light.webp'), WALL)
    # The living scene.
    save(arr(day), os.path.join(a, 'plate.webp'), LIVE, q=92)
    save(maps.clip(0, 1), os.path.join(a, 'maps.webp'), {'': W // 4}, lossless=True)
    save(fig, os.path.join(a, 'figures.webp'), LIVE, q=92)
    save(lid, os.path.join(a, 'lids.webp'), LIVE, q=92)
    save(fsketch, os.path.join(a, 'fsketch.webp'), LIVE, q=90)
    # After the cut: the same place at dusk, nobody there.
    after = pressed(arr(dusk))
    save(after, os.path.join(a, 'after.webp'), LIVE, q=92)
    save(sketch_layer(after, np.zeros((H, W), np.float32)), os.path.join(a, 'sketch-after.webp'), WALL)
    # The revisit: the dusk painting itself, nobody in it.
    save(np.dstack([arr(dusk), np.ones((H, W))]), os.path.join(e, 'scene.webp'), WALL)
    dl = (arr(dusk) * [0.3, 0.59, 0.11]).sum(-1)
    save(sketch_layer(arr(dusk), np.zeros((H, W), np.float32)), os.path.join(e, 'sketch.webp'), WALL)
    dlight = np.clip((dl - blur(dl, 14)) * 4.0, 0, 1) * smooth(0.35, 0.6, dl) * 0.6
    save(np.dstack([dlight, dlight, dlight]), os.path.join(e, 'light.webp'), WALL)

    # Everything the runtime places, in painting uv (y up), figure uv (y up) or metres.
    def fuv(p):
        return [round(p[0] / FIG_CROP[2], 5), round(1 - p[1] / FIG_CROP[3], 5)]

    def fr(r):
        return [round(r[0] / FIG_CROP[2], 5), round(r[1] / FIG_CROP[3], 5)]

    anatomy = {}
    for k, v in ANATOMY.items():
        o = {}
        for f, val in v.items():
            if f in ('c', 'pivot', 'elbow', 'hand'):
                o[f] = fuv(val)
            elif f == 'r':
                o[f] = fr(val)
            elif f == 'angle':
                o[f] = -val  # y flipped
            else:
                o[f] = round(val / FIG_CROP[3], 5)  # a radius, in figure heights
        anatomy[k] = o
    place = [FIG_X0 / W, 1 - (FIG_Y0 + th) / H, tw / W, th / H]
    living = {
        'afternoon': {
            # (No gradual dusk: the evening arrives with the cut, as its own painting. `grade` and
            # `sky` (dusk_parts, dusk_sky) stay available to a scene whose light should change.)
            'plate': 'afternoon/plate', 'maps': 'afternoon/maps', 'grade': None, 'sky': None,
            'figures': {
                'file': 'afternoon/figures', 'lids': 'afternoon/lids', 'sketch': 'afternoon/fsketch',
                'place': [round(v, 5) for v in place], 'pixels': [tw, th], 'split': round(SPLIT / FIG_CROP[2], 5),
                'anatomy': anatomy,
            },
            'after': 'afternoon/after',
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
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')
    print('cut: woodland/afternoon, woodland/empty')


if __name__ == '__main__':
    main()
