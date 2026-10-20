"""The soundtrack of "Almost": the kitchen at night, and the small sounds of felt on wood.

    python3 scripts/almost/sound.py OUT.wav [--takes audition/almost] [--seconds S]
                                    [--stems DIR] [--publish DIR] [--tail 9]

`--stems` also writes the two sounds the white room plays (src/memory/defs.ts, ALMOST's cues), at
the same levels as the film's mix; `--publish` writes them as the room's MP3s, with
`almost-sound.json` (what they were made from):
- `almost-kitchen`: the room (the fridge and the clock). It starts at KITCHEN_AT on the memory's
  timeline, FILM_AT - KITCHEN_AT before the film's first frame, heard through the wall (muffled)
  until the picture opens, and runs `--tail` seconds past its last, as the picture goes back into
  the wall.
- `almost-film`: the figures' sounds, from the film's first frame.

No music and no voices. The layers:
- **The room:** a fridge that hums from the first frame to the last, and a clock that ticks each
  second, a little unevenly. Neither notices anything.
- **The figures:** close, faint material sounds laid on the exposure sheet's own frames:
  - his sleeve once as he reaches, and his fingertip on the fold;
  - her sleeve snatched back across the table, and her chair's small creak;
  - her forearm laid back on the wood;
  - his arm going back across the table and down into his lap;
  - her sleeve lifted off the wood and laid down again, nearer him.

The fridge is made here (the generated take came back as near-silent hiss and a burst). Every other
sound is an ElevenLabs take from scripts/generate-almost.mjs, its generator's hum and low end taken
out, ending on its own decay; all pending the artist's listen. Mixed dry and close, with one small
room. Peaks stay below -3 dBFS.
"""
import json
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import xsheet  # noqa: E402

SR = 48000
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
# Where the kitchen and the film begin on the memory's timeline (src/memory/defs.ts, ALMOST's
# markers `music:kitchen` and `music:film`: tests/memory-defs.test.ts holds them equal). The film's
# own mix is the white room's two sounds as they fall under it, the clock's ticks on the same
# seconds.
KITCHEN_AT = 0.6
FILM_AT = 10.3
# The levels (dBFS on the film's mix): the fridge by what is heard of it (A-weighted), the clock's
# peak, the figures' layer against the takes' levels below, and the startle's loudness at its height
# (momentary LUFS): the sound designer's review, 2026-10-20. Stand-ins until the artist has listened.
FRIDGE_A = -52.0
TICK_AT = 0.795            # the first tick on the room's own timeline (s); then one a second
TICK_PEAK = -40.5
FIGURES_DB = -5.0
STARTLE_LUFS = -18.0


def load(path):
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)


def db(x):
    return 10 ** (x / 20)


def rms_db(x):
    return 20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-12)


def fft_filter(x, lo=None, hi=None, order=2):
    """Zero-phase band shaping in the frequency domain (smooth Butterworth-like magnitudes)."""
    n = len(x)
    X = np.fft.rfft(x, axis=0)
    f = np.fft.rfftfreq(n, 1 / SR)
    g = np.ones_like(f)
    if lo:
        g *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** (2 * order))
    if hi:
        g *= 1 / np.sqrt(1 + (f / hi) ** (2 * order))
    return np.fft.irfft(X * (g[:, None] if x.ndim == 2 else g), n=n, axis=0)


def slow_noise(n, hz, rng):
    """A smooth random wander (0 mean, ~1 deviation) changing at about `hz`."""
    k = max(2, int(n / SR * hz) + 2)
    pts = rng.standard_normal(k)
    xs = np.linspace(0, k - 1, n)
    i = np.floor(xs).astype(int).clip(0, k - 2)
    t = xs - i
    t = t * t * (3 - 2 * t)
    return pts[i] * (1 - t) + pts[i + 1] * t


def fridge(n, rng):
    """An old fridge's compressor running, on the same 60 Hz mains as the white room's own hum, so
    one hands over to the other: the motor's magnetics sing at twice the mains, 120 Hz, the
    strongest line, with its even harmonics up to 720 Hz (a phone's small speaker plays those, and
    the ear hears the hum under them from them); the mains itself 12 dB under it; the motor's slip, a
    line 3% under 120 Hz and 10 dB down, beating slowly against it; and the motor's and the fan's
    broadband noise, 150 Hz to 4 kHz, 10 dB under the 120 Hz line, wandering by a decibel. Mono at the
    source; the room spreads it. (A 50 Hz buzz of odd harmonics read as a ground loop, and a phone
    played none of it: the sound designer's review, 2026-10-20.)"""
    drift = 1 + 0.0015 * slow_noise(n, 0.05, rng)                       # the mains is never exact
    ph = 2 * np.pi * 60 * np.cumsum(drift) / SR
    sig = np.zeros(n)
    for h, gain in ((1, -12), (2, 0), (4, -4), (6, -5), (8, -6), (10, -8), (12, -10)):
        sig += db(gain) * np.sin(h * ph + rng.uniform(0, 2 * np.pi))
    sig += db(-10) * np.sin(2 * ph * 0.97 + rng.uniform(0, 2 * np.pi))
    noise = fft_filter(rng.standard_normal(n), lo=150, hi=3000, order=2)
    sig += noise / np.sqrt((noise ** 2).mean()) * db(-10) / np.sqrt(2) * db(slow_noise(n, 0.15, rng))
    return np.stack([sig, sig], 1)


def clean(x, lo=180.0):
    """A take with what the generator adds taken out: a steady line at 200 Hz and its multiples (to
    1.2 kHz, Q 40, as scripts/woodland-stems.ts does) and everything under `lo` (felt at a sixth of
    life size has nothing down there; the takes' floors and thumps do)."""
    n = len(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    g = 1 / np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** 8)
    for k in range(1, 7):
        f0 = 200.0 * k
        g *= np.abs(f * f - f0 * f0) / np.sqrt((f * f - f0 * f0) ** 2 + (f * f0 / 40.0) ** 2 + 1e-12)
    return np.fft.irfft(np.fft.rfft(x, axis=0) * g[:, None], n=n, axis=0)


def envelope(x, win=0.01):
    k = max(1, int(win * SR))
    return np.sqrt(np.convolve(x.mean(1) ** 2, np.ones(k) / k, 'same'))


def onset(x):
    env = envelope(x, 0.005)
    return max(0, np.argmax(env > env.max() * 0.08) - int(0.01 * SR)) / SR


def ending(x, start, length, fade=0.12, search=0.15):
    """The part of a take from `start` (s), ended on its own decay: at the quietest moment of its
    envelope within `search` of `length`, faded out over `fade` by a raised cosine ending there. (Cut
    while still sounding, eight of the first mix's eleven sounds ended 29-46 dB over the room in
    20 ms: heard edits.)"""
    s = int(start * SR)
    y = x[s:]
    env = envelope(y)
    a, b = int(max(0.0, length - search) * SR), min(len(y), int((length + search) * SR))
    e = a + int(np.argmin(env[a:b])) if b > a else min(len(y), int(length * SR))
    y = y[:e].copy()
    f = min(int(fade * SR), len(y) // 2)
    y[:int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))[:, None]
    y[len(y) - f:] *= (0.5 * (1 + np.cos(np.linspace(0, np.pi, f))))[:, None]
    return y


def shaped(x, points):
    """`x` under a gain envelope: (seconds, dB) points, straight in dB between them, the last held."""
    t = np.arange(len(x)) / SR
    ts, gs = zip(*points)
    return x * db(np.interp(t, ts, gs))[:, None]


def pitched(x, semitones):
    """Higher by `semitones` and shorter by as much (a chair a sixth the size)."""
    k = 2 ** (semitones / 12)
    idx = np.arange(0, len(x) - 1, k)
    return np.stack([np.interp(idx, np.arange(len(x)), x[:, c]) for c in range(x.shape[1])], 1)


def lowpass_sweep(x, corner):
    """A two-pole lowpass whose corner (Hz) follows `corner(t)` (t in seconds), in 64-sample steps,
    its state carried (scripts/woodland-stems.ts's `sweep`)."""
    y = x.copy()
    for c in range(x.shape[1]):
        x1 = x2 = y1 = y2 = 0.0
        col = y[:, c]
        for i0 in range(0, len(col), 64):
            fc = min(SR * 0.45, corner(i0 / SR))
            w = 2 * np.pi * fc / SR
            cw, al = np.cos(w), np.sin(w) / (2 * 0.707)
            a0 = 1 + al
            b0, b1, a1, a2 = (1 - cw) / 2 / a0, (1 - cw) / a0, -2 * cw / a0, (1 - al) / a0
            for i in range(i0, min(len(col), i0 + 64)):
                xi = col[i]
                yi = b0 * xi + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2
                x2, x1, y2, y1 = x1, xi, y1, yi
                col[i] = yi
    return y


# -- measures (what the sound designer's review measured: A-weighted level, level above 400 Hz,
# loudness as EBU R128 has it)

def a_weighted_db(x):
    n = len(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    f2 = f * f
    ra = 12194.0 ** 2 * f2 * f2 / ((f2 + 20.6 ** 2) * np.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194.0 ** 2) + 1e-30)
    g = ra * db(2.0)
    y = np.fft.irfft(np.fft.rfft(x, axis=0) * g[:, None], n=n, axis=0)
    return rms_db(y)


def above_db(x, f0=400.0):
    return rms_db(fft_filter(x, lo=f0, order=4))


def _k_weighted(x):
    n = len(x)
    w = 2 * np.pi * np.fft.rfftfreq(n, 1 / SR) / SR
    z = np.exp(-1j * w)

    def H(b, a):
        return (b[0] + b[1] * z + b[2] * z * z) / (a[0] + a[1] * z + a[2] * z * z)
    g = np.abs(H((1.53512485958697, -2.69169618940638, 1.19839281085285), (1.0, -1.69065929318241, 0.73248077421585))
               * H((1.0, -2.0, 1.0), (1.0, -1.99004745483398, 0.99007225036621)))
    return np.fft.irfft(np.fft.rfft(x, axis=0) * g[:, None], n=n, axis=0)


def momentary(x):
    """Momentary loudness (LUFS, 400 ms windows every 100 ms): the times and the values."""
    y = _k_weighted(x) ** 2
    p = y.sum(1)
    k, hop = int(0.4 * SR), int(0.1 * SR)
    c = np.concatenate([[0.0], np.cumsum(p)])
    starts = np.arange(0, max(1, len(p) - k), hop)
    ms = (c[starts + k] - c[starts]) / k
    return starts / SR + 0.2, -0.691 + 10 * np.log10(ms + 1e-20)


def integrated(x):
    t, m = momentary(x)
    m = m[m > -70]
    if not len(m):
        return -70.0
    gate = 10 * np.log10(np.mean(10 ** (m / 10))) - 10
    m = m[m > gate]
    return float(10 * np.log10(np.mean(10 ** (m / 10))))


def small_room(rng, rt60=0.32, predelay=0.004):
    """A small kitchen: a short decorrelated stereo tail (exponentially decaying noise, darker as it
    decays)."""
    n = int(SR * rt60 * 1.4)
    t = np.arange(n) / SR
    env = np.exp(-6.91 * t / rt60)
    ir = rng.standard_normal((n, 2)) * env[:, None]
    ir = fft_filter(ir, lo=120, hi=5200, order=1)
    ir = np.concatenate([np.zeros((int(SR * predelay), 2)), ir])
    return ir / np.sqrt((ir ** 2).sum(0, keepdims=True))


def convolve(x, ir):
    n = len(x) + len(ir) - 1
    nf = 1 << (n - 1).bit_length()
    X = np.fft.rfft(x, nf, axis=0)
    H = np.fft.rfft(ir, nf, axis=0)
    return np.fft.irfft(X * H, nf, axis=0)[:len(x)]


def pan(x, p):
    """Equal-power pan of a (n, 2) sound to p in -1..1 (left..right)."""
    m = x.mean(1)
    a = (p + 1) * np.pi / 4
    return np.stack([m * np.cos(a), m * np.sin(a)], 1) * np.sqrt(2)


def trim(x, start=None, length=None, fade=0.01):
    """The part of a take from its onset (or `start` seconds), `length` long, faded at both ends."""
    if start is None:
        env = np.sqrt(np.convolve(x.mean(1) ** 2, np.ones(240) / 240, 'same'))
        start = max(0, (np.argmax(env > env.max() * 0.08) - int(0.01 * SR))) / SR
    s = int(start * SR)
    e = len(x) if length is None else min(len(x), s + int(length * SR))
    y = x[s:e].copy()
    f = int(fade * SR)
    if f and len(y) > 2 * f:
        r = np.linspace(0, 1, f)[:, None]
        y[:f] *= r
        y[-f:] *= r[::-1]
    return y


def lay(track, x, at, gain_db=0.0):
    s = int(round(at * SR))
    if s >= len(track):
        return
    e = min(len(track), s + len(x))
    track[s:e] += x[:e - s] * db(gain_db)


def segments(tr):
    """Each move of a track: (first frame, last frame + 1, from key, to key)."""
    out, f, cur = [], 0, None
    for fr, to, t, frames, note in tr.drawings:
        if fr != to:
            if cur and cur[2] == fr and cur[3] == to:
                cur[1] = f + frames
            else:
                cur = [f, f + frames, fr, to]
                out.append(cur)
        else:
            cur = None
        f += frames
    return out


def when(tr, to, frm=None):
    for s, e, a, b in segments(tr):
        if b == to and (frm is None or a == frm):
            return s / xsheet.FPS, e / xsheet.FPS
    raise KeyError(to)


def main():
    a = sys.argv[1:]
    out = a[0]
    opt = {a[i][2:]: a[i + 1] for i in range(1, len(a) - 1, 2)}
    takes = opt.get('takes', os.path.join(ROOT, 'audition', 'almost'))
    rng = np.random.default_rng(7)
    A, B, end = xsheet.sheet()
    seconds = float(opt.get('seconds', end / xsheet.FPS))
    n = int(seconds * SR)
    F = 1 / xsheet.FPS
    T = lambda name, lo=180.0: clean(load(os.path.join(takes, f'almost-{name}.mp3')), lo)  # noqa: E731

    # -- the room ------------------------------------------------------------------------------
    # (Made long enough for the white room's copy too: `lead` before the film, `tail` after it. The
    # film's own mix is the part of it under the film.)
    lead = FILM_AT - KITCHEN_AT
    tail = float(opt.get('tail', 9.0))
    nl, nt = int(lead * SR), int(tail * SR)
    N = nl + n + nt
    ir = small_room(rng)
    hum = pan(fridge(N, rng), 0.55)
    hum_room = fft_filter(hum * 0.8 + convolve(hum, ir) * 0.35, lo=28, order=2)
    # (set by its A-weighted level, what is heard, not by loudness: a 120 Hz line counts for more
    # in LUFS than it sounds)
    hum_room *= db(FRIDGE_A - a_weighted_db(hum_room))
    # the clock: four ticks of the take in turn, its own limp kept (every other tick 40 ms early), on
    # x.12 s of the film's seconds: clear of every move of theirs by 80 ms or more, so it never
    # seems to cue them (on x.70 it fell 55 ms before six of her beats)
    clock = T('clock-1', lo=250.0)
    ticks = [ending(clock, s0, 0.40, fade=0.06, search=0.03) for s0 in (1.005, 2.047, 3.001, 4.044)]
    ref = max(np.abs(t).max() for t in ticks)
    tick_track = np.zeros((N, 2))
    tick_times = []
    for k in range(int(lead + seconds + tail) + 1):
        t = TICK_AT + k * 1.0 - (0.04 if k % 2 else 0.0)
        tick_times.append(t + 0.025 - lead)                       # its transient, in film seconds
        lay(tick_track, pan(ticks[k % len(ticks)], 0.42), t, TICK_PEAK - 20 * np.log10(ref) + rng.uniform(-0.8, 0.8))
    tick_room = fft_filter(tick_track * 0.8 + convolve(tick_track, ir) * 0.35, lo=28, order=2)
    room_all = hum_room + tick_room

    # -- the figures, on their frames: faint, mostly dry, each ending on its own decay -------------
    near = np.zeros((n, 2))
    level = lambda x, rms: db(rms + FIGURES_DB - rms_db(x))  # noqa: E731
    # his sleeve, once, as the wrist carries across (his forearm is in the air: only the sleeve
    # near his elbow brushes the wood); nothing in the hesitation
    t0, _ = when(A, 'carry')
    _, t1 = when(A, 'hesitate')
    r = T('reach-1')
    brush = ending(r, onset(r), t1 - t0)
    lay(near, pan(brush, -0.12), t0, 0.0)
    near_scale = {'reach': level(brush, -37)}
    lay_at = [('reach', brush, t0, -0.12)]
    # his fingertip on the fold, as it arrives
    t0, _ = when(A, 'touch')
    r = T('touch-1')
    tip = ending(r, onset(r), 0.5)
    lay_at.append(('touch', tip, t0 + 2 * F, 0.10))
    near_scale['touch'] = level(tip, -27)
    # the startle: her sleeve snatched back over the wood, loudest on its first two frames, half
    # gone by the fourth, gone by the fourteenth (a reflex is loudest first: a swell after her flinch
    # read as a crescendo, then a gate)
    t0, _ = when(B, 'startle1')
    r = T('drag-3')
    snatch = shaped(ending(r, onset(r), 14 * F, fade=0.05, search=0.02), [(0, 0), (2 * F, 0), (4 * F, -6), (8 * F, -18), (14 * F, -60)])
    lay_at.append(('startle', snatch, t0, 0.22))
    # her chair: one small creak as she flinches, on the second frame, when it moves (a grain of a
    # take, high-passed, raised a third as for a chair a sixth the size: a scrape read as moving
    # away, which she does not)
    t0, _ = when(B, 'startle2')
    r = T('scrape-2', lo=300.0)
    creak = pitched(ending(r, 6 * F, 0.16, fade=0.04, search=0.02), 4)
    lay_at.append(('creak', creak, t0, 0.3))
    near_scale['creak'] = level(creak, -35)
    # her forearm laid back on the wood: the touch of it where it lands
    s0, s1 = when(B, 'settle')
    r = T('touch-2')
    down = ending(r, onset(r), 0.35)
    peak = int(np.argmax(envelope(down, 0.005))) / SR
    lay_at.append(('down', down, (s0 + s1) / 2 - peak, 0.2))
    near_scale['down'] = level(down, -31)
    # his arm back across the table, turned along its edge and down into his lap
    t0, _ = when(A, 'back1')
    _, t1 = when(A, 'lap left', 'slip')
    r = T('settle-1')
    back = ending(r, onset(r), t1 - t0 + 0.1)
    lay_at.append(('back', back, t0, -0.2))
    near_scale['back'] = level(back, -27)
    # her offer: the sleeve lifting off the wood, the hesitation in the air (nothing), laid down
    t0, t1 = when(B, 'offer1')
    r = T('offer-1')
    up = ending(r, onset(r), t1 - t0)
    lay_at.append(('up', up, t0, 0.18))
    near_scale['up'] = level(up, -30)
    t0, t1 = when(B, 'offer2')
    r = T('offer-2')
    laid = ending(r, onset(r), t1 - t0 + 0.05)
    lay_at.append(('laid', laid, t0, 0.12))
    near_scale['laid'] = level(laid, -29)
    near = np.zeros((n, 2))
    for name, x, t, p in lay_at:
        if name != 'startle':
            lay(near, pan(x, p) * near_scale[name], t, 0.0)
    # the startle set by its loudness, the film's one loud moment and still a small one
    st = np.zeros((n, 2))
    name, x, t, p = next(v for v in lay_at if v[0] == 'startle')
    lay(st, pan(x, p), t, 0.0)
    wet = lambda y: fft_filter(y + convolve(y, ir) * 0.18, lo=28, order=2)  # noqa: E731
    st = wet(st)
    st *= db(STARTLE_LUFS - momentary(st)[1].max())
    near = wet(near) + st
    mix = room_all[nl:nl + n] + near
    # fade in from the wall, out to the wall (the memory's own fades sit over these)
    fi, fo = int(0.6 * SR), int(1.2 * SR)
    mix[:fi] *= np.linspace(0, 1, fi)[:, None]
    mix[-fo:] *= np.linspace(1, 0, fo)[:, None]
    peak = np.abs(mix).max()
    scale = db(-3) / peak if peak > db(-3) else 1.0
    mix *= scale
    write(out, mix)
    # the clock against the story's moments (each move that begins a beat, and his breaths): how
    # near a tick comes to one (s)
    beats = sorted({s0 * F for tr in (A, B) for s0, _, a0, b0 in segments(tr) if _begins_beat(tr, s0) or 'breathe' in a0 + b0})
    gap = min(abs(tt - m) for tt in tick_times for m in beats)
    _, mm = momentary(mix)
    report = {'seconds': seconds, 'peak_dbfs': round(20 * np.log10(np.abs(mix).max() + 1e-12), 1),
              'integrated_lufs': round(integrated(mix), 1), 'momentary_max_lufs': round(float(mm.max()), 1),
              'room_a_dbfs': round(a_weighted_db(room_all * scale), 1), 'room_above400_dbfs': round(above_db(room_all * scale), 1),
              'tick_to_nearest_move_s': round(gap, 3)}
    if 'stems' in opt or 'publish' in opt:
        # The white room's two: the same levels as the film's mix, unfaded (the cues fade them). The
        # kitchen is heard through the wall at first: muffled until the picture opens (5.0 s on the
        # memory's timeline), open by the time the visitor is inside (9.8 s).
        kitchen = room_all * scale
        head = int(12 * SR)
        swept = lowpass_sweep(kitchen[:head], lambda t: _through_wall(t + KITCHEN_AT))
        x = int(0.01 * SR)
        swept[-x:] = swept[-x:] * np.linspace(1, 0, x)[:, None] + kitchen[head - x:head] * np.linspace(0, 1, x)[:, None]
        kitchen = np.concatenate([swept, kitchen[head:]])
        film = near * scale
        e = int(0.01 * SR)
        for x in (kitchen, film):
            x[:e] *= np.linspace(0, 1, e)[:, None]
            x[-e:] *= np.linspace(1, 0, e)[:, None]
        report.update({'kitchen_seconds': round(len(kitchen) / SR, 2), 'kitchen_a_dbfs': round(a_weighted_db(kitchen), 1),
                       'film_peak_dbfs': round(20 * np.log10(np.abs(film).max() + 1e-12), 1), 'lead': lead, 'tail': tail})
        if 'stems' in opt:
            d = opt['stems']
            os.makedirs(d, exist_ok=True)
            write(os.path.join(d, 'almost-kitchen.wav'), kitchen)
            write(os.path.join(d, 'almost-film.wav'), film)
        if 'publish' in opt:
            # the room's copies, and what they were made from (tests/film-scene.test.ts holds them to
            # the exposure sheet and this mix: change either and they are made again)
            d = opt['publish']
            os.makedirs(d, exist_ok=True)
            for name, x in (('almost-kitchen', kitchen), ('almost-film', film)):
                pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
                subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '2', '-i', '-',
                                '-c:a', 'libmp3lame', '-b:a', '192k', os.path.join(d, f'{name}.mp3')], input=pcm.tobytes(), check=True)
            with open(os.path.join(d, 'almost-sound.json'), 'w') as fh:
                json.dump({'xsheet': sha256(os.path.join(HERE, 'xsheet.py')), 'sound': sha256(os.path.abspath(__file__))}, fh, indent=1)
                fh.write('\n')
    print(json.dumps(report))


def _begins_beat(tr, frame):
    """Whether a drawing that starts at `frame` carries a beat's note on the sheet."""
    f = 0
    for d in tr.drawings:
        if f == frame:
            return bool(d[4])
        f += d[3]
    return False


def _through_wall(t):
    """The corner of the kitchen's lowpass at memory time `t`: 500 Hz through the plaster, opening
    (evenly in pitch) from 5.0 s to 9.8 s."""
    k = min(1.0, max(0.0, (t - 5.0) / 4.8))
    return 500.0 * (20000.0 / 500.0) ** k


def sha256(path):
    """The first 16 hex digits of a file's SHA-256: enough to know it changed. (A whole one looks to
    tests/dialogue.test.ts like a secret.)"""
    import hashlib
    with open(path, 'rb') as fh:
        return hashlib.sha256(fh.read()).hexdigest()[:16]


def write(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '2', '-i', '-', path], input=pcm.tobytes(), check=True)


if __name__ == '__main__':
    main()
