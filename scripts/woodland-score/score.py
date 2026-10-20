"""The woodland's score, as decided after the reviews of 2026-10-19 and 2026-10-20 (decisions
65–68, 77–83, 112).

One plain tune, someone playing an upright for nobody, at about 71 a minute, the same both times but
for a player's small differences, with one habit of breathing (it lingers at the top and lilts the
turn; nothing slows). Already going round when we
arrive: the last chord of a go-round still ringing as the painting opens out and the sound comes up
with the clearing's own (scripts/woodland-score/render.py), its turnaround a little ahead, then the
tune, which comes home once (21.2, between her look and his), then the tune again, cut after the
note before home (34.5; home falls due at 34.77). One bass note a bar, a tenth above it, no inner
line, one level.

The skeleton: the beats of a 16-beat statement on which a note may start in every statement without
landing on any of the picture's moments (the blinks, both looks, both cuts of the two-shot, the
gust, the cicada's return: tests/woodland-score.test.ts), found by trying every tempo from 64 to 86
a minute and every start for the second statement: 0, 0.5, 3.5, 4, 9, 12, 12.5, 13, 14, 15, 15.5.
(The painting's arrival, 9.8, fell on beat 0.5 of the first time at every tempo: there the tune
comes in a little early.)

  beat  0    0.5        3.5  4             9          12   12.5 13   14   15   15.5
  mel   F5   A♭5 ───    G♭5  F5 ──────     E♭5 ───    F5   E♭5  C5   D♭5  C5   E♭5
  bass  I                    I6            ii                    V    I
        (a lift to sol; a slow fall through fa, mi, re; the turn mi re ti, and home)
"""
import numpy as np

from piano import Note

CUT = 34.5
BEAT = 0.8470          # 70.8 a minute
S2 = 22.90             # the second statement's first beat (his look falls inside its first note)
S1 = S2 - 16 * BEAT    # 9.35
S0 = S1 - 16 * BEAT    # (only its turnaround is heard: 8.50, 8.92)

M = {'C5': 72, 'Db5': 73, 'Eb5': 75, 'F5': 77, 'Gb5': 78, 'Ab5': 80}
# (beat, melody, beats it is held)
TUNE = [
    (0.0, 'F5', 0.5), (0.5, 'Ab5', 3.0), (3.5, 'Gb5', 0.5), (4.0, 'F5', 5.0), (9.0, 'Eb5', 3.0),
    (12.0, 'F5', 0.5), (12.5, 'Eb5', 0.5), (13.0, 'C5', 1.0), (14.0, 'Db5', 1.0),
    (15.0, 'C5', 0.5), (15.5, 'Eb5', 0.5),
]
# Never home (form B, for the artist): the first time, the turn goes back up to re, and the left
# hand stays on V: an open half close, not home with a ninth over it.
TUNE_B = [(b, ('Eb5' if b == 14.0 else m), d) for b, m, d in TUNE]
# The left hand, one a bar (and V-I in the last): bass and a tenth above it, struck together.
# Bar 2 is home with its third in the bass (I6, F under the long F: a brighter bar than vi, where
# most of the tune's long notes had been on minor chords: the creative director's evaluation).
HAND = [(0.0, 49, 65), (4.0, 41, 61), (9.0, 51, 66), (13.0, 44, 60), (14.0, 49, 65)]   # I, I6, ii, V, I

# The first time round it comes in a little early (this much, its turnaround and first two notes),
# so that the painting comes to rest (9.8) inside the tune's high note rather than on it: the
# cinematic director's evaluation found the strict tune's A♭5 on the arrival, at every tempo.
EARLY = 0.31

# Breathing time (decision 112): one habit, the same both times, before the hands' own unevenness.
# The step down after the high A♭5 comes late (the G♭5); the long F5 and E♭5 come on time, their
# chord's bass and tenth a little ahead of them; the turn lilts. Home, the leading tones, the
# go-round and both A♭5s stay on their beats, and nothing slows: not into home (it would answer her
# look), nor into the cut. (beat: seconds late)
HABIT = {3.5: 0.100, 12.0: 0.015, 12.5: 0.045}
# On these beats the chord comes this far ahead of the melody (elsewhere the melody leads it by 12 ms).
BASS_FIRST = {4.0: 0.030, 9.0: 0.030}
# Breaths in the pedal (decision 128): it lifts a little early before two bar lines (statement,
# beat), and after home the first time the hands and the pedal lift together before the go-round,
# so the dampers are heard in the clear and home's ring clears. No note moves.
LIFTS = [(1, 4.0), (2, 9.0)]
LIFT_EARLY = 0.15
HOME_LIFT = 0.15

# The picture's moments no note may begin in (tests/woodland-score.test.ts is the authority; these
# are its values, for the humanising below to keep clear of).
MOMENTS = [(9.6, 10.0), (11.6, 12.0), (13.2, 13.8), (16.0, 16.6), (14.3, 15.7), (17.0, 19.5), (23.5, 25.5), (26.3, 27.7), (27.8, 28.2)]
# Her look and his, among them: nothing of the recording's crackle sounds in either (decision 129).
LOOKS = [(17.0, 19.5), (23.5, 25.5)]


def statement(start, tune=TUNE, hand=HAND, last=None, mel_vel=44, hand_vel=34, first=8.2, early=None):
    """One statement from `start` (s); `last`: the beat after which nothing more is played (the cut);
    `first`: nothing struck before then; `early`: beats played EARLY seconds ahead."""
    out = []
    shift = lambda b: -EARLY if early is not None and b in early else 0.0
    onset = lambda b: start + b * BEAT + shift(b) - (0.0 if b in BASS_FIRST else 0.012) + HABIT.get(b, 0.0)
    for j, (b, m, d) in enumerate(tune):
        if last is not None and b > last:
            break
        t = onset(b)
        if t < first:
            continue
        # A player leans a little on what begins a bar, and plays the quick notes a touch lighter.
        v = mel_vel + (2 if b % 4 == 0 else -2 if b % 1 else 0)
        # Held to just before the next (a late note opens no gap, and its neighbour gives way); the
        # last let go before the next go-round's first (an early one isn't held longer for it: the
        # go-round's E♭ rang a ninth over the first bar).
        dur = onset(tune[j + 1][0]) - t - 0.03 if j + 1 < len(tune) else d * BEAT - 0.03
        out.append(Note(t, M[m], v, dur, 'r'))
    for b, bass, tenth in hand:
        if last is not None and b > last:
            break
        t = start + b * BEAT + shift(b) - BASS_FIRST.get(b, 0.0)
        if t < first:
            continue
        n = 4.0 if b < 13 else 1.0
        hold = min(n, 16 - b) * BEAT - 0.05 - shift(b)
        out.append(Note(t, bass, hand_vel, hold, 'l'))
        out.append(Note(t + 0.006, tenth, hand_vel - 6, hold, 'l'))
    return out


def humanise(notes, seed=12):
    """Someone's hands, not a sequencer: each note a little early or late (about 12 ms, at most 25,
    a chord's notes together) and a little harder or softer (±3), neither drifting; never into one
    of the picture's moments (a nudge that would land in one goes the other way). The seed is the
    take: with the breathing habit, 11's hands played the second time a shade louder than the first
    (the test's one level), 12's don't."""
    rng = np.random.default_rng(seed)
    chords = {}
    for n in sorted(notes, key=lambda n: n.t):
        key = round(n.t, 1) if n.hand == 'l' else None
        if key is not None and key in chords:
            dt = chords[key]
        else:
            dt = float(np.clip(rng.normal(0, 0.012), -0.025, 0.025))
            if key is not None:
                chords[key] = dt
        if any(a <= n.t + dt < b for a, b in MOMENTS) and n.t >= 8.2:
            dt = -dt
        n.t += dt
        n.vel = int(np.clip(n.vel + rng.integers(-3, 4), 8, 80))
    return notes


def performance(form='A'):
    """The notes and the pedal. The previous go-round's last chord (home, struck at 7.65) is
    included so that it is still ringing when the file begins; the file fades in from there."""
    notes = (statement(S0, TUNE, HAND, first=7.5, early={15.0, 15.5}) + statement(S1, TUNE, HAND, early={0.0, 0.5})
             + statement(S2, TUNE, HAND, last=13.0))
    notes = humanise(notes)
    if form == 'B':
        home = S1 + 14 * BEAT
        for n in notes:
            if abs(n.t - (home - 0.012)) < 0.05 and n.hand == 'r':
                n.midi = M['Eb5']
            elif abs(n.t - home) < 0.05 and n.hand == 'l':
                n.midi = 44 if n.midi == 49 else 60
    # The pedal: down just after each left-hand chord, lifted (changed) at the next; a little early
    # before the LIFTS' chords.
    pedal = []
    lh = sorted({round(n.t, 3) for n in notes if n.hand == 'l'})
    starts = [t for i, t in enumerate(lh) if i == 0 or t - lh[i - 1] > 0.2]
    lifts = [(S1, S2)[k - 1] + b * BEAT - BASS_FIRST.get(b, 0.0) for k, b in LIFTS]
    for a, b in zip(starts, starts[1:] + [S2 + 16 * BEAT]):
        early = LIFT_EARLY if any(abs(b - x) < 0.08 for x in lifts) else 0.01
        pedal.append((a + 0.04, b - early))
    # After home the first time: the hands and the pedal lift together before the go-round.
    go = [n for n in notes if n.hand == 'r' and abs(n.t - (S1 + 15 * BEAT - 0.012)) < 0.05]
    if go:
        lift = go[0].t - HOME_LIFT
        for n in notes:
            if n.t < lift < n.t + n.dur and n.t > S1 + 13.5 * BEAT:
                n.dur = lift - n.t
        pedal = [(d, min(u, lift)) if d < lift < u else (d, u) for d, u in pedal]
    return notes, pedal
