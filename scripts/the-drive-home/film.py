"""The Drive Home: the shot list, and the film assembled from the traced drawings.

  python3 film.py trace [SHOT ...]      trace drawings into $DRIVE_HOME_CACHE/<shot>/ (4 in parallel)
  python3 film.py still SHOT SECONDS    one drawing, with the source beside it, for checking
  python3 film.py picture OUT.mp4       assemble the picture at 24 fps, each drawing held two frames

Sources ($DRIVE_HOME_SRC, fetched by fetch_sources.sh), all from the Internet Archive:
  hitchhiker  The Hitch-Hiker (1953, dir. Ida Lupino): the two men in the front seat at night
  tvc         Prelinger Archives, Television Commercials (Camera Only, B&W): hands rubbing in lotion
  carads52    Prelinger Archives, Passenger Car Screen Ads (Chevrolet, 1952): a hand turning a dash knob
"""
import os, sys, math, subprocess
from multiprocessing import Pool
import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import roto as R
import looks as L

SRC = os.environ.get("DRIVE_HOME_SRC", os.path.join(HERE, "src"))
CACHE = os.environ.get("DRIVE_HOME_CACHE", "/tmp/drive-home-cache")
FPS, DRAW = 24, 12                 # drawn on twos
BLINK_ON, BLINK_HZ = 38.9, 1 / 0.605   # the indicator, matched to the relay in signal-4
FILES = dict(hitchhiker="hitchhiker.mp4", tvc="tvc.mp4", carads52="carads52.mp4")

# ---- the shots -------------------------------------------------------------------------------
# start/dur in film seconds; t0 in source seconds; crop (x, y, w, h) on the 640x480 source.
SHOTS = [
    dict(name="road", start=0.0, dur=6.0, src="hitchhiker", t0=225.0, crop=(0, 0, 640, 360),
         look="ROAD", feats=False, glow=dict(col="#ffe2b0", amt=0.9)),
    # every shot of the two men is a stretch where neither of them speaks (lip gaps measured per
    # quarter second); the short ones are slowed, which a sleeping or a driving man hides
    dict(name="two", start=6.0, dur=4.9, src="hitchhiker", t0=247.7, crop=(0, 30, 640, 360),
         look="MOON", split=(0.56, 0.50), lamps=[(7.8, 1.0), (9.8, 0.8)], tweak=dict(tiles=True)),
    dict(name="window", start=10.9, dur=6.0, src="hitchhiker", t0=252.7, crop=(40, 92, 320, 180),
         look="MOON", lamps=[(13.6, 1.0)]),
    dict(name="hands", start=16.9, dur=4.5, src="tvc", t0=958.7, t1=960.6, pingpong=True,
         crop=(0, 30, 640, 360), look="HANDS", feats=False, special="hands", lamps=[(19.0, 0.9)]),
    dict(name="driver", start=21.4, dur=4.5, src="hitchhiker", t0=248.0, crop=(300, 60, 320, 180),
         look="MOON", split=(0.0, 0.0), lamps=[(23.4, 1.0)]),
    dict(name="vent", start=25.9, dur=4.0, src="carads52", t0=212.9, t1=215.2, crop=(60, 90, 520, 292),
         look="DASH", feats=False, special="vent", gray=False, vent=(0.0, 1.0, 214.2, 215.1)),
    dict(name="warm", start=29.9, dur=4.4, src="hitchhiker", t0=361.15, t1=363.4, crop=(80, 50, 480, 270),
         look="SODIUM", split=None,
         tweak=dict(ground=dict(cuts=[0.10, 0.30, 0.66],
                                colours=[[0.02, 0.02, 0.04], [0.07, 0.08, 0.13], [0.17, 0.15, 0.19], [0.42, 0.29, 0.2]]))),
    # the passenger's turn mirrors the driver's: the same dash and reach, seen from the other side
    dict(name="vent-back", start=34.3, dur=3.5, src="carads52", t0=213.1, t1=215.2, crop=(60, 90, 520, 292),
         look="DASH", feats=False, special="vent", gray=False, flip=True, vent=(1.0, 0.45, 214.3, 215.15)),
    dict(name="two-again", start=37.8, dur=3.0, src="hitchhiker", t0=288.3, t1=290.1, crop=(0, 30, 640, 360),
         look="MOON", split=(0.56, 0.50), indicator=True, tweak=dict(tiles=True)),
    dict(name="town", start=40.8, dur=3.2, src="hitchhiker", t0=357.3, t1=358.95, crop=(0, 60, 640, 360),
         look="SODIUM", split=(0.40, 0.40), indicator=True, tweak=dict(tiles=True)),
    dict(name="away", start=44.0, dur=7.6, src="hitchhiker", t0=184.5, t1=189.4, crop=(0, 60, 640, 360),
         look="ROAD_DAY4NIGHT", feats=False, special="away"),
]
LENGTH = 51.6


def shot(name):
    return next(s for s in SHOTS if s["name"] == name)


def source_time(s, k):
    """Source time of drawing k of shot s."""
    n = int(round(s["dur"] * DRAW))
    if s.get("pingpong"):
        span = s["t1"] - s["t0"]
        u = (k / DRAW) / span * 1.0
        u = u % 2
        return s["t0"] + span * (u if u <= 1 else 2 - u)
    if "t1" in s:
        return s["t0"] + (s["t1"] - s["t0"]) * k / max(1, n - 1)
    return s["t0"] + s.get("speed", 1.0) * k / DRAW


# ---- light -----------------------------------------------------------------------------------
def lamp_light(s, ft):
    """A street lamp passes: a band of warm light sweeps across from right to left."""
    gains = []
    for t_on, amt in s.get("lamps", []):
        u = (ft - t_on) / 0.9
        if -0.2 < u < 1.2:
            gains.append((1.25 - 1.6 * u, amt))
    ind = s.get("indicator") and ft >= BLINK_ON
    on = 0.0
    if ind:
        ph = ((ft - BLINK_ON) * BLINK_HZ) % 1.0
        on = smooth01(ph / 0.06) * (1 - smooth01((ph - 0.5) / 0.08))
    if not gains and on <= 0:
        return None
    xs = np.linspace(0, 1, R.WW, dtype=np.float32)[None, :]
    ys = np.linspace(0, 1, R.WH, dtype=np.float32)[:, None]

    def light(tone):
        gain = np.ones((R.WH, R.WW), np.float32)
        add = np.zeros((R.WH, R.WW, 3), np.float32)
        for x0, amt in gains:
            band = np.exp(-((xs - x0 + 0.25 * (ys - 0.5)) / 0.16) ** 2) * (0.6 + 0.4 * ys) * amt
            gain = gain + 1.1 * band
            add = add + band[..., None] * np.array([0.05, 0.028, 0.0], np.float32)
        if on > 0:
            # the indicator lamp is low on the dash, in front of the driver: amber from below
            glow = np.exp(-(((xs - 0.80) / 0.35) ** 2 + ((ys - 1.15) / 0.55) ** 2)) * on
            gain = gain + 0.55 * glow
            add = add + glow[..., None] * np.array([0.11, 0.045, 0.0], np.float32)
        return gain, add
    return light


def smooth01(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


# ---- the special shots ---------------------------------------------------------------------------
def glow_layer(img, col, amt):
    """Small bright lights (headlamps, tail lamps) bloom; the sky does not, being broad."""
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
    top = g - cv2.morphologyEx(g, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
    m = R.smoothstep(0.18, 0.4, top) * R.smoothstep(0.55, 0.8, g)
    m = cv2.resize(m, (R.W, R.H), interpolation=cv2.INTER_CUBIC)
    core = cv2.GaussianBlur(m, (0, 0), 2.5)
    bloom = cv2.GaussianBlur(m, (0, 0), 18) * 4 + cv2.GaussianBlur(m, (0, 0), 60) * 6
    c = np.array(R.hexrgb(col), np.float32)
    return (np.clip(core * 1.6, 0, 1)[..., None] * (0.6 + 0.4 * c) + np.clip(bloom, 0, 1)[..., None] * c * 0.55) * amt


class Vent:
    """A round heater vent on the dash, painted into the source frame (under the hand) so it is traced
    with everything else. aim 0 = straight back at the driver, 1 = turned toward the passenger."""

    def __init__(self, cx, cy, r):
        self.cx, self.cy, self.r = cx, cy, r

    def paint(self, img, aim, hand):
        h, w = img.shape[:2]
        layer = img.copy()
        cx, cy, r = self.cx, self.cy, self.r
        # bezel: a chrome ring, lit from above
        cv2.circle(layer, (cx, cy), int(r * 1.18), (70, 70, 70), -1, cv2.LINE_AA)
        cv2.ellipse(layer, (cx, cy), (int(r * 1.18), int(r * 1.18)), 0, 200, 340, (235, 235, 235), int(r * 0.12), cv2.LINE_AA)
        cv2.circle(layer, (cx, cy), int(r * 1.0), (25, 25, 25), -1, cv2.LINE_AA)
        # the eyeball turns: its face slides toward where it points and foreshortens
        off = aim * 0.34 * r
        ex, ey = int(cx + off), cy
        rx = int(r * (0.86 - 0.28 * aim)); ry = int(r * 0.86)
        cv2.ellipse(layer, (ex, ey), (rx, ry), 0, 0, 360, (200, 200, 200), -1, cv2.LINE_AA)
        cv2.ellipse(layer, (ex, ey), (rx, ry), 0, 0, 360, (20, 20, 20), max(2, int(r * 0.06)), cv2.LINE_AA)
        for k in (-2, -1, 0, 1, 2):  # the louvres
            yy = int(ey + k * ry * 0.34)
            half = int(rx * math.sqrt(max(0.0, 1 - (k * 0.34) ** 2)) * 0.92)
            cv2.line(layer, (ex - half, yy), (ex + half, yy), (35, 35, 35), max(2, int(r * 0.07)), cv2.LINE_AA)
        # the dark throat shows on the side it turns away from
        if aim > 0.05:
            cv2.ellipse(layer, (int(cx - r * 0.55 * aim), cy), (int(r * 0.3 * aim) + 1, int(r * 0.8)), 0, 0, 360, (8, 8, 8), -1, cv2.LINE_AA)
        hm = cv2.GaussianBlur(hand, (0, 0), 1.5)[..., None]
        return (img * hm + layer * (1 - hm)).astype(np.uint8)


def hand_mask(frame, plate):
    """The hand: what the segmenter calls clothes (the glove) and that is not in the empty dash."""
    conf = R.segment(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    conf = np.stack([cv2.resize(c, (frame.shape[1], frame.shape[0])) for c in conf])
    body = np.clip(conf[4] + conf[5] + conf[2] + conf[3], 0, 1)
    diff = np.abs(frame.astype(np.float32) - plate.astype(np.float32)).max(2) / 255
    m = (R.smoothstep(0.35, 0.6, body) * R.smoothstep(0.05, 0.12, cv2.GaussianBlur(diff, (0, 0), 2))) > 0.5
    m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
    cnt, cc, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    if cnt > 1:
        big = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
        m = (cc == big).astype(np.uint8)
    holes = cv2.floodFill(m.copy() * 255, None, (0, 0), 255)[1]
    m = np.maximum(m, (holes == 0).astype(np.uint8))
    g = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return np.clip(cv2.ximgproc.guidedFilter(g, m.astype(np.float32), 6, 200.0), 0, 1)


# ---- tracing ----------------------------------------------------------------------------------
def trace_shot(name, only=None):
    s = shot(name)
    out = os.path.join(CACHE, name)
    os.makedirs(out, exist_ok=True)
    src = R.Source(os.path.join(SRC, FILES[s["src"]]), s.get("crop"), gray=s.get("gray", True), flip=s.get("flip", False))
    tr = R.Tracer(L.look(getattr(L, s["look"]), **s.get("tweak", {})), seed=hash(name) % 1000)
    n = int(round(s["dur"] * DRAW))
    ks = range(n) if only is None else [only]
    plate = vent = prev_hm = None
    if s.get("special") == "vent":
        raw = R.Source(os.path.join(SRC, FILES[s["src"]]), s.get("crop"), gray=False, flip=s.get("flip", False))
        plate = np.median(np.stack([raw.frame(t, denoise=0) for t in (212.1, 212.3, 212.5, 212.7)]), 0).astype(np.uint8)
        x, y, w, h = s["crop"]
        kx = (400 - x) if not s.get("flip") else (x + w - 400)
        vent = Vent(int(kx), int(282 - y), 44)
    for k in ks:
        t = source_time(s, k)
        ft = s["start"] + k / DRAW
        img = src.frame(t)
        mask_fn = None
        if s.get("special") == "vent":
            hm = hand_mask(img, plate)
            h, w = img.shape[:2]
            yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
            d = np.hypot(xx - vent.cx, yy - vent.cy) / vent.r
            if prev_hm is not None:
                # near the vent a hand moves a little each drawing; a mask that leaps outward there
                # is the advert's chrome knob, not the hand
                grown = cv2.dilate(prev_hm, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))
                hm = np.where(d < 3.0, np.minimum(hm, grown), hm)
            prev_hm = hm.copy()
            a0, a1, ta, tb = s["vent"]
            aim = a0 + (a1 - a0) * smooth01((t - ta) / (tb - ta))
            # the fingers hold the rim; the face of the vent, louvres and all, stays in view
            face = np.zeros(hm.shape, np.float32)
            cv2.circle(face, (int(vent.cx + aim * 0.34 * vent.r), vent.cy), int(vent.r * 0.8), 1.0, -1, cv2.LINE_AA)
            hm = hm * (1 - cv2.GaussianBlur(face, (0, 0), 2))
            # the arm comes in from one side only; on the far side of the vent the advert's chrome knob
            # sometimes reads as hand
            xs = np.arange(hm.shape[1], dtype=np.float32)[None, :]
            beyond = (vent.cx - xs) if s.get("flip") else (xs - vent.cx)
            hm = hm * (1 - R.smoothstep(0.8 * vent.r, 1.1 * vent.r, beyond))
            img = vent.paint(img, aim, hm)
            hmw = cv2.resize(hm, (R.WW, R.WH))
            # the advert's hand is gloved and its arm in a pale coat: bare skin only near the vent,
            # the rest of the arm a dark sleeve
            near = cv2.resize(1 - R.smoothstep(1.8, 2.8, d), (R.WW, R.WH))

            def mask_fn(cls, n, hmw=hmw, near=near):
                c = np.zeros_like(cls)
                c[0] = 1 - hmw
                c[3] = hmw * near
                c[4] = hmw * (1 - near)
                return c
        elif s.get("special") == "hands":
            # the commercial's hands fill the frame; the white table shows only in a bright wedge
            # that touches the top edge: that becomes the dark of the lap
            g = cv2.GaussianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (0, 0), 3)
            bright = (g > 0.86 * 255).astype(np.uint8)
            cnt, cc, st, _ = cv2.connectedComponentsWithStats(bright, connectivity=8)
            top = [i for i in range(1, cnt) if st[i, cv2.CC_STAT_TOP] <= 2 and st[i, cv2.CC_STAT_AREA] > 400]
            bg = np.isin(cc, top).astype(np.float32)
            bg = cv2.resize(cv2.GaussianBlur(bg, (0, 0), 2), (R.WW, R.WH))

            def mask_fn(cls, n, bg=bg):
                c = np.zeros_like(cls)
                c[0] = bg
                c[3] = 1 - bg
                return c
        elif s.get("special") == "away":
            def mask_fn(cls, n):
                c = np.zeros_like(cls)
                c[0] = 1
                return c
        if mask_fn is None and s.get("feats") is False:
            def mask_fn(cls, n):
                c = np.zeros_like(cls)
                c[0] = 1
                return c
        o = tr.draw(img, light=lamp_light(s, ft), split=s.get("split"), mask_fn=mask_fn,
                    feats=s.get("feats", True))
        if s.get("glow"):
            o = o + glow_layer(img, s["glow"]["col"], s["glow"]["amt"])
        if s.get("special") == "away":
            o = away_lights(o, img, ft - s["start"])
        R.write_png(os.path.join(out, f"{k:04d}.png"), o)
        if only is not None:
            big = cv2.resize(img, (R.W, R.H))
            cv2.imwrite(os.path.join(CACHE, f"still-{name}.jpg"), np.vstack([cv2.resize(big, (960, 540)),
                        cv2.resize(cv2.imread(os.path.join(out, f"{k:04d}.png")), (960, 540))]))
    return name


def night_lamps(g):
    """The brightest small lights in a dark frame, however faint the film has them: two red lamps."""
    top = g - cv2.morphologyEx(g, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
    m = R.smoothstep(0.45, 0.8, top / max(float(top.max()), 0.08)) * (top > 0.06)
    m = cv2.resize(m.astype(np.float32), (R.W, R.H), interpolation=cv2.INTER_CUBIC)
    core = np.clip(cv2.GaussianBlur(m, (0, 0), 2.0) * 2.0, 0, 1)
    bloom = np.clip(cv2.GaussianBlur(m, (0, 0), 10) * 8 + cv2.GaussianBlur(m, (0, 0), 40) * 10, 0, 1)
    red = np.array([1.0, 0.16, 0.08], np.float32)
    return core[..., None] * (0.5 + 0.5 * red) + bloom[..., None] * red * 0.45


def away_lights(o, img, lt):
    """The car going away: two red tail lamps on the darkest blob on the road."""
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
    if g.mean() < 0.3:  # dusk into night: the lamps are the only light, and they are red
        return o + night_lamps(g)
    h, w = g.shape
    roi = np.zeros_like(g, bool); roi[int(h * 0.35):, int(w * 0.25):int(w * 0.75)] = True
    car = ((g < 0.22) & roi).astype(np.uint8)
    cnt, cc, st, _ = cv2.connectedComponentsWithStats(car, connectivity=8)
    if cnt < 2:
        return o
    b = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
    x, y, bw, bh, area = st[b]
    if area < 12:
        return o
    sx, sy = R.W / w, R.H / h
    m = np.zeros((R.H, R.W), np.float32)
    rad = max(2, int(bw * sx * 0.022))
    for fx in (0.17, 0.83):
        cv2.circle(m, (int((x + fx * bw) * sx), int((y + 0.62 * bh) * sy)), rad, 1.0, -1, cv2.LINE_AA)
    bloom = cv2.GaussianBlur(m, (0, 0), rad * 2.5) * 2 + cv2.GaussianBlur(m, (0, 0), rad * 7) * 3
    red = np.array([1.0, 0.16, 0.08], np.float32)
    return o + (np.clip(m, 0, 1)[..., None] * red + np.clip(bloom, 0, 1)[..., None] * red * 0.5)


# ---- the picture ---------------------------------------------------------------------------------
def drawing(name, k):
    p = os.path.join(CACHE, name, f"{k:04d}.png")
    return cv2.cvtColor(cv2.imread(p), cv2.COLOR_BGR2RGB).astype(np.float32) / 255


def frame_at(f, room=False):
    t = f / FPS
    live = [s for s in SHOTS if s["start"] - 0.8 <= t < s["start"] + s["dur"]]
    img = np.zeros((R.H, R.W, 3), np.float32)
    for s in SHOTS:
        if not (s["start"] <= t < s["start"] + s["dur"]):
            continue
        n = int(round(s["dur"] * DRAW))
        k = min(n - 1, int((t - s["start"]) * DRAW))
        img = drawing(s["name"], k)
        # dissolves: road -> the two of them; the last cut is a cut
        nxt = next((q for q in SHOTS if abs(q["start"] - (s["start"] + s["dur"])) < 1e-6), None)
        if s["name"] == "road" and nxt is not None and t > s["start"] + s["dur"] - 0.8:
            a = smooth01((t - (s["start"] + s["dur"] - 0.8)) / 0.8)
            img = img * (1 - a) + drawing(nxt["name"], 0) * a
        break
    if room:
        # (In the room it begins and ends on the wall: no fade from or to black of its own, the wall
        # takes it in and gives it back: src/memory/memories/drive.ts DRIVE.)
        return np.clip(img, 0, 1)
    fade_in = smooth01(t / 1.6)
    fade_out = 1 - smooth01((t - (LENGTH - 3.0)) / 2.4)
    return np.clip(img * fade_in * fade_out, 0, 1)


# The room's cut begins at the second shot, the two of them side by side (the road at night before it
# is near black, and carried in on it the view filled with black: the cinematic director's review,
# 2026-11-09). docs/drive-home.md.
ROOM_FROM = 6.0


def picture(out, room=False):
    first = int(round(ROOM_FROM * FPS)) if room else 0
    n = int(LENGTH * FPS)
    p = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{R.W}x{R.H}",
                          "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "16",
                          "-pix_fmt", "yuv420p", out], stdin=subprocess.PIPE)
    last = None
    for f in range(first, n):
        img = (frame_at(f, room) * 255 + 0.5).astype(np.uint8)
        p.stdin.write(img.tobytes())
    p.stdin.close()
    p.wait()


def main():
    cmd = sys.argv[1]
    if cmd == "trace":
        names = sys.argv[2:] or [s["name"] for s in SHOTS]
        names.sort(key=lambda n: -shot(n)["dur"])
        with Pool(int(os.environ.get("JOBS", "4"))) as pool:
            for done in pool.imap_unordered(trace_shot, names):
                print("traced", done, flush=True)
    elif cmd == "still":
        s = shot(sys.argv[2])
        k = int(round((float(sys.argv[3]) - s["start"]) * DRAW))
        trace_shot(s["name"], only=k)
        print(os.path.join(CACHE, f"still-{s['name']}.jpg"))
    elif cmd == "picture":
        picture(sys.argv[2])
    elif cmd == "room":
        picture(sys.argv[2], room=True)


if __name__ == "__main__":
    main()
