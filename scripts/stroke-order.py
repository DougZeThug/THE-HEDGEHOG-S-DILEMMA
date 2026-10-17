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
    G  when the colour reaches here (0..1): out from the words as the drawing went, but with the
       two of them (under the words) first, not last: once the drawing is whole the colour begins
       with them (held back with their lines, it went round them, a figure-shaped gap of bare
       plaster in the painting: the crossing's frames, 2026-10-17); a little later the further
       from a line, broken by a soft noise (a wash); never sooner than LAG seconds after its own
       line, on the timeline's clocks.

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
# Where the memory's line is written on the painting (painting uv, y up): across the top of the
# part the wall shows first (the cutter's crop, 0.23, 0.09, 0.5, 0.55), just under its edge. The
# drawing starts here, at the words (cinematic review, 2026-10-17: from the crop's centre, the
# first marks came 150–250 px below and right of them).
WORDS = (0.48, 0.61)
# The timeline's clocks for the drawing and the colour (src/memory/defs.ts, the woodland's
# window.sketch and window.reveal: where each starts and reaches 1, and how: Theatre's soft key or
# a straight one; tests/memory-defs.test.ts keeps them the same), and how long after its line the
# colour may come at the soonest (s).
DRAWN = (2.0, 6.0, 'soft')
COLOURED = (5.4, 7.6, 'linear')
LAG = 0.4


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
    # (Soft round them: no hard-edged island of late colour where they lay.)
    return cv2.GaussianBlur(m, (0, 0), 18)


def clock(kind):
    """A key's ease, Theatre's soft one (a cubic, handles (0.5, 0) and (0.5, 1)) or a straight
    one: the value at a fraction of the time, and the time at a fraction of the value."""
    if kind == 'linear':
        return (lambda x: x), (lambda y: y)
    s = np.linspace(0, 1, 2001)
    xs, ys = 1.5 * s * (1 - s) + s ** 3, 3 * s ** 2 - 2 * s ** 3
    return (lambda x: np.interp(x, xs, ys)), (lambda y: np.interp(y, ys, xs))


def soft_noise(rng, sigma):
    n = cv2.GaussianBlur(rng.random((H, W)).astype(np.float32), (0, 0), sigma)
    return (n - n.min()) / (n.max() - n.min() + 1e-6)


def main():
    dark, source = darkness()
    lines = cv2.GaussianBlur(dark, (0, 0), 0.8) > 0.22
    rng = np.random.default_rng(11)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    ox, oy = WORDS[0] * W, (1 - WORDS[1]) * H
    reach = np.hypot(xx - ox, yy - oy)
    reach /= reach.max()
    # How dark the mark is, a little smoothed (a line's light edge before its dark middle).
    weight = np.clip(cv2.GaussianBlur(dark, (0, 0), 1.5) / 0.8, 0, 1)
    found = people()
    grain = soft_noise(rng, 30)

    def over_lines(x):
        # (All of it within the drawing's time, the first line just after its start and the latest
        # well before its end: the wall shows a mark half drawn at its own time, so a mark timed at
        # 0 would be there before anything is drawn, and one at 1 would stay half drawn.)
        x = (x - x[lines].min()) / (x[lines].max() - x[lines].min() + 1e-6) if lines.any() else x / x.max()
        return 0.02 + np.clip(x, 0, 1) * 0.86

    R = over_lines(0.6 * reach + 0.16 * weight + 0.14 * grain + 0.62 * found)
    # The colour: the drawing's own way out from the words, the two of them a moment after the
    # grass round them rather than last; later with distance from the nearest line; broken softly.
    wash = over_lines(0.6 * reach + 0.16 * weight + 0.14 * grain + 0.04 * found)
    lsrc = np.where(lines, 0, 255).astype(np.uint8)
    dist, labels = cv2.distanceTransformWithLabels(lsrc, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    ly, lx = np.nonzero(lsrc == 0)
    lorder = np.zeros(ly.size + 1, np.float32)
    lorder[1:] = wash[ly, lx]  # labels are numbered over the zero pixels, in scan order
    G = lorder[labels] + 0.18 * np.clip(dist / 120, 0, 1)
    # Soft fronts, not the nearest line's patch: a wash spreads; its edge is broken a little.
    G = cv2.GaussianBlur(G.astype(np.float32), (0, 0), 22) + 0.08 * (soft_noise(rng, 18) - 0.5)
    # As much of the painting takes its colour in each moment as in any other (the wash spreads at
    # one pace: four fifths of it had come in under half a second, a burst: the crossing's frames,
    # 2026-10-17); from just past the wall's soft colour edge, ±0.08 and its grain, so nothing has
    # colour before the colour's time (from 0 the words had half their colour from the start).
    flat = G.ravel()
    rank = np.empty(flat.size, np.float32)
    rank[np.argsort(flat, kind='stable')] = np.arange(flat.size, dtype=np.float32) / (flat.size - 1)
    G = 0.12 + 0.82 * rank.reshape(G.shape)
    # Never sooner than LAG s after its line, in seconds on the two clocks (against the line's
    # time softened, so the wash keeps a soft front).
    _, drawn_at = clock(DRAWN[2])
    coloured_by, _ = clock(COLOURED[2])
    drawn = DRAWN[0] + (DRAWN[1] - DRAWN[0]) * drawn_at(cv2.GaussianBlur(R.astype(np.float32), (0, 0), 8))
    soonest = coloured_by(np.clip((drawn + LAG - COLOURED[0]) / (COLOURED[1] - COLOURED[0]), 0, 1))
    held = float(np.mean(soonest > G + 0.01))
    G = np.maximum(G, soonest)
    rgb = np.dstack([R, G, np.zeros_like(G)])
    Image.fromarray((rgb * 255 + 0.5).astype(np.uint8), 'RGB').save(OUT, 'WEBP', lossless=True, method=6)
    with open(MANIFEST) as f:
        manifest = json.load(f)
    manifest['living']['afternoon']['order'] = 'afternoon/order'
    with open(MANIFEST, 'w') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')
    print(f'order: from {source}; {int(lines.sum())} line pixels; the colour held for its line over {held:.1%} of the painting')


if __name__ == '__main__':
    main()
