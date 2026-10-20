"""Render the woodland's score (scripts/woodland-score/score.py) on the sampler (piano.py): the
memory's file, public/music/woodland-score.mp3, from 8.2 s of the memory (SCORE_FROM in
src/memory/defs.ts) to the cut at 34.5, where it ends (25 ms), mastered to −23 LUFS on the piano
(the cue sheet sets its level in the room): the piano with the recording's sparse crackle
(decisions 113, 127, 129). Its notes, its mechanism, its crackle and how much it swells in each look,
for the test that keeps them off the picture's moments (notes.json). And, for the artist, each at
the same piano level (test-output/review/woodland/sound/): the piano alone; the trace of bow and air
in its strings, raised so that it can be heard; a soft hiss under it; the other form, never home.

  python3 -m venv .venv-audio && .venv-audio/bin/pip install numpy scipy soundfile
  .venv-audio/bin/python scripts/woodland-score/render.py <the Upright Piano KW folder>

The samples: Upright Piano KW, SFZ+FLAC, 2022-02-21, from FreePats (CC0):
http://freepats.zenvoid.org/Piano/acoustic-grand-piano.html#UprightKW. ffmpeg encodes the file.
"""
import hashlib
import json
import os
import subprocess
import sys

import numpy as np
import soundfile as sf
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from loud import integrated  # noqa: E402
from piano import SR, Piano, crackle, hiss, render  # noqa: E402
from score import BEAT, CUT, LOOKS, MOMENTS, S1, S2, performance  # noqa: E402

ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
FROM = 8.2
# How far it steps back while the clearing is hushed round the two of them (dB), so that its
# distance from the place stays the same as in the wides (measured: tests/playtest/woodland-audio.ts;
# 4.5 since the wind, the two-shot's bed, came down: the artist, 2026-10-20).
DIP_DB = float(os.environ.get('DIP_DB', 4.5))
# Its one fault (decision 110): F5's second string 2.5 cents sharp, a beat of about 1 Hz on its two
# long notes.
FAULT = {77: 2.5}
# The crackle's ticks at their median, under the melody's median attack (dB; decision 113).
CRACKLE_DB = -36.0
# For the artist to hear what each texture is (decision 127): the bow and the air raised by this
# much, and a soft hiss this far under the piano (LU), stepping back with the clearing's hush (5 dB
# more than the piano's dip) rather than with the piano.
AID_TEXTURE_DB = 10.0
AID_HISS_LU = -28.0


def smooth(e0, e1, x):
    u = np.clip((x - e0) / (e1 - e0), 0, 1)
    return u * u * (3 - 2 * u)


def mp3(x, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    wav = path[:-4] + '.wav'
    sf.write(wav, x, SR, subtype='PCM_24')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '192k', path], check=True)
    os.remove(wav)


def curve(t, hush_db=DIP_DB):
    """The file's own level: up with the clearing, a little behind it (the clearing opens 6.5–10.5:
    src/memory/synthWoods.ts), never as the loudest thing there (both directors' evaluations: its
    first notes measure 5–7 LU under the clearing), and keeping its distance from the place while
    the place is hushed round the two of them: down with the near cicada's fall before the
    two-shot, up with its return after it (never on a cut). Measured: within 1.2 LU of the
    clearing's level from the gust's end to the cut."""
    g = smooth(FROM, FROM + 0.6, t) * smooth(7.0, 11.0, t) ** 2
    return g * (1 - (1 - 10 ** (-hush_db / 20)) * smooth(12.8, 14.3, t) * (1 - smooth(27.8, 30.0, t)))


def rises(x, ring_alone, notes):
    """In each look, the largest rise from one 400 ms block to the next (100 ms on): in the band of
    the melody note held through it, and above 500 Hz (dB); and the same for the strings' ring alone
    in that band. Nothing may swell back in a look (the recorded strings beat a little of their own)."""
    mono = x.mean(1)
    above = signal.sosfilt(signal.butter(4, 500, 'high', fs=SR, output='sos'), mono)
    out = []
    for a, b in LOOKS:
        held = [n for n in notes if n.hand == 'r' and n.t < a][-1]
        f0 = 440 * 2 ** ((held.midi - 69) / 12)
        sos = signal.butter(2, [f0 * 0.97, f0 * 1.03], 'band', fs=SR, output='sos')
        band = signal.sosfilt(sos, mono)
        ring = signal.sosfilt(sos, ring_alone.mean(1))
        row = {'from': a, 'to': b, 'held': held.midi}
        for name, y in (('band', band), ('above500', above), ('ring', ring)):
            lv = [10 * np.log10((y[i:i + int(0.4 * SR)] ** 2).mean() + 1e-30)
                  for i in range(int((a - FROM) * SR), int((b - 0.4 - FROM) * SR) + 1, int(0.1 * SR))]
            row[name] = round(float(max(0.0, max(np.diff(lv)))), 2)
        out.append(row)
    return out


def main(library):
    # (Each version from its own piano: one shared ran its random touch on from one into the next,
    # and the piano alone came out 0.5 dB louder than A: decision 130.)
    fresh = lambda: Piano(os.path.join(library, 'UprightPianoKW-20220221.sfz'), fault=FAULT)
    out_dir = os.path.join(ROOT, 'test-output/review/woodland/sound')
    for form in ('A', 'B'):
        notes, pedal = performance(form)
        info = {}
        piano = render(fresh(), notes, pedal, FROM - 1.2, CUT, quiet=MOMENTS, info=info)[int(round(1.2 * SR)):]
        t = FROM + np.arange(len(piano)) / SR
        g = curve(t)[:, None]
        # Levels are matched on the piano, not the whole mix: each version is the same piano.
        gain = 10 ** (-23 / 20) / 10 ** (integrated(piano * g) / 20)
        c, ticks = crackle(FROM, CUT, info['attack'] * 10 ** (CRACKLE_DB / 20), quiet=MOMENTS, never=LOOKS)
        c = c[:len(piano)]
        if form == 'A':
            versions = {os.path.join(ROOT, 'public/music/woodland-score.mp3'): piano + c,
                        os.path.join(out_dir, 'woodland-score-piano-alone.mp3'): piano}
            aid = render(fresh(), notes, pedal, FROM - 1.2, CUT, quiet=MOMENTS, texture=True, texture_db=AID_TEXTURE_DB)[int(round(1.2 * SR)):]
            versions[os.path.join(out_dir, 'woodland-score-aid-bow-air.mp3')] = aid
            h = hiss(FROM, CUT, 1.0)[:len(piano)]
            lvl = 10 ** ((integrated(piano) + AID_HISS_LU - integrated(h)) / 20)
            versions[os.path.join(out_dir, 'woodland-score-aid-hiss.mp3')] = piano + h * lvl * (curve(t, DIP_DB + 5.0) / np.maximum(curve(t), 1e-9))[:, None]
        else:
            versions = {os.path.join(out_dir, 'woodland-score-b.mp3'): piano + c}
        for out, x in versions.items():
            x = x * g * gain
            # It ends on the cut: the last 25 ms brought down (nothing after it is in the file).
            f = int(0.025 * SR)
            x[-f:] *= np.linspace(1, 0, f)[:, None] ** 2
            mp3(x.astype(np.float32), out)
            print(f'{out}: {len(x) / SR:.2f} s, peak {20 * np.log10(np.abs(x).max()):.1f} dBFS, {integrated(x):.1f} LUFS')
        heard = [n for n in notes if n.t >= FROM]
        if form == 'A':
            row = lambda n: {'t': round(n.t, 4), 'midi': n.midi, 'vel': n.vel, 'dur': round(n.dur, 4), 'hand': n.hand}
            json.dump({'from': FROM, 'cut': CUT, 'beat': BEAT, 'statements': [round(S1, 4), round(S2, 4)],
                       'notes': [row(n) for n in sorted(heard, key=lambda n: n.t)],
                       'ringing': [row(n) for n in sorted(notes, key=lambda n: n.t) if n.t < FROM],
                       'mechanism': [{'t': round(tt, 4), 'kind': k} for tt, k in info['mechanism'] if FROM <= tt < CUT],
                       'crackle': [{'t': round(tt, 4), 'db': round(db, 1)} for tt, db in ticks],
                       # (The crackle's median tick under the melody's median attack, dB: the ticks above are
                       # relative to it.)
                       'crackleDb': CRACKLE_DB,
                       'looks': rises(piano + c, piano - render(fresh(), notes, pedal, FROM - 1.2, CUT, quiet=MOMENTS, halo_db=None)[int(round(1.2 * SR)):], notes),
                       # The file these notes are of (its hash's first 16: the whole would read as a
                       # key to the credentials scan), and what made it (a re-render is byte for byte).
                       'sha256': hashlib.sha256(open(os.path.join(ROOT, 'public/music/woodland-score.mp3'), 'rb').read()).hexdigest()[:16],
                       'made': {'numpy': np.__version__, 'scipy': __import__('scipy').__version__,
                                'ffmpeg': subprocess.run(['ffmpeg', '-version'], capture_output=True, text=True).stdout.split()[2]}},
                      open(os.path.join(HERE, 'notes.json'), 'w'), indent=1)


if __name__ == '__main__':
    main(sys.argv[1])
