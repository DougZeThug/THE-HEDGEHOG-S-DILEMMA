"""
Stand-ins for her turn's two in-betweens: her head a quarter and three quarters of the way to him,
made here from the drawings already in the kit until the artist draws `b-look-full-mid1.png` and
`b-look-full-mid2.png` (references/woodland/kit/README.md). Offline, free, no model, no network.

    python3 scripts/stand-in-turn.py

How they are made:
- The panel's head, with her eyes already on him (the two-shot shader's look, below), is warped a
  quarter of the way toward take b, and take b a quarter of the way back.
- The warp is a thin-plate spline through points of the face matched by hand on the 2x drawings.
- It is pinned everywhere outside the region take b is laid in by (scripts/two-shot.py), plus a
  margin, so the hair lying on the grass stays where both drawings have it and only her head turns.
- Each head is laid into the panel through that margin.

Writes:
- references/woodland/drawings/stand-in/b-look-full-mid{1,2}.webp, at the sheet's size;
- references/woodland/upscaled/stand-in/b-look-full-mid{1,2}-top@2x.webp, at twice it.

scripts/two-shot.py then uses them until the artist's own drawings are in
references/woodland/drawings/, and names them `standIns` in the manifest. They are not drawings:
the artist judges them in a flipbook before they are filmed.
"""
import importlib.util
import json
import os
import re

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
_spec = importlib.util.spec_from_file_location('two_shot', os.path.join(ROOT, 'scripts', 'two-shot.py'))
ts = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ts)
cut = ts.cut

# The crop the heads are made in: 512 px square at twice the sheet's size (sheet x 377-633, y 0-256).
CX, N = 754, 512
# Matched points of her face, crop px: the panel's head -> take b's. (Each eye by its corners only:
# its iris looks a different way in each drawing, and a point on it slid the iris down under the lid
# for a drawing: the cinematic director's review of the flipbook.)
PAIRS = [
    ((229.25, 150.5), (168.0, 188.0)),    # right eye, outer corner
    ((270.5, 144.25), (191.75, 184.25)),  # right eye, inner corner
    ((303.0, 110.5), (225.5, 146.75)),    # left eye, inner corner
    ((339.25, 120.5), (261.75, 140.0)),   # left eye, outer corner
    ((313.0, 141.75), (211.75, 193.0)),   # nose tip
    ((301.75, 181.75), (210.5, 231.75)),  # mouth, left corner
    ((344.25, 166.75), (249.25, 206.75)), # mouth, right corner
    ((325.5, 168.0), (228.0, 211.75)),    # mouth
    ((348.0, 228.0), (233.0, 274.25)),    # chin
    ((247.0, 123.0), (169.0, 160.0)),     # right brow
    ((314.0, 93.0), (233.0, 130.5)),      # left brow
    ((268.0, 70.5), (240.5, 113.0)),      # hairline
    ((208.0, 165.5), (160.5, 178.0)),     # right cheek's outline
    ((368.0, 153.0), (318.0, 188.0)),     # left cheek's outline
]
# How far outside take b's region the head's motion fades out (crop px), and the pins' spacing.
MARGIN, PIN = 28, 24
# A quarter and three quarters of the way: held evenly, the turn moves slow, fast, slow, as a head
# does, and the change of drawing between them (her ear, her fringe) falls in its fastest step.
STEPS = (('mid1', 1 / 4), ('mid2', 3 / 4))


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def looking(img, eye, gaze):
    """`img` (the crop) with one eye looking by `gaze`, as the two-shot shader's `looking()` draws it
    (src/world/living/materials.ts): inside the opening the iris moves along it and the white fills
    in where it was. `eye`: the manifest's eleven numbers (opening, iris, white; sheet px, y up)."""
    sheet_y = float(ts.PH)
    ex, ey, rx, ry, ang, ix, iy, ir, wr, wg, wb = eye
    e, rad, iris_at, white = np.array([ex, sheet_y - ey]), np.array([rx, ry]), np.array([ix, sheet_y - iy]), np.array([wr, wg, wb])
    cs, sn = np.cos(-ang), np.sin(-ang)
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float64)
    p = np.stack([CX / 2 + (xx + 0.5) / 2, sheet_y - (yy + 0.5) / 2], -1)

    def local(v):
        return np.stack([cs * v[..., 0] + sn * v[..., 1], -sn * v[..., 0] + cs * v[..., 1]], -1) / rad
    q = local(p - e)
    m = 1 - smooth(0.82, 1.0, np.linalg.norm(q, axis=-1))
    dl = np.array([gaze[0], -gaze[1]]) * rad
    src = p - np.array([cs * dl[0] - sn * dl[1], sn * dl[0] + cs * dl[1]])
    iris = (1 - smooth(ir - 0.7, ir + 0.3, np.linalg.norm(src - iris_at, axis=-1))) * (1 - smooth(0.85, 1.0, np.linalg.norm(local(src - e), axis=-1)))
    was = (1 - smooth(ir - 0.2, ir + 0.8, np.linalg.norm(p - iris_at, axis=-1)))[..., None]
    fill = white[None, None] * (1 - 0.2 * smooth(-0.2, 0.9, q[..., 1]))[..., None]
    base = img * (1 - was) + fill * was
    mx = ((src[..., 0] - CX / 2) * 2 - 0.5).astype(np.float32)
    my = ((sheet_y - src[..., 1]) * 2 - 0.5).astype(np.float32)
    moved = cv2.remap(img.astype(np.float32), mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    out = base * (1 - iris[..., None]) + moved * iris[..., None]
    return img * (1 - m[..., None]) + out * m[..., None]


def spline(src, dst):
    """A thin-plate spline taking the points `src` to `dst`: f(xy) for an (n, 2) array."""
    n = len(src)
    d = np.linalg.norm(src[:, None] - src[None], axis=-1)
    L = np.zeros((n + 3, n + 3))
    L[:n, :n] = d * d * np.log(d + 1e-9) + 1e-3 * np.eye(n)
    L[:n, n:] = np.hstack([np.ones((n, 1)), src])
    L[n:, :n] = L[:n, n:].T
    Y = np.zeros((n + 3, 2))
    Y[:n] = dst
    w = np.linalg.solve(L, Y)

    def f(xy):
        out = np.empty((len(xy), 2))
        for i in range(0, len(xy), 16384):
            c = xy[i:i + 16384]
            r = np.linalg.norm(c[:, None] - src[None], axis=-1)
            out[i:i + 16384] = (r * r * np.log(r + 1e-9)) @ w[:n] + np.hstack([np.ones((len(c), 1)), c]) @ w[n:]
        return out
    return f


def warped(img, at, to):
    """`img` with its points at `at` moved to `to` (sampled backward)."""
    f = spline(to, at)
    yy, xx = np.mgrid[0:N, 0:N]
    s = f(np.stack([xx.ravel(), yy.ravel()], 1).astype(np.float64)).astype(np.float32)
    return cv2.remap(img.astype(np.float32), s[:, 0].reshape(N, N), s[:, 1].reshape(N, N), cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)


def main():
    # The panel and take b at twice the sheet's size, the take moved onto the panel as the cutter
    # moves it; and take b's region, from the two at the sheet's own size as the cutter finds it.
    top2, k = ts.source('02-characters', os.path.join(cut.REF, '02-characters.webp'))
    assert k == 2, 'needs references/woodland/upscaled/ (scripts/upscale.py)'
    take2, _ = ts.source('b-look-full-b', os.path.join(cut.REF, 'drawings', 'b-look-full-b.webp'))
    take2, _ = ts.register(top2, take2, 2)
    sheet1, _ = ts.source('02-characters', os.path.join(cut.REF, '02-characters.webp'), up=False)
    take1, _ = ts.source('b-look-full-b', os.path.join(cut.REF, 'drawings', 'b-look-full-b.webp'), up=False)
    take1, _ = ts.register(sheet1, take1, 1)
    region, _ = ts.head_region(sheet1[:ts.PH], take1[:ts.PH])
    inside = cv2.resize((region[0:N // 2, CX // 2:CX // 2 + N // 2] > 0.02).astype(np.uint8), (N, N), interpolation=cv2.INTER_NEAREST)
    grown = cv2.dilate(inside, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * MARGIN + 1, 2 * MARGIN + 1)))
    # (Where the head is laid into the panel: the grown region, its edge softened inward.)
    lay = cv2.GaussianBlur(cv2.erode(grown, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))).astype(np.float32), (0, 0), 4)[..., None]

    # Her eyes on him first (the manifest's eyes, woodland.ts's `gazeB`), as the film has them
    # before her head moves.
    panel = top2[0:N, CX:CX + N].astype(np.float64)
    take = take2[0:N, CX:CX + N]
    eyes = json.load(open(ts.MANIFEST))['living']['afternoon']['near']['eyes']['b']
    spec = open(os.path.join(ROOT, 'src', 'memory', 'living', 'woodland.ts')).read()
    gaze = [float(v) for v in re.search(r'gazeB:\s*\[([-\d.]+),\s*([-\d.]+)\]', spec).groups()]
    for e in eyes:
        panel = looking(panel, e, gaze)

    pins = [(float(x), float(y)) for y in list(range(0, N, PIN)) + [N - 1] for x in list(range(0, N, PIN)) + [N - 1] if not grown[y, x]]
    P = np.array([p for p, _ in PAIRS] + pins)
    T = np.array([t for _, t in PAIRS] + pins)
    sheet = cut.arr(Image.open(os.path.join(cut.REF, '02-characters.webp')).convert('RGB').resize((1448, 1086), Image.LANCZOS))
    lay1 = cv2.resize(lay[..., 0], (N // 2, N // 2), interpolation=cv2.INTER_AREA)[..., None]
    for d in ('drawings', 'upscaled'):
        os.makedirs(os.path.join(cut.REF, d, 'stand-in'), exist_ok=True)
    for name, f in STEPS:
        to = P + (T - P) * f
        head = warped(panel, P, to) if f < 0.5 else warped(take, T, to)
        head = np.clip(head * lay + panel * (1 - lay), 0, 1)
        out2 = top2.copy()
        out2[0:N, CX:CX + N] = head
        cut.img(out2).save(os.path.join(ts.UPSCALED, 'stand-in', f'b-look-full-{name}-top@2x.webp'), 'WEBP', lossless=True, method=6)
        out1 = sheet.copy()
        small = cv2.resize(head.astype(np.float32), (N // 2, N // 2), interpolation=cv2.INTER_AREA)
        out1[0:N // 2, CX // 2:CX // 2 + N // 2] = small * lay1 + out1[0:N // 2, CX // 2:CX // 2 + N // 2] * (1 - lay1)
        cut.img(out1).save(os.path.join(cut.REF, 'drawings', 'stand-in', f'b-look-full-{name}.webp'), 'WEBP', quality=95, method=6)
    print(f'stand-in-turn: {", ".join(n for n, _ in STEPS)} from the panel and take b; {len(pins)} pins outside b\'s region grown {MARGIN} px')


if __name__ == '__main__':
    main()
