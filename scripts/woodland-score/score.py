"""The woodland's score, as decided after the reviews of 2026-10-19 (decisions 65–68).

One plain tune, someone playing an upright for nobody, in its own steady time (4/4 at about 71 a
minute, strict), the same both times. Already going round when we arrive: its turnaround is the
first thing heard (8.5 s, as the painting opens out), then the tune, which comes home once (21.2,
between her look and his), then the tune again, cut after the note before home (34.5; home falls
due at 34.77). One bass note a bar, a tenth above it, no inner line, one level.

The skeleton: the beats of a 16-beat statement on which a note may start in every statement without
landing on any of the picture's moments (the blinks, both looks, both cuts of the two-shot, the
gust, the cicada's return: tests/woodland-score.test.ts), found by trying every tempo from 64 to 86
a minute and every start for the second statement: 0, 0.5, 3.5, 4, 9, 12, 12.5, 13, 14, 15, 15.5.

  beat  0    0.5        3.5  4             9          12   12.5 13   14   15   15.5
  mel   F5   A♭5 ───    G♭5  F5 ──────     E♭5 ───    F5   E♭5  C5   D♭5  C5   E♭5
  bass  I                    vi            ii                    V    I
        (a lift to sol; a slow fall through fa, mi, re; the turn mi re ti, and home)
"""
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
# Never home (form B, for the artist): the first time, the turn goes back up to re instead.
TUNE_B = [(b, ('Eb5' if b == 14.0 else m), d) for b, m, d in TUNE]
# The left hand, one a bar (and V-I in the last): bass and a tenth above it, struck together.
HAND = [(0.0, 49, 65), (4.0, 46, 61), (9.0, 51, 66), (13.0, 44, 60), (14.0, 49, 65)]   # I, vi, ii, V, I


def statement(start, tune=TUNE, last=None, mel_vel=44, hand_vel=34):
    """One statement from `start` (s); `last`: the beat after which nothing more is played (the cut)."""
    out = []
    for b, m, d in tune:
        if last is not None and b > last:
            break
        if start + b * BEAT < 8.2:          # (nothing before the painting opens out)
            continue
        # A player leans a little on what begins a bar, and plays the quick notes a touch lighter.
        v = mel_vel + (2 if b % 4 == 0 else -2 if b % 1 else 0)
        out.append(Note(start + b * BEAT - 0.012, M[m], v, d * BEAT - 0.03, 'r'))
    for b, bass, tenth in HAND:
        if last is not None and b > last:
            break
        if start + b * BEAT < 8.2:
            continue
        n = 4.0 if b < 13 else 1.0
        hold = min(n, 16 - b) * BEAT - 0.05
        out.append(Note(start + b * BEAT, bass, hand_vel, hold, 'l'))
        out.append(Note(start + b * BEAT + 0.006, tenth, hand_vel - 6, hold, 'l'))
    return out


def performance(form='A'):
    tune1 = TUNE if form == 'A' else TUNE_B
    notes = statement(S0, TUNE, last=None) + statement(S1, tune1) + statement(S2, TUNE, last=13.0)
    # Repeats voiced from the neighbouring sample: a repeated pitch alternates its source.
    seen = {}
    for n in sorted(notes, key=lambda n: n.t):
        k = seen.get(n.midi, 0)
        n.alt = k % 2
        seen[n.midi] = k + 1
    # The pedal: down just after each left-hand chord, lifted (changed) at the next.
    pedal = []
    for st in (S0, S1, S2):
        hs = [st + b * BEAT for b, _, _ in HAND if st + b * BEAT >= 8.2]
        for a, b in zip(hs, hs[1:] + [st + 16 * BEAT]):
            pedal.append((a + 0.04, b - 0.01))
    return notes, pedal
