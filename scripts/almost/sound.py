"""The soundtrack of "Almost": the kitchen at night, and the small sounds of felt on wood.

    python3 scripts/almost/sound.py OUT.wav [--takes audition/almost] [--seconds 31]
                                    [--stems DIR] [--tail 9]

`--stems` also writes the two sounds the white room plays (src/memory/defs.ts, ALMOST's cues), at
the same levels as the film's mix:
- `DIR/almost-kitchen.wav`: the room (the fridge, the clock, the air). It starts at KITCHEN_AT on the
  memory's timeline, FILM_AT - KITCHEN_AT before the film's first frame, and runs `--tail`
  seconds past its last, as the picture goes back into the wall.
- `DIR/almost-film.wav`: the figures' sounds, from the film's first frame.

No music and no voices. The layers:
- **The room:** a fridge that hums from the first frame to the last, a clock that ticks each
  second, and the room's own faint air. None of them notices anything.
- **The figures:** close, quiet material sounds laid on the exposure sheet's own frames:
  - his sleeve as he reaches, and his fingertip on the fold;
  - her sleeve dragged back across the table, and her chair scraping a millimetre;
  - his arm going back and down into his lap;
  - her sleeve slid forward again, in two goes.

The fridge is made here: an old compressor's mains hum and motor noise. The generated take
came back as near-silent hiss and a burst. Every other material sound is an ElevenLabs take from
scripts/generate-almost.mjs, pending the artist's listen.

The layers are mixed dry and close, then given one small room. Peaks stay below -3 dBFS.
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
    """An old fridge's compressor running: the motor's 50 Hz hum (a buzz, so its harmonics too,
    falling away above 400 Hz), the 100 Hz of the motor's magnetics, and a soft broadband motor
    noise around 150-900 Hz. Its level and colour waver very slowly. Mono at the source; the room
    spreads it."""
    t = np.arange(n) / SR
    drift = 1 + 0.0015 * slow_noise(n, 0.05, rng)                       # the mains is never exact
    ph = 2 * np.pi * 50 * np.cumsum(drift) / SR
    buzz = np.zeros(n)
    for h in range(1, 13):
        amp = (1 / h ** 1.15) * (1.0 if h % 2 else 0.55)
        buzz += amp * np.sin(h * ph + rng.uniform(0, 2 * np.pi))
    buzz = fft_filter(buzz, lo=40, hi=420, order=2)
    hum100 = 0.6 * np.sin(2 * ph + 0.3) * (1 + 0.15 * slow_noise(n, 0.2, rng))
    motor = fft_filter(rng.standard_normal(n), lo=150, hi=900, order=2)
    motor *= 0.18 * (1 + 0.25 * slow_noise(n, 0.3, rng))
    sig = (buzz / np.abs(buzz).max() * 0.55 + hum100 * 0.35 + motor) * (1 + 0.06 * slow_noise(n, 0.08, rng))
    return np.stack([sig, sig], 1)


def room_tone(n, rng):
    """The room's own faint air: brownish noise, a touch lower on the left (the window side)."""
    w = rng.standard_normal((n, 2))
    b = np.cumsum(w, axis=0)
    c = np.cumsum(np.pad(b, ((SR // 2, SR // 2), (0, 0)), mode='edge'), axis=0)
    b -= (c[SR:] - c[:-SR])[:len(b)] / SR                                   # no drift: less a 1 s mean
    b = fft_filter(b, lo=60, hi=2500, order=1)
    return b / np.abs(b).max()


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
    T = lambda name: load(os.path.join(takes, f'almost-{name}.mp3'))

    # -- the room ------------------------------------------------------------------------------
    # (Made long enough for the white room's copy too: `lead` before the film, `tail` after it. The
    # film's own mix is the part of it under the film.)
    lead = FILM_AT - KITCHEN_AT
    tail = float(opt.get('tail', 9.0))
    nl, nt = int(lead * SR), int(tail * SR)
    N = nl + n + nt
    room = np.zeros((N, 2))
    hum = fridge(N, rng)
    room += pan(hum, 0.55) * db(-36 - rms_db(hum))
    air = room_tone(N, rng)
    room += air * db(-58 - rms_db(air))
    clock = T('clock-1')
    ticks = [trim(clock, start=s, length=0.42, fade=0.004) for s in (1.005, 2.047, 3.001, 4.044)]
    ref = max(np.abs(t).max() for t in ticks)
    for k in range(int(lead + seconds + tail) + 1):
        t = 0.37 + k * 1.0
        tick = ticks[k % len(ticks)]
        lay(room, pan(tick, 0.42), t, -38 - 20 * np.log10(ref) + rng.uniform(-0.8, 0.8))

    # -- the figures, on their frames ------------------------------------------------------------
    F = 1 / xsheet.FPS
    near = np.zeros((n, 2))
    # his sleeve as the wrist lifts, carries, hesitates and goes on (quiet: his forearm is mostly in
    # the air, only the sleeve near his elbow brushes the wood)
    t0, t1 = when(A, 'lift')
    lay(near, pan(trim(T('reach-3'), length=t1 - t0 + 0.25), -0.18), t0, -28 - rms_db(trim(T('reach-3'))) + 2)
    t0, _ = when(A, 'carry')
    _, t1 = when(A, 'hesitate')
    lay(near, pan(trim(T('reach-1'), length=t1 - t0 + 0.2), -0.12), t0, -29 - rms_db(trim(T('reach-1'))))
    t0, _ = when(A, 'approach')
    _, t1 = when(A, 'near')
    lay(near, pan(trim(T('reach-2'), length=t1 - t0 + 0.2), -0.05), t0, -30 - rms_db(trim(T('reach-2'))))
    # his fingertip on the fold, as it arrives
    t0, _ = when(A, 'touch')
    touch = trim(T('touch-1'), length=0.6)
    lay(near, pan(touch, 0.1), t0 + 2 * F, -27 - rms_db(touch))
    # the startle: her sleeve snatched back over the wood on the first frame; the chair's tiny
    # scrape on the second, when it moves
    t0, _ = when(B, 'startle1')
    drag = trim(T('drag-1'), length=0.7)
    lay(near, pan(drag, 0.22), t0, -21 - rms_db(drag))
    t0, _ = when(B, 'startle2')
    scrape = trim(T('scrape-3'), length=0.6)
    lay(near, pan(scrape, 0.3), t0, -31 - rms_db(scrape))
    # her forearm laid back on the wood
    _, t1 = when(B, 'settle')
    down = trim(T('touch-2'), length=0.45)
    lay(near, pan(down, 0.2), t1 - 2 * F, -31 - rms_db(down))
    # his arm back across the table and down into his lap; then, after a moment, the other hand
    t0, _ = when(A, 'back1')
    _, t1 = when(A, 'lap left')
    settle = trim(T('settle-1'), length=t1 - t0 + 0.3)
    lay(near, pan(settle, -0.2), t0, -27 - rms_db(settle))
    t0, _ = when(A, 'lap right')
    _, t1 = when(A, 'lap', 'lap right down')
    other = trim(T('settle-2'), length=t1 - t0 + 0.3)
    lay(near, pan(other, -0.3), t0, -31 - rms_db(other))
    # her offer: the sleeve lifting off the wood, the hesitation in the air (nothing), laid down
    t0, _ = when(B, 'offer1')
    o1 = trim(T('offer-1'), length=0.45)
    lay(near, pan(o1, 0.18), t0, -30 - rms_db(o1))
    t0, t1 = when(B, 'offer2')
    o2 = trim(T('offer-2'), length=t1 - t0 + 0.2)
    lay(near, pan(o2, 0.12), t0, -29 - rms_db(o2))

    # -- one small room round everything, close sounds kept mostly dry -------------------------------
    ir = small_room(rng)
    room_all = fft_filter(room * 0.8 + convolve(room, ir) * 0.35, lo=28, order=2)
    near = fft_filter(near + convolve(near, ir) * 0.18, lo=28, order=2)
    mix = room_all[nl:nl + n] + near
    # fade in from the wall, out to the wall (the memory's own fades sit over these)
    fi, fo = int(0.6 * SR), int(1.2 * SR)
    mix[:fi] *= np.linspace(0, 1, fi)[:, None]
    mix[-fo:] *= np.linspace(1, 0, fo)[:, None]
    peak = np.abs(mix).max()
    scale = db(-3) / peak if peak > db(-3) else 1.0
    mix *= scale
    write(out, mix)
    report = {'seconds': seconds, 'peak_dbfs': round(20 * np.log10(np.abs(mix).max() + 1e-12), 1), 'rms_dbfs': round(rms_db(mix), 1),
              'room_rms_dbfs': round(rms_db(room), 1)}
    if 'stems' in opt:
        # The white room's two: the same levels as the film's mix, unfaded (the cues fade them).
        d = opt['stems']
        os.makedirs(d, exist_ok=True)
        kitchen = room_all * scale
        film = near * scale
        e = int(0.01 * SR)
        for x in (kitchen, film):
            x[:e] *= np.linspace(0, 1, e)[:, None]
            x[-e:] *= np.linspace(1, 0, e)[:, None]
        write(os.path.join(d, 'almost-kitchen.wav'), kitchen)
        write(os.path.join(d, 'almost-film.wav'), film)
        report.update({'kitchen_seconds': round(len(kitchen) / SR, 2), 'kitchen_rms_dbfs': round(rms_db(kitchen), 1),
                       'film_peak_dbfs': round(20 * np.log10(np.abs(film).max() + 1e-12), 1), 'lead': lead, 'tail': tail})
    print(json.dumps(report))


def write(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '2', '-i', '-', path], input=pcm.tobytes(), check=True)


if __name__ == '__main__':
    main()
