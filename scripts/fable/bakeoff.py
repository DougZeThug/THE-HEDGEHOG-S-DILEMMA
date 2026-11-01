"""Put two renders of the pond in front of the artist: each one's clip for a phone, the two side by
side, and stills of both beside the reference's panels 2 and 3. First the bake-off (A_clip, EEVEE,
against B_clip, the compositor), then any render against another (B_clip against B_fix).

Usage: python -I scripts/fable/bakeoff.py [--bake DIR] [--out DIR] [--pair LEFT RIGHT] [--names L R]
(LEFT and RIGHT are folders in --bake, each with frames/ and times.json from comp.py or stage.py)
"""
import argparse
import json
import os
import subprocess

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REF = os.path.join(ROOT, 'references', 'fable', 'Fox_and_Moon_Orange_Reference_v2.png')
PANELS = {2: (516, 0, 1021, 503), 3: (1032, 0, 1536, 503)}
BEATS = [(0, 'ease'), (6, 'withdrawn under the reeds'), (9, 'disappearing'), (16, 'brighter'), (21, 'dimming'),
         (25, 'rest'), (32, 'the creep')]
FPS = 24


def ffmpeg(*a):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *a], check=True)


def font(size):
    for f in ('C:/Windows/Fonts/segoeui.ttf', 'C:/Windows/Fonts/arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def clip(frames, out, w=864, h=1080):
    ffmpeg('-framerate', str(FPS), '-i', os.path.join(frames, '%04d.png'), '-vf', f'scale={w}:{h}:flags=lanczos',
           '-c:v', 'libx264', '-crf', '20', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out)


def side_by_side(a, b, out):
    ffmpeg('-i', a, '-i', b, '-filter_complex', '[0:v][1:v]hstack=inputs=2', '-c:v', 'libx264', '-crf', '21',
           '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out)


def stills(bake, out, pair=('A_clip', 'B_clip'), names=('A', 'B'), tw=360):
    """Rows of beats, left | right, with panels 2 and 3 heading the sheet."""
    folders = [os.path.join(bake, p, 'frames') for p in pair]
    th = round(tw * 1440 / 1152)
    pad, cap = 12, 30
    W = pad + 2 * (tw + pad)
    ref = Image.open(REF).convert('RGB')
    heads = [ref.crop(PANELS[n]).resize((tw, round(tw * 503 / 505)), Image.LANCZOS) for n in (2, 3)]
    H = pad + (heads[0].height + cap + pad) + len(BEATS) * (th + cap + pad)
    sheet = Image.new('RGB', (W, H), (18, 18, 20))
    d = ImageDraw.Draw(sheet)
    f = font(17)
    y = pad
    for i, (im, label) in enumerate(zip(heads, ('reference, panel 2', 'reference, panel 3'))):
        x = pad + i * (tw + pad)
        sheet.paste(im, (x, y))
        d.text((x, y + im.height + 5), label, fill=(225, 222, 214), font=f)
    y += heads[0].height + cap + pad
    for t, label in BEATS:
        n = int(round(t * FPS))
        for i, (frames, route) in enumerate(zip(folders, names)):
            im = Image.open(os.path.join(frames, f'{n:04d}.png')).convert('RGB').resize((tw, th), Image.LANCZOS)
            x = pad + i * (tw + pad)
            sheet.paste(im, (x, y))
            d.text((x, y + th + 5), f'{route}  {t:g} s  {label}', fill=(225, 222, 214), font=f)
        y += th + cap + pad
    sheet.save(out, quality=90)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bake', default=os.path.join(ROOT, 'test-output', 'fable', 'bake'))
    ap.add_argument('--out', default=os.path.join(ROOT, 'test-output', 'fable', 'bake', 'review'))
    ap.add_argument('--pair', nargs=2, default=['A_clip', 'B_clip'])
    ap.add_argument('--names', nargs=2, default=['A-eevee', 'B-compositor'])
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    videos = [os.path.join(a.out, f'pond-{n}.mp4') for n in a.names]
    for folder, video in zip(a.pair, videos):
        clip(os.path.join(a.bake, folder, 'frames'), video)
    side_by_side(*videos, os.path.join(a.out, f'pond-{a.names[0]}-left-{a.names[1]}-right.mp4'))
    stills(a.bake, os.path.join(a.out, 'pond-stills.jpg'), a.pair, [n.split('-')[0] for n in a.names])
    times = {n: json.load(open(os.path.join(a.bake, p, 'times.json'))) for p, n in zip(a.pair, a.names)}
    json.dump(times, open(os.path.join(a.out, 'times.json'), 'w'), indent=1)
    print(json.dumps(times))


if __name__ == '__main__':
    main()
