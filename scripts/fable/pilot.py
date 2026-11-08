"""The pilot's blocking reel (style bible §6, "block a reel of key poses on the soundtrack first"; §8):
the reach and the touch, film frames 3080-3406 (128.33-141.92 s on radio cut v1), on the stage
still.py builds, with mix 1 under it.

Blocking is the key poses, held and stepped, like a stop-motion blocking pass: hiding under the
branch, the reach (k4-reach-2), the touch (k3-touch-1, contact on 3169), sunk (k3-sunk-2, the paw
drawn back, as the artist chose). Within each pose the puppet moves as one piece about his hind feet:
afraid breaths, the press against the branch, the stretch of the reach, the tip of the fall, the
overshoot at contact, the held breath and its settle, the exhale, slow breaths. Around him: the
branch springs away, the moon rises, her path breaks at the touch strip by strip and dies on the
mix's decay (tau 2.5 s), the rings spread, her warm light leaves his face. The in-betweens and the
articulated parts (ears, head, the foreleg at its elbow pin) come next, timed from this reel.

On twos; on ones 3163-3175 (the paw's fall and the contact). Every drawing frame is rendered once.

Writes OUT/drawings/dNNNN.png (the 4:5 column, 1152x1440), OUT/xsheet.json (each frame's drawing
and that drawing's state, and the motion-budget check), OUT/pilot.mp4 and OUT/pilot.webm (864x1080
with the soundtrack), OUT/strip.jpg (the key drawings).

Usage: python -I scripts/fable/pilot.py OUT_DIR [--frames A-B] [--no-video]
"""
import json
import math
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import still as S  # noqa: E402

ROOT = S.ROOT
H, W, COL_X, COL_W = S.H, S.W, S.COL_X, S.COL_W
XX, YY = S.XX, S.YY
FPS = 24
F0, F1 = 3080, 3406
ONES = range(3163, 3176)  # the paw's fall and the contact, on ones
CONTACT = 3169
SOUNDTRACK = ROOT / 'audition' / 'fable' / 'mix' / 'soundtrack.wav'

POSES = {'hide': 'k3-branchpose-1', 'reach': 'k4-reach-2', 'touch': 'k3-touch-1', 'sunk': 'k3-sunk-2'}
# per pose, in flipped source px: where he meets the ground (the anchor), and his pins
ANCHOR_SRC = {'hide': (1700, 2510), 'reach': (2674, 2650), 'touch': (2674, 2650), 'sunk': (2740, 2759)}
AT = {'hide': (560, 978), 'reach': (846, 955), 'touch': (846, 955), 'sunk': (826, 955)}
PINS = {
    'hide': [(3100, 1440), (3660, 1840), (1600, 1440)],                       # shoulder, elbow, hip (the tail hides the hock)
    'reach': [(3400, 1180), (3260, 1720), (2560, 1800), (2240, 2440)],
    'touch': S.SPEC['pins_src'],
    'sunk': [(3140, 1200), (3100, 1880), (2560, 2080), (2240, 2600)],
}
RINGS = [(3169, 16), (3178, 24), (3190, 32), (3204, 40)]  # start frame, life in frames (bible §7)
BREAKS = 9                                                 # strips that break at the touch, nearest first
TAU = 2.5 * FPS                                            # the soundtrack's decay after the touch
BRANCH_SPRUNG = (-24.0, (496.0, 112.0))                    # still.py's branch: cv2 angle, centre in the matte


def smooth(u):
    u = min(max(u, 0.0), 1.0)
    return u * u * (3 - 2 * u)


def drawing_of(f):
    """The frame whose drawing frame f shows: its own on ones, else the even step of the twos."""
    return f if f in ONES else f - ((f - F0) % 2)


# ---------------------------------------------------------------------------------------------
# the exposure sheet: what each drawing holds

def lean_of(pose, f):
    if pose == 'hide':  # afraid: quick shallow breaths; the press against the branch at the push
        return 0.5 * math.sin(2 * math.pi * (f - F0) / 42) + 1.2 * math.exp(-((f - 3105) / 4.0) ** 2)
    if pose == 'reach':  # rising from the hide leaning back, out to his limit; the fall on ones
        fall = {3164: 3.7, 3165: 3.9, 3166: 4.6, 3167: 5.8, 3168: 7.4}
        return fall.get(f, -1.0 + 4.5 * smooth((f - 3123) / 40))
    if pose == 'touch':  # contact: 3 degrees over, settled by 3175; the held breath settles once
        over = {3169: 5.0, 3170: 4.1, 3171: 3.1, 3172: 2.4, 3173: 2.0, 3174: 1.85, 3175: 2.0}
        return over.get(f, 2.0 + 1.3 * smooth((f - 3198) / 42))  # his weight settles once, around where the near ear will turn (3215)
    # sunk: the exhale drops him from upright, then slow breaths (each breath out leans him forward;
    # the one under his head lowering goes with it, not against it), and his head lowers
    exhale = -1.5 + 2.5 * smooth((f - 3266) / 24)
    breath = -0.6 * math.sin(2 * math.pi * max(0, f - 3290) / 90) * smooth((f - 3290) / 20)
    return exhale + breath + 1.2 * smooth((f - 3310) / 48)


def branch_of(f):
    """The branch: over him until the push, then springing up and away (overshoot, settle), then
    swaying a little. Returns (s, sway): s 0 = over him, 1 = sprung."""
    if f < 3099:
        return 0.0, 0.15 * math.sin(2 * math.pi * (f - F0) / 30)
    t = (f - 3099) / FPS
    s = 1 - math.exp(-3.2 * t) * math.cos(4.8 * t)
    return s, 0.5 * math.sin(2 * math.pi * (f - 3099) / 96) * smooth((f - 3122) / 24)


def state(f):
    pose = 'hide' if f < 3123 else 'reach' if f < CONTACT else 'touch' if f < 3266 else 'sunk'
    s, sway = branch_of(f)
    if f < CONTACT:
        under = 0.3 + 0.7 * smooth((f - 3101) / 20)
    else:
        under = math.exp(-(f - CONTACT) / TAU)
    u = min(max((f - F0) / (3376 - F0), 0), 1)
    return {'f': f, 'pose': pose, 'lean': round(lean_of(pose, f), 3), 'at': AT[pose],
            'branch': round(s, 4), 'sway': round(sway, 3), 'under': round(under, 4),
            'moonY': round(262 - 56 * (1 - (1 - u) ** 2), 2)}


# ---------------------------------------------------------------------------------------------
# the pieces, made once

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
        self.fox = {k: S.fox_piece(v) for k, v in POSES.items()}
        (self.f_rgb, self.f_a), (self.n_rgb, self.n_a) = S.banks()
        self.bank_dark, self.lap = S.bank_reflection(self.n_a)
        self.reed_col, self.reed_a = S.reeds_layer()
        self.ring_col = S.lin(np.array([0.9, 0.86, 0.78], np.float32))
        self._moon()
        self._branch()
        self._strips()
        # where his paw meets the water in the touch, at rest: the rings' centre
        big, alpha, _ = S.place_fox(*self.fox['touch'], at=AT['touch'], lean=2.0, anchor_src=ANCHOR_SRC['touch'])
        span = S.contact(alpha)
        self.ring_at = ((span[0] + span[1]) / 2, S.SPEC['waterline'] + 1)

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

    def _branch(self):
        brg, bra = S.cutout(S.SPEC['branch'], key='dark', flip=True)
        ys, xs = np.nonzero(bra > 0.5)
        brg, bra = brg[ys.min():ys.max() + 1, xs.min():xs.max() + 1], bra[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        k = 620 / brg.shape[1]
        brg = cv2.resize(brg, None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
        bra = cv2.resize(bra, None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
        self.br_pm, self.br_a = S.lin(brg) * 0.25 * bra[..., None], bra
        self.br_c = (brg.shape[1] / 2, brg.shape[0] / 2)
        # its two ends, along its long axis; the cut end is the one that hangs lowest when sprung
        ys, xs = np.nonzero(bra > 0.5)
        pts = np.stack([xs, ys], 1).astype(np.float32)
        mean = pts.mean(0)
        u = np.linalg.svd(pts - mean, full_matrices=False)[2][0]
        proj = (pts - mean) @ u
        ends = [mean + u * proj.min(), mean + u * proj.max()]
        sprung = [self._branch_map(*BRANCH_SPRUNG) @ np.array([e[0], e[1], 1.0]) for e in ends]
        cut, leaf = (ends[0], ends[1]) if sprung[0][1] > sprung[1][1] else (ends[1], ends[0])
        # over him: the cut end in his raised paw, the leafy end over his back toward the upper left
        hold = np.array([1018.0, 708.0])
        want = np.array([440.0, 655.0]) - hold
        v = leaf - cut
        ang = math.degrees(math.atan2(v[1], v[0]) - math.atan2(want[1], want[0]))
        M = cv2.getRotationMatrix2D(self.br_c, ang, 1.0)
        centre = hold - (M[:, :2] @ (cut - np.array(self.br_c)))
        self.branch_hide = (ang, (float(centre[0]), float(centre[1])))

    def _branch_map(self, ang, centre):
        M = cv2.getRotationMatrix2D(self.br_c, ang, 1.0)
        M[:, 2] += [centre[0] - self.br_c[0], centre[1] - self.br_c[1]]
        return M

    def branch(self, s, sway):
        (a0, c0), (a1, c1) = self.branch_hide, BRANCH_SPRUNG
        ang = a0 + (a1 - a0) * s + sway
        lift = math.sin(math.pi * min(max(s, 0), 1)) * 60  # it springs up on an arc, not a slide
        cx = c0[0] + (c1[0] - c0[0]) * s
        cy = c0[1] + (c1[1] - c0[1]) * s - lift
        M = self._branch_map(ang, (cx, cy))
        pm = cv2.warpAffine(self.br_pm, M, (W, H), flags=cv2.INTER_CUBIC)
        a = np.clip(cv2.warpAffine(self.br_a, M, (W, H), flags=cv2.INTER_CUBIC), 0, 1)
        return pm, a

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
        """The strips nearest his paw break outward, nearest first, one per drawing from 3171."""
        d = [math.hypot(s['cx'] - ring_at[0], (s['cy'] - ring_at[1]) * 1.6) for s in self.strips]
        order = np.argsort(d)[:BREAKS]
        draws = [f for f in sorted(set(frames)) if f >= CONTACT + 2][:BREAKS]
        for rank, i in enumerate(order):
            s = self.strips[i]
            s['break'] = draws[rank] if rank < len(draws) else None
            s['spread'] = 18 + 34 * max(0.0, 1 - d[i] / 320)
            s['side'] = 1.0 if s['cx'] >= ring_at[0] else -1.0

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
            k = s['split']
            # the strip is pushed away from his paw and its two halves slide apart
            push = s['side'] * go * 0.5
            stamp(out, s['img'][:, :k] * b * dim, s['x'] + push - go * 0.5, s['y'] + 0.12 * go)
            stamp(out, s['img'][:, k:] * b * dim, s['x'] + k + push + go * 0.5, s['y'] - 0.08 * go)
        out = cv2.GaussianBlur(out, (0, 0), 0.7)
        glow = cv2.GaussianBlur(cv2.resize(out, (W // 4, H // 4), interpolation=cv2.INTER_AREA), (0, 0), 7.5)
        glow = cv2.resize(glow, (W, H), interpolation=cv2.INTER_LINEAR) * 0.5
        return (out + glow) * np.array([1.0, 0.9, 0.72], np.float32)

    def render(self, st):
        f, pose = st['f'], st['pose']
        L, A = self.fox[pose]
        big, alpha, M = S.place_fox(L, A, at=st['at'], lean=st['lean'], anchor_src=ANCHOR_SRC[pose])
        lit = S.light_fox(big, alpha, under=st['under'])
        br_pm, br_a = self.branch(st['branch'], st['sway'])
        leaf = cv2.GaussianBlur(np.roll(np.roll(br_a, 12, 0), -8, 1), (0, 0), 5)  # its shadow on him
        lit = lit * (1 - 0.5 * leaf)[..., None]

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

        ao, cast = S.ground_shadows(alpha, st['at'], st['lean'])
        scene = S.over(scene, self.f_rgb * (1 - 0.6 * ao[..., None]), self.f_a)
        lit_s, alpha_s = S.submerge(lit, alpha)
        scene = S.over(scene, lit_s, alpha_s)
        scene = S.pins(scene, M, PINS[pose], S.SPEC['pin_d_src'])
        if live:
            dry = (1 - alpha * (YY < S.SPEC['waterline']))[..., None]
            li, dk = S.rings(self.ring_at, radii, strengths, front=True)
            scene = scene * (1 - 0.5 * dk[..., None] * dry) + li[..., None] * self.ring_col * dry
        if pose == 'touch':
            scene += S.meniscus(alpha)[..., None] * self.ring_col * 0.35
        scene = S.over(scene, self.n_rgb * (1 - 0.45 * cast[..., None]), self.n_a)
        scene = S.over(scene, br_pm / np.maximum(br_a[..., None], 1e-4), br_a)
        scene = S.over(scene, np.broadcast_to(self.reed_col, scene.shape), self.reed_a)
        col = S.srgb(scene[:, COL_X:COL_X + COL_W])
        # what the motion budget measures: where he is
        ys, xs = np.nonzero(alpha > 0.5)
        sig = [float(xs.mean()), float(ys.mean()), float(ys.min()), float(xs.max()), float(xs.min())]
        return (col * 255 + 0.5).astype(np.uint8), sig


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


def strip(out, keys, labels):
    tiles = []
    for f in keys:
        im = Image.open(out / 'drawings' / f'd{f}.png').convert('RGB').resize((288, 360), Image.LANCZOS)
        d = ImageDraw.Draw(im)
        d.rectangle([0, 0, 288, 22], fill=(18, 20, 26))
        d.text((6, 5), f'{f}  {labels.get(f, "")}', fill=(235, 229, 211))
        tiles.append(im)
    cols = 7
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * 292, rows * 364), (18, 20, 26))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * 292 + 2, (i // cols) * 364 + 2))
    sheet.save(out / 'strip.jpg', quality=88)


def main():
    out = Path(sys.argv[1])
    a, b = F0, F1
    if '--frames' in sys.argv:
        a, b = (int(x) for x in sys.argv[sys.argv.index('--frames') + 1].split('-'))
    (out / 'drawings').mkdir(parents=True, exist_ok=True)
    frames = list(range(a, b + 1))
    draw_of = {f: drawing_of(f) for f in frames}
    draws = sorted(set(draw_of.values()))
    stage = Stage()
    stage.assign_breaks(stage.ring_at, list(drawing_of(f) for f in range(F0, F1 + 1)))
    states, sigs = {}, {}
    sig_file = out / 'signatures.json'
    old = json.loads(sig_file.read_text()) if sig_file.exists() else {}
    for i, d in enumerate(draws):
        st = state(d)
        states[d] = st
        png = out / 'drawings' / f'd{d}.png'
        key = json.dumps(st, sort_keys=True)
        if png.exists() and old.get(str(d), {}).get('key') == key:
            sigs[d] = old[str(d)]['sig']
            continue
        img, sig = stage.render(st)
        Image.fromarray(img).save(png)
        sigs[d] = sig
        old[str(d)] = {'key': key, 'sig': sig}
        if i % 10 == 0:
            print(f'drawing {d} ({i + 1}/{len(draws)}) {st["pose"]} lean {st["lean"]}', flush=True)
            sig_file.write_text(json.dumps(old))
    sig_file.write_text(json.dumps(old))
    fails = budget({f: sigs[draw_of[f]] for f in frames}, frames)
    sheet = {
        'shot': 'the reach and the touch (pilot), blocking reel',
        'frames': [a, b], 'fps': FPS, 'ones': [ONES.start, ONES.stop - 1], 'contact': CONTACT,
        'poses': POSES, 'anchorsSrc': ANCHOR_SRC, 'at': AT, 'pins': PINS, 'rings': RINGS,
        'ringsAt': stage.ring_at,
        'breaks': sorted((s['break'], round(s['cx']), round(s['cy'])) for s in stage.strips if s.get('break')),
        'drawings': len(draws),
        'frame': {str(f): draw_of[f] for f in frames},
        'states': {str(d): states[d] for d in draws},
        'motionBudget': {'rule': 'no 48-frame window with under 3 px change in him', 'fails': fails},
    }
    (out / 'xsheet.json').write_text(json.dumps(sheet, indent=1))
    print('drawings', len(draws), 'budget fails', fails, flush=True)
    keys = [d for d in (3080, 3098, 3104, 3110, 3122, 3124, 3144, 3162, 3166, 3168, 3169, 3172, 3175, 3194,
                        3230, 3264, 3266, 3290, 3330, 3370, 3406) if d in states]
    labels = {3080: 'hiding', 3104: 'the push', 3124: 'the reach', 3166: 'the fall', 3169: 'contact',
              3194: 'held breath', 3266: 'the exhale', 3330: 'sunk'}
    strip(out, keys, labels)
    if '--no-video' not in sys.argv:
        video(out, frames, draw_of)
        print('video written', flush=True)


if __name__ == '__main__':
    main()
