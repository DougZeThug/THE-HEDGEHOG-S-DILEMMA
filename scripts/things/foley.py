"""The sound of "Things I Should Have Said" (docs/things.md): the drawing heard as it is made, from
the same list of marks the picture is made from (timeline.py), so every sound is where its mark is.

Each mark is heard by what it means, not by what tool made it (docs/reviews/2026-10-things.md):

    taking back   the eraser lifting what was imagined, the door, the people at the end: the
                  sound the film is about, its reference level
    happened      what happened being drawn (the goodbye, his walk, the door, the casing
                  worked): a hand on paper, well under the eraser
    imagined      what is only imagined: quieter still, or silent (the `weight` mix)
    rub           a revision's own rubbing out of a line it is about to draw again: the eraser,
                  a few strokes, under a taking back
    end           the people taken at the end: the eraser, well under a taking back (as loud,
                  erasing them sounded the same as taking back an almost: the skeptic)

The default mix (`revisit`, v2: the artist's review, 2026-10-22) leaves what happened silent but
for the latch, and lets the hand that revises be heard: its pencil faint as it finds what is only
imagined, its rubbing under the eraser that takes it back.

One hand draws, so one tool sounds at a time (the loudest, crossfaded), as loud as the strongest
mark it is making (a pass of a hundred overlapping strokes is one hand moving fast, not a hundred
hands); where it is moves slowly, as an arm does.

    charcoal    grains: the stick catching on the paper's tooth, as often as it moves past it;
                now and then a crumble
    side        the stick laid flat: a broad, soft hiss with a little grain
    pencil      narrow and slick, a faint squeak under pressure
    eraser      a hand scrubbing, three to six times a second: rubber's stick-slip chatter and the
                paper's rustle, a dip at each turn and a small knock as it reverses

Every voice rings a little in the same sheet (two soft resonances, the paper on its board). A
door's latch can be laid at a time (`events`): a bolt over the strike plate and into the keeper,
the door's slab knocking home. The film's own small room and its air are for the film alone; the
room's copy leaves them out (the white room is the room). Nothing is recorded: all of it is made
here, seeded, the same each time.

    python3 scripts/things/foley.py SHEET.json OUT.wav [MIX] [--room 0]
"""
import json
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'almost'))
from sound import SR, convolve, fft_filter, momentary, slow_noise, small_room  # noqa: E402

CR = 1000                     # the control rate of the voices' activity (Hz)
W = 1280                      # the sheet's width (for where a mark is, left to right)
PAN = 0.6                     # the hand's place across the frame, about ±6 dB at its edges (at 0.3 a take-back on the jamb
                              # was heard 1 dB right: the cinematic director)
HAND_SPEED = 1500.0           # px/s: the fastest a hand moves (the timeline compresses marks faster)

# the drawing voices: band (Hz), level (dB, at full pressure)
VOICES = {
    'charcoal': dict(band=(700, 7000), level=-20.0),
    'side': dict(band=(260, 3600), level=-24.0),
    'pencil': dict(band=(2200, 9000), level=-28.0),
}
TOOL_VOICE = {'charcoal': 'charcoal', 'compressed': 'charcoal', 'side': 'side', 'side_firm': 'side', 'pencil': 'pencil', 'hardpencil': 'pencil'}

# what each mark means, by the name film.py gave its move
TAKE = ('c1/door', 'c1/out', 'c2/out')
END = ('end/',)                      # the people taken at the end: under a taking back
IMAGINED = ('c1/', 'c2/')            # (after TAKE and a revision's rubs: what is left of c1/ and c2/ is drawn)
# each meaning's level against the eraser (LU), per mix; None is silent
MIXES = {
    'revisit': {'take': 0.0, 'rub': -7.0, 'end': -11.0, 'happened': None, 'imagined': -13.0},   # (at -20 the pencil was 1-3 dB over the floor: the cinematic director)
    'eraser': {'take': 0.0, 'rub': -7.0, 'end': -11.0, 'happened': -14.0, 'imagined': -24.0},
    'eraser-only': {'take': 0.0, 'rub': -7.0, 'end': -11.0, 'happened': None, 'imagined': None},
    'weight': {'take': 0.0, 'rub': -7.0, 'end': -11.0, 'happened': -14.0, 'imagined': None},
}
DEFAULT_MIX = 'revisit'
ERASER_LUFS = -33.5           # the eraser's median momentary loudness while it sounds (Memory II's figures sit about here)
LATCH_UNDER = 5.0             # the latch's loudest moment, this far under the eraser's (LU)
ROOM_DB = -64.0
END_FADE = 0.6                # s: the last strokes of a taking back ease off ...
END_GAP = 0.4                 # ... and the hand lifts before the silence


def meaning_of(mark):
    n = mark['name']
    if n.startswith(TAKE):
        return 'take'
    if n.startswith(END):
        return 'end'
    if '/rub/' in n:
        return 'rub'
    if n.startswith(IMAGINED):
        return 'imagined'
    return 'happened'


def voice_of(mark):
    if mark['kind'] == 'erase':
        # a scrub of what happened (a step of his walk) is a hand's swish, not a taking back
        return 'erase' if meaning_of(mark) in ('take', 'rub', 'end') else 'side'
    if mark['kind'] == 'smudge':
        return None                       # (a finger on the dust: masked, one more sound at once)
    return TOOL_VOICE.get(mark.get('tool'), 'charcoal')


def _length(pts):
    p = np.asarray(pts, np.float32)
    return float(np.linalg.norm(np.diff(p, axis=0), axis=1).sum()) if len(p) > 1 else 0.0


def activity(items, length, gains):
    """Each voice's loudness (0..), speed (px/s) and place (-1 left .. 1 right) at the control
    rate: the strongest mark of the voice at each moment, weighted by what it means."""
    n = int(length * CR) + 1
    out = {v: (np.zeros(n), np.zeros(n), np.zeros(n)) for v in list(VOICES) + ['erase']}
    ends = {}
    for t0, t1, m in items:
        if meaning_of(m) == 'take':
            k = next(p for p in TAKE if m['name'].startswith(p))
            ends[k] = max(ends.get(k, 0.0), t1)
    for t0, t1, m in items:
        if t1 - t0 < 1e-3:
            continue                      # laid at once (a drawing already there): no sound
        v = voice_of(m)
        g = gains[meaning_of(m)]
        if v is None or g is None:
            continue
        a, s, x = out[v]
        i0, i1 = max(0, int(t0 * CR)), min(n, int(t1 * CR) + 1)
        if i1 <= i0:
            continue
        k = i1 - i0
        p = np.asarray(m.get('pressure') or [m.get('strength', m.get('amount', 0.7))], np.float64)
        prof = np.interp(np.linspace(0, 1, k), np.linspace(0, 1, len(p)), p) if len(p) > 1 else np.full(k, p[0])
        edge = np.minimum(1.0, np.minimum(np.arange(k) + 1, k - np.arange(k)) / (0.012 * CR))
        env = np.clip(prof, 0, 1.2) * edge * 10 ** (g / 20)
        if meaning_of(m) == 'take':
            # a taking back ends easing off (about 10 dB), and the hand lifts before the silence
            end = ends[next(p for p in TAKE if m['name'].startswith(p))]
            tt = (i0 + np.arange(k)) / CR
            env *= np.where(tt < end - END_GAP, 0.3 + 0.7 * np.clip((end - END_GAP - tt) / END_FADE, 0, 1), 0.0)
        speed = min(HAND_SPEED, _length(m['pts']) / max(t1 - t0, 1e-3))
        place = float(np.clip(np.mean(np.asarray(m['pts'], np.float32)[:, 0]) / W * 2 - 1, -1, 1))
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


def one_hand(acts):
    """One drawing tool sounds at a time: at each moment the loudest, crossfaded over 50 ms."""
    names = list(VOICES)
    stack = np.stack([acts[v][0] * 10 ** (VOICES[v]['level'] / 20) for v in names])
    win = np.argmax(stack, 0)
    for i, v in enumerate(names):
        a, s, x = acts[v]
        keep = _smooth((win == i).astype(float) * (stack.max(0) > 0), 50)
        acts[v] = (a * keep, s, x)
    return acts


def grains(n, rate, rng, lo, hi, size=0.0015):
    """Sparse clicks, `rate` a second (varying), each a short filtered burst."""
    p = rng.random(n) < np.asarray(rate) / SR
    imp = p * rng.uniform(0.4, 1.0, n)
    k = max(4, int(size * SR))
    burst = rng.standard_normal(k) * np.exp(-np.arange(k) / (k / 4))
    y = np.convolve(imp, burst, mode='same')
    return fft_filter(y, lo=lo, hi=hi, order=2)


def body(y):
    """The sheet on its board: two soft resonances (about 450 Hz and 2.5 kHz), +4 dB."""
    n = len(y)
    f = np.fft.rfftfreq(n, 1 / SR)
    g = 1 + 0.58 * np.exp(-0.5 * ((f - 450) / 160) ** 2) + 0.58 * np.exp(-0.5 * ((f - 2500) / 700) ** 2)
    Y = np.fft.rfft(y, axis=0)
    return np.fft.irfft(Y * (g[:, None] if y.ndim == 2 else g), n=n, axis=0)


def _pan(y, pl):
    left, right = np.sqrt(0.5 - 0.5 * pl), np.sqrt(0.5 + 0.5 * pl)
    return np.stack([y * left, y * right], 1)


def _norm(y):
    return y / (np.sqrt((y ** 2).mean()) + 1e-12)


def drawing_voice(name, act, n, rng):
    spec = VOICES[name]
    a, s, x = act
    amp = _up(_smooth(a, 8), n)
    if amp.max() <= 0:
        return np.zeros((n, 2))
    sp = _up(_smooth(s, 40), n)
    pl = _up(_smooth(x, 300), n) * PAN
    lo, hi = spec['band']
    fast = np.clip(sp / HAND_SPEED, 0, 1)
    if name == 'charcoal':
        # the tooth: a grain each time the stick passes a ridge (about 3 px apart), crumbs now and then
        y = _norm(grains(n, 40 + sp / 3.0, rng, lo, hi)) * 0.9
        y += _norm(fft_filter(rng.standard_normal(n), lo=lo, hi=hi, order=2)) * 0.35
        y += _norm(grains(n, 1.5 + 4 * fast, rng, 300, 3000, size=0.012)) * 0.5
    elif name == 'side':
        y = _norm(fft_filter(rng.standard_normal(n), lo=lo, hi=hi, order=1))
        y += _norm(grains(n, 20 + sp / 6.0, rng, 600, 4000)) * 0.4
    else:
        y = _norm(fft_filter(rng.standard_normal(n), lo=lo, hi=hi, order=3))
        # under pressure a faint squeak, wandering
        f0 = 1800 + 600 * slow_noise(n, 2.0, rng)
        y += 0.05 * np.sin(2 * np.pi * np.cumsum(f0) / SR) * np.clip(amp * 1.5 - 0.6, 0, 1)
    y = _norm(y)
    y = np.clip(y, -7.5, 7.5)                    # (a grain no more than 2.5x the voice's peak)
    y *= amp * 10 ** (spec['level'] / 20)
    return _pan(y, pl)


def eraser_voice(act, n, rng):
    """A hand scrubbing: strokes back and forth at 3-6 a second (faster the more there is to
    take), each swelling and dipping to almost nothing at its turn, the push a little stronger
    than the pull; rubber's stick-slip chatter and the paper's rustle; a small knock at each
    reversal. How much is being erased sets its loudness and pace, never adds strokes."""
    a, s, x = act
    amp = _up(_smooth(a, 60), n)
    if amp.max() <= 0:
        return np.zeros((n, 2))
    on = amp > 0.01
    rate = 3.0 + 3.0 * np.clip(_up(_smooth(np.minimum(s, HAND_SPEED), 200), n) / HAND_SPEED, 0, 1)
    rate *= 1 + 0.12 * slow_noise(n, 1.5, rng)
    phase = np.cumsum(rate / SR * np.pi * on)
    stroke = np.abs(np.sin(phase))
    shape = 0.12 + 0.88 * stroke ** 0.8                            # the turn: down about 18 dB
    half = (phase / np.pi).astype(np.int64)
    push = np.where(half % 2 == 0, 1.0, 0.85)
    # stick-slip: a jittered pulse train (120-380 Hz, faster as the stroke speeds)
    f = (120 + 260 * stroke) * (1 + 0.05 * rng.standard_normal(n))
    pulses = np.diff(np.floor(np.cumsum(f / SR)), prepend=0) > 0
    chatter = _norm(fft_filter(pulses * rng.uniform(0.5, 1.0, n), lo=90, hi=1800, order=2))
    rustle = _norm(fft_filter(rng.standard_normal(n), lo=900, hi=6500, order=2))
    y = (0.7 * chatter + 0.55 * rustle) * shape * push
    # the knock as it reverses
    turns = np.nonzero(np.diff(half) > 0)[0]
    k = int(0.018 * SR)
    knock = fft_filter(rng.standard_normal(k), lo=80, hi=320, order=2) * np.exp(-np.arange(k) / (k / 5))
    knock /= np.abs(knock).max() + 1e-9
    for i in turns:
        j = min(n, i + k)
        y[i:j] += knock[:j - i] * 1.1
    y *= amp
    pl = _up(_smooth(x, 300), n) * PAN
    return _pan(y, pl)


def latch(n, at, rng):
    """A door's latch going home: the bolt riding over the strike plate and snapping into the
    keeper (two clicks 30 ms apart, the second larger), each ringing in a few metal modes; the
    slab knocking against the stop; a small rattle after."""
    y = np.zeros(n)
    i = int(at * SR)
    if i >= n:
        return np.zeros((n, 2))
    k = min(n - i, int(0.6 * SR))
    t = np.arange(k) / SR

    def click(t0, g):
        tt = np.clip(t - t0, 0, None)
        gate = t >= t0
        burst = rng.standard_normal(k) * np.exp(-tt / 0.0025) * gate
        out = fft_filter(burst, lo=1500, hi=9000, order=2) * 1.4
        for fm, d, gm in ((1870, 0.025, 0.6), (3240, 0.016, 0.45), (5110, 0.009, 0.3), (7300, 0.006, 0.2)):
            ring = fft_filter(burst, lo=fm * 0.94, hi=fm * 1.06, order=3)
            out += ring / (np.abs(ring).max() + 1e-9) * gm * np.exp(-tt / d) * gate
        return out * g
    y_ = click(0.0, 0.55) + click(0.03, 1.0)
    slab = fft_filter(rng.standard_normal(k), lo=150, hi=600, order=2) * np.exp(-np.clip(t - 0.028, 0, None) / 0.03) * (t >= 0.028)
    y_ += slab / (np.abs(slab).max() + 1e-9) * 0.7
    rattle = fft_filter(rng.standard_normal(k), lo=2000, hi=7000, order=2) * np.exp(-np.clip(t - 0.11, 0, None) / 0.012) * (t >= 0.11)
    y_ += rattle / (np.abs(rattle).max() + 1e-9) * 0.12
    y[i:i + k] = y_
    return np.stack([y * 0.62, y * 0.78], 1)


def room(n, rng):
    """A small, still room's air: a soft, dark breath of noise, slowly changing."""
    b = fft_filter(rng.standard_normal((n, 2)), lo=25, hi=700, order=1)
    b *= 1 + 0.15 * slow_noise(n, 0.2, rng)[:, None]
    b /= np.sqrt((b ** 2).mean()) + 1e-12
    return b * 10 ** (ROOM_DB / 20)


def _active_median(x, floor_db=-60.0):
    t, m = momentary(x)
    m = m[m > floor_db]
    return float(np.median(m)) if len(m) else None


def foley(items, length, events=(), seed=7, mix_name='eraser', with_room=True):
    """The soundtrack (stereo, SR): the voices as `mix_name` hears each meaning, the events, and
    (for the film alone) its small room and air. The eraser is set to ERASER_LUFS in every mix,
    and everything else relative to it."""
    rng = np.random.default_rng(seed)
    n = int(length * SR)
    gains = MIXES[mix_name]
    acts = one_hand(activity(items, length, gains))
    era = body(eraser_voice(acts['erase'], n, rng))
    draw_ = np.zeros((n, 2))
    for v in VOICES:
        draw_ = draw_ + drawing_voice(v, acts[v], n, rng)
    draw_ = body(draw_)
    ref = _active_median(era)
    g = 10 ** ((ERASER_LUFS - ref) / 20) if ref is not None else 1.0
    era, draw_ = era * g, draw_ * g
    # the drawing's peaks never above the eraser's
    ep, dp = np.abs(era).max(), np.abs(draw_).max()
    if ep > 0 and dp > ep:
        draw_ *= ep / dp
    mix = era + draw_
    if with_room:
        mix = mix + 0.12 * convolve(mix, small_room(rng, rt60=0.28))
    era_max = float(momentary(era)[1].max()) if ref is not None else ERASER_LUFS + 6
    for kind, at in events:
        if kind == 'latch':
            lt = latch(n, at, rng)
            if with_room:
                lt = lt + 0.2 * convolve(lt, small_room(rng, rt60=0.35))
            lmax = float(momentary(lt)[1].max())
            mix = mix + lt * 10 ** ((era_max - LATCH_UNDER - lmax) / 20)
    if with_room:
        mix = mix + room(n, rng)
    peak = np.abs(mix).max()
    if peak > 10 ** (-3 / 20):
        mix *= 10 ** (-3 / 20) / peak
    return mix


def write(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2').tobytes()
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '2', '-i', '-', path], input=pcm, check=True)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--') and a not in ('0', '1')]
    with_room = '--room' not in sys.argv or sys.argv[sys.argv.index('--room') + 1] != '0'
    data = json.load(open(args[0]))
    items = [(it['t0'], it['t1'], it['mark']) for it in data['items']]
    write(args[1], foley(items, data['length'], [tuple(e) for e in data.get('events', [])], mix_name=args[2] if len(args) > 2 else 'eraser',
                         with_room=with_room))
