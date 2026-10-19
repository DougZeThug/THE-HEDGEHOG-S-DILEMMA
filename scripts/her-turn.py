"""
Her turn toward him, the two-shot's one gesture (docs/reviews/2026-10-woodland.md): her own painted
head, from the character sheet's top panel, turned in 3D about her neck. Offline and free: no model,
no network.

    python3 scripts/her-turn.py

The earlier turns bent the panel's head into the artist's drawing of her turned to him, a turn of
70-90 degrees between two drawings that don't agree, and read as morphing ("still not a natural turn
at all"). The artist then asked for a slight turn that settles and stays. A slight turn can be made
from one drawing, honestly, as a rotation:

- **A head under the paint.** Her pose is fitted from thirteen points of her face (eyes, nose, mouth,
  chin, brows, hairline, ear) to a generic head. On it are a cranium and a face: a midline profile
  (forehead, nose, mouth, chin), a width, a cross-section, and the nose as a ridge. Her ear is a flap
  hinged at her cheek, its slant halved (a drawn ear is flatter than a real one). Her neck takes its
  depth from her jaw.
- **The turn.** About her neck's axis (the fitted head's up axis, leaning a little into the
  picture), toward him, by `ANGLE`. Her head turns whole; her neck twists, all of it at the jaw and
  none at the collar; the hair near her head follows it a little and the hair lying on the grass
  stays, nothing moving further than `HAIR_REACH` from her head.
- **Two layers.** In front: her head and neck. Behind: her hair and the rest, filled under her with
  the hair beside her (`stretch_fill`). What lies just behind her drawn edges (far cheek, chin, neck,
  ear) moves with them, so the turn never uncovers anything the painting doesn't have. Each layer
  is an inverse warp of the painting: her lines are resampled, never redrawn.
- **Her far cheek's outline is a silhouette,** not paint on her skin: it moves as the model's outline
  does (about half as far), and her cheek between it and her eye widens, as a far cheek coming round
  does.
- **Her eyes** are on him first (the film's own iris move, `gazeB` in src/memory/living/woodland.ts,
  as the two-shot shader draws it); as her head comes round they ease back in their sockets, still on
  him (`KEEP` of their turn remains).

One drawing for each of the timeline's steps (`TURN_STEPS`, src/memory/defs.ts) and the last, each
the 2x crop round her head (lossless), and turn.json (where the crop lies, how far each drawing is):

    references/woodland/drawings/turn/b-turn-01@2x.webp ... and turn.json

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
# How far from her head the hair near it follows (crop px; none beyond), and how far behind her
# drawn edges what lies there goes with them.
HAIR_REACH = 60.0
DRAG = 36.0

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
    m = np.clip(cv2.GaussianBlur(hole.astype(np.float32), (0, 0), 0.8) * 1.6, 0, 1)[..., None]
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
        z = fillnan(np.fmin(zc, zf))
        zn, _ = nearest_on(JAW, z)
        dj, dc = line_dist(JAW), line_dist(COLLAR)
        tneck = np.clip(dj / np.maximum(dj + dc, 1e-3), 0, 1)
        bj = np.where(below, np.clip(dj / 14.0, 0, 1), 0)
        z = z * (1 - bj) + zn * bj
        z = self.ear_depth(z)
        fm = cv2.GaussianBlur(front, (0, 0), 1.0) + 1e-3
        z = masked_blur(z, fm, 3.0)
        z = z + self.far_push(z)
        self.zF = masked_blur(z, fm, 1.5)
        wneck = 1 - smoothstep(0, 1, tneck)
        self.wF = cv2.GaussianBlur(fillnan(np.where(self.head > 0.5, 1.0, np.where(below, wneck, np.nan))).astype(np.float32), (0, 0), 2.0).astype(np.float64)

        # Behind: the panel itself wherever her edge is soft, so where both layers turn alike (the
        # hair round her crown) they make the panel exactly; filled under her, and under the soft
        # edge too along her drawn edges where it isn't hair (no sliver of her stays behind).
        self.d_front = cv2.distanceTransform((front < 0.5).astype(np.uint8), cv2.DIST_L2, 5)
        d_drawn = np.minimum.reduce([line_dist(p) for p in DRAWN])
        ramp = (cv2.dilate((self.front_a > 0.02).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0) & (d_drawn < 5)
        hole = (self.front_a >= 0.98) | (ramp & (hairness(self.panel) < 0.5))
        self.back = stretch_fill(self.panel, hole)
        self.zB = cv2.GaussianBlur(fillnan(np.where(inside_c, zc, np.nan)).astype(np.float32), (0, 0), 3.0).astype(np.float64)
        dhead = cv2.distanceTransform((self.head < 0.5).astype(np.uint8), cv2.DIST_L2, 5)
        wB = 1 - smoothstep(0, HAIR_REACH, dhead)
        wB = np.where(below, np.minimum(wB, wneck), wB)
        self.wB = cv2.GaussianBlur(wB.astype(np.float32), (0, 0), 2.0).astype(np.float64)

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
        m = cv2.GaussianBlur(poly(EAR), (0, 0), 3.0)
        return z * (1 - m) + zp * m

    def far_push(self, z, far_in=30.0, psi=math.radians(-20.0)):
        """How far to push the paint near her far cheek's outline back toward her neck's axis, so it
        keeps pace with the model's outline: from the model's outline before and after a turn (signed
        distances), at each point of the drawn one; along it, fading out under the lock at her temple
        and toward her chin; inward over `far_in` px; only on her skin and the line itself."""
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
        val = np.interp(near_y, [p[1] for p in FAR], push) * smoothstep(124, 140, near_y) * (1 - smoothstep(206, 224, near_y))
        r, g, b = self.panel[..., 0], self.panel[..., 1], self.panel[..., 2]
        skin = (0.3 * r + 0.59 * g + 0.11 * b > 0.6) & (r > g) & (g > b) & (r - b > 0.15)
        inside = self.head > 0.5
        where = cv2.GaussianBlur(((skin & inside) | (dist < 4) | ~inside).astype(np.float32), (0, 0), 2.5)
        return val * where * np.where(inside, 1 - smoothstep(0, far_in, dist), 1.0)

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
        t = (1 - smoothstep(0, DRAG, self.d_front))[..., None]
        DB = DF * t + DB * (1 - t)
        fx, fy, fres = inverse(DF)
        bx, by, bres = inverse(DB)
        B = cv2.remap(self.back, bx, by, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
        F = cv2.remap(img.astype(np.float32), fx, fy, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)
        A = cv2.remap(self.front_a, fx, fy, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)[..., None]
        err = max(float(fres[self.front_a > 0.5].max()), float(bres.max()))
        return np.clip(F * A + B * (1 - A), 0, 1), err


def looking(img, eye, gaze):
    """`img` (the crop) with one eye looking by `gaze`, as the two-shot shader's `looking()` draws it
    (src/world/living/materials.ts): inside the opening the iris moves along it and the white fills
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
    moved = cv2.remap(img.astype(np.float32), mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    out = base * (1 - iris[..., None]) + moved * iris[..., None]
    return img * (1 - m[..., None]) + out * m[..., None]


def steps():
    """How far she has turned at each drawing: the timeline's `TURN_STEPS`, then all the way."""
    src = open(os.path.join(ROOT, 'src', 'memory', 'defs.ts')).read()
    body = re.search(r'export const TURN_STEPS\s*=\s*\[([^\]]*)\]', src).group(1)
    return [float(v) for v in re.findall(r'[-\d.]+', body)] + [1.0]


def main():
    top2, k = ts.source('02-characters', os.path.join(cut.REF, '02-characters.webp'))
    assert k == 2, 'needs references/woodland/upscaled/ (scripts/upscale.py)'
    panel = top2[0:N, CX:CX + N].astype(np.float64)
    eyes = json.load(open(ts.MANIFEST))['living']['afternoon']['near']['eyes']['b']
    spec = open(os.path.join(ROOT, 'src', 'memory', 'living', 'woodland.ts')).read()
    gaze = np.array([float(v) for v in re.search(r'gazeB:\s*\[([-\d.]+),\s*([-\d.]+)\]', spec).groups()])
    head = Head(panel)
    os.makedirs(OUT, exist_ok=True)
    for old in os.listdir(OUT):
        if old.startswith('b-turn-'):
            os.remove(os.path.join(OUT, old))
    fractions, worst = {}, 0.0
    for i, s in enumerate(steps(), 1):
        img = panel.copy()
        for e in eyes:
            img = looking(img, e, gaze * (1 - (1 - KEEP) * s))
        out, err = head.render(math.radians(-ANGLE * s), img)
        worst = max(worst, err)
        name = f'b-turn-{i:02d}'
        Image.fromarray((out * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, f'{name}@2x.webp'), 'WEBP', lossless=True, method=6)
        fractions[name] = round(s, 4)
    with open(os.path.join(OUT, 'turn.json'), 'w') as fh:
        json.dump({'crop': [CX, 0, N, N], 'scale': 2, 'angle': ANGLE, 'tilt': TILT, 'keep': KEEP, 'drawings': fractions}, fh, indent=2)
        fh.write('\n')
    print(f'her-turn: {len(fractions)} drawings to {ANGLE} deg (pose fit rms {head.rms:.1f} px, warps within {worst:.2f} px)')


if __name__ == '__main__':
    main()
