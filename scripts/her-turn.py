"""
Her turn toward him, the two-shot's one gesture (docs/reviews/2026-10-woodland.md): her own painted
head, from the character sheet's top panel, turned a little toward him as a drawing carried in depth
(the artist's production brief, 2026-10-20). Offline and free: numpy and OpenCV, no model, no network.

    python3 scripts/her-turn.py          # her turn's drawings, for the memory
    python3 scripts/her-turn.py --old    # the first rig's (decisions 43-52), for comparison only

A new angle of a face is a new drawing; none exists at 14 degrees, and the only other drawing of her,
take b, is turned 70-90 degrees and disagrees with the panel (the bends between them read as
morphing). So her own head is turned, the way scripts/drawn-rig/README.md describes:

- **A head under the paint.** Her pose is fitted from thirteen points of her face (eyes, nose, mouth,
  chin, brows, hairline, ear) to a generic head: a cranium and a face (a midline profile, a width, a
  cross-section, the nose as a ridge), no surface steeper than `SLOPE` toward its outline, her ear
  a flap hinged at her cheek. Her outline turns with her face: held back where her far cheek comes
  round (`FAR_IN`), the paint between stretched and her cheek swelled (the artist, 2026-10-20).
- **Her paint on meshes.** Her head is one rigid body: skull, face, chin, jaw line, ear and the hair on
  her skull. Her neck is its own mesh, a cylinder about its centre line, so its sides stay where they
  are while it twists, from all of the turn at her jaw to none at her collar (carried with her jaw,
  its far side went with her chin and it narrowed: the artist, 2026-10-20). It goes on up behind her
  jaw out of sight, and her chin slides across it. The shadow her jaw casts on it is split from its
  paint and goes with her jaw. The meshes are z-buffered together (scripts/drawn-rig/raster.py):
  whichever is nearer is seen. Nothing is inverted, nothing folds.
- **Her lines are drawn again, not stretched** (scripts/drawn-rig/lines.py). They are lifted off her
  paint, and each is carried by its centre line with its cross-section rigid. Where her far cheek
  comes round, its paint stretches while her outline keeps its weight. Her eyes are carried whole,
  as drawn.
- **Behind her**, the hair beside her is continued under her (`stretch_fill`). It has its own smooth
  turn, fading out by `HAIR_REACH`. It is dragged by every edge of hers that draws back from it, and
  by every edge where no line is drawn (her hair at her crown and temples is one with the hair beyond).
  Her soft edge is split so that, not turned, the rig is the panel exactly.
- **The performance** is src/memory/defs.ts `TURN` (mirrored by `schedule()`):
  - her eyes go to him first, in two drawings, as the two-shot shader draws a look (`gazeB` in
    src/memory/living/woodland.ts);
  - a moment;
  - her head turns, on twos, its speed rising gently and dying away as she settles;
  - as it comes round her eyes ease back in their sockets, still on him (`KEEP`).
- **Checked** as it runs: not turned, it is the panel (to 2/255); turned, each feature's lines carry
  the ink they were drawn with (`WEIGHT`).

Each drawing is the 2x crop round her head from the upscaled panel (the two-shot's), and the 1x crop
from the sheet's own painting (the wide's: the change the turn makes, laid on the sheet), lossless,
with turn.json (where the crop lies, each drawing's `figure:b.turn` and its schedule):

    references/woodland/drawings/turn/b-turn-01@2x.webp, b-turn-01@1x.webp ... and turn.json

scripts/two-shot.py lays them into the panel and cuts them into the two-shot's and the wide's heads.
"""
import importlib.util
import json
import math
import os
import re
import sys

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
_spec = importlib.util.spec_from_file_location('two_shot', os.path.join(ROOT, 'scripts', 'two-shot.py'))
ts = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ts)
cut = ts.cut
OUT = os.path.join(cut.REF, 'drawings', 'turn')

# The crop the head is turned in: 512 px square at twice the sheet's size (sheet x 377-633, y 0-256).
CX, N = 754, 512
# How far she turns toward him (degrees), how far her neck's axis leans into the picture (degrees;
# the fitted head's own lean is 24.5, which made the turn read partly as a roll of her head), and how
# much of her eyes' turn in their sockets remains when her head has come round.
ANGLE = 14.0
TILT = 10.0
KEEP = 0.65
# How far from her head the hair near it follows (crop px; none beyond); how far behind an edge of
# hers that draws back from what lies behind it that goes with it (none behind an edge that passes
# over it: her face simply covers it); how far either side of her jaw line it holds rigid (so the
# line keeps its weight and the squeeze falls on the plain skin under her chin); how far past her
# ear's outline the flap holds rigid.
HAIR_REACH = 60.0
DRAG = 48.0
JAW_RIGID = (4.0, 16.0)
EAR_RIGID = 6
# How steeply her head's surface may fall away toward its outline (depth px per px): a head's sides
# turn almost edge-on near its outline, and paint there swelled or shrank up to twice over as she
# turned (the hair at her far temple thickened); hair is drawn the same width wherever it lies.
SLOPE = 1.3

# Her face's points on the 2x crop and on a generic head (template units, about a millimetre: up,
# forward, to her left, from between her ear canals), its eyes larger and lower, its chin higher.
LANDMARKS = [
    ((229.25, 150.5), (6, 68, -47)),    # right eye, outer corner
    ((270.5, 144.25), (6, 80, -15)),    # right eye, inner corner
    ((303.0, 110.5), (6, 80, 15)),      # left eye, inner corner
    ((339.25, 120.5), (6, 68, 47)),     # left eye, outer corner
    ((313.0, 141.75), (-24, 98, 0)),    # nose tip
    ((301.75, 181.75), (-50, 82, -22)), # mouth, right corner
    ((344.25, 166.75), (-50, 82, 22)),  # mouth, left corner
    ((325.5, 168.0), (-49, 88, 0)),     # mouth
    ((352.0, 225.0), (-88, 80, 0)),     # chin
    ((247.0, 123.0), (26, 84, -32)),    # right brow
    ((314.0, 93.0), (26, 84, 32)),      # left brow
    ((268.0, 70.5), (66, 78, -4)),      # hairline
    ((197.0, 222.0), (-8, -6, -76)),    # right ear
]
# The face (template units, by height): its midline's distance forward (forehead, brow, between
# the eyes, nose tip, mouth, chin, under the chin), the same with no nose, its half width, and how
# far forward its sides are.
MID_AT = [-110, -96, -84, -66, -49, -34, -24, -12, 6, 25, 45, 70]
MID = [40, 72, 82, 80, 86, 88, 98, 86, 82, 88, 88, 80]
MID_NO_NOSE = [40, 72, 82, 80, 86, 86, 87, 86, 82, 88, 88, 80]
WIDTH_AT, WIDTH = [-110, -88, -70, -45, -10, 20, 50, 80], [10, 26, 42, 58, 68, 72, 70, 60]
SIDE = 18.0
CRANIUM = ((30, -5, 0), (100, 95, 80))  # centre and radii (up, forward, to her left)
# Her ear: where it is on the head, how it faces (forward of straight out to her right), how much of
# its slant to keep, and where it is hinged at her cheek (crop px).
EAR_AT, EAR_FACING, EAR_FLAT, EAR_HINGE = (-8.0, -6.0, -76.0), 0.3, 0.25, (226, 228)

# Her parts on the crop, each drawn edge traced where her skin meets the dark beyond it, just
# outside it (so the line goes with her): far cheek and chin, the neck's two sides, the ear.
FAR_OUT = [(363, 140), (369, 152), (372, 164), (373, 176), (373, 188), (372, 200), (370, 210), (367, 216), (363, 221),
           (360, 224), (357, 227), (354, 230), (351, 233), (349, 236)]
NECK_R = [(349, 236), (351, 240), (355, 248), (359, 256), (364, 264), (369, 272), (375, 280), (378, 284), (383, 289), (390, 296)]
NECK_L = [(276.5, 312), (276.5, 308), (275.5, 304), (274.5, 300), (272.5, 296), (270.5, 292), (268.5, 288), (266.5, 284),
          (264.5, 280), (261.5, 276), (258.5, 272), (255.5, 268), (252.5, 264), (248.5, 260), (245.5, 256), (240, 251),
          (235, 248), (230, 245), (228, 242)]
EAR_OUT = [(229, 241), (215, 246), (205, 247), (193, 246), (182, 243), (174, 237), (169, 226), (169, 215), (173, 205),
           (180, 200), (188, 198)]
EAR = [(227, 241), (215, 245), (205, 246), (193, 245), (183, 242), (175, 236), (170, 226), (170, 215), (174, 206),
       (180, 201), (188, 199), (200, 200), (212, 206), (222, 218), (228, 232)]
# Her head: the hair's outline against the paper, through the hair at her temples (where it turns
# with her head on both sides), her far cheek and chin, the jaw line, her ear.
HEAD = [(205, 45), (217, 41), (240, 38), (255, 33), (280, 29), (300, 29), (320, 37), (338, 47), (352, 60), (362, 75),
        (369, 92), (371, 112), (367, 124), (362, 134)] + FAR_OUT + \
       [(330, 236), (300, 242), (272, 245), (250, 243), (234, 240)] + EAR_OUT + \
       [(195, 185), (199, 160), (198, 130), (195, 100), (197, 70)]
NECK = [(234, 240), (250, 243), (272, 245), (300, 242), (330, 236)] + NECK_R + \
       [(388, 303), (360, 311), (330, 313), (300, 313)] + NECK_L
JAW = [(234, 240), (250, 243), (272, 245), (300, 242), (330, 236), (349, 236)]
COLLAR = [(276, 312), (300, 313), (330, 313), (360, 311), (388, 303)]
DRAWN = [FAR_OUT, NECK_R, NECK_L, EAR_OUT]
# Her features, where the turn must keep her drawn lines' weight (crop px: centre, radii, angle).
# Her far eye widens by about a quarter as it comes round toward us, as a far eye does; nothing else
# may squeeze or stretch her eyes, brows or mouth beyond what the turn itself does.
NEAR_EYE = ((250.0, 147.0), (26.0, 15.0), -0.42)
FAR_EYE = ((324.0, 119.2), (18.6, 11.8), 0.29)
BROWS = [((247.0, 123.0), (22.0, 8.0), 0.0), ((314.0, 93.0), (22.0, 8.0), 0.0)]
MOUTH = ((318.0, 160.0), (30.0, 26.0), 0.0)
# Her far cheek's outline (the line's centre), below the lock over her temple.
FAR = [(354, 132), (360, 140), (366, 152), (369, 164), (370, 176), (370, 188), (369, 200), (367, 212), (361, 220)]


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def unit(v):
    v = np.asarray(v, np.float64)
    return v / np.linalg.norm(v)


def rodrigues(rv):
    a = np.linalg.norm(rv)
    if a < 1e-12:
        return np.eye(3)
    k = rv / a
    K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + math.sin(a) * K + (1 - math.cos(a)) * K @ K


def fit_pose():
    """Her head's axes (up, forward, to her left; x right, y down, z into the picture), scale and the
    point between her ear canals, from the landmarks: least squares, orthographic."""
    img = np.array([p for p, _ in LANDMARKS], np.float64)
    tpl = np.array([t for _, t in LANDMARKS], np.float64)

    def project(p):
        R = rodrigues(p[:3])
        X = p[3] * (tpl[:, 0:1] * R[:, 0] + tpl[:, 1:2] * R[:, 1] + tpl[:, 2:3] * R[:, 2])
        return X[:, :2] + p[4:6]

    # (from a first look: crown up and away, face toward the picture, turned a little to her left)
    u0, f0 = unit([-0.376, -0.861, 0.342]), unit([0.29, -0.46, -0.839])
    M = np.stack([u0, f0, np.cross(u0, f0)], 1)
    U, _, Vt = np.linalg.svd(M)
    M = U @ Vt
    angle = math.acos(np.clip((np.trace(M) - 1) / 2, -1, 1))
    axis = np.array([M[2, 1] - M[1, 2], M[0, 2] - M[2, 0], M[1, 0] - M[0, 1]]) / (2 * math.sin(angle))
    p = np.r_[axis * angle, 1.2, 278.0, 180.0]
    lam = 1e-3
    for _ in range(200):
        r = (project(p) - img).ravel()
        J = np.stack([((project(p + e) - img).ravel() - (project(p - e) - img).ravel()) / 2e-6
                      for e in np.eye(6) * 1e-6], 1)
        A = J.T @ J
        step = np.linalg.solve(A + lam * np.diag(np.diag(A)), -J.T @ r)
        if ((project(p + step) - img) ** 2).sum() < (r ** 2).sum():
            p, lam = p + step, lam * 0.3
        else:
            lam *= 10
        if np.linalg.norm(step) < 1e-9:
            break
    R = rodrigues(p[:3])
    rms = float(np.sqrt(((project(p) - img) ** 2).sum(1).mean()))
    return R[:, 0], R[:, 1], R[:, 2], float(p[3]), np.array([p[4], p[5], 0.0]), rms


def fillnan(a, it=200):
    """NaNs filled from their neighbours, outward (smoothly near what is known, nearest beyond)."""
    a = a.copy()
    k = np.ones((3, 3), np.float32)
    for _ in range(it):
        m = np.isnan(a)
        if not m.any():
            return a
        b = np.nan_to_num(a, nan=0).astype(np.float32)
        num = cv2.filter2D(b * (~m), -1, k, borderType=cv2.BORDER_REPLICATE)
        den = cv2.filter2D((~m).astype(np.float32), -1, k, borderType=cv2.BORDER_REPLICATE)
        a = np.where(m & (den > 0), num / np.maximum(den, 1e-6), a)
    m = np.isnan(a)
    if m.any():
        _, lab = cv2.distanceTransformWithLabels(m.astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
        table = np.zeros(lab.max() + 1, a.dtype)
        table[lab[~m]] = a[~m]
        a = np.where(m, table[lab], a)
    return a


def masked_blur(z, m, sigma):
    """`z` smoothed within her (weight `m`), and carried smoothly outward from her where `m` is ~0
    (outside her it only keeps the warp's inverse smooth)."""
    num = cv2.GaussianBlur((z * m).astype(np.float32), (0, 0), sigma)
    den = cv2.GaussianBlur(m.astype(np.float32), (0, 0), sigma)
    out = np.where(den > 0.05, num / np.maximum(den, 1e-6), np.nan)
    return cv2.GaussianBlur(fillnan(out).astype(np.float32), (0, 0), 1.0).astype(np.float64)


def poly(pts, ss=4):
    m = np.zeros((N * ss, N * ss), np.uint8)
    cv2.fillPoly(m, [np.round(np.array(pts) * ss + (ss - 1) / 2).astype(np.int32)], 255, lineType=cv2.LINE_AA)
    return cv2.resize(m, (N, N), interpolation=cv2.INTER_AREA).astype(np.float32) / 255


def line_dist(pts):
    m = np.full((N, N), 255, np.uint8)
    cv2.polylines(m, [np.round(np.array(pts)).astype(np.int32)], False, 0, 1)
    return cv2.distanceTransform(m, cv2.DIST_L2, 5)


def nearest_on(pts, values):
    """For each pixel, `values` (an (N, N) map) at its nearest pixel on the polyline `pts`, and the
    distance to it."""
    m = np.full((N, N), 255, np.uint8)
    cv2.polylines(m, [np.round(np.array(pts)).astype(np.int32)], False, 0, 1)
    dist, lab = cv2.distanceTransformWithLabels(m, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    table = np.zeros(lab.max() + 1)
    table[lab[m == 0]] = values[m == 0]
    return table[lab], dist


def slope_limited(z, g, iters=96):
    """`z` brought forward wherever it falls away faster than `g` (the largest surface under it no
    steeper than `g` in any direction: its outline flattened, its middle as it was)."""
    out = z.copy()
    steps = [(dy, dx, g * math.hypot(dy, dx)) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx]
    for _ in range(iters):
        p = np.pad(out, 1, mode='edge')
        m = out.copy()
        for dy, dx, c in steps:
            m = np.minimum(m, p[1 + dy:1 + dy + N, 1 + dx:1 + dx + N] + c)
        if np.abs(m - out).max() < 1e-3:
            return m
        out = m
    return out


def nearest_on_mask(mask, values):
    """For each pixel, `values` (an (N, N) or (N, N, C) map) at its nearest pixel of `mask`, and the
    distance to it."""
    m = np.where(mask, 0, 255).astype(np.uint8)
    dist, lab = cv2.distanceTransformWithLabels(m, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    table = np.zeros((lab.max() + 1,) + values.shape[2:], values.dtype)
    table[lab[mask]] = values[mask]
    return table[lab], dist


def hairness(img):
    """How much a pixel is her hair (0..1, soft): brown, darker than her skin."""
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    h = smoothstep(0.66, 0.52, lum) * smoothstep(0.03, 0.12, r - b) * smoothstep(-0.06, 0.0, r - g) * smoothstep(-0.08, -0.01, g - b)
    return cv2.GaussianBlur(h.astype(np.float32), (0, 0), 0.8)


def stretch_fill(img, hole, k=0.6, gap=1.5):
    """`hole` filled with the hair just outside it, mirrored across its edge and compressed (a pixel d
    inside takes one k*d + gap outside, along the smoothed outward normal; failing hair there, one
    nearer; failing that, the hair's colour nearby): the hair beside her continues behind her, its
    strands kept, never smeared, never reaching past a strip of hair into skin or paper."""
    h8 = hole.astype(np.uint8)
    din = cv2.distanceTransform(h8, cv2.DIST_L2, 5)
    gy, gx = np.gradient(cv2.GaussianBlur(din, (0, 0), 3.0))
    n = np.stack([-gx, -gy], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True) + 1e-6
    Y, X = np.mgrid[0:N, 0:N].astype(np.float32)
    hair = hairness(img) * (1 - hole.astype(np.float32))
    filled = np.zeros_like(img, np.float32)
    got = np.zeros(hole.shape, np.float32)
    for kk in (k, k * 0.4, 0.0):
        reach = din + kk * din + gap
        sx, sy = (X + n[..., 0] * reach).astype(np.float32), (Y + n[..., 1] * reach).astype(np.float32)
        smp = cv2.remap(img.astype(np.float32), sx, sy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
        hh = cv2.remap(hair, sx, sy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT) * (1 - got)
        filled += smp * hh[..., None]
        got += hh
    filled = filled / np.maximum(got, 1e-4)[..., None]
    lum = 0.3 * img[..., 0] + 0.59 * img[..., 1] + 0.11 * img[..., 2]
    hr = hair * smoothstep(0.6, 0.25, lum)
    num, den = cv2.GaussianBlur(img * hr[..., None], (0, 0), 6.0), cv2.GaussianBlur(hr, (0, 0), 6.0)
    for _ in range(4):
        far = den <= 1e-3
        num = np.where(far[..., None], cv2.GaussianBlur(num, (0, 0), 12.0), num)
        den = np.where(far, cv2.GaussianBlur(den, (0, 0), 12.0), den)
    colour = num / np.maximum(den, 1e-4)[..., None]
    t = np.clip(got, 0, 1)[..., None]
    filled = filled * t + colour * (1 - t)
    # (a hard seam: it lies under her opaque core, and feathered out it ate into her soft edge)
    m = hole.astype(np.float32)[..., None]
    return img * (1 - m) + filled * m


def inverse(D, iters=80, damp=0.6):
    """The inverse of the forward warp p -> p + D(p): for each pixel, where it comes from (fixed
    point, damped). And how far off it is (px)."""
    Y, X = np.mgrid[0:N, 0:N].astype(np.float32)
    px, py = X.copy(), Y.copy()
    Dx, Dy = np.ascontiguousarray(D[..., 0], np.float32), np.ascontiguousarray(D[..., 1], np.float32)
    for _ in range(iters):
        dx = cv2.remap(Dx, px, py, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        dy = cv2.remap(Dy, px, py, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        px += damp * (X - dx - px)
        py += damp * (Y - dy - py)
    dx = cv2.remap(Dx, px, py, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    dy = cv2.remap(Dy, px, py, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    return px, py, np.hypot(px + dx - X, py + dy - Y)


def span(mx, my):
    """How much of the source each output pixel takes in, at most across any direction (the inverse
    map's largest stretch: above 1 where the turn squeezes her)."""
    a, b = np.gradient(mx, axis=1), np.gradient(mx, axis=0)
    c, d = np.gradient(my, axis=1), np.gradient(my, axis=0)
    q = a * a + b * b + c * c + d * d
    return np.sqrt(0.5 * (q + np.sqrt((a * a + b * b - c * c - d * d) ** 2 + 4 * (a * c + b * d) ** 2)))


def resample(img, mx, my, interp=cv2.INTER_LANCZOS4, border=cv2.BORDER_REFLECT, ss=4):
    """`img` sampled at (mx, my): one sample a pixel where the turn doesn't squeeze her (Lanczos, so a
    sub-pixel move keeps her lines as crisp as the painting: bicubic softened her face by 6%; held
    within the painting's own range round it),
    averaged over `ss`x`ss` where it does (so a fine line squeezed toward her ear stays a line, never
    dots)."""
    one = cv2.remap(img, mx, my, interp, borderMode=border)
    if interp == cv2.INTER_LANCZOS4:
        # (no brighter or darker than the painting round it: Lanczos rings, and beside a thin dark
        # strand on the paper the ring read as a second, pale strand)
        k3 = np.ones((3, 3), np.uint8)
        lo = cv2.remap(cv2.erode(img, k3), mx, my, cv2.INTER_LINEAR, borderMode=border)
        hi = cv2.remap(cv2.dilate(img, k3), mx, my, cv2.INTER_LINEAR, borderMode=border)
        one = np.clip(one, lo, hi)
    t = smoothstep(1.04, 1.3, span(mx, my))
    if t.max() <= 0:
        return one
    h, w = mx.shape
    big = cv2.remap(img, cv2.resize(mx, (w * ss, h * ss), interpolation=cv2.INTER_LINEAR),
                    cv2.resize(my, (w * ss, h * ss), interpolation=cv2.INTER_LINEAR), cv2.INTER_CUBIC, borderMode=border)
    many = cv2.resize(big, (w, h), interpolation=cv2.INTER_AREA)
    t = t.reshape(t.shape + (1,) * (one.ndim - 2))
    return one * (1 - t) + many * t


class Head:
    """Her head on the crop: the model under the paint, her layers, and the turn."""

    def __init__(self, panel):
        self.panel = panel.astype(np.float32)
        self.u_head, self.f, self.l, self.s, self.c, self.rms = fit_pose()
        a = unit(self.u_head[:2])
        t = math.radians(TILT)
        self.u = np.array([a[0] * math.cos(t), a[1] * math.cos(t), math.sin(t)])
        # a point on her neck's axis (5 forward of her ear canals)
        self.axis = self.c + 5 * self.s * self.f
        Y, X = np.mgrid[0:N, 0:N].astype(np.float64)
        self.X = np.stack([X, Y], -1)

        self.head, self.neck = poly(HEAD), poly(NECK)
        # (summed: where the two share an edge their soft halves make one, no seam along her jaw)
        front = np.clip(self.head + self.neck, 0, 1)
        self.front_a = np.clip(cv2.GaussianBlur(front, (0, 0), 0.6), 0, 1)
        below = self.neck > 0.5

        # Depth in front: her face or cranium, whichever is nearer; her ear's flap; her neck's
        # carried down from her jaw (so it twists on from it, never shears).
        zc, inside_c = self.surface(*self.cranium())
        zf, _ = self.surface(*self.face())
        z = slope_limited(fillnan(np.fmin(zc, zf)), SLOPE)
        zn, _ = nearest_on(JAW, z)
        dj, dc = line_dist(JAW), line_dist(COLLAR)
        tneck = np.clip(dj / np.maximum(dj + dc, 1e-3), 0, 1)
        bj = np.where(below, np.clip(dj / 14.0, 0, 1), 0)
        z = z * (1 - bj) + zn * bj
        # (her jaw line and a band either side of it as one: the face model's chin curves away under
        # it, and turning, that squeezed the drawn line six times over until it faded)
        zj, dl = nearest_on(JAW, z)
        w = 1 - smoothstep(*JAW_RIGID, dl)
        z = z * (1 - w) + zj * w
        z = self.ear_depth(z)
        fm = cv2.GaussianBlur(front, (0, 0), 1.0) + 1e-3
        z = masked_blur(z, fm, 3.0)
        z = z + self.far_push(z)
        self.zF = masked_blur(z, fm, 1.5)
        wneck = 1 - smoothstep(0, 1, tneck)
        self.wF = cv2.GaussianBlur(fillnan(np.where(self.head > 0.5, 1.0, np.where(below, wneck, np.nan))).astype(np.float32), (0, 0), 2.0).astype(np.float64)

        # Her soft edge, split into her and what is behind her: each edge pixel's colour is hers (her
        # nearest inner colour) over the colour behind it (what the panel's pixel implies, given how
        # much of it is hers), so not turned the two make the panel exactly, and turned, no sliver of
        # her stays behind. Under her, the hair beside her continues (`stretch_fill`).
        self.d_front = cv2.distanceTransform((front < 0.5).astype(np.uint8), cv2.DIST_L2, 5)
        A = self.front_a[..., None]
        core = self.front_a >= 0.99
        self.soft = (self.front_a > 0.004) & ~core
        # (hers as near her inner colour as the pixel allows: a drawn line lying in her soft edge is
        # dark, and can't be skin over something darker than black, so it stays her line)
        inner, _ = nearest_on_mask(core, self.panel)
        d = inner - self.panel
        with np.errstate(divide='ignore', invalid='ignore'):
            room = np.where(d > 1e-4, (1 - A) * self.panel / (A * d), np.where(d < -1e-4, (1 - A) * (1 - self.panel) / (-A * d), np.inf))
        lam = np.clip(np.nan_to_num(room.min(-1, keepdims=True), nan=0.0, posinf=1.0), 0, 1)
        self.inner = self.panel + lam * d
        behind = np.clip((self.panel - A * self.inner) / np.maximum(1 - A, 1e-3), 0, 1)
        self.back = stretch_fill(np.where(self.soft[..., None], behind, self.panel).astype(np.float32), core)
        # (the hair's depth smooth: hair lying on the grass took the steep fall of the cranium's
        # outline and bunched up beside her near temple)
        self.zB = cv2.GaussianBlur(fillnan(np.where(inside_c, zc, np.nan)).astype(np.float32), (0, 0), 16.0).astype(np.float64)
        dhead = cv2.distanceTransform((self.head < 0.5).astype(np.uint8), cv2.DIST_L2, 5)
        wB = 1 - smoothstep(0, HAIR_REACH, dhead)
        wB = np.where(below, np.minimum(wB, wneck), wB)
        self.wB = cv2.GaussianBlur(wB.astype(np.float32), (0, 0), 2.0).astype(np.float64)
        # Which of her edges draw back from what lies behind them as she turns (at the full turn:
        # how far each edge point moves inward, 4 px or more counting fully), carried outward from
        # her edge: only there does what is behind go with her.
        DF = self.motion(self.zF, self.wF, math.radians(-ANGLE))
        gy, gx = np.gradient(cv2.GaussianBlur(self.d_front.astype(np.float32), (0, 0), 2.0))
        nrm = np.stack([gx, gy], -1)
        nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True) + 1e-6
        edge = (self.d_front > 0) & (self.d_front <= 2)
        rec = np.clip(-(DF * nrm).sum(-1) / 4.0, 0, 1)
        # (where no line is drawn, as in the hair at her crown and temples, her hair is one with what
        # lies beyond it, and always goes with it: split there, a strand doubled)
        drawn = np.minimum.reduce([line_dist(p) for p in DRAWN]) <= 4
        rec = np.where(drawn, rec, 1.0)
        rec_out, _ = nearest_on_mask(edge, rec)
        self.drag = cv2.GaussianBlur(((1 - smoothstep(0, DRAG, self.d_front)) * rec_out).astype(np.float32), (0, 0), 3.0).astype(np.float64)

    # -- the model ---------------------------------------------------------------------------------

    def to3(self, al, be, ga):
        return self.c + self.s * (al[..., None] * self.u_head + be[..., None] * self.f + ga[..., None] * self.l)

    def cranium(self, n=700):
        (ca, cb, cg), (ra, rb, rg) = CRANIUM
        th, ph = np.meshgrid(np.linspace(0, np.pi, n), np.linspace(-np.pi, np.pi, 2 * n), indexing='ij')
        return ca + ra * np.cos(th), cb + rb * np.sin(th) * np.cos(ph), cg + rg * np.sin(th) * np.sin(ph)

    def face(self, n=700):
        al, t = np.meshgrid(np.linspace(-110, 80, n), np.linspace(-1, 1, n), indexing='ij')
        mid, smooth_mid = np.interp(al, MID_AT, MID), np.interp(al, MID_AT, MID_NO_NOSE)
        be = SIDE + (mid - SIDE) * np.sqrt(np.clip(1 - t * t, 0, 1)) ** 0.8
        ga = t * np.interp(al, WIDTH_AT, WIDTH)
        # (the nose is narrow: what it adds to the midline only near the middle)
        be = be - (mid - smooth_mid) * (1 - np.exp(-(ga / 7.0) ** 2))
        return al, be, ga

    def surface(self, al, be, ga, psi=None):
        """The surface's depth at each pixel (nearest point, NaN where it isn't), and where it is."""
        P = self.to3(al, be, ga).reshape(-1, 3)
        if psi is not None:
            P = self.rotate(P, np.full(len(P), psi))
        x, y = np.round(P[:, 0]).astype(int), np.round(P[:, 1]).astype(int)
        ok = (x >= 0) & (x < N) & (y >= 0) & (y < N)
        idx, zs = y[ok] * N + x[ok], P[ok, 2]
        order = np.argsort(-zs)
        z = np.full(N * N, np.nan)
        z[idx[order]] = zs[order]
        z = z.reshape(N, N)
        return z, ~np.isnan(fillnan(z, 2))

    def ear_depth(self, z):
        """Her ear: a flap, hinged where it meets her cheek at the cheek's own depth."""
        n = unit(-self.l + EAR_FACING * self.f)
        gx, gy = -n[0] / n[2] * EAR_FLAT, -n[1] / n[2] * EAR_FLAT
        hx, hy = EAR_HINGE
        zp = z[hy, hx] + gx * (self.X[..., 0] - hx) + gy * (self.X[..., 1] - hy)
        # (rigid out past its outline, so its rim, the rim's light and the outline turn as the flap;
        # blended into her cheek and hair beyond)
        grown = cv2.dilate((poly(EAR) > 0.5).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * EAR_RIGID + 1, 2 * EAR_RIGID + 1)))
        m = cv2.GaussianBlur(grown.astype(np.float32), (0, 0), 3.0)
        return z * (1 - m) + zp * m

    def far_push(self, z, far_in=20.0, psi=math.radians(-20.0)):
        """How far to push the paint near her far cheek's outline back toward her neck's axis, so it
        keeps pace with the model's outline: from the model's outline before and after a turn (signed
        distances), at each point of the drawn one; along it, fading out under the lock at her temple
        and toward her chin; either side of it over `far_in` px, nowhere else; inside, only on her
        skin and the line itself. (`far_in` ends short of her mouth's far corner, 23 px in: at 40 the
        push stretched it 1.7 times, lengthening her mouth; and it once reached all round her head,
        loosening her ear's rim and her jaw line: the skeptic's review, 2026-10-19.)"""
        k = 4

        def outline(p):
            al, be, ga = self.face(900)
            P = self.to3(al, be, ga).reshape(-1, 3)
            Q = self.rotate(P, np.full(len(P), p))
            m = np.zeros((N * k, N * k), np.uint8)
            x, y = np.round(Q[:, 0] * k).astype(int), np.round(Q[:, 1] * k).astype(int)
            ok = (x >= 0) & (x < k * N) & (y >= 0) & (y < k * N)
            m[y[ok], x[ok]] = 1
            m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
            return (cv2.distanceTransform(1 - m, cv2.DIST_L2, 5) - cv2.distanceTransform(m, cv2.DIST_L2, 5)) / k

        s0, s1 = outline(0.0), outline(psi)
        gy, gx = np.gradient(s0)
        per_px = psi * np.array([self.u[1], -self.u[0]])  # image motion per px of depth
        push = []
        for x, y in FAR:
            X = np.array([[x, y, z[y, x]]])
            moved = (self.rotate(X, np.array([psi]))[0, :2] - X[0, :2])
            nrm = unit([gx[y * k, x * k], gy[y * k, x * k]])
            push.append((s0[y * k, x * k] - s1[y * k, x * k] - moved @ nrm) / (per_px @ nrm))
        rows = np.mgrid[0:N, 0:N][0].astype(np.float64)
        near_y, dist = nearest_on(FAR, rows)
        val = np.interp(near_y, [p[1] for p in FAR], push) * smoothstep(124, 140, near_y) * (1 - smoothstep(192, 232, near_y))
        r, g, b = self.panel[..., 0], self.panel[..., 1], self.panel[..., 2]
        skin = (0.3 * r + 0.59 * g + 0.11 * b > 0.6) & (r > g) & (g > b) & (r - b > 0.15)
        inside = self.head > 0.5
        where = cv2.GaussianBlur(((skin & inside) | (dist < 4) | ~inside).astype(np.float32), (0, 0), 2.5)
        return val * where * (1 - smoothstep(0, far_in, dist))

    # -- the turn ----------------------------------------------------------------------------------

    def rotate(self, X, theta):
        """Points (..., 3) turned about her neck's axis by `theta` (radians, each)."""
        d = X - self.axis
        th = theta[..., None]
        cr = np.cross(np.broadcast_to(self.u, d.shape), d)
        return self.axis + d * np.cos(th) + cr * np.sin(th) + self.u * (d @ self.u)[..., None] * (1 - np.cos(th))

    def motion(self, z, w, psi):
        P = np.concatenate([self.X, z[..., None]], -1)
        return self.rotate(P, w * psi)[..., :2] - self.X

    def render(self, psi, img):
        """`img` (the crop, her eyes already drawn) with her head turned by `psi` (radians; negative
        is toward him). Returns the picture and the warps' worst error (px)."""
        DF = self.motion(self.zF, self.wF, psi)
        DB = self.motion(self.zB, self.wB, psi)
        t = self.drag[..., None]
        DB = DF * t + DB * (1 - t)
        fx, fy, fres = inverse(DF)
        bx, by, bres = inverse(DB)
        B = resample(self.back, bx, by)
        F = resample(np.where(self.soft[..., None], self.inner, img).astype(np.float32), fx, fy)
        A = resample(self.front_a, fx, fy, cv2.INTER_LINEAR, cv2.BORDER_CONSTANT)[..., None]
        # (Where each can be seen: under her chin, hidden by her, the hair's can be off a pixel or two.)
        err = max(float(fres[A[..., 0] > 0.02].max()), float(bres[A[..., 0] < 0.98].max()))
        return np.clip(F * A + B * (1 - A), 0, 1), err


# -- the drawn rig (the artist's production brief, 2026-10-20) ------------------------------------
#
# Her head as a drawing carried in depth: her paint on meshes over the pixels it covers in the panel,
# at the depths of the head above, z-buffered together (nothing inverted, nothing folded); her drawn
# lines lifted off her paint and drawn again where her surface takes them, at their own weight; her
# eyes carried whole; her neck, and the hair behind her, each moving as they do.

def _rig_module(name):
    spec = importlib.util.spec_from_file_location(f'drawn_rig_{name}', os.path.join(ROOT, 'scripts', 'drawn-rig', f'{name}.py'))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


raster = _rig_module('raster')
drawn = _rig_module('lines')

# Her far cheek's band, this far in from its outline (px), set deeper so her far outline moves as the
# model's silhouette does: none. Held back like that (7 px against her features' 22) the paint between
# stretched up to 1.8 times, and her cheek swelled ("her left cheek becomes very fat": the artist,
# 2026-10-20); her outline now moves with her face, 17 px, and her nose, eyes and near side carry
# the turn.
FAR_IN = 0.0
# Her eyes are carried whole, as drawn: their openings grown by this much (lids, lashes, irises).
EYE_GROW = 1.35
# How far behind the nearest surface at a pixel a line may lie and still be seen there (depth px).
LINE_DEPTH = 4.5
# How widely the motion of her edges is carried out into the hair behind her (px).
EDGE_SMOOTH = 6.0
# The shortest piece of a centre line that may move with a surface of its own (px).
SHORTEST = 6
# Her neck: a cylinder about its own centre line, so its sides stay where they are as it twists
# (carried with her jaw, its far side went with her chin and pinched it: "her neck narrows to a
# strange degree", the artist, 2026-10-20); continued up behind her jaw this far, hidden until her
# chin slides off it. The shadow her jaw casts on it goes with her jaw, as far as this below it.
NECK_HIDDEN, JAW_SHADOW = 40.0, 40.0
# How far her chin's shadow reaches past its outline where it meets her neck: in full, then fading out.
CHIN_SHADOW = (18.0, 26.0)


def resampled(pts, n):
    """A polyline resampled to `n` points evenly along it."""
    p = np.asarray(pts, np.float64)
    seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))]
    s = np.linspace(0, seg[-1], n)
    return np.stack([np.interp(s, seg, p[:, 0]), np.interp(s, seg, p[:, 1])], 1)


def ellipse_mask(e, grow=1.0):
    (ex, ey), (rx, ry), ang = e
    m = np.zeros((N, N), np.uint8)
    cv2.ellipse(m, (int(round(ex)), int(round(ey))), (int(rx * grow), int(ry * grow)), math.degrees(ang), 0, 360, 1, -1)
    return m > 0


class Turned:
    """Her head turned as a drawing carried in depth (see the module's notes)."""

    def __init__(self, panel):
        self.panel = panel
        h = self.h = Head(panel)
        Y, X = np.mgrid[0:N, 0:N].astype(np.float64)
        self.X = np.stack([X, Y], -1)
        head, neck = h.head > 0.5, h.neck > 0.5
        self.head_m = head
        # Her head: one rigid body (skull, face, chin, jaw line, ear, the hair on her skull) at the
        # template's depth, face or cranium, whichever is nearer; no steeper than `SLOPE` toward its
        # outline; her ear a flap; her far cheek's band deeper.
        zc, _ = h.surface(*h.cranium())
        zf, _ = h.surface(*h.face())
        fm = cv2.GaussianBlur(h.head, (0, 0), 1.0) + 1e-3
        z = masked_blur(h.ear_depth(slope_limited(fillnan(np.fmin(zc, zf)), SLOPE)), fm, 3.0)
        self.zH = masked_blur(z + h.far_push(z, far_in=FAR_IN), fm, 1.5) if FAR_IN > 0 else z
        # Her neck.
        L, R = resampled(NECK_L[::-1], 200), resampled(NECK_R, 200)  # from her jaw to her collar
        C, r = (L + R) / 2, np.linalg.norm(R - L, axis=1) / 2
        line = np.full((N, N), 255, np.uint8)
        cv2.polylines(line, [np.round(C).astype(np.int32)], False, 0, 1)
        dist, lab = cv2.distanceTransformWithLabels(line, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
        on = np.argwhere(line == 0)
        k = np.linalg.norm(on[:, None, ::-1] - C[None], axis=2).argmin(1)
        tr, tc = np.zeros(lab.max() + 1), np.zeros((lab.max() + 1, 2))
        tr[lab[on[:, 0], on[:, 1]]], tc[lab[on[:, 0], on[:, 1]]] = r[k], C[k]
        r_n, c_n = tr[lab], tc[lab]
        uxy = np.linalg.norm(self.h.u[:2])
        s = ((c_n - h.axis[:2]) @ (h.u[:2] / uxy)) / uxy
        zcyl = h.axis[2] + s * h.u[2] - np.sqrt(np.clip(r_n ** 2 - dist ** 2, 0, None))
        zj, dj = nearest_on(JAW, self.zH)
        zN = zcyl
        dc = line_dist(COLLAR)
        wN = 1 - smoothstep(0, 1, np.clip(dj / np.maximum(dj + dc, 1e-3), 0, 1))
        # (behind her jaw line, and behind her chin's own outline where it meets her neck: the skin
        # under her jaw that joins her chin to her neck, seen once her chin slides off her neck's
        # corner; without it the hair behind her showed between them)
        below = np.zeros((N, N), np.uint8)
        under_jaw = np.array(JAW + FAR_OUT[-6:][::-1][1:], np.float64)
        cv2.fillPoly(below, [np.round(np.concatenate([under_jaw, (under_jaw - [0, NECK_HIDDEN])[::-1]])).astype(np.int32)], 1)
        # (bounded by her neck's own side carried on up from its corner: past it, behind her chin, is
        # the hair; to there, her outline's soft edge)
        j, d = np.array(NECK_R[0], np.float64), unit(np.subtract(NECK_R[2], NECK_R[0]))
        side = (self.X - j) @ np.array([d[1], -d[0]])
        near_chin = line_dist(FAR_OUT[-6:]) < 25
        self.hidden = head & ((dist <= r_n + 2) | near_chin) & (below > 0) & ~(near_chin & (side >= 1.5))
        self.near_chin, self.side = near_chin & self.hidden, side
        self.hidden_alpha = np.where(self.near_chin, smoothstep(1.0, -1.0, side), 1.0)
        self.zN = np.where(self.hidden, np.maximum(zN, self.zH + 4.0), zN)
        self.wN = np.where(self.hidden, 1.0, wN)
        self.zF, self.wF = np.where(head, self.zH, self.zN), np.where(head, 1.0, self.wN)
        # Behind her: the hair beside her continued under her (`stretch_fill`), under her soft edge
        # too, there blended toward what the soft-edge split implies is behind her (exact, but
        # ill-conditioned where she is nearly opaque: once her edge moved off it, a bright dotted
        # line); her edge's colour whatever then makes the panel (so a line in her soft edge stays
        # hers).
        A = h.front_a[..., None]
        fill = stretch_fill(panel.astype(np.float32), h.front_a > 0.004)
        behind = np.clip((panel - A * h.inner) / np.maximum(1 - A, 1e-3), 0, 1)
        kk = smoothstep(0.6, 0.98, A)
        back = np.where(h.soft[..., None], behind * (1 - kk) + fill * kk, fill)
        inner = np.clip((panel - (1 - A) * back) / np.maximum(A, 1e-3), 0, 1)
        lum = lambda c: c @ np.array([0.3, 0.59, 0.11])
        miss = (np.abs(inner * A + (1 - A) * back - panel).max(-1) > 2 / 255) & h.soft
        # (nor where that would make her edge much darker than her own colour there: against dark hair
        # it went black, and once her chin moved over her neck it showed as a dark shard)
        miss |= h.soft & (lum(inner) < lum(h.inner) - 0.12)
        self.back = np.where(miss[..., None], behind, back).astype(np.float32)
        self.inner = np.where(miss[..., None], h.inner, inner)
        # Her paint, her lines lifted off it (her eyes carried whole, as drawn).
        own = np.where(h.soft[..., None], self.inner, panel)
        self.eyes = ellipse_mask(NEAR_EYE, EYE_GROW) | ellipse_mask(FAR_EYE, EYE_GROW)
        self.fills, ink, lines, centre = drawn.split(own, h.front_a > 0.02, self.eyes)
        self.lines = drawn.Lines(ink, lines, centre)
        neck_core = neck & ~head
        # Her neck's own paint, lit, and the shadow her jaw casts on it (a darker wedge just under her
        # jaw line), split so the shadow can go with her jaw: shade * lit is her neck's paint.
        lum = 0.3 * self.fills[..., 0] + 0.59 * self.fills[..., 1] + 0.11 * self.fills[..., 2]
        core = neck_core & (h.front_a > 0.99)
        lit_c = np.median(self.fills[core & (lum > 0.665) & (lum < 0.76)], 0)
        shade_c = np.median(self.fills[core & (lum > 0.5) & (lum < 0.645) & (dj < JAW_SHADOW)], 0)
        l_lit, l_shade = lit_c @ [0.3, 0.59, 0.11], shade_c @ [0.3, 0.59, 0.11]
        under = core & (dj < JAW_SHADOW)
        m = np.where(under, np.clip((l_lit - lum) / (l_lit - l_shade), 0, 1), 0)
        # (and on up behind her jaw, as it is just under it, so that moved with her jaw it still meets
        # her jaw line: short of it, a pale line opened between them)
        up, _ = nearest_on_mask(under, m)
        m = np.where(self.hidden | (head & (dj < 8)), up, m)
        # (and under her chin's own outline where it meets her neck, out over the hair there: her chin
        # slides onto her neck as she turns, and its heavy outline, drawn against her dark hair, lay on
        # bright skin with no shadow under it, a dark shard; moved with her jaw, this shadow lies only
        # where her chin has come onto her neck)
        chin = FAR_OUT[-6:]
        d_chin = line_dist(chin)
        beyond = ~head & ~(neck_core & (h.front_a > 0.5)) & (d_chin < CHIN_SHADOW[1])
        m = np.where(beyond, np.maximum(m, 1 - smoothstep(*CHIN_SHADOW, d_chin)), m)
        self.shade = (1 - m[..., None] * (1 - shade_c / lit_c)).astype(np.float32)
        self.neck_lit = (self.fills / self.shade).astype(np.float32)
        self.zJ = zj
        # (the skin behind her jaw and chin, seen as they slide off it, lies in their shadow; along its
        # edge against the hair, her neck's own outline carried on up, as dark as it is drawn just below
        # her chin: without it the skin there read as a pale streak in her hair)
        rim = np.array([self.lines.ink[y, x].min() for x, y in NECK_R[1:4]]).min()
        ink = 1 - (1 - rim) * np.exp(-0.5 * ((self.side + 1.0) / 0.7) ** 2)
        self.neck_fill = (np.broadcast_to(shade_c, (N, N, 3)) * np.where(self.near_chin, ink, 1.0)[..., None]).astype(np.float32)
        grow = lambda m: cv2.dilate(m.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
        head_mesh = grow(head) & ~(neck_core & (h.head < 0.02))
        neck_mesh = (grow(neck) & ~head) | self.hidden | (neck & head)
        self.meshes = []
        for mask, zm, wm, hidden_too in ((head_mesh, self.zH, np.ones((N, N)), False), (neck_mesh, self.zN, self.wN, True)):
            xy, T = raster.pixel_mesh(mask)
            xi, yi = xy[:, 0].astype(int), xy[:, 1].astype(int)
            self.meshes.append((np.c_[xy, zm[yi, xi]], xy, T, wm[yi, xi], hidden_too))
        # (a line lies on the surface drawn there: her head's, out to its mesh's edge, else her neck's)
        self.zL = np.where(head_mesh, self.zH, self.zN).astype(np.float32)
        self.wL = np.where(head_mesh, 1.0, self.wN).astype(np.float32)
        cx, cy = self.lines.centre[:, 0].astype(int), self.lines.centre[:, 1].astype(int)
        self.centre3 = np.c_[self.lines.centre, self.zL[cy, cx]]
        self.centre_w = self.wL[cy, cx]
        # (each line pixel lies on the surface its centre line does, and is seen or hidden with it:
        # judged by the surface under each pixel, the half of her jaw line over her neck was hidden
        # behind her own jaw)
        self.zL = self.centre3[self.lines.nearest, 2].astype(np.float32)
        self.wL = self.centre_w[self.lines.nearest].astype(np.float32)
        # Her head's lines and her neck's, each drawn through its own surface's motion, one-to-one
        # (all of them through one field, her jaw line moving over her neck's lines had two sources
        # at once, and one point in ten of it came from the wrong one).
        # (a centre line crossing from her head onto her neck is split there; a piece of it too short
        # to be a line of its own goes with the surface the rest of it is on: a 3 px stub of her jaw
        # line, moved with her neck, broke off under her ear)
        on_head = head_mesh.copy()
        cx, cy = self.lines.centre[:, 0].astype(int), self.lines.centre[:, 1].astype(int)
        for side in (True, False):
            pts = np.zeros((N, N), np.uint8)
            sel = on_head[cy, cx] == side
            pts[cy[sel], cx[sel]] = 1
            n, lab, stats, _ = cv2.connectedComponentsWithStats(pts, connectivity=8)
            small = (stats[:, cv2.CC_STAT_AREA] < SHORTEST)
            small[0] = False
            on_head[small[lab]] = not side
        self.surfaces = [(self.lines.only(on_head), np.ones((N, N)), self.zH),
                         (self.lines.only(~on_head), self.wN, self.zN)]
        # The hair behind her: its own smooth turn, fading away from her head; dragged by her edges
        # that draw back from it as she turns (over `DRAG` px), and by every edge where no line is
        # drawn (her hair at her crown and temples is one with the hair beyond it).
        DF = self.front_motion(math.radians(-ANGLE))
        gy, gx = np.gradient(cv2.GaussianBlur(h.d_front.astype(np.float32), (0, 0), 2.0))
        nrm = np.stack([gx, gy], -1)
        nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True) + 1e-6
        edge = (h.d_front > 0) & (h.d_front <= 2)
        rec = np.clip(-(DF * nrm).sum(-1) / 4.0, 0, 1)
        rec = np.where(np.minimum.reduce([line_dist(p) for p in DRAWN]) <= 4, rec, 1.0)
        rec_out, _ = nearest_on_mask(edge, rec)
        self.drag = cv2.GaussianBlur(((1 - smoothstep(0, DRAG, h.d_front)) * rec_out).astype(np.float32), (0, 0), 3.0).astype(np.float64)
        self.hair_full = self.hair_motion(math.radians(-ANGLE))

    def front_motion(self, psi):
        """Where each pixel of her goes with her head turned by `psi` (her head rigid, her neck
        twisting), and past her, where her edges near it go, smoothly (copied from the one nearest,
        it jumped where that one changed, 4.7 px between neighbours, and cut a strand at her far
        temple: the technical artist, 2026-10-20)."""
        P = np.concatenate([self.X, self.zF[..., None]], -1)
        D = self.h.rotate(P, psi * self.wF)[..., :2] - self.X
        front = self.h.front_a > 0.5
        D_out, _ = nearest_on_mask(front, D)
        edge = (front & (cv2.distanceTransform(front.astype(np.uint8), cv2.DIST_L2, 5) <= 2)).astype(np.float32)
        num = cv2.GaussianBlur((D * edge[..., None]).astype(np.float32), (0, 0), EDGE_SMOOTH)
        den = cv2.GaussianBlur(edge, (0, 0), EDGE_SMOOTH)[..., None]
        D_out = np.where(den > 1e-4, num / np.maximum(den, 1e-6), D_out)
        return np.where(front[..., None], D, D_out)

    def hair_motion(self, psi):
        """Where the hair behind her goes with her head turned by `psi`."""
        P = np.concatenate([self.X, self.h.zB[..., None]], -1)
        DB = self.h.rotate(P, psi * self.h.wB)[..., :2] - self.X
        t = self.drag[..., None]
        return self.front_motion(psi) * t + DB * (1 - t)

    def ink(self, psi, best=None):
        """Her lines with her head turned by `psi`, each surface's through its own motion, seen where
        their surface is the nearest (`best`: the depth seen at each pixel; none: all of them)."""
        out = np.ones((N, N, 3), np.float32)
        for lines, w, z in self.surfaces:
            cx, cy = lines.centre[:, 0].astype(int), lines.centre[:, 1].astype(int)
            moved = self.h.rotate(np.c_[lines.centre, z[cy, cx]], psi * w[cy, cx])[:, :2]
            P = np.concatenate([self.X, z[..., None]], -1)
            around = self.h.rotate(P, psi * w)[..., :2] - self.X
            out *= lines.draw(moved, None if best is None else self.visible(psi, best), around)
        return out

    def visible(self, psi, best):
        """Whether a line is seen at each output pixel, given where in the drawing it comes from: where
        the surface it lies on is the nearest there (`best`, the depth seen at each pixel)."""

        def test(mx, my):
            zs = cv2.remap(self.zL, mx, my, cv2.INTER_NEAREST, borderMode=cv2.BORDER_REPLICATE)
            ws = cv2.remap(self.wL, mx, my, cv2.INTER_NEAREST, borderMode=cv2.BORDER_REPLICATE)
            zl = self.h.rotate(np.stack([mx, my, zs], -1).astype(np.float64), psi * ws)[..., 2]
            return zl <= best + LINE_DEPTH
        return test

    def render(self, psi, img, hair=None):
        """`img` (the crop, her eyes already drawn) with her head turned by `psi` (radians; negative
        is toward him), and the hair behind her `hair` of the way round with it (a number, or one for
        each pixel; by default as far as her head). Returns the picture and the depth seen at each
        pixel."""
        h = self.h
        own = np.where(h.soft[..., None], self.inner, img)
        tex = np.where(self.eyes[..., None], own, self.fills).astype(np.float32)
        hidden_tex = np.where(self.hidden[..., None], self.neck_fill, self.neck_lit).astype(np.float32)
        alpha = h.front_a.astype(np.float32)
        hidden_alpha = np.where(self.hidden, self.hidden_alpha * alpha, alpha).astype(np.float32)
        best = np.full((N, N), np.inf)
        col = np.zeros((N, N, 3), np.float32)
        alp = np.zeros((N, N), np.float32)
        on_neck = np.zeros((N, N), bool)
        hidden = self.hidden.astype(np.float32)
        for P, uv, T, w, neck in self.meshes:
            Q = h.rotate(P, psi * w) + [0.5, 0.5, 0.0]  # (the rasterizer's pixel centres are at +0.5)
            UV, Z, F = raster.rasterize(Q, T, uv, N, N)
            hit = (F >= 0) & (Z < best)
            mx, my = UV[..., 0].astype(np.float32), UV[..., 1].astype(np.float32)
            c = cv2.remap(hidden_tex if neck else tex, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
            a = cv2.remap(hidden_alpha if neck else alpha, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
            col[hit], alp[hit], best[hit] = c[hit], a[hit], Z[hit]
            # (her neck's own paint, not the skin behind her jaw, which is already in its shadow)
            on_neck[hit] = neck & (cv2.remap(hidden, mx, my, cv2.INTER_NEAREST)[hit] < 0.5) if neck else False
        # the shadow her jaw casts, where her jaw now is (on her neck, wherever her neck is seen)
        P = np.concatenate([self.X, self.zJ[..., None]], -1)
        jx, jy, _ = inverse(h.rotate(P, np.full((N, N), psi))[..., :2] - self.X)
        shade = cv2.remap(self.shade, jx, jy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(1.0, 1.0, 1.0))
        col = np.where(on_neck[..., None], col * shade, col)
        col = np.clip(col * self.ink(psi, best), 0, 1)
        frac = np.asarray(psi / math.radians(-ANGLE) if hair is None else hair, np.float64)
        bx, by, _ = inverse(self.hair_full * (frac[..., None] if frac.ndim else frac))
        behind = resample(self.back, bx, by)
        a = np.clip(alp, 0, 1)[..., None]
        return np.clip(col * a + behind * (1 - a), 0, 1), best


def looking(img, eye, gaze):
    """`img` (the crop, 2x) with one eye looking by `gaze`, as the two-shot shader's `looking()` draws
    it (src/world/living/materials.ts): inside the opening the iris moves along it and the white fills
    in where it was. `eye`: the manifest's eleven numbers (opening, iris, white; sheet px, y up)."""
    sheet_y = float(ts.PH)
    ex, ey, rx, ry, ang, ix, iy, ir, wr, wg, wb = eye
    e, rad, iris_at, white = np.array([ex, sheet_y - ey]), np.array([rx, ry]), np.array([ix, sheet_y - iy]), np.array([wr, wg, wb])
    cs, sn = np.cos(-ang), np.sin(-ang)
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float64)
    p = np.stack([CX / 2 + (xx + 0.5) / 2, sheet_y - (yy + 0.5) / 2], -1)

    def local(v):
        return np.stack([cs * v[..., 0] + sn * v[..., 1], -sn * v[..., 0] + cs * v[..., 1]], -1) / rad
    q = local(p - e)
    m = 1 - smoothstep(0.82, 1.0, np.linalg.norm(q, axis=-1))
    dl = np.array([gaze[0], -gaze[1]]) * rad
    src = p - np.array([cs * dl[0] - sn * dl[1], sn * dl[0] + cs * dl[1]])
    iris = (1 - smoothstep(ir - 0.7, ir + 0.3, np.linalg.norm(src - iris_at, axis=-1))) * (1 - smoothstep(0.85, 1.0, np.linalg.norm(local(src - e), axis=-1)))
    was = (1 - smoothstep(ir - 0.2, ir + 0.8, np.linalg.norm(p - iris_at, axis=-1)))[..., None]
    fill = white[None, None] * (1 - 0.2 * smoothstep(-0.2, 0.9, q[..., 1]))[..., None]
    base = img * (1 - was) + fill * was
    mx = ((src[..., 0] - CX / 2) * 2 - 0.5).astype(np.float32)
    my = ((sheet_y - src[..., 1]) * 2 - 0.5).astype(np.float32)
    # (Resampled as the turn is: bilinear, as the shader samples, softened her iris by a third.)
    moved = resample(img.astype(np.float32), mx, my)
    out = base * (1 - iris[..., None]) + moved * iris[..., None]
    return img * (1 - m[..., None]) + out * m[..., None]


def strain(head, psi):
    """How much the turn squeezes or stretches her drawn lines, feature by feature (a mouth's corner
    is too few pixels to show in her whole head's numbers): for her inked pixels in each, the share
    whose area changes past 0.75-1.35, the 1st and 99th percentile of that change, and the most any
    is stretched in one direction (1 unchanged)."""
    D = head.motion(head.zF, head.wF, psi)
    a, b = 1 + np.gradient(D[..., 0], axis=1), np.gradient(D[..., 0], axis=0)
    c, d = np.gradient(D[..., 1], axis=1), 1 + np.gradient(D[..., 1], axis=0)
    det = a * d - b * c
    q, s = a * a + b * b + c * c + d * d, np.sqrt((a * a + b * b - c * c - d * d) ** 2 + 4 * (a * c + b * d) ** 2)
    most = np.sqrt(0.5 * (q + s))
    r, g, bl = head.panel[..., 0], head.panel[..., 1], head.panel[..., 2]
    lum = 0.3 * r + 0.59 * g + 0.11 * bl
    gm = np.hypot(*np.gradient(cv2.GaussianBlur(lum, (0, 0), 0.7)))
    inked = (gm > 0.06) & (lum < 0.5) & (head.front_a > 0.98)

    def ellipse(e):
        (ex, ey), (rx, ry), ang = e
        cs, sn = math.cos(ang), math.sin(ang)
        dx, dy = head.X[..., 0] - ex, head.X[..., 1] - ey
        return np.hypot((dx * cs + dy * sn) / rx, (-dx * sn + dy * cs) / ry) < 1

    parts = {'near eye': ellipse(NEAR_EYE), 'far eye': ellipse(FAR_EYE), 'brows': ellipse(BROWS[0]) | ellipse(BROWS[1]),
             'mouth': ellipse(MOUTH), 'jaw line': line_dist(JAW) < 8, 'ear': line_dist(EAR_OUT) < 8,
             'far outline': line_dist(FAR_OUT) < 10}
    parts['the rest'] = ~np.logical_or.reduce(list(parts.values()))
    parts['all'] = np.ones_like(inked)
    out = {}
    for name, m in parts.items():
        v = det[inked & m]
        out[name] = (float(((v < 0.75) | (v > 1.35)).mean()), float(np.percentile(v, 1)), float(np.percentile(v, 99)), float(most[inked & m].max()))
    return out


# How far each feature's inked pixels may go (share outside 0.75-1.35, least area, most area, most
# stretch). Her eyes, brows and mouth only as far as the turn itself takes them (her far eye about a
# quarter wider; her mouth 1.3 times, as a mouth turning toward us lengthens); her jaw line and ear
# rigid; her far outline a silhouette, re-drawn as it comes round; the rest as before.
STRAIN = {'near eye': (0.0, 0.8, 1.2, 1.2), 'far eye': (0.0, 1.0, 1.35, 1.35), 'brows': (0.0, 0.85, 1.35, 1.35),
          'mouth': (0.0, 0.9, 1.35, 1.35), 'jaw line': (0.02, 0.75, 1.2, 1.25), 'ear': (0.02, 0.75, 1.1, 1.15),
          'far outline': (0.45, 0.4, 1.8, 1.8), 'the rest': (0.05, 0.6, 1.4, 1.65), 'all': (0.06, 0.6, 1.6, 1.8)}


def sheet_crop():
    """The crop round her head from the sheet's own painting (1x, not the upscale): what the wide's
    people are cut from (scripts/cut-woodland.py)."""
    img = Image.open(os.path.join(cut.REF, '02-characters.webp')).convert('RGB')
    if img.size != (1448, 1086):
        img = img.resize((1448, 1086), Image.LANCZOS)
    return cut.arr(img)[0:N // 2, CX // 2:(CX + N) // 2].astype(np.float64)


def turn_head(t, ease):
    """How far her head has turned `t` s after it starts: its speed rises gently, is greatest at
    2 * `ease`, and dies away slowly as she settles (velocity t^2 e^(-t/ease); src/memory/defs.ts
    `turnHead`)."""
    x = max(0.0, t) / ease
    return 1 - math.exp(-x) * (1 + x + x * x / 2)


def schedule():
    """Her turn's drawings, as src/memory/defs.ts `turnDrawings` makes them (checked against it in
    tests/living-memory.test.ts): when each is shown (s into the memory), her eyes' share of the way
    to him, her head's share of its turn, and the `figure:b.turn` that shows it. And the two-shot's
    times, and the head's ease."""
    src = open(os.path.join(ROOT, 'src', 'memory', 'defs.ts')).read()
    times = {k: float(v) for k, v in re.findall(r'(\w+):\s*([\d.]+)', re.search(r'export const TWO_SHOT\s*=\s*\{([^}]*)\}', src).group(1))}
    turn = re.search(r'export const TURN\s*=\s*\{([^}]*)\}', src).group(1)
    eyes = [float(v) for v in re.search(r'eyes:\s*\[([^\]]*)\]', turn).group(1).split(',')]
    ease = float(re.search(r'ease:\s*([\d.]+)', turn).group(1))
    count = int(re.search(r'drawings:\s*(\d+)', turn).group(1))
    out = [(times['herEyes'] + i / 12, e, 0.0) for i, e in enumerate(eyes)]
    whole = turn_head(count / 12, ease)
    out += [(times['herTurn'] + i / 12, 1.0, turn_head(i / 12, ease) / whole) for i in range(1, count + 1)]
    n = len(out)
    return [{'at': round(a, 4), 'eyes': e, 'head': round(s, 6), 'turn': round((k + 1) / n, 4)} for k, (a, e, s) in enumerate(out)], times, ease, whole


def features(rig):
    """Her drawn features' regions on the crop (her brows, mouth, jaw line, ear, far outline: her
    eyes are carried whole, as painted, not as lines; her jaw line's own, not her neck's outline that
    meets it, which stays as her jaw moves)."""
    return {'brows': ellipse_mask(BROWS[0]) | ellipse_mask(BROWS[1]), 'mouth': ellipse_mask(MOUTH),
            'jaw line': (line_dist(JAW) < 8) & rig.head_m, 'ear': line_dist(EAR_OUT) < 8, 'far outline': line_dist(FAR_OUT) < 10}


def line_weight(rig, psi):
    """How much ink each of her features' lines carries turned, against not turned (1 unchanged), along
    their own centre lines: the ink where each centre-line point went against the ink where it was (the
    darkest within a pixel of it). A line drawn again at its weight keeps its ink; one squeezed thin or
    hidden loses it. Her lines as the picture draws them, seen or hidden."""
    _, best = rig.render(psi, rig.panel)
    a = 1 - rig.ink(0.0).min(-1)
    b = 1 - rig.ink(psi, best).min(-1)
    dark = lambda x: cv2.dilate(x.astype(np.float32), np.ones((3, 3), np.uint8))
    sample = lambda m, p: cv2.remap(dark(m), p[:, 0].astype(np.float32).reshape(-1, 1), p[:, 1].astype(np.float32).reshape(-1, 1), cv2.INTER_LINEAR).ravel()
    moved = rig.h.rotate(rig.centre3, psi * rig.centre_w)[:, :2]
    before, after = sample(a, rig.lines.centre), sample(b, moved)
    cx, cy = rig.lines.centre[:, 0].astype(int), rig.lines.centre[:, 1].astype(int)
    return {name: float(after[m[cy, cx]].sum() / max(before[m[cy, cx]].sum(), 1e-6)) for name, m in features(rig).items()}


# How much ink each feature's lines may lose or gain turned (the turn changes how much of a line is
# seen only where it comes round or goes away: her far outline and ear).
WEIGHT = {'brows': (0.85, 1.15), 'mouth': (0.85, 1.2), 'jaw line': (0.85, 1.15), 'ear': (0.8, 1.15), 'far outline': (0.8, 1.2)}


def main_old():
    """The first rig (decisions 43-52), on the same drawings' schedule: for comparison only, into
    test-output/review/woodland/turn-old/."""
    top2, k = ts.source('02-characters', os.path.join(cut.REF, '02-characters.webp'))
    panel = top2[0:N, CX:CX + N].astype(np.float64)
    eyes = json.load(open(ts.MANIFEST))['living']['afternoon']['near']['eyes']['b']
    gaze = woodland_gaze()
    head = Head(panel)
    out = os.path.join(ROOT, 'test-output', 'review', 'woodland', 'turn-old')
    os.makedirs(out, exist_ok=True)
    for i, d in enumerate(schedule()[0], 1):
        img = panel.copy()
        for e in eyes:
            img = looking(img, e, gaze * d['eyes'] * (1 - (1 - KEEP) * d['head']))
        pic, _ = head.render(math.radians(-ANGLE * d['head']), img)
        Image.fromarray((np.clip(pic, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(out, f'b-turn-{i:02d}@2x.webp'), 'WEBP', lossless=True, method=6)
    print(f'her-turn: the first rig\'s drawings in {os.path.relpath(out, ROOT)}')


def woodland_gaze():
    spec = open(os.path.join(ROOT, 'src', 'memory', 'living', 'woodland.ts')).read()
    return np.array([float(v) for v in re.search(r'gazeB:\s*\[([-\d.]+),\s*([-\d.]+)\]', spec).groups()])


def main():
    if '--old' in sys.argv:
        return main_old()
    top2, k = ts.source('02-characters', os.path.join(cut.REF, '02-characters.webp'))
    assert k == 2, 'needs references/woodland/upscaled/ (scripts/upscale.py)'
    panel = top2[0:N, CX:CX + N].astype(np.float64)
    eyes = json.load(open(ts.MANIFEST))['living']['afternoon']['near']['eyes']['b']
    gaze = woodland_gaze()
    rig = Turned(panel)
    # (Checks: not turned, the rig is the panel; turned, her lines keep their weight.)
    still, _ = rig.render(0.0, panel)
    off = np.abs(still - panel).max(-1)
    assert np.percentile(off, 99.9) <= 2 / 255 + 1e-6 and off.max() <= 12 / 255, \
        f'not turned, the rig should be the panel: p99.9 {np.percentile(off, 99.9) * 255:.1f}/255, max {off.max() * 255:.0f}/255 at {np.unravel_index(off.argmax(), off.shape)}'
    weight = line_weight(rig, math.radians(-ANGLE))
    print('her-turn: not turned, the panel to %.0f/255; turned, her lines\' ink against as drawn: ' % (off.max() * 255) +
          ', '.join(f'{k} {v:.2f}' for k, v in weight.items()))
    for name, v in weight.items():
        lo, hi = WEIGHT[name]
        assert lo <= v <= hi, f'turned, her {name} carries {v:.2f} of its ink (allowed {lo}-{hi})'
    # The wide is cut from the sheet's own painting, not the upscale: the same turn of it (rendered
    # at 2x from it, brought down), laid on it only as the change the turn makes, so wherever she
    # doesn't move the wide stays the sheet exactly (laying in the upscale changed her hair's outline
    # there: QA, 2026-10-19).
    one = sheet_crop()
    one2 = np.clip(cv2.resize(one, (N, N), interpolation=cv2.INTER_LANCZOS4), 0, 1)
    rig1 = Turned(one2)
    still1, _ = rig1.render(0.0, one2)
    assert np.percentile(np.abs(still1 - one2).max(-1), 99.9) <= 2 / 255 + 1e-6, 'not turned, the rig should be the sheet'
    down = lambda a: cv2.resize(a.astype(np.float32), (N // 2, N // 2), interpolation=cv2.INTER_AREA).astype(np.float64)
    base1 = down(still1)
    drawings, times, ease, whole = schedule()
    os.makedirs(OUT, exist_ok=True)
    for old in os.listdir(OUT):
        if old.startswith('b-turn-'):
            os.remove(os.path.join(OUT, old))
    save = lambda a, name: Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, name), 'WEBP', lossless=True, method=6)
    fractions, plan = {}, {}
    for i, d in enumerate(drawings, 1):
        name, psi = f'b-turn-{i:02d}', math.radians(-ANGLE * d['head'])
        g = gaze * d['eyes'] * (1 - (1 - KEEP) * d['head'])
        img, img1 = panel.copy(), one2.copy()
        for e in eyes:
            img, img1 = looking(img, e, g), looking(img1, e, g)
        # (the hair behind her with her head: a spring after it, its far ends later, moved under a
        # screen pixel and opened a seam beside her neck: the cinematic director, 2026-10-20)
        pics = [r.render(psi, src)[0] for r, src in ((rig, img), (rig1, img1))]
        save(pics[0], f'{name}@2x.webp')
        save(one + down(pics[1]) - base1, f'{name}@1x.webp')
        fractions[name] = d['turn']
        plan[name] = {k: d[k] for k in ('at', 'eyes', 'head')}
        print(f'her-turn: {name} at {d["at"]:.3f} s: eyes {d["eyes"]:.2f}, head {d["head"]:.3f}', flush=True)
    with open(os.path.join(OUT, 'turn.json'), 'w') as fh:
        json.dump({'crop': [CX, 0, N, N], 'scale': 2, 'angle': ANGLE, 'tilt': TILT, 'keep': KEEP, 'rig': 'drawn',
                   'drawings': fractions, 'schedule': plan}, fh, indent=2)
        fh.write('\n')
    print(f'her-turn: {len(fractions)} drawings to {ANGLE} deg (pose fit rms {rig.h.rms:.1f} px)')


if __name__ == '__main__':
    main()
