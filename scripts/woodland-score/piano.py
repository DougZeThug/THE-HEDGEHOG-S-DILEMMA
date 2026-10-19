"""A small offline sampler for the woodland's score: Upright Piano KW (FreePats, CC0: a Kawai upright
in a living room, recorded at the player's head), played softly, with its pedal and a little of its
mechanism, in a small room of its own. Notes are events in seconds; the render covers [t0, t1) of
that time, so its last sample can fall exactly on a cut.

Its samples are a minor third apart in two velocity layers: each note is repitched from the nearest
(and a repeat may be voiced from the next nearest, so that it isn't a copy), to a piano's own stretch
from where each sample was measured (tuning.json, from tuning.py). `felt` 1 damps it toward a felt
piano; the score is played as the upright is (0): a felt piano is the white room's own (src/audio/
Music.ts), and its warmth is what a phone's speaker loses first (the reviews of 2026-10-19).
"""
import json
import math
import os
import re
from dataclasses import dataclass, field
from fractions import Fraction

import numpy as np
import soundfile as sf
from scipy import signal

SR = 48000


@dataclass
class Note:
    t: float          # onset (s)
    midi: int
    vel: int          # 1..127
    dur: float        # key held (s); the pedal may hold it longer
    hand: str = 'r'
    alt: int = 0      # 1: voiced from the neighbouring sample (a repeat that isn't a copy)


@dataclass
class Region:
    lo: int
    hi: int
    center: int
    lovel: int
    hivel: int
    loop: tuple | None
    path: str
    cutoff: float | None = None


def parse_sfz(path):
    """The library's map: <group> opcodes carry to its <region>s."""
    text = open(path).read()
    text = re.sub(r'//.*', '', text)
    regions, group, cur = [], {}, None
    for tok in re.findall(r'<\w+>|\S+=\S+', text):
        if tok == '<group>':
            group, cur = {}, None
        elif tok == '<region>':
            cur = dict(group)
            regions.append(cur)
        elif tok.startswith('<'):
            cur = None
        else:
            k, v = tok.split('=', 1)
            (cur if cur is not None else group)[k] = v
    out = []
    base = os.path.dirname(path)
    for r in regions:
        if 'key' in r:
            r.setdefault('lokey', r['key']); r.setdefault('hikey', r['key']); r.setdefault('pitch_keycenter', r['key'])
        loop = None
        if r.get('loop_mode', 'no_loop') == 'loop_continuous' and 'loop_start' in r:
            loop = (int(r['loop_start']), int(r['loop_end']))
        out.append(Region(int(r['lokey']), int(r['hikey']), int(r['pitch_keycenter']), int(r.get('lovel', 0)),
                          int(r.get('hivel', 127)), loop, os.path.join(base, r['sample'].replace('\\', '/'))))
    return out


# A piano's own stretch (cents from equal temperament by key): its bass a little flat, its top a
# little sharp, so its partials agree. Each sample is brought to it from where it was measured
# (tuning.json: the living-room upright's bass was flatter than a tuner would leave it).
STRETCH = [(24, -25.0), (36, -8.0), (48, -2.0), (60, 0.0), (72, 1.0), (84, 5.0), (96, 15.0), (108, 30.0)]


def stretch(m):
    xs, ys = zip(*STRETCH)
    return float(np.interp(m, xs, ys))


def repitch(x, cents):
    """x raised by cents (lowered if negative), resampled once."""
    if abs(cents) < 0.5:
        return x
    r = Fraction(2 ** (-cents / 1200)).limit_denominator(1200)
    return signal.resample_poly(x, r.numerator, r.denominator, axis=0).astype(np.float32)


class Piano:
    def __init__(self, sfz, seed=7):
        self.regions = parse_sfz(sfz)
        self.cache = {}
        self.matched = {}
        self.rng = np.random.default_rng(seed)
        tj = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tuning.json')
        self.tuning = json.load(open(tj)) if os.path.exists(tj) else {}

    def region(self, midi, vel, alt=0):
        """The sample for a key: its own (alt 0), or the next nearest of the same layer (alt 1), so
        that a repeated note is a different string's recording, a few semitones repitched."""
        layer = [r for r in self.regions if r.lovel <= vel <= r.hivel and os.path.exists(r.path)]
        own = [r for r in layer if r.lo <= midi <= r.hi]
        if not own:  # (no loud layer for this key: the soft one)
            layer = [r for r in self.regions if os.path.exists(r.path)]
            own = [r for r in layer if r.lo <= midi <= r.hi]
        best = min(own, key=lambda r: abs(r.center - midi))
        if not alt:
            return best
        others = sorted({r.center: r for r in layer if r.center != best.center and r.lovel == best.lovel}.values(), key=lambda r: abs(r.center - midi))
        return others[0] if others and abs(others[0].center - midi) <= 4 else best

    def sample(self, r, need_s):
        """The region's sample at 48 kHz, looped (if it loops) to at least `need_s` seconds."""
        key = (r.path, round(need_s, 1) if r.loop else 0)
        if key in self.cache:
            return self.cache[key]
        x, sr = sf.read(r.path, dtype='float32', always_2d=True)
        if r.loop and len(x) < need_s * sr:
            a, b = r.loop
            body, tail = x[:a], x[a:b]
            reps = int(math.ceil((need_s * sr - a) / max(1, b - a))) + 1
            x = np.concatenate([body] + [tail] * reps)
        y = signal.resample_poly(x, 160, 147, axis=0).astype(np.float32)  # 44.1 -> 48 kHz
        self.cache[key] = y
        return y

    def match(self, n: Note):
        """The gain that brings a key's alternate sample to its own sample's level (each sample was
        normalised on its own: a repeat voiced from its neighbour was up to 2–3 dB louder)."""
        key = (n.midi, n.vel > 80)
        if key not in self.matched:
            def level(alt):
                r = self.region(n.midi, n.vel, alt)
                x = repitch(self.sample(r, 1.0), 100 * (n.midi - r.center))
                seg = x[int(0.02 * SR):int(0.6 * SR)]
                return float(np.sqrt((seg ** 2).mean()) + 1e-9)
            self.matched[key] = level(0) / level(1)
        return self.matched[key]

    def voice(self, n: Note, off: float, felt=1.0):
        """One note from its onset to its release `off` (s after onset) and its ring after."""
        r = self.region(n.midi, n.vel, n.alt)
        rel = 0.12 + 0.35 * np.clip((60 - n.midi) / 36, 0, 1)   # bass dampers are slower
        need = off + rel + 0.05
        x = self.sample(r, need)
        measured = self.tuning.get(os.path.basename(r.path), 0.0)
        x = repitch(x, 100 * (n.midi - r.center) + stretch(n.midi) - measured)
        n_on = min(len(x), int((off + rel) * SR))
        y = x[:n_on].copy()
        if r.cutoff:  # (the library's own voicing for this sample)
            y = signal.sosfilt(signal.butter(2, r.cutoff, 'low', fs=SR, output='sos'), y, axis=0).astype(np.float32)
        # release: the damper falls at `off`
        k = int(off * SR)
        if k < len(y):
            tt = np.arange(len(y) - k) / SR
            y[k:] *= np.exp(-tt / (rel / 4.6))[:, None]
        # touch: soft playing is darker, and felt darker still; the attack's edge rounded
        g = (n.vel / 127.0) ** 1.8 * (self.match(n) if n.alt else 1.0)
        # (felt 1: damped toward a felt piano; 0: the upright as it is, only soft playing's darkening)
        fc = (1700 + 22 * n.vel) if felt >= 1 else (3200 + 60 * n.vel)
        sos = signal.butter(2 if felt >= 1 else 1, min(fc, SR * 0.45), 'low', fs=SR, output='sos')
        y = signal.sosfilt(sos, y, axis=0).astype(np.float32)
        a = int(0.007 * SR)
        y[:a] *= (0.35 + 0.65 * (0.5 - 0.5 * np.cos(np.linspace(0, np.pi, a))))[:, None]
        # the felt's own thump, under the note
        th = int(0.03 * SR)
        noise = self.rng.standard_normal((th, 2)).astype(np.float32)
        noise = signal.sosfilt(signal.butter(2, 420, 'low', fs=SR, output='sos'), noise, axis=0)
        noise *= np.exp(-np.arange(th) / (0.008 * SR))[:, None] * 0.05 * felt
        y[:th] += noise * float(np.abs(y).max() + 1e-6)
        return y * g, k, rel


def mechanism(rng, kind, level):
    """The instrument's own small sounds: a key's wood, a damper settling, the pedal."""
    if kind == 'key':
        n, lo, hi, tau = int(0.012 * SR), 900, 3200, 0.003
    elif kind == 'damper':
        n, lo, hi, tau = int(0.05 * SR), 150, 1200, 0.012
    else:  # pedal
        n, lo, hi, tau = int(0.14 * SR), 60, 2200, 0.04
    x = rng.standard_normal((n, 2)).astype(np.float32)
    x = signal.sosfilt(signal.butter(2, [lo, hi], 'band', fs=SR, output='sos'), x, axis=0)
    x *= np.exp(-np.arange(n) / (tau * SR))[:, None]
    return x / (np.abs(x).max() + 1e-9) * level


def room(seconds=0.55, seed=3):
    """A small, soft room (a house's): early reflections and a short diffuse tail."""
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    ir = rng.standard_normal((n, 2)).astype(np.float32) * np.exp(-t / (seconds / 6.9))[:, None]
    ir = signal.sosfilt(signal.butter(1, 3500, 'low', fs=SR, output='sos'), ir, axis=0)
    for ms, g in ((7, 0.5), (11, 0.4), (17, 0.3), (23, 0.22), (31, 0.16)):
        i = int(ms / 1000 * SR)
        ir[i, 0] += g
        ir[i + int(0.0007 * SR), 1] += g * 0.9
    ir[:int(0.003 * SR)] = 0
    return ir / np.sqrt((ir ** 2).sum(0, keepdims=True))


def render(piano, notes, pedal, t0, t1, wet=0.16, felt=1.0, mech=1.0, seed=11):
    """[t0, t1) of the performance: notes held by the keys or the pedal (`pedal`: [(down, up)]),
    mechanism, the room. The render's last sample is t1 (nothing after it)."""
    rng = np.random.default_rng(seed)
    tail = 3.0
    out = np.zeros((int((t1 - t0 + tail) * SR), 2), np.float32)

    def held_until(n):
        end = n.t + n.dur
        for d, u in pedal:
            if d <= end < u:
                return u
        return end

    for n in notes:
        if n.t >= t1 + tail:
            continue
        off = held_until(n) - n.t
        y, k, rel = piano.voice(n, off, felt)
        i = int(round((n.t - t0) * SR))
        j0, j1 = max(0, i), min(len(out), i + len(y))
        if j1 > j0:
            out[j0:j1] += y[j0 - i:j1 - i]
        if mech:
            m = mechanism(rng, 'key', 0.0025 * mech * (n.vel / 64))
            if 0 <= i < len(out) - len(m):
                out[i:i + len(m)] += m
            e = i + k
            m = mechanism(rng, 'damper', 0.0018 * mech)
            if 0 <= e < len(out) - len(m):
                out[e:e + len(m)] += m
    if mech:
        for d, u in pedal:
            for tt, lv in ((d, 0.003), (u, 0.0022)):
                i = int(round((tt - t0) * SR))
                m = mechanism(rng, 'pedal', lv * mech)
                if 0 <= i < len(out) - len(m):
                    out[i:i + len(m)] += m
    ir = room()
    wetsig = np.stack([signal.fftconvolve(out[:, c], ir[:, c])[:len(out)] for c in range(2)], -1).astype(np.float32)
    mix = out * (1 - wet) + wetsig * wet
    mix = signal.sosfilt(signal.butter(2, 32, 'high', fs=SR, output='sos'), mix, axis=0).astype(np.float32)
    return mix[:int(round((t1 - t0) * SR))]


def declick(x, ms=4):
    k = int(ms / 1000 * SR)
    x = x.copy()
    x[-k:] *= np.linspace(1, 0, k)[:, None] ** 2
    return x
