"""The films for the artist: the room before (5 s), the woodland, the room after (8 s), at speed, with
its sound (woodland-film-sound.py) as the room plays it (and again, for a visitor who chooses them,
with its captions: woodland-captions.mjs); and short clips of what each texture under the piano
would be, for the artist to choose (decision 127): the piano alone, the bow and air raised so they
can be heard, a soft hiss, the crackle, each from the first wide through her look to home (memory
9.0–21.5); and the hiss and the crackle raised too (+20 and +26 dB), as built 30 dB or more under the
piano where they sound (QA, 2026-10-20). The pictures are the films already recorded from this build's memory (the sound changed,
not the picture): heart/ for the room, the way in and the dusk, context5/ for the two-shot and the
second wide (her rebuilt turn); the room before and after held on their first and last frame.

  npm run build
  .venv-audio/bin/python tests/playtest/woodland-film.py test-output/review/woodland/sound

once the sound of each is made first, into <out dir>/A.wav (as built), P.wav (the piano alone),
W.wav (the bow and air raised) and H.wav (a soft hiss), from scripts/woodland-score/render.py's files:
  PRE=5 POST=8 GAIN=0 STEMS=<out>/stems-A OUT=<out>/mix npx vite-node tests/playtest/woodland-audio.ts
  PRE=5 POST=8 GAIN=0 STEMS=<out>/stems-P OUT=<out>/mix OVERRIDE='{"music:score":{"asset":"<abs out>/woodland-score-piano-alone.mp3"}}' npx vite-node tests/playtest/woodland-audio.ts
  (and stems-W from woodland-score-aid-bow-air.mp3, stems-H from woodland-score-aid-hiss.mp3)
  .venv-audio/bin/python tests/playtest/woodland-film-sound.py <out>/stems-A <out>/A.wav   (and P, W, H)
  node tests/playtest/woodland-captions.mjs <out>/caps
"""
import os
import shutil
import subprocess
import sys

ROOT = 'test-output/review/woodland'
FPS = 12
PRE = 5.0          # film seconds before the memory
# (text, memory seconds it is shown at, seconds it holds before fading): MemoryAudio and Captions.
# Each is shown as its sound is heard (the cue's marker, or its captionAt: src/memory/defs.ts).
CAPS = [(0, 0.0, 3.7), (1, 9.9, 3.7), (2, 36.0, 3.7), (3, 48.5, 5.2)]


def frames(out):
    d = os.path.join(out, 'frames')
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(d)
    heart = os.path.join(ROOT, 'heart/frames-desktop-afternoon')
    ctx = os.path.join(ROOT, 'context5/frames-desktop-afternoon')
    seq = [os.path.join(heart, '00000.jpg')] * 36
    seq += [os.path.join(heart, f'{i:05d}.jpg') for i in range(0, 168)]
    seq += [os.path.join(ctx, f'{i:05d}.jpg') for i in range(168, 456)]
    seq += [os.path.join(heart, f'{i:05d}.jpg') for i in range(456, 660)]
    seq += [os.path.join(heart, '00659.jpg')] * 96
    for k, f in enumerate(seq):
        os.symlink(os.path.abspath(f), os.path.join(d, f'{k:05d}.jpg'))
    return d, len(seq)


def film(frames_dir, audio, out, start=0.0, end=None, caps=False):
    """Frames (+ captions) + sound, from `start` to `end` film seconds."""
    inputs = ['-framerate', str(FPS), '-i', os.path.join(frames_dir, '%05d.jpg')]
    chain, last = [], '0:v'
    for k, (i, at, hold) in enumerate(CAPS if caps else []):
        t0 = PRE + at
        inputs += ['-loop', '1', '-framerate', str(FPS), '-t', '66', '-i', os.path.join(OUT, 'caps', f'cap-{i}.png')]
        chain.append(f'[{k + 1}:v]format=rgba,fade=in:st={t0}:d=1.4:alpha=1,fade=out:st={t0 + hold}:d=1.4:alpha=1[c{k}]')
        chain.append(f'[{last}][c{k}]overlay=0:0:enable=\'between(t,{t0},{t0 + hold + 1.4})\'[v{k}]')
        last = f'v{k}'
    inputs += ['-i', audio]
    trim = ['-ss', str(start)] + (['-to', str(end)] if end else [])
    graph = ['-filter_complex', ';'.join(chain)] if chain else []
    vmap = f'[{last}]' if chain else '0:v'
    cmd = ['ffmpeg', '-v', 'error', '-y', *inputs, *graph, '-map', vmap, '-map', f'{len(chain) // 2 + 1}:a',
           *trim, '-c:v', 'libx264', '-r', '24', '-pix_fmt', 'yuv420p', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', out]
    subprocess.run(cmd, check=True)
    print(out)


def raised(out, wav, base, db):
    """`wav` with what it adds to `base` (the texture alone: as built minus the piano alone) raised
    `db` dB, written beside it."""
    import numpy as np
    import soundfile as sf
    x, sr = sf.read(os.path.join(out, wav), dtype='float64')
    b, _ = sf.read(os.path.join(out, base), dtype='float64')
    n = min(len(x), len(b))
    y = b[:n] + 10 ** (db / 20) * (x[:n] - b[:n])
    assert np.abs(y).max() < 0.89, 'raised past -1 dBFS'
    path = os.path.join(out, f'{wav[:-4]}-raised-{db}dB.wav')
    sf.write(path, y, sr, subtype='PCM_24')
    return path


OUT = sys.argv[1] if len(sys.argv) > 1 else 'test-output/review/woodland/sound'

if __name__ == '__main__':
    out = OUT
    d, n = frames(out)
    print(n, 'frames,', n / FPS, 's')
    # As every visitor has it: no captions (off by default: the artist, 2026-10-19); the same with
    # captions on, as a visitor who chooses them in settings sees it (src/ui/prefs.ts).
    film(d, os.path.join(out, 'A.wav'), os.path.join(out, 'woodland-film.mp4'))
    film(d, os.path.join(out, 'A.wav'), os.path.join(out, 'woodland-film-with-captions-chosen.mp4'), caps=True)
    for wav, name in (('P.wav', 'clip-1-piano-alone'), ('W.wav', 'clip-2-bow-and-air'), ('H.wav', 'clip-3-hiss'), ('A.wav', 'clip-4-crackle')):
        film(d, os.path.join(out, wav), os.path.join(out, f'{name}.mp4'), PRE + 9.0, PRE + 21.5)
    for wav, db, name in (('H.wav', 20, 'clip-3b-hiss-raised'), ('A.wav', 26, 'clip-4b-crackle-raised')):
        film(d, raised(out, wav, 'P.wav', db), os.path.join(out, f'{name}.mp4'), PRE + 9.0, PRE + 21.5)
