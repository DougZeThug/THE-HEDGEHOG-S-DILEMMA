"""
How far a living memory's film moves (docs/reviews/2026-10-woodland.md). For each second of
memory time it compares the second's first frame with the frame half a second later, block by
block (16 px), and finds how far each block travelled (block matching, ±8 px, textured blocks
only). It reports the share of blocks that travelled at least 2 px, over the whole frame and
round the two of them, and how far the most-moving tenth travelled. It doesn't count what only
changes brightness (light, a blink), only what visibly travels. Review numbers, not a gate.

    python3 -I tests/playtest/motion.py [frames dir] [fps] [pre seconds] [from s] [to s]

Defaults: the desktop afternoon film's frames, 12 a second, 2 s of the room first, 6–31 s.
"""
import os
import sys

import numpy as np
from PIL import Image

DIR = sys.argv[1] if len(sys.argv) > 1 else 'test-output/review/woodland/film/frames-desktop-afternoon'
FPS = int(sys.argv[2]) if len(sys.argv) > 2 else 12
PRE = float(sys.argv[3]) if len(sys.argv) > 3 else 2
T0 = float(sys.argv[4]) if len(sys.argv) > 4 else 6
T1 = float(sys.argv[5]) if len(sys.argv) > 5 else 31
# Round the two of them, as a share of the frame (the immersed 16:9 view): x0, y0, x1, y1.
PEOPLE = (0.2, 0.44, 0.78, 0.84)
B, R = 16, 8


def lum(i):
    p = os.path.join(DIR, '%05d.jpg' % i)
    return np.asarray(Image.open(p).convert('L'), np.float32)


def flow(a, b):
    """Each block's travel from a to b (px), or nan where a block has too little texture to say."""
    h, w = a.shape
    nh, nw = (h - 2 * R) // B, (w - 2 * R) // B
    A = a[R:R + nh * B, R:R + nw * B]
    blocks = A.reshape(nh, B, nw, B)
    texture = blocks.std(axis=(1, 3))
    best = np.full((nh, nw), np.inf)
    zero = None
    disp = np.zeros((nh, nw))
    for dy in range(-R, R + 1):
        for dx in range(-R, R + 1):
            S = b[R + dy:R + dy + nh * B, R + dx:R + dx + nw * B]
            sad = np.abs(S - A).reshape(nh, B, nw, B).mean(axis=(1, 3))
            if dx == 0 and dy == 0:
                zero = sad
            better = sad < best - 1e-6
            best = np.where(better, sad, best)
            disp = np.where(better, np.hypot(dx, dy), disp)
    # Only where the match is clear (moving made it better than staying put, and there is texture).
    disp = np.where((texture > 6) & ((zero - best) > 0.8) | (disp == 0), disp, 0.0)
    return np.where(texture > 6, disp, np.nan)


def main():
    rows = []
    for s in range(int(T0), int(T1)):
        i = int(round((PRE + s) * FPS))
        d = flow(lum(i), lum(i + FPS // 2))
        nh, nw = d.shape
        x0, y0, x1, y1 = int(PEOPLE[0] * nw), int(PEOPLE[1] * nh), int(PEOPLE[2] * nw), int(PEOPLE[3] * nh)
        whole = np.nanmean(d >= 2) * 100
        people = np.nanmean(d[y0:y1, x0:x1] >= 2) * 100
        p90 = np.nanpercentile(d, 90)
        rows.append((s, whole, people, p90))
        print(f'{s:5d} s   moving ≥2 px: whole {whole:5.1f}%   people {people:5.1f}%   top tenth {p90:4.1f} px')
    wh, pe = [r[1] for r in rows], [r[2] for r in rows]
    print(f'whole: min {min(wh):.1f}%  median {np.median(wh):.1f}%   people: min {min(pe):.1f}%  median {np.median(pe):.1f}%')


if __name__ == '__main__':
    main()
