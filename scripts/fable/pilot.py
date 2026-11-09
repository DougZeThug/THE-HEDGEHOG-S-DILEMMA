"""The pilot, animated (style bible §3, §6, §8): the reach and the touch, film frames 3080-3406
(128.33-141.92 s on radio cut v1), on the stage still.py builds, with mix 1 under it.

Reel 1 blocked the key poses on the soundtrack and the artist kept its timing. This is the
animation on that timing: the puppet (rig.py: each key drawing cut into pinned paper pieces) moves
through every frame, each piece on its own curve, so he goes from pose to pose instead of jumping.

  3080-3098  hiding under the bough, lying, quick shallow breaths, his raised paw holding it down
  3099-3110  the push: he eases the bough up off him and his paw slips off it; it whips free
  3110-3125  out from under it: he gathers and lunges forward, hops (in the air 3117-3120), lands,
             sits up leaning back, looks out
  3123-3163  the reach: he leans out and his paw goes out after her on an arc, to his limit
  3164-3168  the fall, on ones; 3169 contact (the approved still), 3 degrees over, settled by 3175
  3176-3265  the held breath: no breath, his weight settles once
  3266-3290  the exhale: he draws his paw back out of the water, sits back and draws in on himself;
             the sunk drawing from 3280, its head going on down
  3291-3406  sunk: slow breaths, his head lowers, the moon stops on "hill" (3376)

He changes drawing twice, each time inside a fast move and under its motion blur: hiding to the
touch drawing mid-lunge (3117), inside a 360-degree shutter whose sub-frames straddle the change,
the lunge's speed carried through it into a hop: three frames in the air, down on his feet at 3120,
which then stay put; the touch to sunk at 3280, a clean cut as he sits back, the two drawings posed
to meet at the muzzle and the neck within a few px, his eyes closed after it. Fast moves are shot
with a 180-degree shutter (several sub-frames averaged).

The bough grows from off the left edge of the frame and never leaves that root. His paw is on its
stem, holding it down over him, and it strains up against him, bowed. He eases it up and his paw
slips off; it whips back up to where it hangs in the still, overshooting and settling, its tip a
beat behind its base. His forearm is in front of it while he holds it; its leaves shade him.

Her reflection breaks as a front runs out from his paw: 22 strips, nearest first, each torn into
two or three pieces pushed apart and away from him.

On ones 3094-3176 and 3262-3292 (the moves), on twos in the holds. Each drawing re-seats the pieces
by a hair, as hands do. Every drawing frame is rendered once.

Writes OUT/drawings/dNNNN.png (the 4:5 column, 1152x1440), OUT/xsheet.json, OUT/pilot.mp4 and
OUT/pilot.webm (864x1080 with the soundtrack), OUT/strip.jpg (key drawings).

Usage: python -I scripts/fable/pilot.py OUT_DIR [--frames A-B] [--only F,F,...] [--no-video]
"""
import bisect
import json
import math
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rig as R  # noqa: E402
import still as S  # noqa: E402

ROOT = S.ROOT
H, W, COL_X, COL_W = S.H, S.W, S.COL_X, S.COL_W
XX, YY = S.XX, S.YY
FPS = 24
F0, F1 = 3080, 3406
ONES = [range(3094, 3177), range(3262, 3293)]
CONTACT = 3169
SWAPS = (3117, 3280)  # hide -> touch mid-lunge; touch -> sunk mid-exhale
SOUNDTRACK = ROOT / 'audition' / 'fable' / 'mix' / 'soundtrack.wav'

ANCHOR = {'hide': (1700, 2510), 'touch': (2674, 2650), 'sunk': (2740, 2759)}
HIDE_REAR = (1150, 2560)     # the hiding drawing rises about his haunch, not his middle
PINS = {  # (piece, source px): brass pins at the joints the model sheet pins
    'hide': [('upper', (3150, 1480)), ('lower', (3660, 1850)), ('body', (1600, 1440))],
    'touch': [('upper', (3440, 1200)), ('lower', (3560, 1880)), ('body', (2560, 1800)), ('body', (2240, 2440))],
    'sunk': [('body', (3140, 1200)), ('body', (3100, 1880)), ('body', (2560, 2080)), ('body', (2240, 2600))],
}
PAW = {'hide': ('lower', (4720, 1010)), 'touch': ('lower', (4480, 2620)), 'sunk': ('body', (4000, 2700))}
RINGS = [(3169, 16), (3178, 24), (3190, 32), (3204, 40)]  # start frame, life in frames (bible §7)
BREAKS = 22                                                # strips that break at the touch, nearest first
FRONT = 9.0                                                # px per frame: how fast the break runs out from his paw
TAU = 2.5 * FPS                                            # the soundtrack's decay after the touch

# the bough: its root off the left edge, its length, the angle it hangs at when free (degrees,
# clockwise from pointing right), and how its stem sits on his paw while he holds it
BOUGH_ROOT = (330.0, 560.0)
BOUGH_LEN = 740.0
BOUGH_REST = -30.0
BOUGH_FREE = 3107       # his paw leaves it
BOUGH_UNDER = 1.2       # degrees: its stem runs just under his paw, which holds it down
BOUGH_BOW = 13.0        # degrees: held down, its base strains this far above where his paw holds it


def smooth(u):
    u = min(max(u, 0.0), 1.0)
    return u * u * (3 - 2 * u)


def curve(keys, t):
    """Cubic through (frame, value) keys: smooth through the keys between, easing into and out of
    holds, turns and the ends, never overshooting between two keys (overshoots are keyed)."""
    ts = [k[0] for k in keys]
    vs = [k[1] for k in keys]
    if t <= ts[0]:
        return vs[0]
    if t >= ts[-1]:
        return vs[-1]
    i = bisect.bisect_right(ts, t) - 1

    def tan(j):
        if j == 0 or j == len(ts) - 1:
            return 0.0
        d0 = (vs[j] - vs[j - 1]) / (ts[j] - ts[j - 1])
        d1 = (vs[j + 1] - vs[j]) / (ts[j + 1] - ts[j])
        if d0 * d1 <= 0:
            return 0.0
        m = (vs[j + 1] - vs[j - 1]) / (ts[j + 1] - ts[j - 1])
        return math.copysign(min(abs(m), 3 * abs(d0), 3 * abs(d1)), m)
    t0, t1 = ts[i], ts[i + 1]
    h = t1 - t0
    u = (t - t0) / h
    m0, m1 = tan(i) * h, tan(i + 1) * h
    return ((2 * u ** 3 - 3 * u ** 2 + 1) * vs[i] + (u ** 3 - 2 * u ** 2 + u) * m0
            + (-2 * u ** 3 + 3 * u ** 2) * vs[i + 1] + (u ** 3 - u ** 2) * m1)


def wave(t, period, phase=0.0):
    return math.sin(2 * math.pi * t / period + phase)


def drawing_of(f):
    """The frame whose drawing frame f shows: its own on ones, else the even step of the twos."""
    if any(f in r for r in ONES):
        return f
    return f - ((f - F0) % 2)


# ---------------------------------------------------------------------------------------------
# the performance: every piece's curve, at any (fractional) frame

HIDE = {
    # the last keys run on past the change of drawing (3117), so he is still moving through it
    'x': [(3080, 560), (3110, 560), (3112.5, 550), (3117, 665), (3119, 725)],
    'y': [(3080, 978), (3110, 978), (3112.5, 981), (3117, 962), (3119, 955)],
    'lean': [(3080, 0), (3099, 0), (3106, -2.5), (3110, -3.5), (3112.5, -1.0), (3117, -5), (3119, -6)],
    'head': [(3080, 0), (3094, 0), (3097, 2.0), (3099, 1.5), (3105, -5), (3109, -7), (3112.5, -1), (3117, -6), (3119, -7)],
    # he eases the bough up off him, his paw slips off it, comes down and forward for the lunge
    'upper': [(3080, 0), (3095, 0), (3098, 2.5), (3104, -9), (3108, -14), (3110.5, -10), (3112.5, 4), (3117, 0), (3119, -2)],
    'lower': [(3080, 0), (3095, 0), (3098, 2.0), (3104, -8), (3108, -12), (3110.5, 10), (3112.5, 40), (3117, 30), (3119, 26)],
    'squash': [(3080, 0), (3110, 0), (3112.5, 1), (3115, 0)],
}
LAND = 3120   # the hop: in the air from the change of drawing (3117), down on his feet here, and they stay
TOUCH = {
    # landed, he sits up and back, so his forepaws come down on the bank, clear of the water till 3169
    'lean': [(3117, 2), (3120, 4), (3122.5, 0), (3125, -6), (3128, -8), (3132, -7), (3140, -2), (3150, 3.0),
             (3158, 4.2), (3163, 4.4), (3164, 4.7), (3165, 5.1), (3166, 5.6), (3167, 6.1), (3168, 6.3), (3169, 6.8),
             (3170, 6.2), (3171, 4.6), (3172, 3.3), (3173, 2.5), (3174, 2.0), (3175, 1.85), (3176, 2.0), (3198, 2.0),
             (3240, 3.3), (3262, 3.3), (3266, 3.9), (3272, -1.0), (3280, -12), (3282, -12.5)],
    # up toward her through the reach; his eyes drop just before his paw does
    'head': [(3117, 2), (3120, 6), (3122, -2), (3125, -11), (3129, -12), (3135, -9), (3142, -9), (3150, -11),
             (3156, -10), (3160, -8), (3163, -6), (3165, -3), (3167, 0), (3168, 1.5), (3169, 2.2), (3172, -0.5),
             (3175, 0), (3264, 0), (3268, -1.5), (3280, -18), (3282, -18.5)],   # up out of the water as he draws back
    # the foreleg's keys from the landing to the reach, and in the draw-back, are solved for where the
    # paw must be: down on the bank left of the shore, then lifted clear of the water going back
    'upper': [(3117, -8), (3119, 40), (3120, 41), (3122.5, 41), (3125, 34.5), (3129, 31.5), (3133, 36),
              (3136, 31.25), (3150, -15), (3158, -18), (3163, -18.5), (3165, -15.5), (3166, -12.5), (3167, -8.5),
              (3168, -8), (3169, 0), (3264, 0), (3268, -2.5), (3272, 15.25), (3276, 22), (3280, 14), (3282, 14)],
    'lower': [(3117, -4), (3119, -37), (3120, -36), (3122.5, -33), (3125, -20.5), (3129, -15.25), (3133, -27.5),
              (3136, -36), (3150, -18), (3158, -22.5), (3163, -23), (3165, -19), (3166, -15), (3167, -10),
              (3168, -12), (3169, 1.5), (3171, -0.5), (3173, 0), (3264, 0), (3268, -5), (3272, -22.25),
              (3276, -17.75), (3280, 8), (3282, 8)],   # 3168 keeps the paw just out of the water: contact is 3169
    'tail': [(3117, 6), (3120, -6), (3123, 3), (3127, -1), (3132, 0), (3266, 0), (3280, 18), (3282, 18)],
}
SUNK = {
    'lean': [(3280, 6.5), (3285, 1.95), (3291, -0.2), (3296, 0), (3310, 0), (3358, 1.2), (3406, 1.5)],
    'head': [(3280, 4), (3285, 5), (3290, 5.5), (3310, 5.5), (3358, 9), (3406, 10)],   # from where the touch head left it, on down
}
TOUCH_AT = (846, 955)   # his hind feet once he lands, through the touch and the exhale
SUNK_AT = (830, 955)    # sunk sits back off the shore, its paw drawn back out of the water; posed so its head meets where the touch drawing left his (3280)


def hop(t):
    """His hind feet through the hop: in the air from 3117 (35 px up, still carrying the lunge's
    speed forward), falling onto their marks at LAND, then still."""
    u = min(max((t - SWAPS[0]) / (LAND - SWAPS[0]), 0.0), 1.0)
    return TOUCH_AT[0] - 40 * (1 - u) ** 2, TOUCH_AT[1] - 35 * (1 - u * u)


def perform(t, d, rig=None):
    """His pose at frame t (fractional, for the shutter), with drawing d's re-seat: the rig (that
    of the frame, or the one asked for), the map of its root (source px to matte px), and each
    piece's angle (or angle and scale)."""
    rig = rig or ('hide' if t < SWAPS[0] else 'touch' if t < SWAPS[1] else 'sunk')
    jit = np.random.default_rng(d) if d is not None else None
    seat = {n: float(jit.normal(0, 0.12)) if jit else 0.0 for n in ('head', 'upper', 'lower', 'tail')}
    dx, dy = (float(v) for v in jit.normal(0, 0.25, 2)) if jit else (0.0, 0.0)
    if rig == 'hide':
        breath = 1 + 0.012 * (0.5 - 0.5 * math.cos(2 * math.pi * (t - F0) / 17)) * (1 - smooth((t - 3096) / 4))
        sq = curve(HIDE['squash'], t)
        pose = {
            'body': (0.0, (1 + 0.02 * sq, breath - 0.03 * sq)),
            'head': curve(HIDE['head'], t) + 0.6 * wave(t, 52, 1.1) * (1 - smooth((t - 3094) / 6)),
            'upper': curve(HIDE['upper'], t) + 0.4 * wave(t, 23, 0.4),   # holding the bough down, trembling
            'lower': curve(HIDE['lower'], t) + 0.5 * wave(t, 19, 2.0),
        }
        at = (curve(HIDE['x'], t) + dx, curve(HIDE['y'], t) + dy)
        root = R.place_map(ANCHOR['hide'], at, curve(HIDE['lean'], t), pivot=HIDE_REAR)
        lean = 0.0
    elif rig == 'touch':
        # breathing while he reaches, none while he holds it, the breath out at the exhale
        held = smooth((t - 3166) / 3) * (1 - smooth((t - 3264) / 3))
        breath = 1 + 0.007 * (0.5 - 0.5 * math.cos(2 * math.pi * (t - 3120) / 34)) * (1 - held)
        breath -= 0.015 * smooth((t - 3266) / 14)
        land = math.exp(-((t - LAND - 0.8) / 0.9) ** 2)   # two frames of squash as he lands
        drift = smooth((t - 3176) / 12) * (1 - smooth((t - 3262) / 4))  # the held breath is still alive
        curl = smooth((t - 3268) / 12)  # breathing out he draws in on himself, toward sunk's smaller shape
        pose = {
            'body': (0.0, ((1 + 0.015 * land) * (1 - 0.05 * curl), (breath - 0.04 * land) * (1 - 0.06 * curl))),
            'head': curve(TOUCH['head'], t) + drift * (0.5 * wave(t, 83, 0.7) + 0.25 * wave(t, 37, 2.2)),
            'upper': curve(TOUCH['upper'], t) + 0.6 * wave(t, 29, 1.0) * smooth((t - 3150) / 8) * (1 - smooth((t - 3163) / 2)),
            'lower': curve(TOUCH['lower'], t) + 0.8 * wave(t, 23, 0.0) * smooth((t - 3150) / 8) * (1 - smooth((t - 3163) / 2)),
            'tail': curve(TOUCH['tail'], t) + 1.4 * wave(t, 101, 0.3) * smooth((t - 3130) / 20),
        }
        lean = curve(TOUCH['lean'], t)
        fx, fy = hop(t)
        at = (fx + dx, fy + dy)
        root = R.place_map(ANCHOR['touch'], at, lean)
    else:
        breath = 1 + 0.010 * (0.5 - 0.5 * math.cos(2 * math.pi * max(0.0, t - 3290) / 90)) * smooth((t - 3288) / 8)
        lean = curve(SUNK['lean'], t) + 0.5 * (breath - 1) / 0.01 * 0.6
        pose = {
            'body': (0.0, (1.0, breath)),
            'head': curve(SUNK['head'], t) + 0.6 * wave(t, 71, 0.5) * smooth((t - 3284) / 10),
        }
        at = (SUNK_AT[0] + dx, SUNK_AT[1] + dy)
        root = R.place_map(ANCHOR['sunk'], at, lean)
    for n, sv in seat.items():
        if n in pose:
            pose[n] = pose[n] + sv
    return {'rig': rig, 'root': root, 'pose': pose, 'at': at, 'lean': lean}


# ---------------------------------------------------------------------------------------------
# the stage

def stamp(dst, img, ox, oy):
    """Add a small image into dst at (ox, oy), clipped, in place."""
    x0, y0 = int(round(ox)), int(round(oy))
    hh, ww = img.shape[:2]
    sx0, sy0, dx0, dy0 = max(0, -x0), max(0, -y0), max(0, x0), max(0, y0)
    cw, ch = min(ww - sx0, dst.shape[1] - dx0), min(hh - sy0, dst.shape[0] - dy0)
    if cw > 0 and ch > 0:
        dst[dy0:dy0 + ch, dx0:dx0 + cw] += img[sy0:sy0 + ch, sx0:sx0 + cw]


class Stage:
    def __init__(self):
        print('building the stage', flush=True)
        self.plate = S.haze(S.plate())
        self.rigs = {k: R.build(k) for k in ('hide', 'touch', 'sunk')}
        (self.f_rgb, self.f_a), (self.n_rgb, self.n_a) = S.banks()
        self.bank_dark, self.lap = S.bank_reflection(self.n_a)
        self.reed_col, self.reed_a = S.reeds_layer()
        self.ring_col = S.lin(np.array([0.9, 0.86, 0.78], np.float32))
        self._moon()
        self._bough()
        self._strips()
        # where his paw meets the water at rest in the touch: the rings' centre
        pz = perform(3175, 0)
        _, alpha = self.fox_at(pz)
        span = S.contact(alpha)
        self.ring_at = ((span[0] + span[1]) / 2, S.SPEC['waterline'] + 1)

    # -- him
    def maps(self, pz):
        return R.pose_maps(self.rigs[pz['rig']], pz['pose'], pz['root'])

    def fox_at(self, pz):
        return R.render(self.rigs[pz['rig']], self.maps(pz))

    def point(self, pz, piece, src):
        return (self.maps(pz)[piece] @ np.array([*src, 1.0]))[:2]

    def extent(self, pz):
        """The corners of every piece, in the matte: what the shutter measures."""
        maps = self.maps(pz)
        pts = []
        for p in self.rigs[pz['rig']]:
            x0, y0 = p['o']
            hh, ww = p['a'].shape
            for cx, cy in ((x0, y0), (x0 + ww, y0), (x0, y0 + hh), (x0 + ww, y0 + hh)):
                pts.append((maps[p['name']] @ np.array([cx / R.WS, cy / R.WS, 1.0]))[:2])
        return np.array(pts)

    def shutter(self, t, d):
        """The sub-frames of a 180-degree shutter about t (360 about the hop), as many as the fastest
        corner needs (up to 8, 18 through the lunge). Through the hop the sub-frames before the
        change of drawing are the lying drawing and those after it the sitting one, so the cut frame
        is the heaviest smear; the change into sunk is a clean cut, each frame one drawing."""
        half = 0.5 if abs(t - SWAPS[0]) < 2.5 else 0.25
        lo, hi = t - half, t + half
        if lo < SWAPS[1] <= hi:
            if t < SWAPS[1]:
                hi = SWAPS[1] - 1e-3
            else:
                lo = SWAPS[1]
        a, b = perform(lo, d), perform(hi, d)
        if a['rig'] == b['rig']:
            move = float(np.abs(self.extent(a) - self.extent(b)).max())
        else:
            move = float(np.abs(self.extent(a).mean(0) - self.extent(b).mean(0)).max()) + 60
        cap = 18 if 3110 <= t <= 3122 else 8
        n = 1 if move < 2.5 else int(min(cap, math.ceil(move / 2.5)))
        return [t] if n == 1 else list(np.linspace(lo, hi, n))

    def fox(self, t, d):
        """Him at t through the shutter: linear light, alpha, the alpha of the pieces drawn in front
        of the bough (his raised forearm, while he holds it), and how many sub-frames."""
        ts = self.shutter(t, d)
        C = np.zeros((H, W, 3), np.float32)
        A = np.zeros((H, W), np.float32)
        F = np.zeros((H, W), np.float32)
        for u in ts:
            pz = perform(u, d)
            maps = self.maps(pz)
            L, a = R.render(self.rigs[pz['rig']], maps)
            C += L * a[..., None]
            A += a
            if pz['rig'] == 'hide' and u < BOUGH_FREE + 4:
                F += R.render([p for p in self.rigs['hide'] if p['name'] == 'lower'], maps, shade=0.0)[1]
        C, A, F = C / len(ts), A / len(ts), F / len(ts)
        return C / np.maximum(A[..., None], 1e-4) * (A[..., None] > 1e-3), np.clip(A, 0, 1), np.clip(F, 0, 1), len(ts)

    # -- the bough
    def _bough(self):
        """The bough laid along +x from its cut end (its root), scaled to its length: linear light
        premultiplied, alpha, and where the root sits in the sprite."""
        brg, bra = S.cutout(S.SPEC['branch'], key='dark')
        ys, xs = np.nonzero(bra > 0.5)
        pts = np.stack([xs, ys], 1).astype(np.float32)
        mean = pts.mean(0)
        u = np.linalg.svd(pts - mean, full_matrices=False)[2][0]
        if u[0] < 0:
            u = -u
        proj = (pts - mean) @ u
        k = BOUGH_LEN / float(proj.max() - proj.min())
        cut = (mean + u * proj.min()) * k             # the cut end is the left end in the drawing
        brg = cv2.resize(brg, None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
        bra = cv2.resize(bra, None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
        ang = math.degrees(math.atan2(u[1], u[0]))
        pad = int(0.25 * BOUGH_LEN)
        size = (int(BOUGH_LEN + 2 * pad), int(2 * pad + 0.6 * BOUGH_LEN))
        M = cv2.getRotationMatrix2D((float(cut[0]), float(cut[1])), ang, 1.0)
        M[:, 2] += [pad - cut[0], size[1] / 2 - cut[1]]
        col = cv2.warpAffine(brg, M, size, flags=cv2.INTER_CUBIC)
        a = np.clip(cv2.warpAffine(bra, M, size, flags=cv2.INTER_CUBIC), 0, 1)
        self.bough_pm = (S.lin(np.clip(col, 0, 1)) * 0.25 * a[..., None]).astype(np.float32)
        self.bough_a = a.astype(np.float32)
        self.bough_o = (pad, size[1] / 2)
        r = BOUGH_LEN + pad
        self.bough_box = (max(0, int(BOUGH_ROOT[0] - r)), max(0, int(BOUGH_ROOT[1] - r)),
                          min(W, int(BOUGH_ROOT[0] + r)), min(H, int(BOUGH_ROOT[1] + r)))

    def bough_angles(self, t):
        """(base, tip) angles of the bough, degrees clockwise from pointing right. Held, his paw is
        on its stem near the tip and it strains up against him, bowed: its base BOUGH_BOW above the
        paw. Let go, its base springs to rest from where it was and how fast it was rising, and the
        bow comes out of it with its tip a beat behind, so it whips."""
        def paw(u):
            pz = perform(u, int(u))
            px, py = self.point(pz, *PAW['hide'])
            return (math.degrees(math.atan2(py - BOUGH_ROOT[1], px - BOUGH_ROOT[0])),
                    math.hypot(px - BOUGH_ROOT[0], py - BOUGH_ROOT[1]))

        def held(u):
            u = min(u, BOUGH_FREE)
            ang, r = paw(u)
            base_ = ang - BOUGH_BOW
            k = min(r / BOUGH_LEN, 1.0) ** 1.5
            return base_, base_ + (ang + BOUGH_UNDER - base_) / k

        def base(u):
            if u <= BOUGH_FREE:
                return held(u)[0]
            a0 = held(BOUGH_FREE)[0]
            s_ = (u - BOUGH_FREE) / FPS
            v0 = (held(BOUGH_FREE)[0] - held(BOUGH_FREE - 1)[0]) * FPS
            w, z = 5.2, 0.32
            wd = w * math.sqrt(1 - z * z)
            x0 = a0 - BOUGH_REST
            return BOUGH_REST + math.exp(-z * w * s_) * (x0 * math.cos(wd * s_) + (v0 + z * w * x0) / wd * math.sin(wd * s_))
        sway = 0.45 * wave(t, 113, 0.9) * smooth((t - 3140) / 40)
        if t <= BOUGH_FREE:
            b, tip = held(t)
        else:
            b = base(t)
            c = held(BOUGH_FREE)[1] - base(BOUGH_FREE - 2.5)
            tip = base(t - 2.5) + c * math.exp(-(t - BOUGH_FREE) / 2.0)
        return b + sway, tip + 1.6 * sway

    def bough_at(self, base, tip):
        """The bough bent: each point turned about the root by an angle growing from the base's to
        the tip's along it (a turn about the root keeps its distance from the root, so the bend is
        exact both ways)."""
        x0, y0, x1, y1 = self.bough_box
        yy, xx = YY[y0:y1, x0:x1] - BOUGH_ROOT[1], XX[y0:y1, x0:x1] - BOUGH_ROOT[0]
        r = np.hypot(xx, yy)
        phi = np.arctan2(yy, xx)
        k = np.clip(r / BOUGH_LEN, 0, 1.2) ** 1.5
        th = np.radians(base + (tip - base) * k)
        src = phi - th
        mx = (r * np.cos(src) + self.bough_o[0]).astype(np.float32)
        my = (r * np.sin(src) + self.bough_o[1]).astype(np.float32)
        pm = np.zeros((H, W, 3), np.float32)
        a = np.zeros((H, W), np.float32)
        pm[y0:y1, x0:x1] = cv2.remap(self.bough_pm, mx, my, cv2.INTER_LINEAR, borderValue=0)
        a[y0:y1, x0:x1] = cv2.remap(self.bough_a, mx, my, cv2.INTER_LINEAR, borderValue=0)
        return pm, a

    def bough(self, t):
        """The bough at t through the shutter: sub-frames as its tip needs."""
        b0, t0 = self.bough_angles(t - 0.25)
        b1, t1 = self.bough_angles(t + 0.25)
        move = math.radians(max(abs(b1 - b0), abs(t1 - t0))) * BOUGH_LEN
        n = 1 if move < 2.5 else int(min(18, math.ceil(move / 2.5)))
        us = [t] if n == 1 else list(np.linspace(t - 0.25, t + 0.25, n))
        pm = np.zeros((H, W, 3), np.float32)
        a = np.zeros((H, W), np.float32)
        for u in us:
            p_, a_ = self.bough_at(*self.bough_angles(u))
            pm += p_
            a += a_
        return pm / len(us), np.clip(a / len(us), 0, 1)

    # -- the moon and her path
    def _moon(self):
        moon = S.load(S.SPEC['moon_file'])
        md = S.SPEC['moon_d']
        k = md / (moon.shape[0] * 0.65)
        mm = cv2.resize(S.lin(moon) * np.array([1.0, 1.03, 1.12], np.float32), None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
        ma = cv2.resize(np.clip((moon.mean(-1) - 0.08) / 0.25, 0, 1), None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
        self.moon_pm, self.moon_a, self.moon_tex = mm * ma[..., None], ma, mm
        pad = int(md * 3)
        canvas = np.zeros((ma.shape[0] + 2 * pad, ma.shape[1] + 2 * pad, 3), np.float32)
        canvas[pad:pad + ma.shape[0], pad:pad + ma.shape[1]] = self.moon_pm
        self.halo = cv2.GaussianBlur(canvas, (0, 0), md * 0.6) * np.array([1.0, 0.85, 0.6], np.float32) * 0.8
        self.halo_pad = pad

    def _strips(self):
        """Her path as separate torn strips (still.py's layout), each kept as a small premultiplied
        sprite, so each can break, slide and dim on its own."""
        rng = np.random.default_rng(11)   # still.py's layout
        own = np.random.default_rng(12)   # each strip's split and glint
        tex = cv2.resize(self.moon_tex, (400, 60), interpolation=cv2.INTER_AREA)
        hz = S.SPEC['horizon']
        pcx = S.SPEC['path_x']
        strips = []
        y = hz + 12
        while y < H:
            t = (y - hz) / (H - hz)
            hgt = 8 + 26 * t
            for _ in range(rng.integers(1, 4)):
                wid = (90 + 520 * t) * rng.uniform(0.3, 1.0)
                cx = pcx + rng.normal(0, 26 + 80 * t)
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
                split = int(sw_ * own.uniform(0.35, 0.65))
                strips.append({'img': (strip * sa[..., None]).astype(np.float32), 'x': cx - sw_ / 2, 'y': y - sh_ / 2,
                               'cx': cx, 'cy': y, 'b': bright, 'split': split,
                               'period': own.uniform(30, 60), 'phase': own.uniform(0, 2 * math.pi)})
            y += hgt * 0.65 + 4 + 16 * t * rng.uniform(0.4, 1.6)
        self.strips = strips

    def assign_breaks(self, ring_at, frames):
        """The strips nearest his paw break, as a front runs out from it at FRONT px a frame (with
        the rings' flattening), nearest first: each torn into two or three pieces that are pushed
        apart and away from his paw."""
        rng = np.random.default_rng(13)
        d = [math.hypot(s['cx'] - ring_at[0], (s['cy'] - ring_at[1]) / 0.45) for s in self.strips]
        draws = sorted(set(frames))
        for i in np.argsort(d)[:BREAKS]:
            s = self.strips[i]
            due = CONTACT + 1 + d[i] / FRONT
            s['break'] = next((f for f in draws if f >= due), None)
            s['spread'] = 14 + 40 * max(0.0, 1 - d[i] / 360)
            sw = s['img'].shape[1]
            cuts = sorted(rng.uniform(0.25, 0.75, 1 if sw < 90 else 2))
            edges = [0] + [int(c * sw) for c in cuts] + [sw]
            pieces = []
            for j in range(len(edges) - 1):
                x0, x1 = edges[j], edges[j + 1]
                img = s['img'][:, x0:x1].copy()
                hh = img.shape[0]
                # torn where it parted: a ragged edge a few px deep
                for side, cut in ((0, j > 0), (1, j < len(edges) - 2)):
                    if not cut:
                        continue
                    rag = (1 + 3 * rng.random(hh)).astype(int)
                    for y_ in range(hh):
                        if side == 0:
                            img[y_, :rag[y_]] = 0
                        else:
                            img[y_, img.shape[1] - rag[y_]:] = 0
                mid = s['x'] + (x0 + x1) / 2
                pieces.append({'img': img, 'x0': x0, 'dir': (mid - ring_at[0]) / max(abs(mid - ring_at[0]), 40.0),
                               'k': j - (len(edges) - 2) / 2, 'dy': float(rng.normal(0, 0.12))})
            s['pieces'] = pieces

    def path(self, f, moon_y):
        hz = S.SPEC['horizon']
        peak = hz + (hz - moon_y)  # her disc on the water, mirrored about the horizon: down as she rises
        ref_peak = hz + (hz - 240)  # where it was in the approved still
        out = np.zeros((H, W, 3), np.float32)
        for s in self.strips:
            env = (0.7 + 0.5 * math.exp(-((s['cy'] - peak) / 220) ** 2)) / (0.7 + 0.5 * math.exp(-((s['cy'] - ref_peak) / 220) ** 2))
            glint = 0.86 + 0.14 * math.sin(2 * math.pi * f / s['period'] + s['phase'])
            drift = 0.6 * math.sin(2 * math.pi * f / (s['period'] * 2.3) + s['phase'])
            b = s['b'] * env * glint
            br = s.get('break')
            if br is None or f < br:
                stamp(out, s['img'] * b, s['x'] + drift, s['y'])
                continue
            t = f - br
            dim = math.exp(-(f - CONTACT) / TAU) * max(0.0, min(1.0, (3347 - f) / 40))  # out by "still,"
            go = s['spread'] * (1 - math.exp(-t / 5))
            for pc in s['pieces']:  # pushed away from his paw, the pieces sliding apart
                stamp(out, pc['img'] * b * dim, s['x'] + pc['x0'] + go * (0.5 * pc['dir'] + 0.6 * pc['k']),
                      s['y'] + go * pc['dy'])
        out = cv2.GaussianBlur(out, (0, 0), 0.7)
        glow = cv2.GaussianBlur(cv2.resize(out, (W // 4, H // 4), interpolation=cv2.INTER_AREA), (0, 0), 7.5)
        glow = cv2.resize(glow, (W, H), interpolation=cv2.INTER_LINEAR) * 0.5
        return (out + glow) * np.array([1.0, 0.9, 0.72], np.float32)

    def pins(self, scene, pz):
        maps = self.maps(pz)
        for piece, src in PINS[pz['rig']]:
            scene = S.pins(scene, maps[piece][:2], [src], S.SPEC['pin_d_src'])
        return scene

    def render(self, st):
        f = st['f']
        big, alpha, front, shots = self.fox(f, f)
        pz = perform(f, f)
        lit0 = S.light_fox(big, alpha, under=st['under'])
        br_pm, br_a = self.bough(f)
        leaf = cv2.GaussianBlur(np.roll(np.roll(br_a, 12, 0), -8, 1), (0, 0), 5)  # its shadow on him
        lit = lit0 * (1 - 0.5 * leaf * (1 - front))[..., None]

        scene = self.plate.copy()
        mx, my = S.SPEC['moon_at'][0], st['moonY']
        mh, mw = self.moon_a.shape
        scene *= 1 - S.place_a(self.moon_a, mx - mw / 2, my - mh / 2)[..., None]
        stamp(scene, self.moon_pm, mx - mw / 2, my - mh / 2)
        stamp(scene, self.halo, mx - mw / 2 - self.halo_pad, my - mh / 2 - self.halo_pad)
        scene += self.path(f, my)

        live = [(f - r0, life) for (r0, life) in RINGS if 0 <= f - r0 < life]
        ring_at = self.ring_at if live else None
        rp, ra = S.reflection(lit, alpha, ring_at)
        scene = scene * (1 - ra[..., None]) + rp
        scene = scene * (1 - self.bank_dark[..., None]) + self.lap[..., None] * self.ring_col * 0.12
        radii = [34 + 4.0 * age for age, life in live]
        strengths = [0.6 * (1 - age / life) ** 1.2 for age, life in live]
        if live:
            li, dk = S.rings(self.ring_at, radii, strengths, front=False)
            scene = scene * (1 - 0.5 * dk[..., None]) + li[..., None] * self.ring_col

        ground = ANCHOR[pz['rig']]
        foot = pz['root'] @ np.array([*ground, 1.0])
        ao, cast = S.ground_shadows(alpha, (foot[0], foot[1]), S.SPEC['lean'])
        scene = S.over(scene, self.f_rgb * (1 - 0.6 * ao[..., None]), self.f_a)
        lit_s, alpha_s = S.submerge(lit, alpha)
        scene = S.over(scene, lit_s, alpha_s)
        scene = self.pins(scene, pz)
        if live:
            dry = (1 - alpha * (YY < S.SPEC['waterline']))[..., None]
            li, dk = S.rings(self.ring_at, radii, strengths, front=True)
            scene = scene * (1 - 0.5 * dk[..., None] * dry) + li[..., None] * self.ring_col * dry
        wet = S.contact(alpha)
        if wet:
            scene += S.meniscus(alpha)[..., None] * self.ring_col * 0.35
        scene = S.over(scene, self.n_rgb * (1 - 0.45 * cast[..., None]), self.n_a)
        scene = S.over(scene, br_pm / np.maximum(br_a[..., None], 1e-4), br_a)
        if front.any():  # his paw on the bough's stem, holding it down
            scene = S.over(scene, lit0, front)
        scene = S.over(scene, np.broadcast_to(self.reed_col, scene.shape), self.reed_a)
        col = S.srgb(scene[:, COL_X:COL_X + COL_W])
        # what the motion budget measures: where he is
        ys, xs = np.nonzero(alpha > 0.5)
        sig = [float(xs.mean()), float(ys.mean()), float(ys.min()), float(xs.max()), float(xs.min())]
        return (col * 255 + 0.5).astype(np.uint8), sig, {'shutter': shots, 'wet': bool(wet)}


def state(f):
    pz = perform(f, f)
    if f < CONTACT:
        under = 0.3 + 0.7 * smooth((f - 3101) / 20)
    else:
        under = math.exp(-(f - CONTACT) / TAU)
    u = min(max((f - F0) / (3376 - F0), 0), 1)
    pose = {k: (round(float(v), 3) if isinstance(v, (int, float)) else [round(v[0], 3), [round(x, 4) for x in v[1]]])
            for k, v in pz['pose'].items()}
    return {'f': f, 'rig': pz['rig'], 'lean': round(pz['lean'], 3), 'at': [round(pz['at'][0], 2), round(pz['at'][1], 2)],
            'pose': pose, 'under': round(under, 4), 'moonY': round(262 - 56 * (1 - (1 - u) ** 2), 2), 'v': 3}


def budget(sigs, frames):
    """Style bible §0: no stretch longer than about 2 s (48 frames) without a change in him of at
    least 3 px. Returns the windows that fail."""
    arr = np.array([sigs[f] for f in frames])
    fails = []
    for i in range(0, len(frames) - 48):
        win = arr[i:i + 49]
        move = float((win.max(0) - win.min(0)).max())
        if move < 3:
            fails.append((frames[i], frames[i + 48], round(move, 2)))
    merged = []
    for a, b, m in fails:
        if merged and a <= merged[-1][1]:
            merged[-1] = (merged[-1][0], b, min(merged[-1][2], m))
        else:
            merged.append((a, b, m))
    return merged


def jumps(sigs, frames):
    """The largest change in him from one shown frame to the next (px), and where: a cut between
    drawings shows here as a spike."""
    arr = np.array([sigs[f] for f in frames])
    d = np.abs(np.diff(arr, axis=0)).max(1)
    order = np.argsort(d)[::-1][:6]
    return [(frames[i], frames[i + 1], round(float(d[i]), 1)) for i in order]


def video(out, frames, draw_of):
    """The frames, each its drawing, piped once into a lossless master at 864x1080, then the two
    deliverables with the soundtrack's stretch under them."""
    master = out / 'pilot-master.mkv'
    p = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{COL_W}x{H}',
                          '-r', str(FPS), '-i', '-', '-vf', 'scale=864:1080:flags=lanczos', '-c:v', 'ffv1', str(master)],
                         stdin=subprocess.PIPE)
    last = None
    for f in frames:
        d = draw_of[f]
        if last is None or last[0] != d:
            last = (d, np.asarray(Image.open(out / 'drawings' / f'd{d}.png').convert('RGB')))
        p.stdin.write(last[1].tobytes())
    p.stdin.close()
    p.wait()
    t0, dur = frames[0] / FPS, len(frames) / FPS
    aud = ['-ss', f'{t0:.6f}', '-t', f'{dur:.6f}', '-i', str(SOUNDTRACK)]
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(master), *aud, '-map', '0:v', '-map', '1:a',
                    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
                    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-shortest', str(out / 'pilot.mp4')], check=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(master), *aud, '-map', '0:v', '-map', '1:a',
                    '-c:v', 'libvpx-vp9', '-crf', '31', '-b:v', '0', '-row-mt', '1', '-pix_fmt', 'yuv420p',
                    '-c:a', 'libopus', '-b:a', '128k', '-shortest', str(out / 'pilot.webm')], check=True)


def strip(out, keys, labels, name='strip.jpg', cols=7):
    tiles = []
    for f in keys:
        im = Image.open(out / 'drawings' / f'd{f}.png').convert('RGB').resize((288, 360), Image.LANCZOS)
        d = ImageDraw.Draw(im)
        d.rectangle([0, 0, 288, 22], fill=(18, 20, 26))
        d.text((6, 5), f'{f}  {labels.get(f, "")}', fill=(235, 229, 211))
        tiles.append(im)
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * 292, rows * 364), (18, 20, 26))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * 292 + 2, (i // cols) * 364 + 2))
    sheet.save(out / name, quality=88)


LABELS = {3080: 'hiding', 3104: 'the push', 3112: 'gathers', 3116: 'the lunge', 3124: 'sits up', 3150: 'the reach',
          3166: 'the fall', 3169: 'contact', 3194: 'held breath', 3266: 'the exhale', 3280: 'sinks', 3330: 'sunk'}
KEYS = (3080, 3098, 3104, 3108, 3112, 3114, 3116, 3117, 3120, 3124, 3136, 3150, 3162, 3166, 3168, 3169, 3172, 3194,
        3240, 3264, 3270, 3276, 3280, 3286, 3300, 3340, 3406)


def main():
    out = Path(sys.argv[1])
    a, b = F0, F1
    if '--frames' in sys.argv:
        a, b = (int(x) for x in sys.argv[sys.argv.index('--frames') + 1].split('-'))
    (out / 'drawings').mkdir(parents=True, exist_ok=True)
    frames = list(range(a, b + 1))
    draw_of = {f: drawing_of(f) for f in frames}
    draws = sorted(set(draw_of.values()))
    if '--only' in sys.argv:
        draws = [int(x) for x in sys.argv[sys.argv.index('--only') + 1].split(',')]
    stage = Stage()
    stage.assign_breaks(stage.ring_at, list(drawing_of(f) for f in range(F0, F1 + 1)))
    states, sigs, notes = {}, {}, {}
    sig_file = out / 'signatures.json'
    old = json.loads(sig_file.read_text()) if sig_file.exists() else {}
    for i, d in enumerate(draws):
        st = state(d)
        states[d] = st
        png = out / 'drawings' / f'd{d}.png'
        key = json.dumps(st, sort_keys=True)
        if png.exists() and old.get(str(d), {}).get('key') == key:
            sigs[d], notes[d] = old[str(d)]['sig'], old[str(d)].get('notes', {})
            continue
        img, sig, note = stage.render(st)
        Image.fromarray(img).save(png)
        sigs[d], notes[d] = sig, note
        old[str(d)] = {'key': key, 'sig': sig, 'notes': note}
        if i % 10 == 0:
            print(f'drawing {d} ({i + 1}/{len(draws)}) {st["rig"]} shutter {note["shutter"]}', flush=True)
            sig_file.write_text(json.dumps(old))
    sig_file.write_text(json.dumps(old))
    if '--only' in sys.argv:
        strip(out, draws, LABELS, name='only.jpg', cols=min(7, len(draws)))
        return
    shown = {f: sigs[draw_of[f]] for f in frames}
    fails = budget(shown, frames)
    big = jumps(shown, frames)
    sheet = {
        'shot': 'the reach and the touch (pilot), animated: reel 2',
        'frames': [a, b], 'fps': FPS, 'ones': [[r.start, r.stop - 1] for r in ONES], 'contact': CONTACT,
        'swaps': {'hide->touch': SWAPS[0], 'touch->sunk': SWAPS[1]}, 'land': LAND,
        'rigs': {k: v[0] for k, v in R.RIGS.items()}, 'anchors': ANCHOR, 'rings': RINGS, 'ringsAt': stage.ring_at,
        'bough': {'root': BOUGH_ROOT, 'length': BOUGH_LEN, 'rest': BOUGH_REST, 'free': BOUGH_FREE},
        'breaks': sorted((s['break'], round(s['cx']), round(s['cy'])) for s in stage.strips if s.get('break')),
        'drawings': len(draws),
        'frame': {str(f): draw_of[f] for f in frames},
        'states': {str(d): states[d] for d in draws},
        'shutter': {str(d): notes[d].get('shutter', 1) for d in draws},
        'motionBudget': {'rule': 'no 48-frame window with under 3 px change in him', 'fails': fails},
        'largestSteps': big,
    }
    (out / 'xsheet.json').write_text(json.dumps(sheet, indent=1))
    print('drawings', len(draws), 'budget fails', fails, 'largest steps', big, flush=True)
    strip(out, [d for d in KEYS if d in states], LABELS)
    if '--no-video' not in sys.argv:
        video(out, frames, draw_of)
        print('video written', flush=True)


if __name__ == '__main__':
    main()
