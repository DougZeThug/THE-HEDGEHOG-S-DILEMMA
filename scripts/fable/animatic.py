"""The artist's visual animatic retimed onto the locked radio cut, with the chosen soundtrack under it.

The package's animatic (references/The Fox the Moon/.../animatic: 1280x720, 12 fps, silent, its
subtitles burned in) was timed to an earlier reading; it shows story order, not timing. Here every
subtitle cue is pinned to its line in radio cut v1: the cue's start to the line's start, its end to
the line's end, so each subtitle is up while Tom says it. Between the anchors time runs linearly, so
the cut's silences (the ease, the rest, the touch, the last glance) hold the animatic's pictures
for as long as the film holds them. Before the first cue is the curtains' lead-in; after the last,
the animatic's end hold runs to the cut, where the picture goes to black with the sound. The film
is 24 fps; each output frame shows the animatic frame its time maps back to.

It is the picture's first placement on the film's clock: animatic-timing.json, written beside this
script, gives every anchor and every animatic shot's in and out on the film (seconds and 24 fps
frames), for the exposure sheet.

Usage: python -I scripts/fable/animatic.py [--package DIR] [--mix WAV] [--out DIR]
  --package  the package's animatic folder (shot_timing.json, fox_and_moon_visual_animatic_v2.mp4)
  --mix      the soundtrack (default audition/fable/mix/soundtrack.wav, mix 1)
  --out      default test-output/fable/animatic
"""
import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FPS = 24
CUT = json.loads((ROOT / 'scripts/fable/radio-cut.json').read_text(encoding='utf8'))


def words(s):
    import re
    return re.sub(r'[^a-z ]', '', s.lower().replace('’', "'").replace('-', ' ')).split()


def anchors(timing):
    """(animatic time, film time) pairs: the start, every cue's start and end, the hold, the cut."""
    units, pairs, ui = CUT['units'], [(0.0, 0.0)], 0
    for c in timing['cues']:
        want, got, j = words(c['text']), [], ui
        while j < len(units) and len(got) < len(want):
            got += words(units[j]['text'])
            j += 1
        if got != want:
            raise SystemExit(f"cue {c['text'][:40]!r} doesn't match the cut's lines from {ui}")
        pairs += [(c['start'], units[ui]['at']), (c['end'], units[j - 1]['end'])]
        ui = j
    if ui != len(units):
        raise SystemExit('not every line of the cut has a cue')
    pairs.append((timing['ending']['hold_until'], CUT['length']['toCut']))
    # The film's one hard sync (decision 9): one cue spans "reached after her. His paw struck the
    # water", so the touch is pinned inside it. The animatic's contact is the first frame with
    # ripples (frame 2035, 169.500 s, found by frame difference on the pond); it goes on the touch
    # sound's onset in the chosen mix.
    pairs.append((ANIMATIC_TOUCH, touch_onset()))
    pairs.sort()
    assert all(f0 < f1 for (_, f0), (_, f1) in zip(pairs, pairs[1:])), 'anchors must run forward on the film too'
    return pairs


ANIMATIC_TOUCH = 2034 / 12  # frame 2035 of the package animatic, the first with ripples


def touch_onset():
    """The touch's onset in the mix: its peak sits 0.25 s into the gap (sfx_takes.PLACES), its onset
    the take's own lead before that peak."""
    sfx = json.loads((ROOT / 'scripts/fable/sfx-ledger.json').read_text(encoding='utf8'))
    mix = json.loads((ROOT / 'scripts/fable/mix.json').read_text(encoding='utf8'))
    f = sfx['entries'][mix['effects']['touch']['take']]['facts']
    gap = next(u['end'] for u in CUT['units'] if u.get('why') == 'the touch')
    return gap + 0.25 - (f['peakAt'] - f['onset'])


def to_film(pairs, t):
    for (a0, f0), (a1, f1) in zip(pairs, pairs[1:]):
        if a0 <= t <= a1:
            return f0 + (t - a0) * (f1 - f0) / (a1 - a0)
    return None


def to_animatic(pairs, f):
    for (a0, f0), (a1, f1) in zip(pairs, pairs[1:]):
        if f0 <= f <= f1:
            return a0 + (f - f0) * (a1 - a0) / (f1 - f0)
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--package', default=str(ROOT / 'references/The Fox the Moon/The_Fox_and_the_Moon_Claude_Code_Package_v2/animatic'))
    ap.add_argument('--mix', default=str(ROOT / 'audition/fable/mix/soundtrack.wav'))
    ap.add_argument('--out', default=str(ROOT / 'test-output/fable/animatic'))
    args = ap.parse_args()
    pkg, out = Path(args.package), Path(args.out)
    timing = json.loads((pkg / 'shot_timing.json').read_text(encoding='utf8'))
    src_fps = timing['fps']
    pairs = anchors(timing)

    # The animatic's frames, once, as stills.
    frames = out / 'frames'
    frames.mkdir(parents=True, exist_ok=True)
    if not any(frames.glob('*.png')):
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', str(pkg / 'fox_and_moon_visual_animatic_v2.mp4'),
                        '-vf', f'fps={src_fps}', str(frames / '%05d.png')], check=True)
    count = len(list(frames.glob('*.png')))
    black = out / 'black.png'
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=black:s=1280x720', '-frames:v', '1', str(black)], check=True)

    # Each film frame shows the animatic frame its time maps back to; black from the cut.
    cut_frame = round(CUT['length']['toCut'] * FPS)
    total = round(CUT['length']['withBlack'] * FPS)
    shown = []
    for k in range(total):
        if k >= cut_frame:
            shown.append(None)
            continue
        a = to_animatic(pairs, (k + 0.5) / FPS)
        shown.append(min(count, max(1, int(a * src_fps) + 1)))
    runs = []
    for s in shown:
        if runs and runs[-1][0] == s:
            runs[-1][1] += 1
        else:
            runs.append([s, 1])
    lst = out / 'frames.ffconcat'
    lines = ['ffconcat version 1.0']
    for s, n in runs:
        path = black if s is None else frames / f'{s:05d}.png'
        lines += [f"file '{path.as_posix()}'", f'duration {n / FPS:.6f}']
    lines.append(f"file '{black.as_posix()}'")  # the concat demuxer needs a last entry to close the final duration
    lst.write_text('\n'.join(lines) + '\n', encoding='utf8')

    film = out / 'fable-animatic.mp4'
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', str(lst), '-i', args.mix,
                    '-map', '0:v', '-map', '1:a', '-vf', f'fps={FPS},format=yuv420p', '-c:v', 'libx264', '-crf', '20', '-preset', 'medium',
                    '-c:a', 'aac', '-b:a', '160k', '-t', f"{CUT['length']['withBlack']:.3f}", '-movflags', '+faststart', str(film)], check=True)
    small = out / 'fable-animatic-small.mp4'
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(film), '-vf', 'scale=960:540', '-c:v', 'libx264', '-crf', '30',
                    '-preset', 'slow', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', str(small)], check=True)
    # The same, as WebM, for a page that offers both (a browser without H.264 plays this one).
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(film), '-vf', 'scale=960:540', '-c:v', 'libvpx-vp9', '-crf', '40',
                    '-b:v', '0', '-row-mt', '1', '-c:a', 'libopus', '-b:a', '96k', str(small.with_suffix('.webm'))], check=True)

    # The record: anchors, and every animatic shot on the film's clock.
    shots = []
    for s in timing['shots']:
        f0, f1 = to_film(pairs, s['start']), to_film(pairs, min(s['end'], pairs[-1][0]))
        shots.append({'shot': s['index'], 'name': s['name'], 'animatic': [round(s['start'], 3), round(s['end'], 3)],
                      'film': [round(f0, 3), round(f1, 3)], 'frames': [round(f0 * FPS), round(f1 * FPS)]})
    record = {
        'note': 'The package animatic retimed onto radio cut v1 by scripts/fable/animatic.py: each subtitle cue pinned to its line, linear between. A placement for the exposure sheet, not the final picture.',
        'radioCut': CUT['version'], 'fps': FPS, 'sourceFps': src_fps, 'cutFrame': cut_frame, 'frames': total,
        'anchors': [[round(a, 3), round(f, 3)] for a, f in pairs],
        'shots': shots,
    }
    (ROOT / 'scripts/fable/animatic-timing.json').write_bytes((json.dumps(record, indent=1) + '\n').encode('utf8'))
    for s in shots:
        print(f"{s['shot']:2} {s['name']:<20} film {s['film'][0]:7.2f}-{s['film'][1]:7.2f}  frames {s['frames'][0]}-{s['frames'][1]}")
    print(film, small)


if __name__ == '__main__':
    main()
