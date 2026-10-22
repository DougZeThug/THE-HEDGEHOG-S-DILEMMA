"""The sound of "Things I Should Have Said" (docs/things.md; the artist's sound brief of 2026-10-22):
an ordinary goodbye in a real flat, then someone unable to stop changing it. Made from the film's own
exposure sheet (story.py's sheet.json), so every sound is where its mark or its moment is. Nothing
is recorded but the piano (FreePats Upright Piano KW, CC0, through scripts/woodland-score/piano.py);
the rest is made here, seeded, the same each time.

    the wall      the goodbye drawing itself on the white room's wall: charcoal, the stick's side,
                  hard pencil, close (its own cue, `wall`)
    the flat      carried in, the drawing is a place: a flat's air, traffic far off, the stairwell
                  light's hum through the open door; her sleeve, his coat, the carrier bag, his
                  shoes on the boards, then in the stairwell, going; the door on its closer, the
                  latch. The latch shuts the stairwell out; the flat recedes, darkening, and is
                  gone a breath after the eraser has begun
    the paper     the remembering: very close and dry, no room: the hard pencil finding a body, the
                  pencil drawing it, touched down and lifted once a gesture; the rubber rubbing a
                  line out to draw it again; the door lifted; his almost taken back; hers, heavier;
                  the people taken at the end, each erasure quieter. Then nothing: the room's own
                  hushed air is the last silence
    the thought   (Mix B only) two notes on a piano, played softly, while his hand is held; in
                  hers, the first note only. The second is never played again

    .venv-audio/bin/python scripts/things/soundscape.py SHEET.json OUT_DIR [--piano DIR] [--room a|b]

(numpy, scipy, soundfile: python3 -m venv .venv-audio && .venv-audio/bin/pip install numpy scipy
soundfile.) SHEET.json is story.py's; DIR is the Upright Piano KW folder (FreePats, CC0:
http://freepats.zenvoid.org/Piano/acoustic-grand-piano.html#UprightKW), without which Mix B is not
made. Writes OUT_DIR/mix-a.wav, mix-b.wav (the whole sheet), wall.wav (sheet 0-6) and stems. With
--room, the room's files from that mix: public/music/things-film.mp3 (from FROM, no room of its own:
the white room is the room), things-wall.mp3 (the wall's goodbye), and in things-sound.json what
they were made from (emergence.py writes its beats there first).
"""
import hashlib
import json
import math
import os
import subprocess
import sys

import numpy as np
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'almost'))
sys.path.insert(0, os.path.join(HERE, '..', 'woodland-score'))

import foley as F  # noqa: E402
from sound import SR, convolve, fft_filter, momentary, slow_noise, small_room  # noqa: E402

FROM = 6.0                       # where the room's film begins (emergence.py)
ERASER_LUFS = -33.5              # the reference (Memory II's figures): each layer is placed from it
# Every layer by its measured loudness against the reference (LU), so a change in one never moves the
# others (as gains on voices of their own levels, the pencil came out 32 LU under: the cinematic
# director). Momentary medians while each sounds; the flat's air its whole. (The room plays the film
# 9 dB down over its own hushed hum: under about -55 LUFS here, nothing reaches a visitor: the
# skeptic. So the flat, the pencil and the steps are up, and nothing is left at the edge of hearing.)
UNDER = {
    'flat': -12.0,               # the air, the traffic, the stairwell's hum: inhabited, extraordinarily quiet
    'people': -4.0,              # her sleeve, his coat, the bag, his steps (their loudest moments)
    'latch': -2.0,               # the latch's loudest moment: the goodbye's loudest
    'pencil': -9.0,              # what is imagined being drawn
    'build': -17.0,              # its construction, the hard pencil
    'rub': -14.0,                # a line rubbed out to be drawn again (at -7 it was heard as a taking back
                                 # inside his turn, before anything was taken: the skeptic)
    'lift': -4.0,                # the door lifted: the moment reopened
    'take': 1.5,                 # his almost taken back
    'take2': 5.5,                # hers: heavier, the second time (each levelled on its own: sharing a
                                 # median with the quiet lift, his came out louder than hers: both directors)
    'end': -3.5,                 # the people taken at the end, its loudest moment (the first): tired,
                                 # and fading as it goes
    'piano': -6.0,               # (B) the notes, their loudest moments (in the holds about -43: in the
                                 # room, over its hush, just there)
    'wall': -8.0,                # the goodbye drawn on the wall (its own cue)
}
PIANO_SFZ = None                 # Mix B's piano: --piano DIR (the Upright Piano KW folder)
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
MUSIC = os.path.join(ROOT, 'public', 'music')


# ---------------------------------------------------------------- the sheet
def span(items, prefix):
    """(first start, last end) of the marks whose names begin with `prefix`."""
    mine = [(a, b) for a, b, m in items if m['name'].startswith(prefix)]
    return (min(a for a, _ in mine), max(b for _, b in mine)) if mine else (None, None)


# ---------------------------------------------------------------- small tools
def lay(buf, y, at):
    i = int(round(at * SR))
    if y.ndim == 1:
        y = np.stack([y, y], 1)
    j0, j1 = max(0, i), min(len(buf), i + len(y))
    if j1 > j0:
        buf[j0:j1] += y[j0 - i:j1 - i]


def panned(y, p):
    """Mono `y` at `p` (-1 left .. 1 right), equal power."""
    a = (p + 1) * math.pi / 4
    return np.stack([y * math.cos(a), y * math.sin(a)], 1)


def burst(rng, dur, lo, hi, decay, order=2):
    n = max(8, int(dur * SR))
    tt = np.arange(n) / SR
    return fft_filter(rng.standard_normal(n), lo=lo, hi=hi, order=order) * np.exp(-tt / decay)


def ramp(n, points):
    """A gain over the sheet: [(s, gain)], linear between, held at the ends."""
    tt = np.arange(n) / SR
    xs, ys = zip(*points)
    return np.interp(tt, xs, ys)


def median_lufs(x, floor=-75.0):
    t, m = momentary(x)
    m = m[m > floor]
    return float(np.median(m)) if len(m) else None


def peak_lufs(x):
    return float(momentary(x)[1].max())


def at_level(x, target, how='median'):
    ref = median_lufs(x) if how == 'median' else peak_lufs(x)
    return x if ref is None else x * 10 ** ((target - ref) / 20)


# ---------------------------------------------------------------- the flat
def flat(n, rng, latch_at, lift, gone_at):
    """The flat's own sound, from the first frame the room sees (FROM): its air, traffic far off
    through a closed window, and the stairwell's light humming through the open door, on the right.
    The latch shuts the stairwell out; a breath later the flat begins to go, its top first, and is
    still there, darkened, under the eraser lifting the door (`lift`), gone by `gone_at`: a
    withdrawal, not a cut (the skeptic)."""
    air = F.room(n, rng)
    # traffic: a low, slow wash, a car far off once
    brown = np.cumsum(rng.standard_normal(n)) / math.sqrt(SR)
    traffic = fft_filter(brown, lo=30, hi=260, order=2)
    traffic /= np.sqrt((traffic ** 2).mean()) + 1e-12
    traffic *= 10 ** ((-6 + 2.5 * slow_noise(n, 0.05, rng)) / 20)
    car = fft_filter(rng.standard_normal(n), lo=140, hi=650, order=2)
    car /= np.sqrt((car ** 2).mean()) + 1e-12
    tt = np.arange(n) / SR
    car *= np.exp(-0.5 * ((tt - 8.4) / 1.4) ** 2) * 0.5
    world = np.stack([traffic * 0.8 + car * 0.6, traffic * 0.8 + car * 0.45], 1) + air * 10 ** (64 / 20) * 0.6
    # the stairwell light: mains hum and its harmonics, far, through the doorway (right)
    hum = sum(a * np.sin(2 * math.pi * f * tt + rng.uniform(0, 6.28)) for f, a in ((100, 1.0), (200, 0.5), (300, 0.22), (400, 0.12)))
    hum = hum * (1 + 0.04 * slow_noise(n, 0.3, rng)) * 0.35
    door = np.interp(tt, [0, 11.6, 13.0, latch_at, latch_at + 0.01], [1, 1, 0.45, 0.25, 0.0])
    world = world + panned(hum * door, 0.2)
    # in over a second as the film begins; held a breath after the latch; then gone, the top first
    g = np.interp(tt, [FROM, FROM + 1.2, latch_at + 1.0, lift, gone_at], [0, 1, 1, 0.6, 0])
    dark = np.interp(tt, [latch_at + 1.0, lift], [0, 1])
    lp = np.stack([fft_filter(world[:, c], hi=300, order=2) for c in range(2)], 1)
    return (world * (1 - dark)[:, None] + lp * dark[:, None]) * g[:, None]


def shoe(rng, hard=1.0):
    """A man's shoe on a board floor: the boards' thud, the heel's knock, the sole after it."""
    n = int(0.14 * SR)
    def part(at, lo, hi, decay):
        y = np.zeros(n)
        k = int(at * SR)
        b = burst(rng, (n - k) / SR, lo, hi, decay, 2)[:n - k]
        y[k:k + len(b)] = b
        return y / (np.abs(y).max() + 1e-9)
    # (the heel carries it: 78% of the step was under 350 Hz, which a phone's speaker drops: the
    # sound designer)
    y = part(0.0, 80, 300, 0.035) * 0.7 + part(0.0, 1200, 4500, 0.006) * 1.0 * hard + part(0.035, 700, 3500, 0.02) * 0.5
    return y * rng.uniform(0.85, 1.0)


def rustle(rng, dur, lo=500, hi=4500, swells=2):
    """Cloth moving: soft noise in a few swells."""
    n = int(dur * SR)
    y = fft_filter(rng.standard_normal(n), lo=lo, hi=hi, order=2)
    tt = np.linspace(0, 1, n)
    env = sum(np.exp(-0.5 * ((tt - c) / 0.18) ** 2) * rng.uniform(0.5, 1.0) for c in np.linspace(0.25, 0.75, swells))
    return y * env / (np.abs(y * env).max() + 1e-9)


def crinkle(rng, dur, rate=45.0):
    """The plastic carrier bag: sparse crackles over a faint hiss."""
    n = int(dur * SR)
    imp = (rng.random(n) < rate / SR) * rng.uniform(0.2, 1.0, n) ** 2
    y = fft_filter(np.convolve(imp, np.exp(-np.arange(int(0.002 * SR)) / (0.0004 * SR)), 'same'), lo=2200, hi=9500, order=2)
    y = y / (np.abs(y).max() + 1e-9) + fft_filter(rng.standard_normal(n), lo=3000, hi=9000, order=1) * 0.05
    return y * np.sin(np.linspace(0, math.pi, n)) ** 0.5


def people(n, rng, items, latch_at):
    """Her sleeve as she waves; his coat and the bag as he lifts it, as he turns; his shoes on the
    boards (three steps), then in the stairwell, going (further, more of its echo, quieter); the
    door's closer breathing as it swings; the latch, its slab's knock, the air it pushes; the flat's
    small room round all of it."""
    out = np.zeros((n, 2))
    wave = span(items, 'real/wave1/')[0] or 6.6
    nod = span(items, 'real/wave2/')[0] or 7.2
    turn = span(items, 'real/turn/')[0] or 8.0
    # each step as its new position is drawn (the first stroke of it, not the old one's erasing: the
    # steps landed 0.15-0.25 s ahead of the picture: the sound designer)
    drawn = lambda k: min((a for a, b, m in items if m['name'].startswith(f'real/{k}/') and m['kind'] == 'stroke'), default=None)
    steps = [drawn(k) for k in ('going0', 'going2', 'going4')]
    swing = span(items, 'real/door1/')[0] or 11.6
    lay(out, panned(rustle(rng, 0.55, 600, 3800) * 0.35, -0.45), wave)
    lay(out, panned(rustle(rng, 0.6, 400, 4200, 3) * 0.6, 0.0), nod - 0.05)
    lay(out, panned(crinkle(rng, 0.45) * 0.45, 0.05), nod)
    lay(out, panned(rustle(rng, 0.7, 350, 4500, 3) * 0.8, 0.05), turn - 0.05)
    lay(out, panned(crinkle(rng, 0.4) * 0.35, 0.1), turn + 0.1)
    for k, t in enumerate(s for s in steps if s is not None):
        p = 0.05 + 0.05 * k
        lay(out, panned(shoe(rng, 1.0 - 0.1 * k) * (1.0 - 0.12 * k), p), t)
        lay(out, panned(crinkle(rng, 0.25, 30) * 0.18, p), t + 0.08)
    # in the stairwell, behind the door (not off to the right of it: the sound designer): further,
    # its own echo
    hall = small_room(rng, rt60=0.9, predelay=0.012)
    far = np.zeros((n, 2))
    for k, t in enumerate((10.95, 11.55, 12.15, 12.75)):
        lay(far, panned(shoe(rng, 0.7) * 0.55 * 0.72 ** k, 0.2), t)
    far = np.stack([fft_filter(far[:, c], hi=2400 - 300 * 1, order=1) for c in range(2)], 1)
    out += far * 0.5 + convolve(far, hall) * 0.5
    # the door: a soft knock of the leaf as it starts, the closer's breath as it swings
    lay(out, panned(burst(rng, 0.08, 120, 900, 0.015) * 0.25, 0.35), swing)
    sw = int((latch_at - swing) * SR)
    breath = fft_filter(rng.standard_normal(sw), lo=700, hi=3200, order=2)
    breath *= np.linspace(1, 0.35, sw) * np.sin(np.linspace(0, math.pi, sw)) ** 0.3
    lay(out, panned(breath / (np.abs(breath).max() + 1e-9) * 0.12, 0.35), swing)
    room = small_room(rng, rt60=0.42, predelay=0.006)
    out = out + convolve(out, room) * 0.3
    # the latch (foley.latch, two clicks and the slab's knock) and its decay in the room (a 48 Hz sine
    # for the air it pushes read as a kick drum: the sound designer)
    lt = F.latch(n, latch_at, rng)
    lt = lt + convolve(lt, small_room(rng, rt60=0.55, predelay=0.005)) * 0.35
    return out, lt


# ---------------------------------------------------------------- the paper
def eraser(act, n, rng, rate=(3.0, 3.0), push=0.85, weight=0.0, grit=1.0, knock=1.1):
    """foley.eraser_voice with a hand of its own: `rate` its strokes a second (slowest, added at
    its fastest); `push` the pull against the push; `weight` the paper's thud under a heavier hand
    (a body pressed into it); `grit` the rubber's stick-slip."""
    a, s, x = act
    amp = F._up(F._smooth(a, 60), n)
    if amp.max() <= 0:
        return np.zeros((n, 2))
    on = amp > 0.01
    r = rate[0] + rate[1] * np.clip(F._up(F._smooth(np.minimum(s, F.HAND_SPEED), 200), n) / F.HAND_SPEED, 0, 1)
    r *= 1 + 0.12 * slow_noise(n, 1.5, rng)
    phase = np.cumsum(r / SR * np.pi * on)
    stroke = np.abs(np.sin(phase))
    shape = 0.12 + 0.88 * stroke ** 0.8
    half = (phase / np.pi).astype(np.int64)
    pull = np.where(half % 2 == 0, 1.0, push)
    f = (120 + 260 * stroke) * (1 + 0.05 * rng.standard_normal(n))
    pulses = np.diff(np.floor(np.cumsum(f / SR)), prepend=0) > 0
    chatter = F._norm(fft_filter(pulses * rng.uniform(0.5, 1.0, n), lo=90, hi=1800, order=2))
    rustle_ = F._norm(fft_filter(rng.standard_normal(n), lo=900, hi=6500, order=2))
    y = (0.7 * grit * chatter + 0.55 * rustle_) * shape * pull
    if weight > 0:
        thud = F._norm(fft_filter(rng.standard_normal(n), lo=60, hi=320, order=2))
        y = y + weight * thud * shape ** 2
    turns = np.nonzero(np.diff(half) > 0)[0]
    kk = int(0.018 * SR)
    kn = fft_filter(rng.standard_normal(kk), lo=80, hi=320, order=2) * np.exp(-np.arange(kk) / (kk / 5))
    kn /= np.abs(kn).max() + 1e-9
    for i in turns:
        j = min(n, i + kk)
        y[i:j] += kn[:j - i] * knock
    y *= amp
    return F._pan(y, F._up(F._smooth(x, 300), n) * F.PAN)


def touches(items, n, rng, select, hard=False):
    """The pencil touching down and lifting, once a gesture: strokes that follow each other within
    150 ms are one movement of the hand, with one tick as its point meets the paper (as hard as the
    gesture presses at its hardest) and a breath of a lift at its end. (A tick at every stroke's
    onset, 36-80 a second, was a crackle, and the pencil one hiss: the sound designer.)"""
    out = np.zeros((n, 2))
    sel = sorted((t0, t1, m) for t0, t1, m in items if select(m) and t1 - t0 >= 1e-3 and m['kind'] == 'stroke')
    gestures = []
    for t0, t1, m in sel:
        p = float(np.max(m.get('pressure') or [0.6]))
        x = float(np.clip(np.mean(np.asarray(m['pts'], np.float32)[:, 0]) / F.W * 2 - 1, -1, 1)) * F.PAN
        if gestures and t0 - gestures[-1]['t1'] < 0.15:
            g = gestures[-1]
            g['t1'] = max(g['t1'], t1)
            if p > g['p']:
                g['p'], g['x'] = p, x
        else:
            gestures.append({'t0': t0, 't1': t1, 'p': p, 'x': x})
    lo, hi = (3500, 11000) if hard else (2200, 9000)
    for g in gestures:
        tick = burst(rng, 0.012, lo, hi, 0.0018 if hard else 0.0028)
        lay(out, panned(tick / (np.abs(tick).max() + 1e-9) * (0.4 + 0.8 * g['p']), g['x']), g['t0'])
        lift = burst(rng, 0.03, 2500, 8000, 0.008)
        lay(out, panned(lift / (np.abs(lift).max() + 1e-9) * 0.05 * g['p'], g['x']), g['t1'])
    return out


def drawing(items, n, rng, select):
    """The drawing voices (foley.drawing_voice) of the marks `select` keeps, one hand."""
    sel = [(a, b, m) for a, b, m in items if select(m)]
    acts = F.one_hand(F.activity(sel, n / SR, {k: 0.0 for k in ('take', 'rub', 'end', 'happened', 'imagined')}))
    y = np.zeros((n, 2))
    for v in F.VOICES:
        y = y + F.drawing_voice(v, acts[v], n, rng)
    return F.body(y), acts


# ---------------------------------------------------------------- the thought (Mix B)
def piano_figure(n, his_hold, her_hold):
    """Two notes, softly, on the upright, while his hand is held (B3, then C#4: a step up, nowhere to
    go); in hers, while the two hands are held a finger's width apart, the first note only. Nothing
    after: the last silence is the second note not played. (Not a held tone: it filled the film's
    silences and pumped under the eraser; not notes on the reveals: they scored them: all three
    reviewers.)"""
    import piano as P
    pf = P.Piano(PIANO_SFZ, seed=5)
    (h0, h1), (s0, s1) = his_hold, her_hold
    notes = [P.Note(h0 + 0.12, 59, 22, 1.2), P.Note(h0 + 1.32, 61, 18, h1 - h0 - 1.3), P.Note(s0 + 0.12, 59, 19, s1 - s0)]
    y = P.render(pf, notes, [(h0, h1 + 0.6), (s0, s1 + 0.6)], 0.0, n / SR, wet=0.55, mech=0.25, halo_db=-34.0)
    y = y[:n]
    # felt: the hammer's brightness taken off, as an upright with its practice felt down
    y = np.stack([fft_filter(y[:, c], hi=2400, order=2) for c in range(2)], 1)
    out = np.zeros((n, 2))
    out[:len(y)] = y
    return out


# ---------------------------------------------------------------- the whole
def build(sheet):
    d = json.load(open(sheet))
    items = [(it['t0'], it['t1'], it['mark']) for it in d['items']]
    length = d['length']
    n = int(length * SR)
    rng = np.random.default_rng(11)
    latch_at = dict(d['events'])['latch']
    lift = span(items, 'c1/door')[0]
    last = max(b for a, b, m in items)
    stems = {}
    # the flat and the people in it
    stems['flat'] = flat(n, rng, latch_at, lift, lift + 2.3)
    ppl, lt = people(n, rng, items, latch_at)
    stems['people'], stems['latch'] = ppl, lt
    # the paper: what is imagined drawn, its construction, each mark's touch
    imag = lambda m: m['name'].startswith(('c1/', 'c2/')) and m['kind'] == 'stroke' and m['layer'] != 'construct'
    build_ = lambda m: m['name'].startswith(('c1/', 'c2/')) and m['kind'] == 'stroke' and m['layer'] == 'construct'
    pen, _ = drawing(items, n, rng, imag)
    stems['pencil'] = pen + touches(items, n, rng, imag) * 0.6
    hp, _ = drawing(items, n, rng, build_)
    stems['build'] = hp + touches(items, n, rng, build_, hard=True) * 0.7
    # the rubber, by what it does: rubbing a line to draw it again; taking his back; taking hers
    # back, harder; taking them, tired
    def acts(pfx, skip=()):
        sel = [(a, b, m) for a, b, m in items if m['kind'] == 'erase' and m['name'].startswith(pfx) and not any(s in m['name'] for s in skip)]
        return F.one_hand(F.activity(sel, length, {k: 0.0 for k in ('take', 'rub', 'end', 'happened', 'imagined')}))['erase']
    rub = [(a, b, m) for a, b, m in items if m['kind'] == 'erase' and '/rub/' in m['name']]
    stems['rub'] = eraser(F.one_hand(F.activity(rub, length, {k: 0.0 for k in ('take', 'rub', 'end', 'happened', 'imagined')}))['erase'], n, rng,
                          rate=(4.0, 2.0), push=0.9, grit=0.7, knock=0.6)
    stems['lift'] = eraser(acts(('c1/door',)), n, rng)
    stems['take'] = eraser(acts(('c1/out',)), n, rng)
    # hers heavier: slower strokes, the rubber knocking harder at each turn, the paper's give under
    # it where a phone still has it (250-700 Hz, not 60-320: the sound designer)
    stems['take2'] = eraser(acts(('c2/out',)), n, rng, rate=(2.2, 1.8), push=0.75, weight=0.35, grit=1.2, knock=1.6)
    # the end: each erasure quieter than the one before, down 15 dB to the last (it rose to the knobs
    # and the almosts, the thinnest act given the loudest sound of the ending: the cinematic director)
    e0, e1 = span(items, 'end/')
    stems['end'] = eraser(acts(('end/',)), n, rng, rate=(2.2, 1.6), push=0.9, grit=0.6, knock=0.7) * ramp(n, [(e0, 1.0), (e1, 10 ** (-15 / 20))])[:, None]
    # (No pencil set down after the last mark, no paper's nearness under the empty doorway: one was
    # the film's only full stop, the other inaudible under the room's own hushed hum: the skeptic.)
    # the thought (Mix B): the two holds, from the sheet
    his_hold = (span(items, 'c1/hand')[1], span(items, 'c1/out')[0])
    her_hold = (span(items, 'c2/reach')[1], span(items, 'c2/out')[0])
    stems['piano'] = piano_figure(n, his_hold, her_hold) if PIANO_SFZ else np.zeros((n, 2))
    # the wall: the goodbye drawing itself (sheet 0-6)
    wall_items = [(a, b, m) for a, b, m in items if a < FROM and m['name'].startswith('goodbye/')]
    w, _ = drawing(wall_items, int(FROM * SR), rng, lambda m: True)
    wall = w
    hard_ = lambda m: m['kind'] == 'stroke' and m.get('tool') == 'hardpencil'
    wall += touches(wall_items, int(FROM * SR), rng, hard_, hard=True) * 0.3
    return stems, wall, dict(n=n, length=length, latch=latch_at, lift=lift, last=last)


def leveled(stems, wall, info):
    """Each stem at its measured level against the reference (UNDER)."""
    out = {}
    for k, lu in UNDER.items():
        if k in ('wall',):
            continue
        x = stems[k]
        if k in ('people', 'latch', 'piano', 'end'):
            out[k] = at_level(x, ERASER_LUFS + lu, 'peak')
        elif k == 'flat':
            seg = x[int(FROM * SR):int(info['latch'] * SR)]
            ref_ = F._active_median(seg, -90)
            out[k] = x * 10 ** ((ERASER_LUFS + lu - ref_) / 20)
        else:
            out[k] = at_level(x, ERASER_LUFS + lu)
    w = at_level(wall, ERASER_LUFS + UNDER['wall'])
    return out, w


A_STEMS = ('flat', 'people', 'latch', 'pencil', 'build', 'rub', 'lift', 'take', 'take2', 'end')
B_STEMS = A_STEMS + ('piano',)


def mix(out, names):
    y = sum(out[k] for k in names)
    peak = np.abs(y).max()
    if peak > 10 ** (-3 / 20):
        y = y * 10 ** (-3 / 20) / peak
    return y


def mp3(x, path):
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2').tobytes()
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '2', '-i', '-', '-c:a', 'libmp3lame', '-b:a', '160k', path],
                   input=pcm, check=True)


def sha256(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()[:16]


def main():
    global PIANO_SFZ
    args = sys.argv[1:]
    opt = lambda k: args[args.index(k) + 1] if k in args else None
    room, piano_dir = opt('--room'), opt('--piano')
    sheet, out_dir = [a for i, a in enumerate(args) if not a.startswith('--') and (i == 0 or not args[i - 1].startswith('--'))][:2]
    if piano_dir:
        PIANO_SFZ = os.path.join(piano_dir, 'UprightPianoKW-20220221.sfz')
    if room == 'b' and not PIANO_SFZ:
        sys.exit('Mix B needs the piano: --piano DIR')
    os.makedirs(out_dir, exist_ok=True)
    stems, wall, info = build(sheet)
    out, w = leveled(stems, wall, info)
    mixes = {'a': mix(out, A_STEMS)}
    if PIANO_SFZ:
        mixes['b'] = mix(out, B_STEMS)
    else:
        print('(no --piano: Mix B not made)')
    w = w / max(1.0, np.abs(w).max() / 10 ** (-3 / 20))
    for k, y in mixes.items():
        F.write(os.path.join(out_dir, f'mix-{k}.wav'), y)
    F.write(os.path.join(out_dir, 'wall.wav'), w)
    os.makedirs(os.path.join(out_dir, 'stems'), exist_ok=True)
    for k, x in out.items():
        F.write(os.path.join(out_dir, 'stems', f'{k}.wav'), x)
    print('levels (momentary median / peak, LUFS):')
    for k, x in out.items():
        print(f'  {k:8s} {median_lufs(x) or float("nan"):6.1f} {peak_lufs(x):6.1f}')
    print(json.dumps({k: round(v, 3) for k, v in info.items() if k != 'n'}))
    if room:
        mp3(mixes[room][int(FROM * SR):], os.path.join(MUSIC, 'things-film.mp3'))
        mp3(w[:int(FROM * SR)], os.path.join(MUSIC, 'things-wall.mp3'))
        # what they were made from (tests/film-scene.test.ts: change any and make them again)
        path = os.path.join(MUSIC, 'things-sound.json')
        beats = json.load(open(path)).get('beats', {}) if os.path.exists(path) else {}
        made = {'story': sha256(os.path.join(HERE, 'story.py')), 'foley': sha256(os.path.join(HERE, 'foley.py')),
                'soundscape': sha256(os.path.abspath(__file__)), 'mix': room, 'beats': beats}
        with open(path, 'w') as fh:
            json.dump(made, fh, indent=1)
            fh.write('\n')


if __name__ == '__main__':
    main()
