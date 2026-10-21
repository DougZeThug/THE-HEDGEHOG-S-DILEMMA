"""The sound of "Things I Should Have Said" (docs/things.md): the drawing heard as it is made, from
the same list of marks the picture is made from (timeline.py), so every sound is where its mark is.

One hand draws, so each tool is one voice, not one per mark: its loudness at any moment is the
strongest mark it is making then (a pass of a hundred overlapping strokes is one hand moving fast,
not a hundred hands), and its brightness and grit follow how fast that hand moves.

    charcoal    a dry rasp with grit: the stick catching on the paper's tooth
    side        the stick laid flat: broader, softer, a hiss with a little grain
    pencil      thin and high, almost a whisper
    eraser      rubber dragged back and forth: low friction, swelling with each sweep
    smudge      a finger over the dust: barely there

Under it the room: a still, small room's air. A door's latch can be laid at a time (`events`).
Nothing is recorded: all of it is made here, seeded, the same each time.

    python3 scripts/things/foley.py MARKS.json OUT.wav LENGTH_S
"""
import json
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'almost'))
from sound import SR, convolve, fft_filter, integrated, slow_noise, small_room  # noqa: E402

CR = 1000                     # the control rate of the voices' activity (Hz)
W = 1280                      # the sheet's width (for where a mark is, left to right)

# each tool's voice: band (Hz), level (dB, at full pressure), grit (0..1), which voice it sounds in
VOICES = {
    'charcoal': dict(band=(700, 7000), level=-20.0, grit=0.75),
    'side': dict(band=(260, 3600), level=-26.0, grit=0.35),
    'pencil': dict(band=(2200, 10000), level=-30.0, grit=0.3),
    'erase': dict(band=(170, 2400), level=-23.0, grit=0.15),
    'smudge': dict(band=(120, 1300), level=-36.0, grit=0.0),
}
TOOL_VOICE = {'charcoal': 'charcoal', 'compressed': 'charcoal', 'side': 'side', 'pencil': 'pencil', 'hardpencil': 'pencil'}
TARGET_LUFS = -30.0           # intimate: a hand on paper heard close, in a quiet room
ROOM_DB = -64.0


def voice_of(mark):
    if mark['kind'] == 'erase':
        return 'erase'
    if mark['kind'] == 'smudge':
        return 'smudge'
    return TOOL_VOICE.get(mark.get('tool'), 'charcoal')


def _length(pts):
    p = np.asarray(pts, np.float32)
    return float(np.linalg.norm(np.diff(p, axis=0), axis=1).sum()) if len(p) > 1 else 0.0


def activity(items, length):
    """Each voice's loudness (0..1), speed (px/s) and place (-1 left .. 1 right) at the control
    rate: the strongest mark of the voice at each moment."""
    n = int(length * CR) + 1
    out = {v: (np.zeros(n), np.zeros(n), np.zeros(n)) for v in VOICES}
    for t0, t1, m in items:
        if t1 - t0 < 1e-3:
            continue                      # laid at once (a drawing already there): no sound
        v = voice_of(m)
        a, s, x = out[v]
        i0, i1 = int(t0 * CR), min(n, int(t1 * CR) + 1)
        if i1 <= i0:
            continue
        k = i1 - i0
        p = np.asarray(m.get('pressure') or [m.get('strength', m.get('amount', 0.7))], np.float64)
        prof = np.interp(np.linspace(0, 1, k), np.linspace(0, 1, len(p)), p) if len(p) > 1 else np.full(k, p[0])
        if m['kind'] == 'erase':
            # a sweep swells and fades as the rubber drags
            prof = prof * np.sin(np.linspace(0.05, 0.95, k) * np.pi) ** 0.7
        edge = np.minimum(1.0, np.minimum(np.arange(k) + 1, k - np.arange(k)) / (0.012 * CR))
        env = np.clip(prof, 0, 1.2) * edge
        speed = _length(m['pts']) / max(t1 - t0, 1e-3)
        place = float(np.clip(np.mean(np.asarray(m["pts"], np.float32)[:, 0]) / W * 2 - 1, -1, 1))
        seg = slice(i0, i1)
        louder = env > a[seg]
        a[seg] = np.where(louder, env, a[seg])
        s[seg] = np.where(louder, speed, s[seg])
        x[seg] = np.where(louder, place, x[seg])
    return out


def _up(c, n):
    return np.interp(np.arange(n) / SR, np.arange(len(c)) / CR, c)


def _smooth(c, ms):
    k = max(1, int(ms / 1000 * CR))
    return np.convolve(c, np.ones(k) / k, mode='same')


def voice(name, act, n, rng):
    """One voice, stereo: noise in its band, grit from the paper's tooth, loud as `act` says."""
    spec = VOICES[name]
    a, s, x = act
    a = _smooth(a, 8)
    amp = _up(a, n)
    if amp.max() <= 0:
        return np.zeros((n, 2))
    sp = _up(_smooth(s, 30), n)
    pl = _up(_smooth(x, 60), n) * 0.35
    lo, hi = spec['band']
    noise = rng.standard_normal(n)
    # brighter the faster the hand moves: a dark band and a bright one, mixed by speed
    fast = np.clip(sp / 900.0, 0, 1)
    body = fft_filter(noise, lo=lo, hi=hi * 0.55, order=2)
    air = fft_filter(noise, lo=lo * 1.8, hi=hi, order=2)
    y = body * (1 - 0.6 * fast) + air * (0.4 + 0.6 * fast)
    if spec['grit'] > 0:
        # the tooth: the stick catches and lets go, more often the faster it goes
        catches = np.abs(slow_noise(n, 260.0, rng)) ** 3
        catches /= catches.std() + 1e-9
        y *= 1 - spec['grit'] + spec['grit'] * np.clip(catches, 0, 4) * (0.6 + 0.6 * fast)
    if name == 'erase':
        # the rubber's drag: a low, uneven friction under the hiss
        y += fft_filter(rng.standard_normal(n), lo=60, hi=420, order=2) * 1.6 * (0.6 + 0.4 * np.abs(slow_noise(n, 9.0, rng)))
    y /= np.sqrt((y ** 2).mean()) + 1e-12
    y *= amp * 10 ** (spec['level'] / 20)
    left, right = np.sqrt(0.5 - 0.5 * pl), np.sqrt(0.5 + 0.5 * pl)
    return np.stack([y * left, y * right], 1)


def latch(n, at, rng):
    """A door's latch going home: a click and its little metal ring, and the door's weight."""
    y = np.zeros(n)
    i = int(at * SR)
    if i >= n:
        return np.zeros((n, 2))
    k = min(n - i, int(0.5 * SR))
    t = np.arange(k) / SR
    click = rng.standard_normal(k) * np.exp(-t / 0.004)
    ring = sum(np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) * np.exp(-t / d) * g for f, d, g in ((1870, 0.03, 0.5), (3240, 0.018, 0.3), (5110, 0.01, 0.15)))
    thud = np.sin(2 * np.pi * 92 * t) * np.exp(-t / 0.06) * 1.4
    y[i:i + k] = fft_filter(click, lo=900, hi=9000) * 2.5 + ring + thud
    y *= 10 ** (-22 / 20) / (np.abs(y).max() + 1e-9)
    return np.stack([y * 0.62, y * 0.78], 1)


def room(n, rng):
    """A small, still room's air: a soft, dark breath of noise, slowly changing."""
    b = fft_filter(rng.standard_normal((n, 2)), lo=25, hi=700, order=1)
    b *= 1 + 0.15 * slow_noise(n, 0.2, rng)[:, None]
    b /= np.sqrt((b ** 2).mean()) + 1e-12
    return b * 10 ** (ROOM_DB / 20)


# how loud each voice is in a mix (dB): drawing quiet, taking back heard (docs/reviews/2026-10-things.md, 16)
MIXES = {'eraser': {'charcoal': -12.0, 'side': -12.0, 'pencil': -10.0, 'smudge': -6.0, 'erase': 0.0},
         'eraser-only': {'charcoal': None, 'side': None, 'pencil': None, 'smudge': None, 'erase': 0.0},
         'full': {v: 0.0 for v in VOICES}}


def foley(items, length, events=(), seed=7, mix_name='eraser'):
    """The soundtrack (stereo, SR): the voices as `mix_name` has them, the events, the room; set to
    TARGET_LUFS."""
    rng = np.random.default_rng(seed)
    n = int(length * SR)
    acts = activity(items, length)
    gains = MIXES[mix_name]
    mix = np.zeros((n, 2))
    for v in VOICES:
        y = voice(v, acts[v], n, rng)           # (made in order, so the noise is the same in every mix)
        if gains[v] is not None:
            mix = mix + y * 10 ** (gains[v] / 20)
    for kind, at in events:
        if kind == 'latch':
            mix = mix + latch(n, at, rng)
    # the paper is on a wall, in a room: a short, quiet tail
    mix = mix + 0.12 * convolve(mix, small_room(rng, rt60=0.28))
    lu = integrated(mix) if np.abs(mix).max() > 0 else -70.0
    if lu > -70:
        mix *= 10 ** ((TARGET_LUFS - lu) / 20)
    mix = mix + room(n, rng)
    peak = np.abs(mix).max()
    if peak > 10 ** (-3 / 20):
        mix *= 10 ** (-3 / 20) / peak
    return mix


def write(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2').tobytes()
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '2', '-i', '-', path], input=pcm, check=True)


if __name__ == '__main__':
    marks_path, out, length = sys.argv[1], sys.argv[2], float(sys.argv[3])
    data = json.load(open(marks_path))
    items = [(it['t0'], it['t1'], it['mark']) for it in data['items']]
    write(out, foley(items, length, [tuple(e) for e in data.get('events', [])]))
