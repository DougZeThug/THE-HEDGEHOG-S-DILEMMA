"""The woodland's sounds against each other, part by part (ITU-R BS.1770 loudness at the film's
gain): the piano against the place (the day's insects and the far birds), and how far the cut falls.
The figures in docs/reviews/2026-10-woodland.md ("Against the place") come from this.

  PRE=5 POST=8 GAIN=0 STEMS=<dir> npx vite-node tests/playtest/woodland-audio.ts
  .venv-audio/bin/python tests/playtest/woodland-spans.py <dir>

Film time is memory time + 5 s. The white room round it is tests/playtest/woodland-film-sound.py's.
"""
import importlib.util
import os
import sys

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'scripts', 'woodland-score'))
from loud import kweight  # noqa: E402

spec = importlib.util.spec_from_file_location('film_sound', os.path.join(HERE, 'woodland-film-sound.py'))
fs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fs)

SR = 48000
# (film seconds from, to, what)
SPANS = [(13.2, 15.5, 'entry (8.2–10.5)'), (15.5, 18.5, 'first wide, gust (10.5–13.5)'), (18.5, 20, 'after the gust (13.5–15)'),
         (20, 32, 'two-shot (15–27)'), (33, 39.5, 'second wide (28–34.5)'), (37.5, 39.5, 'last 2 s'), (39.5, 47.5, 'dusk (34.5–42.5)')]


def main(d):
    st = {f[:-4]: sf.read(os.path.join(d, f), dtype='float64')[0] for f in os.listdir(d) if f.endswith('.wav')}
    n = max(len(v) for v in st.values())

    def pad(name):
        y = np.zeros((n, 2))
        if name in st:
            y[:len(st[name])] = st[name]
        return y
    g = 1.478 * 0.9 * 10 ** (fs.LISTEN_DB / 20)
    piano = pad('music-score') * g
    insects = (pad('music-cicadas') + pad('music-woods')) * g
    evening = pad('music-evening') * g
    place = insects + (pad('sfx-bird-1') + pad('sfx-bird-2')) * g

    def lufs(x, a, b):
        y = kweight(x[int(a * SR):int(b * SR)])
        return -0.691 + 10 * np.log10((y ** 2).mean(axis=0).sum() + 1e-20)
    print(f"{'':30s}{'insects':>9s}{'piano':>8s}{'evening':>9s}{'place':>8s}  piano re place")
    for a, b, what in SPANS:
        print(f'{what:30s}{lufs(insects, a, b):9.1f}{lufs(piano, a, b):8.1f}{lufs(evening, a, b):9.1f}{lufs(place, a, b):8.1f}  {lufs(piano, a, b) - lufs(place, a, b):6.1f}')
    print('piano re place, 8.5–34.5 overall:', round(lufs(piano, 13.5, 39.5) - lufs(place, 13.5, 39.5), 1))
    before, after = lufs(place + piano, 36.5, 39.5), lufs(evening, 39.5, 42.5)
    print('the cut: last 3 s', round(before, 1), ' first 3 s after', round(after, 1), ' falls', round(after - before, 1))


if __name__ == '__main__':
    main(sys.argv[1])
