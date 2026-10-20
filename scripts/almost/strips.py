"""Motion strips of "Almost": chosen frames of a film side by side, each labelled with its frame
and second, for judging the acting frame by frame.

    python3 scripts/almost/strips.py FILM.mp4 OUT.jpg --frames 196-212 [--cols 6] [--width 320]

`--frames` takes single frames and ranges (`96,136-142,200-212:2`, the last every second frame).
"""
import sys

import cv2
import numpy as np


def parse(spec):
    out = []
    for part in spec.split(','):
        step = 1
        if ':' in part:
            part, step = part.split(':')
            step = int(step)
        if '-' in part:
            a, b = (int(x) for x in part.split('-'))
            out += list(range(a, b + 1, step))
        else:
            out.append(int(part))
    return out


def main():
    a = sys.argv[1:]
    film, out = a[0], a[1]
    opt = {a[i][2:]: a[i + 1] for i in range(2, len(a) - 1, 2)}
    frames = parse(opt['frames'])
    cols = int(opt.get('cols', 6))
    width = int(opt.get('width', 320))
    cap = cv2.VideoCapture(film)
    fps = cap.get(cv2.CAP_PROP_FPS) or 24
    cells = []
    want = set(frames)
    i = 0
    got = {}
    while len(got) < len(want):
        ok, img = cap.read()
        if not ok:
            break
        if i in want:
            got[i] = img
        i += 1
    for f in frames:
        img = got.get(f)
        if img is None:
            continue
        h = int(round(img.shape[0] * width / img.shape[1]))
        img = cv2.resize(img, (width, h), interpolation=cv2.INTER_AREA)
        label = f'{f}  {f / fps:5.2f}s'
        cv2.rectangle(img, (0, 0), (len(label) * 8 + 8, 18), (0, 0, 0), -1)
        cv2.putText(img, label, (4, 13), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1, cv2.LINE_AA)
        cells.append(img)
    if not cells:
        raise SystemExit('no frames')
    h, w = cells[0].shape[:2]
    rows = (len(cells) + cols - 1) // cols
    sheet = np.full((rows * (h + 4) + 4, cols * (w + 4) + 4, 3), 24, np.uint8)
    for k, c in enumerate(cells):
        r, q = divmod(k, cols)
        sheet[4 + r * (h + 4):4 + r * (h + 4) + h, 4 + q * (w + 4):4 + q * (w + 4) + w] = c
    cv2.imwrite(out, sheet, [cv2.IMWRITE_JPEG_QUALITY, 88])
    print('strip', out, len(cells), 'frames')


if __name__ == '__main__':
    main()
