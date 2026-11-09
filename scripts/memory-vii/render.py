"""Memory VII, The Shape of Someone: a 26 s shadow-puppet film, rendered procedurally.

Two people stand apart at the edges of a dim room, out of focus. A single warm
light drifts across the plaster wall behind them, and their shadows, free of
them, approach, hesitate, meet, embrace and come apart, a thin bridge of shade
holding between them for a moment as they part.

    python3 scripts/memory-vii/render.py OUT.mp4 [--room] [--still SECONDS]

--room renders the film the installation plays (src/memory/defs.ts SHADOWS): it opens and
closes on the dim wall, never on black, so the wall's gathering shade (the first frame, revealed
by order.py's map) and the film are one picture, in and out.

Needs numpy, Pillow and ffmpeg. Silent: the sound is mixed by mix.py.
"""
import math, subprocess, sys
from multiprocessing import Pool
import numpy as np
from PIL import Image

W, H, FPS, DUR = 1920, 1080, 24, 26.0
ROOM = "--room" in sys.argv
# The dim room before the light and after it: in the room the film opens on the plaster in shade.
AMBIENT = (0.066, 0.068, 0.078) if ROOM else (0.020, 0.024, 0.034)
SS = 2  # shadows and silhouettes are evaluated at 1/SS resolution (they are soft)

# ---------------------------------------------------------------- timing
def ease(x):
    return 0.5 - 0.5 * math.cos(math.pi * min(max(x, 0.0), 1.0))

def kf(t, keys):
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            return v0 + (v1 - v0) * ease((t - t0) / (t1 - t0))
    return keys[-1][1]

LIGHT_X = [(0, 0.80), (6, 0.66), (12, 0.53), (16.5, 0.47), (21, 0.31), (26, 0.22)]
LIGHT_I = [(0, 0.0), (2.6, 0.5), (6, 0.78), (12.5, 0.98), (16.5, 1.06), (20, 0.82), (23.6, 0.22), (25.3, 0.0)]
GAP = [(0, 1560), (5, 1180), (8, 800), (10.2, 880), (12.6, 420), (14.1, 292), (17.0, 284), (19.6, 560), (22.5, 1120), (26, 1560)]
SCALE = [(0, 178), (13, 194), (17, 198), (22, 182), (26, 172)]
PEN = [(0, 15), (12, 9), (17, 8), (22, 17), (26, 24)]
BRIDGE = [(0, 0.02), (11.4, 0.05), (12.8, 0.22), (14.2, 0.05), (17.2, 0.08), (18.6, 0.95), (19.7, 0.55), (20.7, 0.0)]
A_LEAN = [(0, 0), (7.4, 0), (8.5, 0.06), (10, 0.0), (12.6, 0.04), (14.1, 0.065), (17.1, 0.065), (19.2, 0.02), (26, -0.03)]
A_HEAD = [(0, 0), (7.8, 0), (8.6, 0.1), (10.2, 0), (13, 0.08), (14.3, 0.2), (17.1, 0.2), (18.7, 0.04), (26, -0.08)]
A_ARM = [(0, 0), (7.3, 0), (8.6, 0.3), (9.9, 0.04), (12.7, 0.1), (14.4, 1.0), (17.2, 1.0), (19.3, 0.08), (26, 0)]
B_LEAN = [(0, 0), (8.1, 0), (9.1, -0.07), (10.7, -0.03), (12.9, 0.04), (14.1, 0.06), (17.1, 0.06), (19.0, 0.0), (26, 0.0)]
B_HEAD = [(0, 0), (8.2, 0), (9.3, 0.34), (10.9, 0.12), (13.1, 0.08), (14.5, 0.17), (17.1, 0.17), (18.7, 0.0), (22, 0.12), (26, 0.16)]
B_ARM = [(0, 0), (13.1, 0), (14.7, 0.92), (17.1, 0.92), (18.9, 0.05), (26, 0)]
ZOOM = [(0, 1.0), (26, 1.055)]

# ---------------------------------------------------------------- sdf
def smin(a, b, k):
    if k <= 1e-4:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h - k * h * (1.0 - h)

def ellipse(x, y, cx, cy, rx, ry):
    dx, dy = (x - cx) / rx, (y - cy) / ry
    return (np.sqrt(dx * dx + dy * dy) - 1.0) * min(rx, ry)

def capsule(x, y, ax, ay, bx, by, r):
    px, py, vx, vy = x - ax, y - ay, bx - ax, by - ay
    h = np.clip((px * vx + py * vy) / (vx * vx + vy * vy), 0.0, 1.0)
    dx, dy = px - vx * h, py - vy * h
    return np.sqrt(dx * dx + dy * dy) - r

def rot(x, y, cx, cy, a):
    c, s = math.cos(a), math.sin(a)
    dx, dy = x - cx, y - cy
    return cx + c * dx - s * dy, cy + s * dx + c * dy

def figure(x, y, lean, head, arm, hair):
    """Signed distance (in figure units, head about 1 tall) of a person in
    profile, facing +x, hips at the origin, y up. lean and head tip toward the
    face; arm 0..1 goes from hanging to holding someone."""
    x, y = rot(x, y, 0.0, 0.0, lean)  # undo the lean (positive lean tips forward)
    d = capsule(x, y, 0.0, 0.3, 0.06, 1.85, 0.6)
    d = smin(d, ellipse(x, y, 0.16, 1.35, 0.66 if hair else 0.6, 0.85), 0.25)
    d = smin(d, ellipse(x, y, -0.02, 2.02, 0.5, 0.36), 0.25)
    d = smin(d, capsule(x, y, 0.02, 2.15, 0.1, 2.72, 0.2), 0.12)
    hx, hy = rot(x, y, 0.08, 2.62, head)
    hd = ellipse(hx, hy, 0.12, 3.18, 0.43, 0.53)
    hd = smin(hd, ellipse(hx, hy, 0.52, 3.12, 0.1, 0.07), 0.06)   # nose
    hd = smin(hd, ellipse(hx, hy, 0.36, 2.83, 0.17, 0.13), 0.08)  # chin
    if hair:
        hd = smin(hd, ellipse(hx, hy, -0.12, 3.05, 0.42, 0.62), 0.1)
        hd = smin(hd, capsule(hx, hy, -0.18, 3.0, -0.3, 2.05, 0.27), 0.15)
    d = smin(d, hd, 0.1)
    t1 = 0.12 + (1.6 - 0.12) * arm
    t2 = 0.27 + (1.15 - 0.27) * arm
    sx, sy = 0.05, 1.95
    ex, ey = sx + 1.15 * math.sin(t1), sy - 1.15 * math.cos(t1)
    fl = 1.15 - 0.42 * arm  # in a hold the forearm turns along their back, foreshortened
    wx, wy = ex + fl * math.sin(t2), ey - fl * math.cos(t2)
    a = capsule(x, y, sx, sy, ex, ey, 0.18)
    a = smin(a, capsule(x, y, ex, ey, wx, wy, 0.14), 0.08)
    a = smin(a, ellipse(x, y, wx + 0.06 * math.sin(t2), wy - 0.06 * math.cos(t2), 0.17, 0.2), 0.08)
    return smin(d, a, 0.12)

def back(x, y, head, hair):
    """A person seen from behind (we stand behind them, looking at the wall)."""
    d = ellipse(x, y, 0.0, 1.55, 1.2, 0.72)
    d = smin(d, ellipse(x, y, 0.0, 0.6, 1.25, 1.0), 0.3)
    d = smin(d, capsule(x, y, 0.0, 2.1, 0.0, 2.75, 0.27), 0.2)
    hx, hy = rot(x, y, 0.0, 2.62, head)
    hd = ellipse(hx, hy, 0.0, 3.2, 0.44 if not hair else 0.5, 0.55 if not hair else 0.6)
    if hair:
        hd = smin(hd, capsule(hx, hy, 0.0, 3.0, 0.0, 2.15, 0.46), 0.2)
    return smin(d, hd, 0.15)

def placed_back(gx, gy, ox, oy, s, **pose):
    return back((gx - ox) / s, (oy - gy) / s, **pose) * s

def placed(gx, gy, ox, oy, s, facing, **pose):
    """Figure placed on screen: hips at (ox, oy) px, s px per unit, facing +1 right / -1 left."""
    lx = (gx - ox) / s * facing
    ly = (oy - gy) / s
    return figure(lx, ly, **pose) * s  # back to px

# ---------------------------------------------------------------- textures
def value_noise(w, h, cells, rng):
    g = rng.random((cells[1] + 3, cells[0] + 3)).astype(np.float32)
    im = Image.fromarray(g, mode="F").resize((w, h), Image.BICUBIC)
    return np.asarray(im, dtype=np.float32)

def make_plaster():
    rng = np.random.default_rng(7)
    a = np.zeros((H, W), np.float32)
    for cells, amp in (((6, 4), 0.05), ((14, 8), 0.03), ((40, 22), 0.016), ((120, 68), 0.008)):
        a += (value_noise(W, H, cells, rng) - 0.5) * amp
    a += (value_noise(W, H, (5, 60), rng) - 0.5) * 0.018  # faint horizontal trowel passes
    a += (rng.random((H, W), dtype=np.float32) - 0.5) * 0.02  # tooth
    return 0.80 + a

def resample(img, z):
    """Zoom an HxW float image by z about its centre."""
    cw, ch = W / z, H / z
    box = ((W - cw) / 2, (H - ch) / 2, (W + cw) / 2, (H + ch) / 2)
    return np.asarray(Image.fromarray(img, mode="F").resize((W, H), Image.BILINEAR, box=box), dtype=np.float32)

def up(a):
    return np.asarray(Image.fromarray(a.astype(np.float32), mode="F").resize((W, H), Image.BILINEAR), dtype=np.float32)

PLASTER = None
YY, XX = np.mgrid[0:H, 0:W].astype(np.float32)
GY, GX = (np.mgrid[0:H // SS, 0:W // SS].astype(np.float32) + 0.5) * SS
VIG = None
MOTES = np.random.default_rng(3).random((46, 5))

def init():
    global PLASTER, VIG
    PLASTER = make_plaster()
    r = np.sqrt(((XX - W / 2) / (W * 0.62)) ** 2 + ((YY - H * 0.47) / (H * 0.78)) ** 2)
    VIG = np.clip(1.0 - 0.75 * r ** 2.4, 0.0, 1.0).astype(np.float32)

# ---------------------------------------------------------------- frame
def frame(i):
    t = i / FPS
    z = kf(t, ZOOM)
    # camera: world = c + (screen - c) / z
    wx = W / 2 + (GX - W / 2) / z
    wy = H / 2 + (GY - H / 2) / z

    lx = kf(t, LIGHT_X) * W + 18 * math.sin(t * 0.7)
    ly = H * (0.36 + 0.025 * math.sin(t * 0.43 + 1.0))
    flick = 1.0 + 0.012 * math.sin(t * 13.1) + 0.008 * math.sin(t * 29.7 + 2.0)
    li = kf(t, LIGHT_I) * flick
    lr = H * (0.40 + 0.08 * (kf(t, LIGHT_I)))

    # light on the wall (full res, in world coordinates)
    fx = W / 2 + (XX - W / 2) / z
    fy = H / 2 + (YY - H / 2) / z
    d2 = ((fx - lx) ** 2 + ((fy - ly) * 1.15) ** 2) / (lr * lr)
    pool = li * (1.0 / (1.0 + d2)) ** 1.6 + li * 0.05 * np.exp(-d2 * 0.05)

    # shadows
    gap, s = kf(t, GAP), kf(t, SCALE)
    sway = 0.022 * math.sin(t * 1.1) * ease((t - 13.5) / 1.5) * (1 - ease((t - 17.2) / 1.5))
    cx = W / 2 + (W / 2 - lx) * 0.33 + sway * 260
    oy = H * 1.02
    da = placed(wx, wy, cx - gap / 2, oy, s, 1, lean=kf(t, A_LEAN) + sway, head=kf(t, A_HEAD), arm=kf(t, A_ARM), hair=False)
    db = placed(wx, wy, cx + gap / 2, oy + s * 0.12, s * 0.95, -1, lean=kf(t, B_LEAN) - sway, head=kf(t, B_HEAD), arm=kf(t, B_ARM), hair=True)
    dd = smin(da, db, kf(t, BRIDGE) * s)
    pen = kf(t, PEN)
    shade = up(np.clip(0.5 - dd / (2 * pen), 0.0, 1.0) ** 1.0)
    shade = shade * shade * (3 - 2 * shade)

    lit = pool * (1.0 - 0.9 * shade)
    alb = resample(PLASTER, z)
    warm = np.array([1.0, 0.80, 0.58], np.float32) * (1.0 + 0.04 * ease((t - 12) / 4))
    amb = np.array(AMBIENT, np.float32)
    img = alb[..., None] * (amb + lit[..., None] * warm * 1.25)

    # dust in the beam
    glow = np.zeros((H, W), np.float32)
    for k, (mx, my, sp, ph, sz) in enumerate(MOTES):
        px = (mx * W + 40 * math.sin(t * (0.2 + sp * 0.3) + ph * 6) + t * (8 + 10 * sp)) % W
        py = (my * H - t * (6 + 14 * sp) + 25 * math.sin(t * 0.3 + ph * 9)) % H
        near = k < 6  # a few close to the lens: big and soft
        rad = (26 + 30 * sz) if near else (2.0 + 2.5 * sz)
        bx, by = int(px), int(py)
        r = int(rad * 3) + 1
        x0, x1, y0, y1 = max(bx - r, 0), min(bx + r, W), max(by - r, 0), min(by + r, H)
        if x0 >= x1 or y0 >= y1:
            continue
        sx = np.arange(x0, x1, dtype=np.float32) - px
        sy = np.arange(y0, y1, dtype=np.float32)[:, None] - py
        beam = pool[min(max(by, 0), H - 1), min(max(bx, 0), W - 1)]
        twinkle = 0.6 + 0.4 * math.sin(t * (1.5 + 2 * sp) + ph * 20)
        amp = (0.05 if near else 0.5) * beam * twinkle
        glow[y0:y1, x0:x1] += amp * np.exp(-(sx * sx + sy * sy) / (2 * rad * rad))
    img += glow[..., None] * warm * 0.9

    # the two of them, near the lens, out of focus and apart
    zf = 1.0 + (z - 1.0) * 1.8
    fxs = W / 2 + (GX - W / 2) / zf
    fys = H / 2 + (GY - H / 2) / zf
    breath = 0.012 * math.sin(t * 1.3)
    fs = H * 0.33
    fa = placed_back(fxs, fys, W * 0.075, H * 1.5 + breath * fs, fs, head=0.1, hair=False)
    fb = placed_back(fxs, fys, W * 0.93, H * 1.55 - breath * fs * 0.8, fs * 0.94,
                     head=-0.1 - 0.1 * ease((t - 18.5) / 3.5), hair=True)
    fd = np.minimum(fa, fb)
    blur = 80.0
    occ = up(np.clip(0.5 - fd / (2 * blur), 0.0, 1.0))
    occ = occ * occ * (3 - 2 * occ)
    if ROOM:
        # (They hide the lit wall behind them, and are lit only by the room's dim air themselves:
        # in the dark before the light they are hardly there, as they are not on the wall.)
        img = img * (1.0 - occ[..., None]) + occ[..., None] * (amb * 0.55 + (img - alb[..., None] * amb) * 0.06)
    else:
        img = img * (1.0 - 0.94 * occ[..., None])

    # grade (in the room, no vignette and no grain of its own: on the wall a darker rim read as a
    # stain, and the room's post adds both when it is entered; the technical artist, 2026-11-09)
    if not ROOM:
        img *= VIG[..., None]
    if not ROOM:
        img *= ease(t / 1.6) * (1 - ease((t - (DUR - 1.4)) / 1.4))
    img = 1.0 - np.exp(-img * 1.35)
    img = np.clip(img, 0, 1) ** (1 / 2.05)
    if ROOM:
        return (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8).tobytes()
    rng = np.random.default_rng(1000 + i)
    g = rng.standard_normal((H // 2, W // 2), dtype=np.float32)
    g = np.asarray(Image.fromarray(g, mode="F").resize((W, H), Image.BILINEAR), dtype=np.float32)
    img += (g * 0.016 + rng.standard_normal((H, W), dtype=np.float32) * 0.006)[..., None]
    img[..., 2] += 0.006  # a breath of blue in the dark
    return (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8).tobytes()

def main():
    out = sys.argv[1]
    if "--still" in sys.argv:
        init()
        ts = [float(v) for v in sys.argv[sys.argv.index("--still") + 1].split(",")]
        for t in ts:
            Image.frombytes("RGB", (W, H), frame(int(t * FPS))).save(out.replace(".png", f"-{t:05.1f}.png"))
        return
    n = int(DUR * FPS)
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
                           "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow",
                           "-crf", "16", "-pix_fmt", "yuv420p", "-tune", "grain", out], stdin=subprocess.PIPE)
    with Pool(4, initializer=init) as pool:
        for k, buf in enumerate(pool.imap(frame, range(n), chunksize=2)):
            ff.stdin.write(buf)
            if k % 48 == 0:
                print(f"frame {k}/{n}", flush=True)
    ff.stdin.close()
    ff.wait()

if __name__ == "__main__":
    main()
