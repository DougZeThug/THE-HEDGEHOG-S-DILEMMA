"""Film A for the artist: the room before (5 s), the woodland, the room after (8 s), at speed, with
its sound (woodland-film-sound.py) and its captions as a visitor sees them (woodland-captions.mjs);
and short clips of the alternatives. The pictures are the films already recorded from this build's
memory (the sound changed, not the picture): heart/ for the room, the way in and the dusk,
context5/ for the two-shot and the second wide (her rebuilt turn); the room before and after held
on their first and last frame.

  npm run build
  .venv-audio/bin/python tests/playtest/woodland-film.py test-output/review/woodland/sound

once the sound of each version is made first, into <out dir>/A.wav (as built; and A-phone.wav),
B.wav (the score's other form, never home) and W.wav (the wind ending at the cut):
  PRE=5 POST=8 GAIN=0 STEMS=<out>/stems-A OUT=<out>/mix npx vite-node tests/playtest/woodland-audio.ts
  PRE=5 POST=8 GAIN=0 STEMS=<out>/stems-B OUT=<out>/mix OVERRIDE='{"music:score":{"asset":"<out>/woodland-score-b.mp3"}}' npx vite-node tests/playtest/woodland-audio.ts
  PRE=5 POST=8 GAIN=0 STEMS=<out>/stems-W OUT=<out>/mix OVERRIDE='{"music:air":{"until":34.5}}' npx vite-node tests/playtest/woodland-audio.ts
  .venv-audio/bin/python tests/playtest/woodland-film-sound.py <out>/stems-A <out>/A.wav <out>/A-phone.wav   (and B, W)
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
CAPS = [(0, 0.0, 3.7), (1, 12.2, 3.7), (2, 35.3, 3.7), (3, 48.2, 5.2)]


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


def film(frames_dir, audio, out, start=0.0, end=None):
    """Frames + captions + sound, from `start` to `end` film seconds."""
    inputs = ['-framerate', str(FPS), '-i', os.path.join(frames_dir, '%05d.jpg')]
    chain, last = [], '0:v'
    for k, (i, at, hold) in enumerate(CAPS):
        t0 = PRE + at
        inputs += ['-loop', '1', '-framerate', str(FPS), '-t', '66', '-i', os.path.join(OUT, 'caps', f'cap-{i}.png')]
        chain.append(f'[{k + 1}:v]format=rgba,fade=in:st={t0}:d=1.4:alpha=1,fade=out:st={t0 + hold}:d=1.4:alpha=1[c{k}]')
        chain.append(f'[{last}][c{k}]overlay=0:0:enable=\'between(t,{t0},{t0 + hold + 1.4})\'[v{k}]')
        last = f'v{k}'
    inputs += ['-i', audio]
    trim = ['-ss', str(start)] + (['-to', str(end)] if end else [])
    cmd = ['ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex', ';'.join(chain), '-map', f'[{last}]', '-map', f'{len(CAPS) + 1}:a',
           *trim, '-c:v', 'libx264', '-r', '24', '-pix_fmt', 'yuv420p', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', out]
    subprocess.run(cmd, check=True)
    print(out)


OUT = sys.argv[1] if len(sys.argv) > 1 else 'test-output/review/woodland/sound'

if __name__ == '__main__':
    out = OUT
    d, n = frames(out)
    print(n, 'frames,', n / FPS, 's')
    film(d, os.path.join(out, 'A.wav'), os.path.join(out, 'woodland-film-A.mp4'))
    film(d, os.path.join(out, 'A-phone.wav'), os.path.join(out, 'woodland-film-A-phone-speaker.mp4'))
    # The alternatives, from the cut to the two of them (15.0) to the room taking the painting back (43.5).
    film(d, os.path.join(out, 'B.wav'), os.path.join(out, 'alternative-never-home-15-43.mp4'), PRE + 15.0, PRE + 43.5)
    film(d, os.path.join(out, 'W.wav'), os.path.join(out, 'alternative-no-wind-across-the-cut-15-43.mp4'), PRE + 15.0, PRE + 43.5)
    film(d, os.path.join(out, 'A.wav'), os.path.join(out, 'as-built-15-43.mp4'), PRE + 15.0, PRE + 43.5)
