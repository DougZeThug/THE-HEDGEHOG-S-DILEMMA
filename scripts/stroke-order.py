"""
When each pencil line of the woodland appears on the plaster, and when the colour comes after it
(the artist's shot list, shot 1: "pencil marks begin suggesting branches and grasses"; shot 2:
"drawn branches acquire colour"; docs/reviews/2026-10-woodland.md). Offline only.

    python3 scripts/stroke-order.py

Reads the artist's pencil drawing of the composition (references/woodland/drawings/pencil.png)
or, until there is one, the graphite layer cut from the painting
(public/memories/woodland/afternoon/sketch.webp: a stand-in, an edge filter, which reads as one).
Writes public/memories/woodland/afternoon/order.webp (lossless, painting-sized) and its manifest
entry:

    R  when the pencil gets here (0..1 of the drawing): out from the words along a broken front,
       light marks before dark ones (it is laid in lightly, then gone over), the two people found
       last. Not stroke by stroke: nobody can follow a stroke's order from across a room, and
       the order of a thinned, traced line was the work's least visible effort (the skeptic's
       review, 2026-10-17).
    G  when the colour reaches here (0..1): the time of the nearest line, a little later the
       further from it, broken by a soft noise (a wash, following the drawing); never before its
       line.

The wall's window (src/world/MemoryWindow.ts) draws a line where R ≤ window.sketch's progress
and colour where G ≤ window.reveal's.
"""
import json
import os

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PENCIL = os.path.join(ROOT, 'references', 'woodland', 'drawings', 'pencil.png')
SKETCH = os.path.join(ROOT, 'public', 'memories', 'woodland', 'afternoon', 'sketch.webp')
OUT = os.path.join(ROOT, 'public', 'memories', 'woodland', 'afternoon', 'order.webp')
MANIFEST = os.path.join(ROOT, 'public', 'memories', 'woodland', 'manifest.json')
W, H = 1672, 941
# The painting's part round the words (painting uv, y up), from the cutter: the drawing starts here.
CROP = (0.23, 0.09, 0.5, 0.55)


def darkness():
    """How dark the pencil is at each point (0..1), painting-sized."""
    if os.path.exists(PENCIL):
        g = np.asarray(Image.open(PENCIL).convert('L').resize((W, H), Image.LANCZOS), np.float32) / 255
        paper = np.percentile(g, 90)
        return np.clip((paper - g) / max(paper - g.min(), 1e-3), 0, 1), 'the artist\'s pencil drawing'
    a = np.asarray(Image.open(SKETCH).convert('RGBA').resize((W, H), Image.LANCZOS), np.float32)[..., 3] / 255
    return a, 'the graphite cut from the painting (a stand-in)'


def people():
    """Where the two of them are (0..1, soft): their own cut-out (the puppet's body), where it lies
    on the painting. (The words are written over them: without this they would be drawn first.)"""
    with open(MANIFEST) as f:
        fig = json.load(f)['living']['afternoon']['figures']
    atlas = Image.open(os.path.join(ROOT, 'public', 'memories', 'woodland', fig['file'] + '.webp')).convert('RGBA')
    body = atlas.crop((0, 0, fig['pixels'][0], fig['pixels'][1])).split()[3]
    x0, y0, w, h = fig['place']  # painting uv, y up
    pw, ph = round(w * W), round(h * H)
    m = np.zeros((H, W), np.float32)
    px, py = round(x0 * W), round((1 - y0 - h) * H)
    m[py:py + ph, px:px + pw] = np.asarray(body.resize((pw, ph), Image.LANCZOS), np.float32)[:H - py, :W - px] / 255
    m = cv2.dilate((m > 0.3).astype(np.uint8), np.ones((9, 9), np.uint8)).astype(np.float32)
    return cv2.GaussianBlur(m, (0, 0), 6)


def soft_noise(rng, sigma):
    n = cv2.GaussianBlur(rng.random((H, W)).astype(np.float32), (0, 0), sigma)
    return (n - n.min()) / (n.max() - n.min() + 1e-6)


def main():
    dark, source = darkness()
    lines = cv2.GaussianBlur(dark, (0, 0), 0.8) > 0.22
    rng = np.random.default_rng(11)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    ox, oy = (CROP[0] + CROP[2] / 2) * W, (1 - (CROP[1] + CROP[3] / 2)) * H
    reach = np.hypot(xx - ox, yy - oy)
    reach /= reach.max()
    # How dark the mark is, a little smoothed (a line's light edge before its dark middle).
    weight = np.clip(cv2.GaussianBlur(dark, (0, 0), 1.5) / 0.8, 0, 1)
    found = people()
    R = 0.6 * reach + 0.16 * weight + 0.14 * soft_noise(rng, 30) + 0.62 * found
    # (All of it within the drawing's time, the latest line well before its end: the wall's reveal
    # is half-way at a mark's own time, so a mark timed at the very end would stay half drawn.)
    R = (R - R[lines].min()) / (R[lines].max() - R[lines].min() + 1e-6) if lines.any() else R / R.max()
    R = np.clip(R, 0, 1) * 0.88
    # The colour: after the nearest line, later with distance from it, broken softly.
    lsrc = np.where(lines, 0, 255).astype(np.uint8)
    dist, labels = cv2.distanceTransformWithLabels(lsrc, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    ly, lx = np.nonzero(lsrc == 0)
    lorder = np.zeros(ly.size + 1, np.float32)
    lorder[1:] = R[ly, lx]  # labels are numbered over the zero pixels, in scan order
    G = lorder[labels] + 0.18 * np.clip(dist / 120, 0, 1)
    # Soft fronts, not the nearest line's patch: a wash spreads; its edge is broken a little.
    G = cv2.GaussianBlur(G.astype(np.float32), (0, 0), 22) + 0.08 * (soft_noise(rng, 18) - 0.5)
    G = (G - G.min()) / (G.max() - G.min() + 1e-6) * 0.94
    # Never before its line (a lag after the pencil, whatever the wash's own order).
    G = np.maximum(G, R + 0.06)
    rgb = np.dstack([R, G, np.zeros_like(G)])
    Image.fromarray((rgb * 255 + 0.5).astype(np.uint8), 'RGB').save(OUT, 'WEBP', lossless=True, method=6)
    with open(MANIFEST) as f:
        manifest = json.load(f)
    manifest['living']['afternoon']['order'] = 'afternoon/order'
    with open(MANIFEST, 'w') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')
    print(f'order: from {source}; {int(lines.sum())} line pixels')


if __name__ == '__main__':
    main()
