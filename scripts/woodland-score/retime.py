"""The woodland's score joined for the film's timeline (2026-10-24): public/music/woodland-score.mp3,
made from the render composed for the painted rig's 53 s timeline (audition/woodland/
woodland-score-53s.mp3, render.py; its notes in notes.json), 4.0 s shorter, so that it still stops
on the cut to the empty clearing a note before home, the second time round, as the artist approved.

    python3 scripts/woodland-score/retime.py

Its samples (FreePats' Upright Piano KW) can't be had here to render it again, so it is edited, as
the editorial baseline's sound was, but on the music's own terms rather than at the picture's join:

1. One join, of whole beats: five (the first time round, beat 4 to beat 9; 4.2446 s as played,
   bass to bass). Out of the dampers' fall after the G-flat (beat 3.5, its pedal lifted 0.14 s
   before), into the silence before the E-flat's chord (the long F of beats 4 to 9 has died to the
   recording's floor, -51 dB, by then), 10 ms before it: the chord lands where the F's bar would
   have begun, its own bass-first timing kept. The tune: the lift to A-flat, the step to G-flat,
   then E-flat over ii (G-flat is that chord's third), the turn, home.
2. The 0.2446 s the join took beyond 4 s, given back where nothing is heard but the long F's
   decay, the second time round (-45 to -47 dB, 1.8 s of it, stretched by Rubber Band, pitch kept).
   Everything after it is exactly 4.0 s earlier than it was: the end as it was.

Why there: her glance in the close-up falls in the second statement's A-flat, the tune's longest
held high note: struck 0.24 s before her eyes go (19.06; her eyes 19.3), held through her head's
turn (20.2-21.5), the step down to G-flat as she settles (21.71). (Taking exactly 4 s at the
picture's own join struck that A-flat on her eyes' first movement, and left a jump of 4.72 beats
inside a held chord.) The cost: the turn's first note comes 0.28 s after the cut to the two of them
(15.28; the rig's score kept 0.7 s clear of its cuts). retimed.json records the map, every note's
new time, the crackle that stays, and checks of the file as made (the join's level, the glance).
"""
import hashlib
import json
import os
import subprocess
import tempfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(ROOT, 'audition', 'woodland', 'woodland-score-53s.mp3')
OUT = os.path.join(ROOT, 'public', 'music', 'woodland-score.mp3')
SR = 48000
FROM = 8.2
OLD_CUT, NEW_CUT = 34.5, 30.5
# The join (memory s, the 53 s timeline's): from just before beat 4's chord, five beats as played.
BEAT4_BASS, BEAT9_BASS = 12.7078, 16.9524
JOIN_A = 12.700
JOIN_B = JOIN_A + (BEAT9_BASS - BEAT4_BASS)
JOIN_FADE = 0.012
# Where it is given back: the second time's F, decayed (memory s, the 53 s timeline's).
GIVE = (28.5, 30.3)
GIVE_FADE = 0.03
SHIFT = OLD_CUT - NEW_CUT
MAKEUP_DB = 0.265
EXTRA = (JOIN_B - JOIN_A) - SHIFT
# Her glance (src/memory/defs.ts WOODLAND_FILM.glance).
GLANCE = {'eyes': 19.3, 'head': 20.2, 'turned': 21.5, 'settled': 21.8}


def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).copy()


def stretch(x, ratio):
    """x made `ratio` times as long (Rubber Band through ffmpeg, pitch kept, for a held sound)."""
    with tempfile.TemporaryDirectory() as d:
        src, dst = os.path.join(d, 'in.f32'), os.path.join(d, 'out.f32')
        x.astype(np.float32).tofile(src)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', src,
                        '-af', f'rubberband=tempo={1 / ratio:.8f}:transients=smooth:detector=soft:phase=laminar:window=long:smoothing=on:pitchq=quality:channels=together',
                        '-f', 'f32le', '-ar', str(SR), '-ac', '2', dst], check=True)
        return np.fromfile(dst, np.float32).reshape(-1, 2)


def fade(n):
    """An equal-power crossfade's two halves over n samples."""
    k = (np.arange(n) + 0.5) / n
    return np.cos(k * np.pi / 2)[:, None], np.sin(k * np.pi / 2)[:, None]


def old_to_new(t):
    """A moment of the 53 s timeline on the film's (None if the join took it out)."""
    if t < JOIN_A:
        return t
    if t < JOIN_B:
        return None
    if t < GIVE[0]:
        return t - (JOIN_B - JOIN_A)
    if t < GIVE[1]:
        return GIVE[0] - (JOIN_B - JOIN_A) + (t - GIVE[0]) * (GIVE[1] - GIVE[0] + EXTRA) / (GIVE[1] - GIVE[0])
    return t - SHIFT


def level_db(x, a, b):
    i, j = int(round((a - FROM) * SR)), int(round((b - FROM) * SR))
    seg = x[max(0, i):j]
    return float(20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-12))


def main():
    x = decode(SRC)
    assert abs(len(x) / SR - (OLD_CUT - FROM)) < 1e-3, len(x) / SR
    s = lambda t: int(round((t - FROM) * SR))
    # 1. The join.
    nf = int(round(JOIN_FADE * SR))
    a, b = x[:s(JOIN_A) + nf // 2], x[s(JOIN_B) - nf // 2:]
    out_f, in_f = fade(nf)
    joined = np.concatenate([a[:-nf], a[-nf:] * out_f + b[:nf] * in_f, b[nf:]])
    # 2. Given back, inside the decay (with handles for the stretch, then crossfaded to it each side).
    g0, g1 = s(GIVE[0] - (JOIN_B - JOIN_A)) , s(GIVE[1] - (JOIN_B - JOIN_A))
    h = int(0.25 * SR)
    ratio = (GIVE[1] - GIVE[0] + EXTRA) / (GIVE[1] - GIVE[0])
    long = stretch(joined[g0 - h:g1 + h], ratio)
    hs = int(round(h * ratio))
    want = int(round((g1 - g0) * ratio))
    mid = long[hs:hs + want]
    nf2 = int(round(GIVE_FADE * SR))
    o, i = fade(nf2)
    head = joined[:g0]
    tail = joined[g1:]
    mid = mid.copy()
    # (Into it from the original, and out of it into the original, over 30 ms each.)
    mid[:nf2] = joined[g0:g0 + nf2] * o + mid[:nf2] * i
    mid[-nf2:] = mid[-nf2:] * o + joined[g1 - nf2:g1] * i
    y = np.concatenate([head, mid, tail]).astype(np.float32)
    want_len = int(round((NEW_CUT - FROM) * SR))
    assert abs(len(y) - want_len) <= 2, (len(y), want_len)
    y = y[:want_len] if len(y) >= want_len else np.concatenate([y, np.zeros((want_len - len(y), 2), np.float32)])
    # (Through ffmpeg's LAME at 192 kb/s a file comes back 0.265 dB quieter: decoded and encoded again
    # unedited, the 53 s render did. Made up, so the memory's piano is at the level it was set at.)
    y = (y * 10 ** (MAKEUP_DB / 20)).astype(np.float32)
    peak = float(20 * np.log10(np.abs(y).max()))
    assert peak < -1.0, peak
    with tempfile.TemporaryDirectory() as d:
        wav = os.path.join(d, 'score.wav')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-c:a', 'pcm_s24le', wav], input=y.tobytes(), check=True)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '192k', OUT], check=True)
    # What was made, as made: the file decoded again.
    z = decode(OUT)
    notes = json.load(open(os.path.join(HERE, 'notes.json')))
    row = lambda n, t: {**n, 't': round(t, 4)}
    mapped = [row(n, old_to_new(n['t'])) for n in notes['notes'] if old_to_new(n['t']) is not None]
    dropped = [n for n in notes['notes'] if old_to_new(n['t']) is None]
    crackle = [{**c, 't': round(old_to_new(c['t']), 4)} for c in notes['crackle'] if old_to_new(c['t']) is not None]
    mechanism = [{**m, 't': round(old_to_new(m['t']), 4)} for m in notes['mechanism'] if old_to_new(m['t']) is not None]
    # The piano above 500 Hz through her glance, in 400 ms blocks: it only falls (nothing swells in a look).
    from scipy import signal
    sos = signal.butter(4, 500, 'highpass', fs=SR, output='sos')
    hp = signal.sosfilt(sos, z.mean(1))
    blocks = []
    t = GLANCE['eyes']
    while t + 0.4 <= GLANCE['settled'] + 1e-9:
        seg = hp[int((t - FROM) * SR):int((t + 0.4 - FROM) * SR)]
        blocks.append(round(float(20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-12)), 2))
        t += 0.4
    rec = {
        'from': FROM, 'cut': NEW_CUT, 'source': os.path.relpath(SRC, ROOT),
        'source_sha256': hashlib.sha256(open(SRC, 'rb').read()).hexdigest()[:16],
        'join': {'from': JOIN_A, 'to': round(JOIN_B, 4), 'beats': 5, 'fade': JOIN_FADE,
                 'level_db': {'before': round(level_db(x, JOIN_A - 0.03, JOIN_A), 1), 'after': round(level_db(x, JOIN_B, JOIN_B + 0.008), 1)}},
        'given': {'from': GIVE[0], 'to': GIVE[1], 'seconds': round(EXTRA, 4), 'ratio': round(ratio, 5), 'fade': GIVE_FADE,
                  'level_db': round(level_db(x, GIVE[0], GIVE[1]), 1)},
        'shift_after': SHIFT,
        'notes': mapped, 'dropped': dropped, 'crackle': crackle, 'mechanism': mechanism,
        'glance_above500_db': blocks,
        'peak_dbfs': round(peak, 2),
        'samples': len(z),
        'sha256': hashlib.sha256(open(OUT, 'rb').read()).hexdigest()[:16],
    }
    json.dump(rec, open(os.path.join(HERE, 'retimed.json'), 'w'), indent=1)
    print(f'{OUT}: {len(z) / SR:.3f} s ({len(y) / SR:.3f} written), peak {peak:.1f} dBFS; join {JOIN_A}->{JOIN_B:.4f}, '
          f'{EXTRA:.4f} s given back at {GIVE}; glance blocks {blocks}')


if __name__ == '__main__':
    main()
