"""Render the woodland's score (scripts/woodland-score/score.py) on the sampler (piano.py): the
memory's file, public/music/woodland-score.mp3, from 8.2 s of the memory (SCORE_FROM in
src/memory/defs.ts) to the cut at 34.5, where it ends (25 ms), mastered to −23 LUFS (the cue
sheet sets its level in the room); its notes, for the test that keeps them off the picture's
moments (notes.json); and the other form, never home, for the artist to compare
(test-output/review/woodland/sound/woodland-score-b.mp3).

  python3 -m venv .venv-audio && .venv-audio/bin/pip install numpy scipy soundfile
  .venv-audio/bin/python scripts/woodland-score/render.py <the Upright Piano KW folder>

The samples: Upright Piano KW, SFZ+FLAC, 2022-02-21, from FreePats (CC0):
http://freepats.zenvoid.org/Piano/acoustic-grand-piano.html#UprightKW. ffmpeg encodes the file.
"""
import json
import os
import subprocess
import sys

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from loud import integrated  # noqa: E402
from piano import SR, Piano, render  # noqa: E402
from score import BEAT, CUT, S1, S2, performance  # noqa: E402

ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
FROM = 8.2


def mp3(x, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    wav = path[:-4] + '.wav'
    sf.write(wav, x, SR, subtype='PCM_24')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '192k', path], check=True)
    os.remove(wav)


def main(library):
    p = Piano(os.path.join(library, 'UprightPianoKW-20220221.sfz'))
    for form, out in (('A', os.path.join(ROOT, 'public/music/woodland-score.mp3')),
                      ('B', os.path.join(ROOT, 'test-output/review/woodland/sound/woodland-score-b.mp3'))):
        notes, pedal = performance(form)
        x = render(p, notes, pedal, FROM, CUT, felt=0.0, wet=0.12)
        # It ends on the cut: the last 25 ms brought down (nothing after it is in the file).
        f = int(0.025 * SR)
        x[-f:] *= np.linspace(1, 0, f)[:, None] ** 2
        x *= 10 ** (-23 / 20) / 10 ** (integrated(x) / 20)
        mp3(x.astype(np.float32), out)
        print(f'{out}: {len(x) / SR:.2f} s, peak {20 * np.log10(np.abs(x).max()):.1f} dBFS, {len(notes)} notes')
        if form == 'A':
            json.dump({'from': FROM, 'cut': CUT, 'beat': BEAT, 'statements': [round(S1, 4), round(S2, 4)], 'notes': [{'t': round(n.t, 4), 'midi': n.midi, 'vel': n.vel, 'dur': round(n.dur, 4), 'hand': n.hand} for n in sorted(notes, key=lambda n: n.t)]},
                      open(os.path.join(HERE, 'notes.json'), 'w'), indent=1)


if __name__ == '__main__':
    main(sys.argv[1])
