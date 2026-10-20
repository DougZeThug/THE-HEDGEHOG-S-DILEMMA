"""A small offline sampler for the woodland's score: Upright Piano KW (FreePats, CC0: a Kawai upright
in a living room, recorded at the player's head), played softly, as an old upright heard at the bench
(decisions 109–113 of docs/reviews/2026-10-woodland.md): each note in its place, its strings ringing
on while the pedal holds them, its mechanism where it can be heard, a small room of the samples' own
kind, one fault of its own; and, as a switch, the faint texture under it (a trace of bow in its
strings, a breath of air round them; the recording's crackle is `crackle`). Notes are events in
seconds; the render covers [t0, t1) of that time, so its last sample can fall exactly on a cut.

Its samples are a minor third apart in two velocity layers: each note is repitched from the nearest,
its bass to a piano's own stretch from where each sample was measured, its treble keeping its own
small mistuning (tuning.json, from tuning.py). No felt: a felt piano, its thump and its closing sweep,
are the white room's own (src/audio/Music.ts).
"""
import json
import math
import os
import re
from dataclasses import dataclass
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
        # (Its own voicing: a low-pass on some of the bass samples, as the library plays them; QA,
        # 2026-10-20: it was read and never applied.)
        out.append(Region(int(r['lokey']), int(r['hikey']), int(r['pitch_keycenter']), int(r.get('lovel', 0)),
                          int(r.get('hivel', 127)), loop, os.path.join(base, r['sample'].replace('\\', '/')),
                          float(r['cutoff']) if 'cutoff' in r else None))
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


def aligned_mid(x):
    """A stereo recording's two sides summed without their phase differences. At a fundamental the
    coincident pair in that living room can hear the room's field out of step (the C5 sample's sides
    are 15 dB apart there, and their plain sum loses 3.9 dB). Each moment and frequency keeps the two
    sides' mean power, and the phase of their sum weighted by their levels (the louder side leads,
    with no hard switch)."""
    nper, hop = 2048, 512
    _, _, Z = signal.stft(x.T, fs=SR, nperseg=nper, noverlap=nper - hop, boundary='even', padded=True)
    L, R = Z[0], Z[1]
    mag = np.sqrt((np.abs(L) ** 2 + np.abs(R) ** 2) / 2)
    ph = np.angle(L * np.abs(L) + R * np.abs(R))
    _, y = signal.istft(mag * np.exp(1j * ph), fs=SR, nperseg=nper, noverlap=nper - hop, boundary=True)
    return y[:len(x)].astype(np.float32)


def pan(midi):
    """A key's place as the player hears it (constant power, 1 a side at the centre): the bass a
    little left, the top a little right."""
    p = float(np.interp(midi, [41, 80], [-0.2, 0.15]))
    return math.cos((p + 1) * math.pi / 4) * math.sqrt(2), math.sin((p + 1) * math.pi / 4) * math.sqrt(2)


def ring(midi):
    """How long a string rings on when it is free (T60, s): long in the bass, short at the top."""
    return float(np.interp(midi, [48, 60, 72, 84], [14.0, 11.0, 8.0, 5.0]))


class Piano:
    def __init__(self, sfz, seed=7, fault=None):
        self.regions = parse_sfz(sfz)
        self.cache = {}
        self.rng = np.random.default_rng(seed)
        # A fault of its own (key -> cents): that key's second string a little off, a slow beat on its
        # long notes (somebody's piano, not a preset's wear).
        self.fault = fault or {}
        tj = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tuning.json')
        self.tuning = json.load(open(tj)) if os.path.exists(tj) else {}

    def region(self, midi, vel):
        """The sample for a key: the nearest of its layer (a repeat is the same string)."""
        layer = [r for r in self.regions if r.lovel <= vel <= r.hivel and os.path.exists(r.path)]
        own = [r for r in layer if r.lo <= midi <= r.hi]
        if not own:  # (no loud layer for this key: the soft one)
            layer = [r for r in self.regions if os.path.exists(r.path)]
            own = [r for r in layer if r.lo <= midi <= r.hi]
        return min(own, key=lambda r: abs(r.center - midi))

    def sample(self, r, need_s):
        """The region's sample at 48 kHz, looped (if it loops) to at least `need_s` seconds, as its
        mid (its two sides summed without their phase differences) and its side."""
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
        y = np.stack([aligned_mid(y), (y[:, 0] - y[:, 1]) / 2], -1).astype(np.float32)
        self.cache[key] = y
        return y

    def voice(self, n: Note, off: float):
        """One note from its onset to its release `off` (s after onset) and its ring after: one
        sample a key, a little louder or softer each time it is struck; its mid placed by pitch, its
        own side 24 dB down (the room gives the width: the sample's sides are its living room's)."""
        r = self.region(n.midi, n.vel)
        rel = 0.12 + 0.35 * np.clip((60 - n.midi) / 36, 0, 1)   # bass dampers are slower
        need = off + rel + 0.05
        x0 = self.sample(r, need)
        measured = self.tuning.get(os.path.basename(r.path), 0.0)
        # (The treble keeps its own small mistuning, as measured; the bass is brought to the stretch.)
        cents = 100 * (n.midi - r.center) + stretch(n.midi) - (measured if n.midi < 60 else 0.0)
        x = repitch(x0, cents)
        n_on = min(len(x), int((off + rel) * SR))
        y = x[:n_on].copy()
        if r.cutoff:  # (the library's own voicing for this sample)
            y = signal.sosfilt(signal.butter(2, r.cutoff, 'low', fs=SR, output='sos'), y, axis=0).astype(np.float32)
        # release: the damper falls at `off`
        k = int(off * SR)
        if k < len(y):
            tt = np.arange(len(y) - k) / SR
            y[k:] *= np.exp(-tt / (rel / 4.6))[:, None]
        # touch: soft playing is darker; the hammer's edge rounded over 4 ms
        g = (n.vel / 127.0) ** 1.8 * 10 ** (self.rng.uniform(-0.5, 0.5) / 20)
        sos = signal.butter(1, min(3200 + 60 * n.vel, SR * 0.45), 'low', fs=SR, output='sos')
        y = signal.sosfilt(sos, y, axis=0).astype(np.float32)
        a = int(0.004 * SR)
        y[:a] *= (0.2 + 0.8 * (0.5 - 0.5 * np.cos(np.linspace(0, np.pi, a))))[:, None]
        # its fault: the key's second string a few cents off, from 10 ms, 8 dB under
        if n.midi in self.fault:
            x2 = repitch(x0, cents + self.fault[n.midi])[:len(y)]
            d = int(0.010 * SR)
            y2 = np.zeros_like(y)
            y2[d:len(x2)] = x2[d:len(y)]
            y2[d:2 * d] *= np.linspace(0, 1, d)[:, None]   # (in over 10 ms, never a step)
            if k < len(y2):
                y2[k:] *= np.exp(-np.arange(len(y2) - k) / SR / (rel / 4.6))[:, None]
            y += signal.sosfilt(sos, y2, axis=0).astype(np.float32) * 10 ** (-8 / 20)
        mid, side = y[:, 0], y[:, 1] * 10 ** (-24 / 20)
        gl, gr = pan(n.midi)
        y = np.stack([gl * mid + side, gr * mid - side], -1).astype(np.float32)
        return y * g, k, rel


def loudest10(x):
    """A sound's loudest 10 ms (RMS): the level the mechanism's sounds are set by (decision 128)."""
    w = int(0.010 * SR)
    if len(x) <= w:
        return float(np.sqrt((x ** 2).mean())) + 1e-12
    return float(np.sqrt(np.convolve(x ** 2, np.ones(w) / w, 'valid').max())) + 1e-12


def modal(rng, modes, dur, noise=0.0):
    """An impulse (and a breath of noise) through damped resonators: wood and felt, not a click.
    modes: [(Hz, Q, gain)]. Its loudest 10 ms at 1."""
    n = int(dur * SR)
    x = np.zeros(n)
    x[0] = 1.0
    if noise:
        x += rng.standard_normal(n) * noise * np.exp(-np.arange(n) / (0.003 * SR))
    out = np.zeros(n)
    for f, q, g in modes:
        b, a = signal.iirpeak(f, q, fs=SR)
        out += signal.lfilter(b, a, x) * g
    out *= np.exp(-np.arange(n) / (dur / 4 * SR))
    return out / loudest10(out)


def knock(rng):
    """The key bottoming in its bed: 6–12 ms of wood (about 650, 1250, 2300 Hz)."""
    jit = lambda f: f * rng.uniform(0.93, 1.07)
    return modal(rng, [(jit(650), rng.uniform(12, 18), 1.0), (jit(1250), rng.uniform(12, 18), 0.7), (jit(2300), 15, 0.35)], rng.uniform(0.006, 0.012), 0.3)


def pedal_up(rng):
    """The dampers settling on the strings: a felt brush, 200 Hz–2 kHz, 60–120 ms (its loudest 10
    ms at 1)."""
    n = int(rng.uniform(0.06, 0.12) * SR)
    x = rng.standard_normal(n)
    x = signal.sosfilt(signal.butter(2, [200, 2000], 'band', fs=SR, output='sos'), x)
    x *= np.sin(np.linspace(0, np.pi, n)) ** 2
    return x / loudest10(x)


def room(seed=3):
    """A small room heard from the bench, as the samples were (a coincident pair at the player's
    head): each reflection reaches both sides at once, a little louder on its own side, so the two
    sides comb alike and a note keeps its place (and a phone's mono loses nothing). Each wall takes
    some of the top. The floor, the wall behind the piano, the ceiling, the side walls, the wall behind
    the bench, then a few later ones; a tail from 15 ms, 0.35 s under 1 kHz and 0.25 s over, 15 dB
    under the direct sound and a little wider than it. For the dry sound's mid; no direct sound."""
    rng = np.random.default_rng(seed)
    n = int(0.6 * SR)
    ir = np.zeros((n, 2))
    # (ms after the direct sound, dB, from (degrees, + left), the wall's top)
    refl = [(2.8, -15, 0, 9000), (4.1, -17, 15, 7000), (5.6, -18, -10, 6000), (6.7, -19, 75, 5000),
            (8.9, -20, -80, 5000), (11.8, -21, 180, 4000), (13.4, -23, 40, 3500), (15.9, -24, -55, 3000),
            (18.2, -25, 120, 3000)]
    for ms, dbv, ang, fc in refl:
        i = int(round(ms / 1000 * SR))
        th = math.radians(ang)
        imp = np.zeros(n - i)
        imp[0] = 10 ** (dbv / 20)
        imp = signal.sosfilt(signal.butter(1, fc, 'low', fs=SR, output='sos'), imp)
        ir[i:, 0] += (0.5 + 0.5 * math.cos(th - math.pi / 4)) * imp
        ir[i:, 1] += (0.5 + 0.5 * math.cos(th + math.pi / 4)) * imp
    t = np.arange(n) / SR
    noise = rng.standard_normal((n, 2))

    def tail(x):
        lo = signal.sosfilt(signal.butter(2, 1000, 'low', fs=SR, output='sos'), x) * np.exp(-6.91 * t / 0.35)
        hi = signal.sosfilt(signal.butter(2, 1000, 'high', fs=SR, output='sos'), x) * np.exp(-6.91 * t / 0.25)
        return (lo + hi) * np.clip((t - 0.015) / 0.01, 0, 1)
    m, s = tail(noise[:, 0]), tail(noise[:, 1])
    m /= np.sqrt((m ** 2).sum())
    s *= 10 ** (-4 / 20) / np.sqrt((s ** 2).sum())
    tl = np.stack([m + s, m - s], -1)
    tl *= 10 ** (-15 / 20) / np.sqrt((tl ** 2).sum(0).mean())
    return ir + tl


def partials(y, f0, lowest=250.0):
    """A note's own partials near 1, 2 and 3 times its pitch (none under `lowest`), found in its first
    half second: [(Hz, amplitude re its strongest)], lowest first."""
    mono = y.mean(1) if y.ndim == 2 else y
    seg = mono[int(0.05 * SR):int(0.55 * SR)]
    if len(seg) < 4096:
        return []
    spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg))))
    fr = np.fft.rfftfreq(len(seg), 1 / SR)
    out = []
    for k in (1, 2, 3):
        fk = f0 * k
        if fk < lowest:
            continue
        sel = (fr > fk * 0.985) & (fr < fk * 1.015)
        if not sel.any():
            continue
        i = int(np.argmax(spec * sel))
        f = fr[i]
        if 0 < i < len(spec) - 1:  # (between bins: the peak's own frequency)
            a_, b_, c_ = np.log(spec[i - 1:i + 2] + 1e-12)
            f += 0.5 * (a_ - c_) / (a_ - 2 * b_ + c_) * (fr[1] - fr[0])
        out.append((float(f), float(spec[i] / (spec.max() + 1e-12))))
    return out


def halo(y, f0, start, until, level, t60, rel=0.1, at=2.0, seed=0, bow_db=None, air_db=None, fault=None):
    """The strings left free by the pedal, ringing on with a note (decisions 111, 125): its own
    partials, each a unison's three strings, one carrying it and two quieter a twentieth to a tenth
    of a hertz from it, all in step as it is struck, so the ring only falls through a ring of four
    seconds (it never swells back); `fault` (cents) puts a key's own fault in its second string, so
    that key's ring beats and no other's does. It rises as the note's own sound falls, rings at the
    strings' slower rate while the pedal is down, then is stopped by the dampers. `level`: what
    its lowest partial's band holds `at` seconds in, in dB re that band's peak over the first 0.3 s
    (the halo makes up what the note's own sound lacks, and is never less than 8 dB under that).
    Returns the ring (mono) and, with `bow_db` or `air_db`, the texture in it (decision 113): a trace
    of bow, a stick-slip rasp at the string's period rung through its partials, placed with it; and a
    breath of air round each partial, wide. Each is that many dB under the note's whole sound (its own
    and its ring) as it falls: it never rises once the note is struck, and is cut with it."""
    rng = np.random.default_rng(seed)
    n = int((until - start + rel) * SR)
    parts = partials(y, f0)
    if n <= 0 or not parts:
        return np.zeros(max(n, 0)), None
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f, amp in parts:
        phase = rng.uniform(0, 2 * np.pi)
        second = f * (2 ** (fault / 1200) - 1) if fault else rng.uniform(0.05, 0.11)
        for a_, d in ((1.0, 0.0), (0.4, second), (0.2, -rng.uniform(0.03, 0.08))):
            out += amp * a_ * np.sin(2 * np.pi * (f + d) * t + phase)
    # (It blooms within a few hundredths of a second of the strike, under the note's own attack: a
    # slower bloom swelled the held note back up in the looks, which begin as it is struck.)
    env = (1 - np.exp(-t / 0.05)) * np.exp(-6.91 * t / t60)
    end = int((until - start) * SR)
    if end < n:
        env[end:] *= np.exp(-np.arange(n - end) / SR / (rel / 4.6))
    out *= env
    fk, amp = parts[0]
    mono = y.mean(1) if y.ndim == 2 else y
    band = signal.sosfilt(signal.butter(2, [fk * 0.97, fk * 1.03], 'band', fs=SR, output='sos'), mono[:int((at + 0.3) * SR)])
    w = int(0.05 * SR)
    pk = max(float(np.sqrt((band[j:j + w] ** 2).mean())) for j in range(0, int(0.3 * SR), w))
    own = band[int((at - 0.25) * SR):int((at + 0.25) * SR)]
    own_p = float((own ** 2).mean()) if len(own) else 0.0
    want = (pk * 10 ** (level / 20)) ** 2
    need = math.sqrt(max(want - own_p, want * 10 ** (-8 / 10)))
    e_at = (1 - math.exp(-at / 0.05)) * math.exp(-6.91 * at / t60)
    out *= need / (amp * 1.0954 / math.sqrt(2) * e_at + 1e-12)   # (1.0954: the three strings' power)
    if bow_db is None and air_db is None:
        return out, None
    # the note's whole sound as it falls (its peak in the attack, then never rising)
    whole = out.copy()
    m_ = min(n, len(mono))
    whole[:m_] += mono[:m_]
    w = int(0.05 * SR)
    fall = np.sqrt(np.convolve(whole ** 2, np.ones(w) / w, 'same'))
    k0 = int(np.argmax(fall[:int(0.1 * SR)]))
    fall[k0:] = np.minimum.accumulate(fall[k0:])
    fall[:k0] = fall[k0] * np.arange(k0) / max(k0, 1)
    tex = np.zeros((n, 2))
    # (nothing of it held under 400 Hz: no texture in the left hand's register)
    high = [(f, a_) for f, a_ in parts if f >= 400.0]
    if not high:
        return out, None
    if bow_db is not None:
        # the bow's slips, at the string's period, a little uneven in time and strength, and its hair
        per = SR / f0
        gaps = per * (1 + 0.02 * rng.standard_normal(int(n / per) + 2))
        pos = np.cumsum(gaps).astype(int)
        pos = pos[pos < n]
        exc = np.zeros(n)
        exc[pos] = rng.lognormal(0, 0.5, len(pos))
        exc += 0.15 * exc.std() * rng.standard_normal(n)
        bow = np.zeros(n)
        for f, a_ in high:
            b, a = signal.iirpeak(f, 40, fs=SR)
            bow += a_ * signal.lfilter(b, a, exc)
        bow *= fall * 10 ** (bow_db / 20) / (float(np.sqrt((bow ** 2).mean())) + 1e-12)
        tex += bow[:, None]
    if air_db is not None:
        air = np.zeros((n, 2))
        for f, a_ in high:
            b, a = signal.iirpeak(f, f / 12.0, fs=SR)   # (about 12 Hz wide)
            for c in range(2):   # (each side its own: air, not a width)
                air[:, c] += a_ * signal.lfilter(b, a, rng.standard_normal(n))
        air *= fall[:, None] * 10 ** (air_db / 20) / (float(np.sqrt((air ** 2).mean(0).mean())) + 1e-12)
        tex += air
    return out, tex


def render(piano, notes, pedal, t0, t1, wet=1.0, mech=1.0, halo_db=-28.0, texture=False, texture_db=0.0, quiet=(), seed=11, info=None):
    """[t0, t1) of the performance: notes held by the keys or the pedal (`pedal`: [(down, up)]), the
    strings ringing on while the pedal holds them, the mechanism (the key's wood, the pedal), the
    room; with `texture`, the trace of bow and the breath of air in the ringing strings. Nothing of
    the mechanism sounds inside a `quiet` window (the picture's moments), nor at the last pedal
    change. `info`, if a dict, is given the melody's median attack (`attack`, RMS over its first 40
    ms) and each mechanism sound (`mechanism`: [(s, kind)]). The render's last sample is t1."""
    rng = np.random.default_rng(seed)
    tail = 3.0
    out = np.zeros((int((t1 - t0 + tail) * SR), 2), np.float32)
    mech_out = np.zeros_like(out)
    hush = lambda tt: any(a <= tt < b for a, b in quiet)
    events = []

    def held_until(n):
        end = n.t + n.dur
        for d, u in pedal:
            if d <= end < u:
                return u
        return end

    def add(buf, y, i):
        j0, j1 = max(0, i), min(len(buf), i + len(y))
        if j1 > j0:
            buf[j0:j1] += y[j0 - i:j1 - i]

    attacks = []
    for n in notes:
        if n.t >= t1 + tail:
            continue
        off = held_until(n) - n.t
        y, k, rel = piano.voice(n, off)
        i = int(round((n.t - t0) * SR))
        add(out, y, i)
        att = float(np.sqrt((y[:int(0.04 * SR)] ** 2).mean()))
        if n.hand == 'r':
            attacks.append(att)
        if halo_db is not None:
            f0 = 440 * 2 ** ((n.midi - 69) / 12)
            # (The texture only in the melody's strings: a bass note's, set against its whole sound,
            # crowded into its one or two upper partials, under both looks: decision 126.)
            tx = texture and n.hand == 'r'
            h, tex = halo(y, f0, n.t, held_until(n), halo_db, ring(n.midi), seed=int(n.t * 1000) + n.midi,
                          bow_db=-14.0 + texture_db if tx else None, air_db=-14.0 + texture_db if tx else None,
                          fault=piano.fault.get(n.midi))
            gl, gr = pan(n.midi)
            add(out, np.stack([h * gl, h * gr], -1).astype(np.float32), i)
            if tex is not None:
                add(out, (tex * np.array([[gl, gr]])).astype(np.float32), i)
        # the key in its bed, 10–15 ms before the string (one for a left-hand chord: the bass), its
        # loudest 10 ms 38 dB under the note's attack (decision 128)
        if mech and not (n.hand == 'l' and n.midi >= 60):
            lead = rng.uniform(0.010, 0.015)
            m = knock(rng) * att * 10 ** ((-36 if n.hand == 'l' else -38 + rng.uniform(-2.5, 2.5)) / 20) * mech
            if not hush(n.t) and not hush(n.t - lead) and t0 <= n.t - lead < t1:
                i2 = i - int(lead * SR)
                add(mech_out, np.stack([m, m], -1).astype(np.float32), i2)
                events.append((n.t - lead, 'key'))
    if mech and attacks:
        ref = float(np.median(attacks))
        ups = [u for d, u in pedal]
        for j, (d, u) in enumerate(pedal):
            # The dampers settling at each change (the cadence's quick V–I change light); the last
            # change, the V chord's in the stillness before the cut, silent. (No thump as the pedal
            # goes down: it was heard nowhere: decision 128.)
            if j >= len(pedal) - 2 or hush(u) or not (t0 <= u < t1):
                continue
            quick = j + 1 < len(pedal) and pedal[j + 1][0] - d < 1.0
            # (Where the pedal lifts a little early, a breath, the brush is heard in the clear.)
            breath = j + 1 < len(pedal) and pedal[j + 1][0] - u > 0.12
            lvl = (-24 if breath else -38 if quick else -32) + rng.uniform(-2.5, 2.5)
            m = pedal_up(rng) * ref * 10 ** (lvl / 20) * mech
            add(mech_out, np.stack([m, m], -1).astype(np.float32), int(round((u - t0) * SR)))
            events.append((u, 'pedal up'))
    if info is not None:
        info['attack'] = float(np.median(attacks)) if attacks else 0.0
        info['mechanism'] = sorted(events)
    dry = out + mech_out
    ir = room()
    mid = dry.mean(1)
    wetsig = np.stack([signal.fftconvolve(mid, ir[:, c])[:len(dry)] for c in range(2)], -1).astype(np.float32)
    mix = dry + wetsig * wet
    mix = signal.sosfilt(signal.butter(2, 32, 'high', fs=SR, output='sos'), mix, axis=0).astype(np.float32)
    return mix[:int(round((t1 - t0) * SR))]


def crackle(t0, t1, level, quiet=(), clear=1.0, rate=2.0, seed=19, never=()):
    """A worn recording's crackle (decisions 113, 129): ticks at random, about `rate` a second (never
    periodic, never closer than 30 ms), 1–2 ms of 300 Hz–2.5 kHz, in both ears a little to one side;
    at their median `level` (RMS over the tick), within ±1.5 dB of it and never 2 dB over. None at
    all inside a `never` window (the looks), none above its median inside a `quiet` one, none in the
    last `clear` seconds (its stop is not a needle lifting). Returns the signal and its ticks [(s, dB
    re median)]."""
    rng = np.random.default_rng(seed)
    n = int(round((t1 - t0) * SR))
    out = np.zeros((n, 2))
    band = signal.butter(2, [300, 2500], 'band', fs=SR, output='sos')
    ticks = []
    t = t0
    while True:
        t += max(0.030, rng.exponential(1 / rate))
        if t >= t1 - clear:
            break
        db = float(np.clip(rng.normal(0, 1.5), -4, 2))
        bal = rng.uniform(-6, 6)
        L = int(rng.uniform(0.001, 0.002) * SR)
        burst = np.concatenate([rng.standard_normal(L) * np.hanning(L), np.zeros(int(0.002 * SR))])
        if any(a <= t < b for a, b in never):
            continue
        if any(a <= t < b for a, b in quiet):
            db = min(db, 0.0)
        burst = signal.sosfilt(band, burst)
        burst *= level * 10 ** (db / 20) / (float(np.sqrt((burst[:L] ** 2).mean())) + 1e-12)
        i = int(round((t - t0) * SR))
        j = min(n, i + len(burst))
        gl, gr = 10 ** (min(0.0, -bal) / 20), 10 ** (min(0.0, bal) / 20)
        out[i:j, 0] += burst[:j - i] * gl
        out[i:j, 1] += burst[:j - i] * gr
        ticks.append((t, db))
    return out.astype(np.float32), ticks


def hiss(t0, t1, level, seed=23):
    """A soft tape hiss, for the artist to hear (decision 127): pink, from 300 Hz, rolled off above
    4 kHz, each side its own, steady at `level` (RMS)."""
    rng = np.random.default_rng(seed)
    n = int(round((t1 - t0) * SR))
    x = rng.standard_normal((n + 4800, 2))
    b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
    a = [1, -2.494956002, 2.017265875, -0.522189400]
    x = signal.lfilter(b, a, x, axis=0)[4800:]
    x = signal.sosfilt(signal.butter(2, 300, 'high', fs=SR, output='sos'), x, axis=0)
    x = signal.sosfilt(signal.butter(2, 4000, 'low', fs=SR, output='sos'), x, axis=0)
    return (x * level / (np.sqrt((x ** 2).mean()) + 1e-12)).astype(np.float32)
