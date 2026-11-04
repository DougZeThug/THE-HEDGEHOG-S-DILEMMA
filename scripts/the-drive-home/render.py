"""The Drive Home: a 54 s painterly, rotoscope-style film, rendered procedurally.

Two grown siblings drive home at night after a difficult family gathering. The
passenger looks out of the window; the driver keeps both hands on the wheel.
The passenger rubs their hands for warmth. Without looking, the driver turns
the heater vent toward them. A minute later the passenger turns it back so it
reaches the driver's hands too. Neither says anything. Streetlights pass over
their faces, a turn signal ticks, and the car goes on into the dark.

    python3 scripts/the-drive-home/render.py OUT.mp4
    python3 scripts/the-drive-home/render.py STILL.png --still 12.0,23.0

Needs numpy, opencv-python and ffmpeg. The picture is painted at 1280x720 on
twos (12 drawings a second, as rotoscoped film is), run through a Kuwahara
paint filter with a boiling brush texture, and finished at 1920x1080 on a
canvas grain. Silent: the sound is laid by mix.sh.
"""
import math, subprocess, sys
from multiprocessing import Pool
import numpy as np
import cv2

W, H = 1280, 720          # painting resolution
OW, OH = 1920, 1080       # output resolution
FPS, DRAW = 24, 12        # frames per second, drawings per second
DUR = 54.0

# ---------------------------------------------------------------- timeline
# shot boundaries (seconds). A road, B/D/F two-shot, C/E the vent, G the turn.
SHOTS = [("A", 0.0, 6.5), ("B", 6.5, 12.0), ("P1", 12.0, 19.5), ("C", 19.5, 26.0),
         ("P2", 26.0, 32.5), ("E", 32.5, 39.0), ("F", 39.0, 46.6), ("G", 46.6, DUR)]
DISSOLVES = {("A", "B"): 0.8, ("F", "G"): 1.0}
BLINK_ON = 41.6           # driver flicks the indicator
BLINK_HZ = 1 / 0.605     # matched to the relay in the recorded indicator (raw/signal-4)
LAMP_PERIOD = 2.35        # seconds between streetlights
LAST_LAMP = 43.2          # after the turn there are no more streetlights


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def ease(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def kf(t, keys):
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            return v0 + (v1 - v0) * ease((t - t0) / (t1 - t0))
    return keys[-1][1]


def blink_level(t):
    """Indicator lamp brightness 0..1 (square-ish pulses with a soft filament)."""
    if t < BLINK_ON:
        return 0.0
    ph = ((t - BLINK_ON) * BLINK_HZ) % 1.0
    return ease(ph / 0.08) * (1 - ease((ph - 0.42) / 0.12))


def lamp_phase(t, offset=0.0):
    """0..1 through one streetlight pass; returns (phase, index)."""
    u = (t + offset) / LAMP_PERIOD
    return u % 1.0, int(math.floor(u))


# ---------------------------------------------------------------- drawing kit
YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)


def blur(a, s):
    if s <= 0.3:
        return a
    k = int(s * 3) * 2 + 1
    return cv2.GaussianBlur(a, (k, k), s)


def aa(d, w=1.2):
    """coverage from a signed distance in px"""
    return np.clip(0.5 - d / w, 0.0, 1.0)


def sd_ellipse(cx, cy, rx, ry, ang=0.0):
    x, y = XX - cx, YY - cy
    if ang:
        c, s = math.cos(ang), math.sin(ang)
        x, y = c * x + s * y, -s * x + c * y
    q = np.sqrt((x / rx) ** 2 + (y / ry) ** 2)
    return (q - 1.0) * min(rx, ry)


def sd_capsule(ax, ay, bx, by, r):
    px, py, vx, vy = XX - ax, YY - ay, bx - ax, by - ay
    h = np.clip((px * vx + py * vy) / (vx * vx + vy * vy + 1e-6), 0.0, 1.0)
    dx, dy = px - vx * h, py - vy * h
    return np.sqrt(dx * dx + dy * dy) - r


def sd_box(cx, cy, hw, hh, r=0.0, ang=0.0):
    x, y = XX - cx, YY - cy
    if ang:
        c, s = math.cos(ang), math.sin(ang)
        x, y = c * x + s * y, -s * x + c * y
    qx, qy = np.abs(x) - hw + r, np.abs(y) - hh + r
    return np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2) + np.minimum(np.maximum(qx, qy), 0) - r


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h - k * h * (1.0 - h)


def poly_sd(pts, feather=1.0):
    """approximate coverage of a polygon (anti-aliased, optionally feathered)"""
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [np.round(np.array(pts) * 4).astype(np.int32)], 255, cv2.LINE_AA, shift=2)
    m = m.astype(np.float32) / 255.0
    return blur(m, feather) if feather > 1 else m


def over(img, col, m):
    m = m[..., None]
    img *= 1.0 - m
    img += np.asarray(col, np.float32) * m
    return img


def normals_from_sd(d, radius, bumps=None, k=1.0):
    """A pillowy relief from a signed distance: a dome `radius` px deep at the edge,
    plus optional extra height (px). Returns unit normals (x right, y up, z out)."""
    h = np.sqrt(np.clip(-d / radius, 0.0, 1.0)) * radius
    if bumps is not None:
        h = h + bumps
    gy, gx = np.gradient(h)
    nx, ny = -gx * k, gy * k
    nz = np.ones_like(h)
    n = np.sqrt(nx * nx + ny * ny + nz * nz)
    return nx / n, ny / n, nz / n


def lambert(nx, ny, nz, L, wrap=0.35):
    lx, ly, lz = L
    ln = math.sqrt(lx * lx + ly * ly + lz * lz)
    v = (nx * lx + ny * ly + nz * lz) / ln
    return np.clip((v + wrap) / (1 + wrap), 0.0, 1.0)


def shade(nx, ny, nz, albedo, lights, rim=None):
    """lights: list of (direction, rgb, mask-or-None). albedo: rgb or HxWx3."""
    acc = np.zeros((H, W, 3), np.float32)
    for L, rgb, mask, wrap in lights:
        l = lambert(nx, ny, nz, L, wrap)
        if mask is not None:
            l = l * mask
        acc += l[..., None] * np.asarray(rgb, np.float32)
    return acc * albedo


# ---------------------------------------------------------------- textures
def value_noise(w, h, cells, rng):
    g = rng.random((cells[1] + 3, cells[0] + 3)).astype(np.float32)
    return cv2.resize(g, (w, h), interpolation=cv2.INTER_CUBIC)


def fbm(w, h, seed, octaves=((6, 4, 1.0), (14, 8, 0.5), (34, 20, 0.25), (90, 50, 0.12))):
    rng = np.random.default_rng(seed)
    a = np.zeros((h, w), np.float32)
    for cx, cy, amp in octaves:
        a += (value_noise(w, h, (cx, cy), rng) - 0.5) * amp
    return a


def stroke_texture(seed):
    """Brush-stroke relief: noise smeared along a slowly turning direction field
    (a cheap line-integral convolution)."""
    rng = np.random.default_rng(seed)
    base = rng.random((H, W)).astype(np.float32)
    base = blur(base, 0.8)
    ang = fbm(W, H, seed + 1, ((3, 2, 1.0), (7, 4, 0.5))) * 2.5 + 0.9
    dx, dy = np.cos(ang), np.sin(ang)
    acc = np.zeros_like(base)
    n = 5
    for k in range(-n, n + 1):
        mx = (XX + dx * k * 1.3).astype(np.float32)
        my = (YY + dy * k * 1.3).astype(np.float32)
        acc += cv2.remap(base, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    acc /= (2 * n + 1)
    acc = (acc - acc.mean()) / (acc.std() + 1e-6)
    return acc.astype(np.float32)


G = {}


def init():
    if G:
        return
    cv2.setNumThreads(1)  # one process per core already
    G["strokes"] = [stroke_texture(100 + k) for k in range(3)]
    G["wob"] = [(fbm(W, H, 200 + k, ((5, 3, 1.0), (12, 7, 0.4))),
                 fbm(W, H, 300 + k, ((5, 3, 1.0), (12, 7, 0.4)))) for k in range(3)]
    rng = np.random.default_rng(9)
    # canvas weave at output resolution
    oy, ox = np.mgrid[0:OH, 0:OW].astype(np.float32)
    weave = 0.5 * np.sin(ox * 1.9) * np.sin(oy * 1.9 + np.sin(ox * 0.05)) + 0.5 * np.sin(oy * 2.3) * np.sin(ox * 0.9)
    tooth = blur(rng.random((OH, OW)).astype(np.float32), 0.7) - 0.5
    G["canvas"] = (weave * 0.012 + tooth * 0.05).astype(np.float32)
    G["fields"] = fbm(W, H, 11)
    G["leather"] = fbm(W, H, 12, ((40, 24, 0.5), (120, 70, 0.5), (300, 170, 0.3)))
    G["drops"] = np.random.default_rng(5).random((70, 4))
    G["trees"] = np.random.default_rng(6).random((60, 4))
    r = np.sqrt(((XX - W / 2) / (W * 0.62)) ** 2 + ((YY - H * 0.5) / (H * 0.72)) ** 2)
    G["vig"] = np.clip(1.0 - 0.6 * r ** 2.6, 0.0, 1.0).astype(np.float32)


# ---------------------------------------------------------------- lights
SODIUM = np.array([1.0, 0.60, 0.28], np.float32)
AMBER = np.array([1.0, 0.50, 0.08], np.float32)
NIGHT = np.array([0.10, 0.15, 0.26], np.float32)
DASH = np.array([0.10, 0.26, 0.30], np.float32)


def interior_lamp(t):
    """A passing streetlight seen from inside: returns (strength, elevation 0..1,
    the y in px of the roof-shadow edge sweeping down the frame)."""
    if t > LAST_LAMP + 1.0:
        return 0.0, 0.5, H * 2
    p, _ = lamp_phase(t, 0.6)
    # the lamp climbs from ahead to overhead; the windscreen header's shadow
    # slides down over them and off the bottom of the frame
    s = math.sin(math.pi * clamp(p / 0.62)) ** 1.6
    s *= 1.0 - ease((t - LAST_LAMP) / 0.9)
    edge = -260 + (H + 520) * clamp(p / 0.62)
    return s, clamp(p / 0.62), edge


# ---------------------------------------------------------------- people
SKIN_D = np.array([0.62, 0.45, 0.36], np.float32)   # the driver
SKIN_P = np.array([0.68, 0.49, 0.39], np.float32)   # the passenger
HAIR_D = np.array([0.075, 0.06, 0.05], np.float32)
HAIR_P = np.array([0.17, 0.10, 0.065], np.float32)
COAT_D = np.array([0.07, 0.08, 0.10], np.float32)    # charcoal
COAT_P = np.array([0.10, 0.14, 0.11], np.float32)    # bottle-green wool
KNIT_P = np.array([0.36, 0.29, 0.20], np.float32)    # oatmeal cuffs


def L_ell(u, v, cx, cy, rx, ry):
    q = np.sqrt(((u - cx) / rx) ** 2 + ((v - cy) / ry) ** 2)
    return (q - 1.0) * min(rx, ry)


def L_cap(u, v, ax, ay, bx, by, r):
    pu, pv, wu, wv = u - ax, v - ay, bx - ax, by - ay
    h = np.clip((pu * wu + pv * wv) / (wu * wu + wv * wv), 0.0, 1.0)
    return np.sqrt((pu - wu * h) ** 2 + (pv - wv * h) ** 2) - r


def gauss(u, v, cx, cy, sx, sy):
    return np.exp(-((u - cx) / sx) ** 2 - ((v - cy) / sy) ** 2)


def local(cx, cy, s, facing, tilt=0.0):
    """screen -> head space: u toward the face, v up, units of s px; tilt nods
    the head forward (+) about the top of the neck."""
    u = (XX - cx) / s * facing
    v = (cy - YY) / s
    if tilt:
        c, si = math.cos(tilt), math.sin(tilt)
        pu, pv = u - 0.0, v + 0.7
        u, v = c * pu - si * pv, si * pu + c * pv - 0.7
    return u, v


def profile_sd(u, v):
    d = L_ell(u, v, -0.05, 0.30, 1.0, 1.02)                        # cranium
    d = smin(d, L_ell(u, v, 0.36, 0.42, 0.55, 0.70), 0.2)           # forehead
    d = smin(d, L_ell(u, v, 0.42, -0.36, 0.54, 0.60), 0.25)         # cheek, maxilla
    d = smin(d, L_ell(u, v, 0.86, 0.19, 0.11, 0.09), 0.07)          # brow
    d = smin(d, L_cap(u, v, 0.89, 0.06, 1.10, -0.27, 0.06), 0.05)   # nose
    d = smin(d, L_ell(u, v, 1.07, -0.30, 0.085, 0.075), 0.04)       # tip
    d = smin(d, L_ell(u, v, 0.97, -0.40, 0.09, 0.05), 0.05)         # under the nose
    d = smin(d, L_ell(u, v, 0.95, -0.53, 0.07, 0.055), 0.035)       # upper lip
    d = smin(d, L_ell(u, v, 0.925, -0.645, 0.065, 0.05), 0.035)     # lower lip
    d = smin(d, L_ell(u, v, 0.82, -0.86, 0.16, 0.14), 0.07)         # chin
    d = smin(d, L_cap(u, v, 0.74, -0.93, -0.08, -0.55, 0.12), 0.16)  # jaw
    d = smin(d, L_cap(u, v, 0.18, -0.62, 0.0, -2.2, 0.40), 0.18)    # neck
    return d


def profile(img, cx, cy, s, facing, skin, hair, lights, long_hair=False, eye_open=1.0, tilt=0.0, eye_vis=1.0, coat=None):
    u, v = local(cx, cy, s, facing, tilt)
    if long_hair:  # falls behind the neck to the shoulders
        dh = smin(L_ell(u, v, -0.25, 0.25, 1.12, 1.12), L_cap(u, v, -0.45, -0.2, -0.35, -1.75, 0.62), 0.4)
        dh = smin(dh, L_cap(u, v, 0.05, 0.5, -0.05, -1.5, 0.32), 0.3)
        nx, ny, nz = normals_from_sd(dh * s, 0.8 * s)
        strands = 1.0 + 0.2 * np.sin(u * 30 + v * 4 + G["fields"] * 10)
        over(img, shade(nx, ny, nz, hair * 0.8, lights) * strands[..., None], aa(dh * s, 2.0))
    d = profile_sd(u, v)
    bump = (0.05 * gauss(u, v, 0.62, -0.12, 0.2, 0.14)     # cheekbone
            - 0.06 * gauss(u, v, 0.74, 0.05, 0.12, 0.08)   # socket
            - 0.03 * gauss(u, v, 0.5, 0.3, 0.12, 0.15)     # temple
            - 0.025 * gauss(u, v, 0.86, -0.42, 0.08, 0.12))  # beside the mouth
    nx, ny, nz = normals_from_sd(d * s, 0.8 * s, bump * s)
    alb = np.broadcast_to(skin, (H, W, 3)).copy()
    lips = gauss(u, v, 0.94, -0.585, 0.06, 0.09)
    alb *= (1 - lips[..., None] * np.array([0.12, 0.32, 0.30], np.float32))
    flush = gauss(u, v, 0.6, -0.25, 0.22, 0.16)
    alb *= (1 + flush[..., None] * np.array([0.10, -0.03, -0.05], np.float32))
    neck_shadow = np.clip((-0.62 - v) * 1.3, 0, 0.45) * np.clip((0.7 - u) * 2, 0, 1)
    alb *= (1 - neck_shadow[..., None])
    col = shade(nx, ny, nz, alb, lights)
    m = aa(d * s, 1.3)
    over(img, col, m)
    # the eye, its lid, the brow
    eo = max(eye_open, 0.05)
    eye = L_ell(u, v, 0.80, 0.035, 0.075, 0.03 * eo)
    over(img, np.array([0.035, 0.028, 0.03], np.float32), aa(eye * s, 1.2) * 0.9 * eye_vis)
    glint = gauss(u, v, 0.83, 0.04, 0.012, 0.01) * eo * eye_vis
    lit = shade(np.zeros((1, 1)), np.zeros((1, 1)), np.ones((1, 1)), np.ones(3, np.float32),
                [(L, rgb, None, w) for L, rgb, _, w in lights[:1]])[0, 0]
    img += glint[..., None] * (0.03 + 0.8 * lit) * 0.6
    lid = L_cap(u, v, 0.72, 0.075, 0.86, 0.065, 0.012)
    over(img, skin * 0.06, aa(lid * s, 1.2) * 0.45 * eye_vis)  # the lash line, dark in any light
    brow = L_cap(u, v, 0.62, 0.19, 0.9, 0.205, 0.028)
    over(img, col * 0.4, aa(brow * s, 1.5) * 0.8)  # the brow, lit as the face is
    # hair cap
    if long_hair:  # hair worn down frames the face and covers the ear
        hl = np.where(u > 0.35, -0.3 + (u - 0.35) * 2.7, -0.3 - np.clip(-0.25 - u, 0, None) * 1.0)
    else:
        hl = np.where(u > 0.15, (u - 0.15) * 1.3, np.where(u > -0.25, -0.05, -0.05 - (-0.25 - u) * 1.0))
    capd = np.maximum(L_ell(u, v, -0.05, 0.32, 1.05, 1.07), hl - v)
    capd = smin(capd, L_ell(u, v, 0.12, 0.88, 0.72, 0.42), 0.15)
    nx, ny, nz = normals_from_sd(capd * s, 0.7 * s)
    strands = 1.0 + 0.1 * np.sin(np.arctan2(v - 0.2, u + 0.1) * 55 + G["fields"] * 16)
    over(img, shade(nx, ny, nz, hair, lights) * strands[..., None], aa(capd * s, 2.0))
    if not long_hair:  # the ear
        de = L_ell(u, v, -0.02, -0.02, 0.13, 0.24)
        nx, ny, nz = normals_from_sd(de * s, 0.1 * s)
        over(img, shade(nx, ny, nz, skin * 0.8, lights), aa(de * s, 1.3))
        inner = L_ell(u, v, 0.0, -0.0, 0.06, 0.14)
        over(img, skin * 0.06, aa(inner * s, 2) * 0.4)
    if coat is not None:  # the coat collar round the neck
        col = smin(L_cap(u, v, -0.55, -1.15, 0.45, -1.45, 0.3), L_ell(u, v, -0.2, -1.9, 1.0, 0.55), 0.2)
        nx, ny, nz = normals_from_sd(col * s, 0.25 * s)
        over(img, shade(nx, ny, nz, coat * 1.2, lights), aa(col * s, 1.5))
    if long_hair:  # a lock tucked behind the ear, falling forward of the shoulder
        lock = L_cap(u, v, 0.1, 0.55, -0.12, -0.15, 0.13)
        lock = smin(lock, L_cap(u, v, -0.12, -0.15, -0.05, -1.2, 0.16), 0.1)
        nx, ny, nz = normals_from_sd(lock * s, 0.15 * s)
        over(img, shade(nx, ny, nz, hair * 1.1, lights), aa(lock * s, 1.8))
    return d


def back_of_head(img, cx, cy, s, skin, hair, lights, turn=0.0, long_hair=False):
    """seen from behind; turn > 0 turns the face toward frame right so a sliver
    of cheek and nose shows past the hair."""
    if turn > 0:
        profile(img, cx + 0.35 * s * turn, cy, s * 0.95, 1, skin, hair, lights, long_hair=False, eye_vis=0.0)
    u, v = (XX - cx) / s, (cy - YY) / s
    for side in (-1, 1):
        if turn > 0 and side > 0:
            continue
        de = L_ell(u, v, side * 0.86, 0.0, 0.12, 0.25)
        over(img, shade(*normals_from_sd(de * s, 0.08 * s), skin * 0.9, lights), aa(de * s, 1.3))
    neck = L_cap(u, v, 0.0, -0.5, 0.0, -2.0, 0.5)
    over(img, shade(*normals_from_sd(neck * s, 0.4 * s), skin * 0.8, lights), aa(neck * s, 1.5))
    dh = L_ell(u, v, -0.02 * turn, 0.25, 0.9, 1.0)
    if long_hair:
        dh = smin(dh, L_cap(u, v, 0.0, 0.0, 0.0, -1.5, 0.82), 0.3)
    nx, ny, nz = normals_from_sd(dh * s, 0.8 * s)
    strands = 1.0 + 0.2 * np.sin(u * 26 + G["fields"] * 12)
    over(img, shade(nx, ny, nz, hair, lights) * strands[..., None], aa(dh * s, 2.0))


def mitten(u, v, cx, cy, ang, ln, r, thumb_side=1):
    """a side-on hand in local units, fingers together along `ang`: a broad palm
    that narrows into the fingers, the thumb along one edge"""
    c, si = math.cos(ang), math.sin(ang)
    pu, pv = u - cx, v - cy
    a, b = pu * c + pv * si, -pu * si + pv * c          # along / across the hand
    palm = L_ell(a, b, 0.42 * ln, 0.0, 0.46 * ln, r * 1.15)
    fing = L_cap(a, b, 0.6 * ln, 0.0, 1.0 * ln, -0.05 * r, r * 0.78)
    d = smin(palm, fing, 0.25 * r)
    thumb = L_cap(a, b, 0.2 * ln, thumb_side * r * 0.9, 0.62 * ln, thumb_side * r * 1.05, r * 0.42)
    return smin(d, thumb, 0.2 * r), a, b


def hand(cx, cy, s, ang, curl=0.5, spread=0.0, thumb=1.0, point=0.0):
    """signed distance (px) of a hand seen from above or behind: palm at
    (cx, cy), fingers toward screen angle `ang` (radians, y down). s ~ palm
    half-length. Fingers taper over two joints; `curl` folds them under."""
    c, si = math.cos(ang), math.sin(ang)
    def P(a, b):
        return cx + c * a * s - si * b * s, cy + si * a * s + c * b * s
    d = sd_ellipse(*P(0.1, 0.0), 0.95 * s, 0.78 * s, ang)
    for k, (b, ln) in enumerate(((-0.52, 1.05), (-0.17, 1.2), (0.18, 1.12), (0.5, 0.9))):
        cu = 0.15 if (k == 0 and point > 0) else curl
        b2 = b * (1 + spread)
        j0 = P(0.78, b2 * 0.95)
        j1 = P(0.78 + ln * 0.55 * (1 - 0.55 * cu), b2 * 1.02)
        j2 = P(0.78 + ln * (1 - 0.8 * cu), b2 * 1.04 + 0.08 * cu)
        d = smin(d, sd_capsule(*j0, *j1, 0.2 * s), 0.1 * s)
        d = smin(d, sd_capsule(*j1, *j2, 0.165 * s), 0.05 * s)
    t0 = P(0.0, -0.7)
    t1 = P(0.5 + 0.35 * thumb, -1.0 - 0.2 * thumb)
    t2 = P(0.85 + 0.35 * thumb, -1.0 - 0.15 * thumb)
    d = smin(d, sd_capsule(*t0, *t1, 0.25 * s), 0.18 * s)
    return smin(d, sd_capsule(*t1, *t2, 0.19 * s), 0.05 * s)


def draw_sd(img, d, depth, albedo, lights, w=1.4, alpha=1.0):
    nx, ny, nz = normals_from_sd(d, depth)
    over(img, shade(nx, ny, nz, albedo, lights), aa(d, w) * alpha)


# ---------------------------------------------------------------- lamp light inside the car
def lamp_sweep(t, axis_px, length, reverse=False, width=420.0):
    """A streetlight passing outside, as seen inside: (strength, band mask, progress).
    The band of light slides along `axis_px` (an HxW coordinate) over `length` px."""
    s, pr, _ = interior_lamp(t)
    pos = (1 - pr if reverse else pr) * (length + 2 * width) - width
    band = np.exp(-((axis_px - pos) / width) ** 2)
    return s, band, pr


# ---------------------------------------------------------------- shot A: the road
def project(x, y, z, cam_h=1.25, f=860.0, hor=H * 0.47, sway=0.0):
    """road space metres (x right, y up, z forward) -> screen px"""
    z = max(z, 0.05)
    return W / 2 + (x - sway) * f / z, hor - (y - cam_h) * f / z


def road_scene(t, oncoming=None):
    img = np.zeros((H, W, 3), np.float32)
    hor = H * 0.47
    speed = 15.0
    travel = t * speed
    sway = 0.12 * math.sin(t * 0.37)
    sky = np.clip((hor - YY) / hor, 0, 1)
    img[:] = np.array([0.012, 0.018, 0.04], np.float32)
    img += (np.exp(-sky * 5.0) * 0.12)[..., None] * np.array([0.9, 0.55, 0.32], np.float32)
    img += (G["fields"] * 0.03 * (YY < hor))[..., None] * np.array([0.3, 0.4, 0.6], np.float32)
    ground = np.clip((YY - hor) / (H - hor), 0, 1)
    img = np.where((YY > hor)[..., None], np.array([0.008, 0.011, 0.014], np.float32) * (1 + ground[..., None]), img)
    for k, (a, b, c, e) in enumerate(G["trees"]):
        z = ((a * 400 - travel) % 400) + 8
        side = -1 if k % 2 else 1
        x = side * (10 + 18 * b)
        px, py = project(x, 0, z, sway=sway)
        hgt = (6 + 8 * c) * 860 / z
        wid = (3 + 4 * e) * 860 / z
        dt = sd_ellipse(px, py - hgt * 0.7, wid, hgt * 0.55)
        dt = dt + G["leather"] * wid * 1.2
        dt = np.minimum(dt, sd_box(px, py - hgt * 0.2, max(wid * 0.06, 0.6), hgt * 0.25))
        fog = math.exp(-z / 160)
        over(img, np.array([0.006, 0.008, 0.012], np.float32) * (1 + 2 * (1 - fog)), aa(dt, 2.5) * (0.6 + 0.4 * fog))
    rw = 3.6
    zr = np.where(YY > hor + 1, 1.25 * 860 / np.maximum(YY - hor, 1), 1e4)
    xr = (XX - W / 2) * zr / 860 + sway
    on_road = ((np.abs(xr) < rw * 2) & (YY > hor + 1)).astype(np.float32)
    img = img * (1 - on_road[..., None]) + np.array([0.020, 0.022, 0.026], np.float32) * on_road[..., None]
    dash = ((zr + travel) % 9.0 < 3.0) & (np.abs(xr) < 0.07) & (zr < 120)
    img += (dash * np.exp(-zr / 60))[..., None].astype(np.float32) * np.array([0.25, 0.23, 0.2], np.float32)
    edge = (np.abs(np.abs(xr) - rw * 2 + 0.25) < 0.08) & (zr < 140)
    img += (edge * np.exp(-zr / 50))[..., None].astype(np.float32) * np.array([0.18, 0.18, 0.17], np.float32)
    glow = np.zeros((H, W), np.float32)
    refl = np.zeros((H, W), np.float32)
    lamp_x = 7.6
    for k in range(-1, 9):
        zl = (k * LAMP_PERIOD * speed - (travel % (LAMP_PERIOD * speed))) + 6
        if zl < 1.0:
            continue
        fade = math.exp(-zl / 170)
        pool = np.exp(-(((xr - 4.6) / 5.0) ** 2) - ((zr - zl) / 6.5) ** 2) * on_road
        glow += pool * 0.55 * fade
        hx, hy = project(lamp_x - 2.6, 8.0, zl, sway=sway)
        bx, by = project(lamp_x, 0.0, zl, sway=sway)
        tx, ty = project(lamp_x, 8.3, zl, sway=sway)
        pw = max(0.12 * 860 / zl, 0.8)
        dp = np.minimum(sd_capsule(bx, by, tx, ty, pw), sd_capsule(tx, ty, hx, hy, pw * 0.7))
        over(img, np.array([0.02, 0.02, 0.024], np.float32), aa(dp, 1.5))
        r = max(0.5 * 860 / zl, 1.2)
        rr = np.sqrt((XX - hx) ** 2 + (YY - hy) ** 2)
        glow += np.exp(-rr * rr / (2 * r * r)) * 3.0 * fade + np.exp(-rr / (r * 9)) * 0.22 * fade
        ry0 = project(lamp_x - 2.6, 0, zl, sway=sway)[1]
        streak = np.exp(-((XX - hx) / (r * 1.6 + 2)) ** 2) * np.exp(-np.clip(YY - ry0, 0, None) / (60 + 2000 / zl)) * (YY > ry0 - 4)
        refl += streak * 0.5 * fade
    img += (glow + refl * on_road)[..., None] * SODIUM * 0.5
    if oncoming is not None and -2.5 < oncoming < 1.6:
        tc = oncoming
        zc = 60 - (tc + 2.5) * 45.0
        if zc > 1.2:
            for off in (-0.75, 0.75):
                px, py = project(-3.2 + off, 0.65, zc, sway=sway)
                r = max(0.25 * 860 / zc, 1.0)
                rr = np.sqrt((XX - px) ** 2 + (YY - py) ** 2)
                gl = np.exp(-rr * rr / (2 * r * r)) * 4 + np.exp(-rr / (r * 14)) * 0.5
                ry = project(-3.2 + off, 0, zc, sway=sway)[1]
                gl += np.exp(-((XX - px) / (r * 1.5 + 2)) ** 2) * np.exp(-np.clip(YY - ry, 0, None) / 90) * (YY > ry) * 0.6 * on_road
                img += gl[..., None] * np.array([0.85, 0.88, 1.0], np.float32) * 0.6 * min(1, 30 / zc)
    return img


def shot_road(t, local_t):
    img = road_scene(t, oncoming=local_t - 5.0)
    drops = np.zeros((H, W), np.float32)
    for a, b, c, e in G["drops"]:
        px, py = a * W, b * H * 0.85 + (local_t * (2 + 6 * c)) % 30
        r = 2 + 5 * c
        drops += (np.exp(-((XX - px) ** 2 + (YY - py) ** 2) / (2 * r * r)) * 0.5
                  - np.exp(-((XX - px - r * 0.3) ** 2 + (YY - py - r * 0.3) ** 2) / (0.5 * r * r)) * 0.25)
    lum = blur(img.mean(axis=2), 30)
    img += (drops * (0.05 + lum * 1.2))[..., None] * np.array([0.9, 0.8, 0.7], np.float32)
    dash_d = (H * 0.86 + 40 * ((XX - W / 2) / W) ** 2) - YY   # > 0 above the dash line
    over(img, np.array([0.006, 0.007, 0.009], np.float32), aa(dash_d, 2.0))
    over(img, np.array([0.008, 0.008, 0.01], np.float32), aa(sd_box(W / 2, 30, 120, 26, 18), 2))
    over(img, np.array([0.004, 0.004, 0.005], np.float32), aa(YY - 10, 3))
    return img


# ---------------------------------------------------------------- B: from the back seat
def shot_back(t, local_t):
    s_l, pr, _ = interior_lamp(t)
    # through the windscreen, the road (a smaller copy of the drive)
    road = road_scene(t)
    img = np.zeros((H, W, 3), np.float32)
    ws = (130, 70, 1150, 430)  # windscreen box
    sub = cv2.resize(road, (ws[2] - ws[0], ws[3] - ws[1]), interpolation=cv2.INTER_AREA)
    img[:] = np.array([0.012, 0.014, 0.02], np.float32)
    wmask = aa(sd_box((ws[0] + ws[2]) / 2, (ws[1] + ws[3]) / 2, (ws[2] - ws[0]) / 2, (ws[3] - ws[1]) / 2, 60), 8)
    big = np.zeros_like(img)
    big[ws[1]:ws[3], ws[0]:ws[2]] = sub * 1.4
    img = img * (1 - wmask[..., None]) + big * wmask[..., None]
    # the lamp, as it comes overhead, rakes down over them from the top of the screen
    band = np.exp(-((YY - (-300 + (H + 600) * pr)) / 260.0) ** 2)
    lights = [((0.3, 0.9, -0.5), SODIUM * 1.2 * s_l, band, 0.25),
              ((0.0, 0.5, -1.0), np.array([0.10, 0.11, 0.14], np.float32) * 0.6, None, 0.5),
              ((0.0, 1.0, 0.2), NIGHT * 0.25, None, 0.6)]
    # dashboard silhouette, the vent glowing faintly in the middle, the wheel
    dash = YY - (430 + 25 * np.sin((XX / W) * math.pi))
    over(img, np.array([0.010, 0.011, 0.013], np.float32), aa(-dash, 2))
    over(img, np.array([0.012, 0.009, 0.007], np.float32), aa(sd_box(640, 470, 50, 18, 6), 2))
    wheel = np.abs(sd_ellipse(380, 520, 190, 120)) - 13
    draw_sd(img, wheel, 10, np.array([0.03, 0.03, 0.035], np.float32), lights)
    for hx, ang in ((215, -1.2), (545, -1.94)):
        draw_sd(img, hand(hx, 450, 22, ang, curl=0.9, thumb=0.3), 10, SKIN_D * 0.6, lights)
        draw_sd(img, sd_capsule(hx + (-20 if hx < 380 else 20), 470, 380 + (-150 if hx < 380 else 150), 760, 34), 20, COAT_D, lights)
    # mirror
    over(img, np.array([0.008, 0.008, 0.01], np.float32), aa(sd_box(640, 105, 95, 24, 14), 2))
    # their heads and shoulders, dark against the glass
    breathe = 2 * math.sin(t * 1.2)
    draw_sd(img, smin(sd_ellipse(390, 640, 230, 120), sd_box(390, 760, 230, 100, 30), 40), 80, COAT_D, lights)
    back_of_head(img, 390, 330 + breathe, 78, SKIN_D, HAIR_D, lights)
    draw_sd(img, smin(sd_ellipse(890, 650, 220, 115), sd_box(890, 760, 220, 100, 30), 40), 80, COAT_P, lights)
    back_of_head(img, 892, 338 - breathe, 74, SKIN_P, HAIR_P, lights, turn=0.8, long_hair=True)
    # headrests below the heads, seat backs at the bottom of the frame
    for hx in (390, 890):
        draw_sd(img, sd_box(hx, 520, 95, 52, 30), 30, np.array([0.06, 0.06, 0.065], np.float32), lights)
        draw_sd(img, sd_box(hx, 760, 250, 150, 60), 60, np.array([0.05, 0.05, 0.055], np.float32), lights)
    # roof and pillars
    over(img, np.array([0.006, 0.007, 0.009], np.float32), aa(YY - 40, 30))
    return img


# ---------------------------------------------------------------- P: the passenger at the window
def shot_passenger(t, name, local_t):
    img = np.zeros((H, W, 3), np.float32)
    s_l, band, pr = lamp_sweep(t, XX + 0.3 * YY, W + 200)
    lights = [((0.6, 0.55, 0.6), SODIUM * 1.35 * s_l, band, 0.25),
              ((0.9, 0.2, 0.3), NIGHT * 0.55, None, 0.5),             # window side
              ((-0.6, -0.4, 0.7), DASH * 0.18, None, 0.4)]             # instruments, behind us
    warm = 0.0 if name == "P1" else ease((t - 26.0) / 3.0)
    lights.append(((-0.8, -0.2, 0.5), np.array([1.0, 0.55, 0.3], np.float32) * 0.07 * warm, None, 0.5))
    # cabin: door, window, pillars
    img[:] = np.array([0.014, 0.016, 0.022], np.float32)
    win = np.maximum(sd_box(1010, 320, 330, 210, 30), -(YY - 80 - (1340 - XX) * 0.1))
    outside = np.zeros_like(img)
    outside[:] = np.array([0.010, 0.014, 0.026], np.float32)
    outside += (np.clip((YY - 380) / 200, 0, 1) * 0.02)[..., None] * np.array([0.6, 0.5, 0.4], np.float32)
    # passing lamps outside: bright blurs moving left to right (backward)
    for k in range(3):
        p = ((t + 0.6) / LAMP_PERIOD + k * 0.0) % 1.0
        if t > LAST_LAMP + 0.8:
            break
        lx = 600 + (p - 0.15) * 1600
        ly = 170 - 60 * math.sin(math.pi * p)
        rr = np.sqrt(((XX - lx) / 3.0) ** 2 + (YY - ly) ** 2)
        outside += (np.exp(-rr / 14) * 1.4 + np.exp(-rr / 60) * 0.12)[..., None] * SODIUM
        break
    # hedges streaming past
    hedge = YY - (420 + 30 * np.sin((XX - t * 900) * 0.01) + 12 * np.sin((XX - t * 900) * 0.037))
    over(outside, np.array([0.004, 0.006, 0.008], np.float32), aa(-hedge, 4))
    outside = blur(outside, 2)
    # streaks of rain on the glass
    streak = np.zeros((H, W), np.float32)
    for a, b, c, e in G["drops"][:45]:
        x0 = 690 + a * 650
        y0 = 120 + b * 420
        ln = 10 + 40 * c
        streak += np.exp(-((XX - x0 - (YY - y0) * 0.6) / 1.5) ** 2) * np.clip(1 - np.abs(YY - y0) / ln, 0, 1)
    wm = aa(win, 3)
    img = img * (1 - wm[..., None]) + outside * wm[..., None]
    img += (streak * wm * (0.02 + 0.25 * s_l * band))[..., None] * SODIUM
    # the door below the window, the pillar to the right
    door = np.maximum(-(YY - 540 - (XX - 700) * 0.05), -(XX - 640))
    draw_sd(img, door, 40, np.array([0.06, 0.06, 0.065], np.float32), lights)
    draw_sd(img, sd_box(1300, 300, 60, 400, 0), 30, np.array([0.03, 0.03, 0.035], np.float32), lights)
    # the dash far left, with the vent breathing warm air (once it is turned to them)
    dsh = YY - (520 - 0.25 * XX + 0.0004 * XX * XX)
    over(img, np.array([0.012, 0.013, 0.016], np.float32), aa(-dsh, 6) * aa(XX - 360, 30))
    vent = sd_box(170, 560, 70, 30, 10)
    over(img, np.array([0.006, 0.006, 0.008], np.float32), aa(vent, 3))
    if name == "P2":
        img += (np.exp(-((XX - 240) / 160) ** 2 - ((YY - 540) / 70) ** 2) * 0.03)[..., None] * np.array([1.0, 0.6, 0.35], np.float32)
    # window frame: the top seal and the B-pillar edge, so the glass reads as glass
    over(img, np.array([0.02, 0.022, 0.026], np.float32), aa(np.abs(win) - 6, 2) * 0.9)
    # their reflection in the glass: the face they are looking at, faint and cold
    refl = np.zeros_like(img)
    rl = [((-0.6, 0.55, 0.6), SODIUM * 1.0 * s_l, band, 0.25), ((-0.9, 0.2, 0.3), NIGHT * 0.9, None, 0.5)]
    profile(refl, 1060, 300, 92, -1, SKIN_P, HAIR_P, rl, long_hair=True, eye_open=1.0, tilt=0.05)
    refl = blur(refl, 3.0)
    img += refl * wm[..., None] * 0.32 * np.array([0.8, 0.9, 1.1], np.float32)
    # the passenger: shoulders, arms, hands, head turned to the glass
    breathe = 2.5 * math.sin(t * 1.2)
    sh = smin(sd_ellipse(500, 590, 270, 150), sd_box(480, 760, 280, 160, 60), 60)
    draw_sd(img, sh, 120, COAT_P, lights)
    # hands: rubbing (P1), then still in the warm air (P2)
    if name == "P1":
        rise = ease((t - 12.9) / 1.0) * (1 - 0.4 * ease((t - 17.6) / 1.5))
        rub = math.sin((t - 13.4) * 2 * math.pi * 1.2) * ease((t - 13.4) / 0.4) * (1 - ease((t - 17.0) / 0.6))
    else:
        rise = 0.6 - 0.05 * ease((t - 29.0) / 2.0)
        rub = 0.0
    hy = 760 - 250 * rise
    u, v = (XX - 640) / 60.0, (hy - YY) / 60.0
    forearm = L_cap(u, v, -2.6, -3.4, -0.55, -0.35, 0.62)
    draw_sd(img, forearm * 60, 50, COAT_P, lights)
    h2, _, _ = mitten(u, v, -0.35 - 0.22 * rub, -0.08, 1.05, 2.15, 0.5, -1)
    h1, a1, b1 = mitten(u, v, -0.5 + 0.22 * rub, 0.0, 1.0, 2.15, 0.5, 1)
    draw_sd(img, h2 * 60, 22, SKIN_P * 0.8, lights)
    draw_sd(img, h1 * 60, 22, SKIN_P, lights)
    for bb, aw in ((-0.02, 0.4), (0.17, 0.25), (-0.2, 0.2)):  # the lines between the fingers
        crease = np.exp(-((b1 - bb) / 0.025) ** 2) * np.clip((a1 - 1.25) * 4, 0, 1) * np.clip((2.05 - a1) * 6, 0, 1)
        over(img, SKIN_P * 0.15, crease * aa(h1 * 60, 1) * aw)
    cuff = L_cap(u, v, -0.95, -0.95, -0.45, -0.25, 0.5)
    draw_sd(img, cuff * 60, 16, KNIT_P, lights)
    exhale = 0.0
    profile(img, 560, 300 + breathe, 100, 1, SKIN_P, HAIR_P, lights, long_hair=True,
            eye_open=1.0 if (t % 6.1) > 0.14 else 0.1, tilt=0.06 + 0.02 * math.sin(t * 0.4), eye_vis=0.8,
            coat=COAT_P)
    # the near edge of our own seat, out of focus
    over(img, np.array([0.004, 0.005, 0.006], np.float32), aa(sd_ellipse(-60, 520, 170, 420), 30))
    return img


# ---------------------------------------------------------------- F: the driver
def shot_driver(t, local_t):
    img = np.zeros((H, W, 3), np.float32)
    s_l, band, pr = lamp_sweep(t, -(XX - 0.3 * YY) + W, W + 200)
    bl = blink_level(t)
    lights = [((0.6, 0.55, 0.6), SODIUM * 1.35 * s_l, band, 0.25),
              ((-0.9, 0.3, 0.3), NIGHT * 0.5, None, 0.5),             # side window
              ((0.7, -0.6, 0.5), DASH * 0.16, None, 0.4),              # instruments
              ((0.7, -0.5, 0.6), AMBER * 0.42 * bl, None, 0.45)]       # indicator
    img[:] = np.array([0.012, 0.014, 0.02], np.float32)
    # the driver's window behind them, with the lamps streaming past right to left
    win = np.maximum(sd_box(330, 300, 330, 200, 30), -(YY - 90 - XX * 0.08))
    outside = np.zeros_like(img)
    outside[:] = np.array([0.010, 0.014, 0.026], np.float32)
    if t < LAST_LAMP + 0.8:
        p = ((t + 0.6) / LAMP_PERIOD) % 1.0
        lx = 700 - (p - 0.15) * 1500
        ly = 170 - 60 * math.sin(math.pi * p)
        rr = np.sqrt(((XX - lx) / 3.0) ** 2 + (YY - ly) ** 2)
        outside += (np.exp(-rr / 14) * 1.4 + np.exp(-rr / 60) * 0.12)[..., None] * SODIUM
    hedge = YY - (420 + 30 * np.sin((XX + t * 900) * 0.01) + 12 * np.sin((XX + t * 900) * 0.037))
    over(outside, np.array([0.004, 0.006, 0.008], np.float32), aa(-hedge, 4))
    wm = aa(win, 3)
    img = img * (1 - wm[..., None]) + blur(outside, 2) * wm[..., None]
    # windscreen to the right: the road ahead, dark, a far lamp
    ws = np.maximum(sd_box(1150, 260, 260, 190, 40), -(XX - 900))
    road = np.zeros_like(img)
    road[:] = np.array([0.012, 0.016, 0.03], np.float32)
    road += (np.exp(-((YY - 330) / 40.0) ** 2) * 0.05)[..., None] * SODIUM * (1 - ease((t - 43) / 2))
    wsm = aa(ws, 4)
    img = img * (1 - wsm[..., None]) + road * wsm[..., None]
    # dash and wheel
    dsh = np.maximum((430 + (XX - 900) * -0.05) - YY, 900 - XX)
    draw_sd(img, np.maximum(dsh, -200), 40, np.array([0.04, 0.04, 0.045], np.float32), lights)
    if bl > 0:
        img += (np.exp(-((XX - 990) ** 2 + (YY - 470) ** 2) / 50.0) * bl * 1.5)[..., None] * AMBER
    img += (np.exp(-((XX - 1010) ** 2 + (YY - 480) ** 2) / 900.0) * 0.06)[..., None] * DASH
    # the driver: shoulders, arm to the wheel, head forward, eyes on the road
    breathe = 2.0 * math.sin(t * 1.15 + 1)
    draw_sd(img, smin(sd_ellipse(580, 580, 280, 150), sd_box(580, 760, 290, 170, 60), 60), 120, COAT_D, lights)
    flick = ease((t - 41.0) / 0.3) * (1 - ease((t - 41.7) / 0.35))
    rim = np.abs(sd_ellipse(925, 560, 70, 200, 0.18)) - 15
    draw_sd(img, rim, 10, np.array([0.035, 0.035, 0.04], np.float32), lights)
    wy = 470 + 28 * flick
    draw_sd(img, sd_capsule(610, 470, 700, 700, 62), 50, COAT_D, lights)      # upper arm to the elbow
    draw_sd(img, sd_capsule(700, 700, 860, wy + 25, 54), 50, COAT_D, lights)  # forearm up to the wheel
    warm = ease((t - 39.0) / 4.0)
    hl = lights + [((0.8, 0.0, 0.5), np.array([1.0, 0.55, 0.3], np.float32) * 0.08 * warm, None, 0.5)]
    u, v = (XX - 860) / 60.0, (wy - YY) / 60.0
    fist = smin(L_ell(u, v, 0.95, -0.1, 0.62, 0.55), L_cap(u, v, 0.35, 0.1, 1.2, 0.35, 0.22), 0.15)
    draw_sd(img, fist * 60, 26, SKIN_D, hl)
    for kk in range(3):  # knuckle lines over the rim
        kn = L_cap(u, v, 0.6 + 0.25 * kk, -0.55, 0.75 + 0.25 * kk, 0.3, 0.02)
        over(img, SKIN_D * 0.2, aa(kn * 60, 2) * aa(fist * 60, 1) * 0.25)
    draw_sd(img, L_cap(u, v, -0.75, -0.65, -0.1, -0.25, 0.55) * 60, 14, np.array([0.09, 0.1, 0.12], np.float32), lights)
    profile(img, 640, 300 + breathe, 102, 1, SKIN_D, HAIR_D, lights, eye_open=1.0 if (t % 4.7) > 0.13 else 0.1,
            tilt=-0.02, coat=COAT_D)
    over(img, np.array([0.004, 0.005, 0.006], np.float32), aa(YY - 30, 25))
    return img


# ---------------------------------------------------------------- C, E: the vent
def vent_shot(t, name, local_t):
    img = np.zeros((H, W, 3), np.float32)
    s_l, band, pr = lamp_sweep(t, XX - 0.5 * YY, W + 300, width=360)
    lights = [((0.3, 0.7, 0.6), SODIUM * 1.1 * s_l, band, 0.3),
              ((0.0, 1.0, 0.3), NIGHT * 0.38, None, 0.6),
              ((0.0, -0.4, 0.9), DASH * 0.25, None, 0.5)]
    ox, oy = 640 + 10 * math.sin(local_t * 0.3), 340
    leather = 1 + G["leather"] * 0.3
    nx, ny, nz = normals_from_sd(np.full((H, W), -100, np.float32), 60, G["leather"] * 3)
    img[:] = shade(nx, ny, nz, np.array([0.15, 0.15, 0.16], np.float32) * leather[..., None], lights)
    over(img, np.array([0.01, 0.01, 0.012], np.float32), aa(np.abs(YY - (oy + 245 + 0.03 * (XX - ox))) - 2.5, 2) * 0.8)
    st = sd_box(ox, oy + 360, 300, 70, 14)
    over(img, np.array([0.02, 0.022, 0.026], np.float32), aa(st, 6))
    for k in range(5):
        img += (np.exp(-((XX - (ox - 180 + 90 * k)) ** 2 + (YY - (oy + 360)) ** 2) / 40.0) * 0.3)[..., None] * DASH
    bez = sd_box(ox, oy, 330, 175, 55)
    draw_sd(img, bez, 30, np.array([0.10, 0.10, 0.11], np.float32), lights)
    over(img, np.array([0.006, 0.006, 0.008], np.float32), aa(sd_box(ox, oy, 292, 138, 34), 1.5))
    # vane angle: + aims toward frame right, the passenger's side
    if name == "C":
        ang = kf(t, [(0, -0.08), (21.7, -0.08), (22.9, 0.65), (99, 0.65)])
    else:
        ang = kf(t, [(0, 0.65), (35.2, 0.65), (36.4, 0.05), (99, 0.05)])
    for k in range(7):
        vx = ox - 250 + 83 * k
        wid = 5 + 36 * abs(math.sin(ang))
        cx = vx + 10 * math.sin(ang)
        dv = sd_box(cx, oy, wid / 2, 130, 2)
        face = 0.6 + 0.4 * (ang > 0)
        draw_sd(img, dv, 5, np.array([0.13, 0.13, 0.14], np.float32) * face, lights, w=1.2)
        edge = sd_box(cx - (wid / 2 - 1.5) * (1 if ang > 0 else -1), oy, 1.3, 128, 1)
        over(img, np.array([0.22, 0.22, 0.23], np.float32) * (0.3 + s_l), aa(edge, 1.2) * 0.5)
    tab_x = ox + 50 * math.sin(ang)
    draw_sd(img, sd_box(tab_x, oy, 22, 42, 8), 10, np.array([0.19, 0.19, 0.2], np.float32), lights)
    # warm air: the faintest streams, and a shimmer
    flow = np.zeros((H, W), np.float32)
    def streams(dirx, n, gain, seed):
        f = np.zeros((H, W), np.float32)
        for k in range(n):
            ph = (local_t * 0.55 + k / n) % 1.0
            y0 = oy - 100 + 200 * ((k * 0.618 + seed) % 1.0)
            x0 = ox + dirx * (250 + ph * 650)
            r = 25 + 70 * ph
            f += np.exp(-(((XX - x0) / (r * 1.8)) ** 2 + ((YY - y0 + ph * 40) / r) ** 2)) * (1 - ph) * ph * 4 * gain
        return f
    flow += streams(math.sin(ang) * 1.3 + 0.01, 12, 1.0, 0.0)
    if name == "E":
        flow = flow * (1 - 0.5 * ease((t - 36.4) / 1.0)) + streams(-0.9, 10, ease((t - 36.0) / 1.5), 0.3)
    flow = blur(flow, 8)
    img += (flow * 0.010)[..., None] * np.array([1.0, 0.72, 0.5], np.float32)
    dx = (np.sin(YY * 0.06 + local_t * 8) * flow * 2.0).astype(np.float32)
    img = cv2.remap(img, (XX + dx).astype(np.float32), YY, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    if name == "C":
        # the driver's right hand, from the left, eyes still on the road: reach, push, go
        r_in = kf(t, [(0, 0), (20.4, 0), (21.5, 1), (23.4, 1), (24.6, 0)])
        push = ease((t - 21.7) / 1.2) * (1 - ease((t - 23.4) / 0.8))
        hx = ox - 900 + 700 * r_in + 60 * push
        hy = oy + 90 - 40 * r_in
        if r_in > 0.01:
            d = hand(hx, hy, 70, -0.25, curl=0.7, point=1.0, thumb=0.5)
            draw_sd(img, sd_capsule(hx - 110, hy + 30, hx - 1000, hy + 200, 95), 60, COAT_D, lights)
            draw_sd(img, d, 30, SKIN_D, lights)
    else:
        # the passenger's hand, from the right, turns it back so it reaches both of them
        r_in = kf(t, [(0, 0), (33.8, 0), (35.0, 1), (37.0, 1), (38.2, 0)])
        push = ease((t - 35.2) / 1.2) * (1 - ease((t - 37.0) / 0.8))
        hx = ox + 900 - 690 * r_in - 70 * push
        hy = oy + 95 - 40 * r_in
        # the driver's hand on the wheel at the left edge, now in the warm air
        rim = np.abs(sd_ellipse(ox - 950, oy + 520, 500, 520)) - 26
        draw_sd(img, rim, 16, np.array([0.05, 0.05, 0.055], np.float32), lights)
        warm = ease((t - 36.6) / 2.0)
        hl = lights + [((0.8, 0.1, 0.6), np.array([1.0, 0.6, 0.4], np.float32) * 0.10 * warm, None, 0.5)]
        draw_sd(img, sd_capsule(ox - 620, oy + 330, ox - 900, oy + 620, 90), 60, COAT_D, lights)
        draw_sd(img, hand(ox - 520, oy + 220, 62, -0.6, curl=0.95, thumb=0.3), 30, SKIN_D, hl)
        if r_in > 0.01:
            d = hand(hx, hy, 66, math.pi + 0.22, curl=0.7, point=1.0, thumb=0.5)
            draw_sd(img, sd_capsule(hx + 110, hy + 30, hx + 1000, hy + 210, 92), 60, COAT_P, lights)
            draw_sd(img, sd_capsule(hx + 95, hy + 25, hx + 150, hy + 38, 70), 24, KNIT_P, lights)
            draw_sd(img, d, 30, SKIN_P, lights)
    focus = np.exp(-(((XX - ox) / 620.0) ** 2 + ((YY - oy) / 380.0) ** 2))
    soft = blur(img, 6)
    return img * focus[..., None] + soft * (1 - focus[..., None])


# ---------------------------------------------------------------- G: the turn, from above
def shot_turn(t, local_t):
    img = np.zeros((H, W, 3), np.float32)
    img[:] = np.array([0.009, 0.012, 0.018], np.float32)
    img += (G["fields"] * 0.025)[..., None] * np.array([0.3, 0.45, 0.5], np.float32)
    main_y = 520 + 0.08 * (XX - 640)
    over(img, np.array([0.026, 0.026, 0.03], np.float32), aa(np.abs(YY - main_y) - 30, 3))
    lane_t = np.clip((main_y - YY) / 520.0, 0, 1)
    lane_x = 700 + 280 * lane_t ** 1.6 - 70 * lane_t
    dlane = np.where(YY < main_y, np.abs(XX - lane_x) - (22 - 12 * lane_t), 99)
    over(img, np.array([0.016, 0.017, 0.02], np.float32), aa(dlane, 3) * (1 - 0.5 * lane_t))
    for k in range(-1, 8):
        lx = 40 + k * 190
        ly = 520 + 0.08 * (lx - 640) - 46
        pool = np.exp(-((XX - lx) ** 2 / (2 * 60 ** 2) + (YY - ly - 40) ** 2 / (2 * 32 ** 2)))
        img += (pool * 0.18)[..., None] * SODIUM
        img += (np.exp(-((XX - lx) ** 2 + (YY - ly) ** 2) / 10.0) * 1.4)[..., None] * SODIUM
    img += (np.exp(-((XX - 1110) ** 2 + (YY - 110) ** 2) / 6.0) * 0.9)[..., None] * np.array([1.0, 0.75, 0.45], np.float32)
    u = kf(local_t, [(0, 0.0), (3.0, 0.6), (6.2, 1.0), (7.4, 1.25)])
    base_y = 520 + 0.08 * (700 - 640)
    if u < 0.6:
        x = 230 + (u / 0.6) * 470
        y = 520 + 0.08 * (x - 640) + 12
        hd = 0.08
    else:
        q = (u - 0.6) / 0.65
        y = base_y + 12 - q * 520
        lt = clamp((base_y - y) / 520.0)
        x = 700 + 280 * lt ** 1.6 - 70 * lt
        hd = 0.08 + (-math.pi / 2 + 0.45 * lt - 0.08) * ease(q * 5)
    scale = 1.6 * (1.0 - 0.45 * clamp((u - 0.6) / 0.65))
    c, s = math.cos(hd), math.sin(hd)
    for off in (-7, 7):
        bx, by = x + c * 22 * scale - s * off * scale, y + s * 22 * scale + c * off * scale
        px, py = XX - bx, YY - by
        along = px * c + py * s
        across = -px * s + py * c
        beam = np.exp(-(across / (6 + np.abs(along) * 0.35)) ** 2) * np.exp(-np.abs(along) / (70 * scale)) * (along > 0)
        img += (beam * 0.16)[..., None] * np.array([0.9, 0.9, 0.85], np.float32)
    body = sd_box(x, y, 24 * scale, 11 * scale, 5 * scale, hd)
    over(img, np.array([0.035, 0.038, 0.045], np.float32), aa(body, 1.2))
    over(img, np.array([0.012, 0.014, 0.018], np.float32), aa(sd_box(x - c * 2 * scale, y - s * 2 * scale, 11 * scale, 8 * scale, 3 * scale, hd), 1.2))
    for off in (-8, 8):
        tx, ty = x - c * 24 * scale - s * off * scale, y - s * 24 * scale + c * off * scale
        img += (np.exp(-((XX - tx) ** 2 + (YY - ty) ** 2) / (6.0 * scale + 1)) * 0.9)[..., None] * np.array([1.0, 0.1, 0.06], np.float32)
    bl = blink_level(t) * (1 - ease((local_t - 5.5) / 0.6))
    tx, ty = x - c * 23 * scale + s * 9 * scale, y - s * 23 * scale - c * 9 * scale
    rr = (XX - tx) ** 2 + (YY - ty) ** 2
    g = np.exp(-rr / (12.0 * scale + 1)) * 1.6 * bl + np.exp(-rr / (900.0 * scale + 1)) * 0.06 * bl
    img += g[..., None] * AMBER
    return img


# ---------------------------------------------------------------- paint
def kuwahara(img, r):
    lum = img.mean(axis=2)
    k = (r + 1, r + 1)
    best_v = None
    out = np.zeros_like(img)
    for ax, ay in ((0, 0), (r, 0), (0, r), (r, r)):
        m = cv2.boxFilter(img, -1, k, anchor=(ax, ay), borderType=cv2.BORDER_REFLECT)
        ml = cv2.boxFilter(lum, -1, k, anchor=(ax, ay), borderType=cv2.BORDER_REFLECT)
        m2 = cv2.boxFilter(lum * lum, -1, k, anchor=(ax, ay), borderType=cv2.BORDER_REFLECT)
        v = m2 - ml * ml
        if best_v is None:
            best_v, out = v, m
        else:
            sel = v < best_v
            best_v = np.where(sel, v, best_v)
            out = np.where(sel[..., None], m, out)
    return out


def paint(img, n):
    """the rotoscope finish: boil, Kuwahara daubs, stroke relief, warm/cool split"""
    k = (n // 2) % 3  # the boil changes every other drawing (6 a second)
    wx, wy = G["wob"][k]
    img = cv2.remap(img, (XX + wx * 2.2).astype(np.float32), (YY + wy * 2.2).astype(np.float32),
                    cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    p = np.sqrt(np.clip(img, 0, None))  # daub in a perceptual-ish space so the darks paint too
    p = 0.55 * kuwahara(p, 3) + 0.45 * kuwahara(p, 6)
    st = G["strokes"][k]
    p = p * (1.0 + 0.06 * st[..., None])
    lum = p.mean(axis=2, keepdims=True)
    p = p + (0.25 - lum).clip(0, None) * np.array([-0.03, 0.0, 0.05], np.float32)   # cool shadows
    p = p + (lum - 0.35).clip(0, None) * np.array([0.05, 0.01, -0.06], np.float32)   # warm lights
    return np.clip(p, 0, 1) ** 2


def finish(img, fade):
    img = img * G["vig"][..., None] * fade
    img = 1.0 - np.exp(-img * 2.4)
    img = np.clip(img, 0, 1) ** (1 / 2.0)
    out = cv2.resize(img, (OW, OH), interpolation=cv2.INTER_CUBIC)
    out = out * (1 + G["canvas"][..., None]) + G["canvas"][..., None] * 0.04
    return out


# ---------------------------------------------------------------- frame
def render_shot(name, t, start):
    lt = t - start
    if name == "A":
        return shot_road(t, lt)
    if name == "B":
        return shot_back(t, lt)
    if name in ("P1", "P2"):
        return shot_passenger(t, name, lt)
    if name in ("C", "E"):
        return vent_shot(t, name, lt)
    if name == "F":
        return shot_driver(t, lt)
    return shot_turn(t, lt)


def drawing(n):
    """the n-th drawing (12 per second), returned as 8-bit RGB at output size"""
    init()
    t = n / DRAW
    cur = [s for s in SHOTS if s[1] <= t < s[2]] or [SHOTS[-1]]
    name, start, end = cur[0]
    img = render_shot(name, t, start)
    idx = [s[0] for s in SHOTS].index(name)
    if idx + 1 < len(SHOTS):
        nxt = SHOTS[idx + 1]
        dz = DISSOLVES.get((name, nxt[0]))
        if dz and t > end - dz / 2:
            a = ease((t - (end - dz / 2)) / dz)
            img = img * (1 - a) + render_shot(nxt[0], t, nxt[1]) * a
    if idx > 0:
        prv = SHOTS[idx - 1]
        dz = DISSOLVES.get((prv[0], name))
        if dz and t < start + dz / 2:
            a = ease((t - (start - dz / 2)) / dz)
            img = render_shot(prv[0], t, prv[1]) * (1 - a) + img * a
    img = paint(img, n)
    fade = ease(t / 2.2) * (1 - ease((t - (DUR - 3.2)) / 3.0))
    out = finish(img, fade)
    rng = np.random.default_rng(1000 + n)
    out += rng.standard_normal((OH, OW, 1)).astype(np.float32) * 0.008
    return (np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)


def main():
    out = sys.argv[1]
    if "--still" in sys.argv:
        ts = [float(v) for v in sys.argv[sys.argv.index("--still") + 1].split(",")]
        for t in ts:
            rgb = drawing(int(round(t * DRAW)))
            cv2.imwrite(out.replace(".png", f"-{t:05.1f}.png"), rgb[..., ::-1])
        return
    n = int(DUR * DRAW)
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                           "-s", f"{OW}x{OH}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow",
                           "-crf", "17", "-pix_fmt", "yuv420p", "-tune", "grain", out], stdin=subprocess.PIPE)
    with Pool(4, initializer=init) as pool:
        for k, rgb in enumerate(pool.imap(drawing, range(n), chunksize=2)):
            buf = rgb.tobytes()
            for _ in range(FPS // DRAW):  # on twos
                ff.stdin.write(buf)
            if k % 24 == 0:
                print(f"drawing {k}/{n}", flush=True)
    ff.stdin.close()
    ff.wait()


if __name__ == "__main__":
    main()
