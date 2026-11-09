"""The puppet rig (style bible §3, §6): each key drawing cut into its paper pieces, pinned at the
joints, so he moves between poses instead of jumping. A paper puppet, as the drawings already are:
the head on a pin behind the ear, the foreleg's upper card on the shoulder pin and its lower leg on
the elbow pin, the tail behind the body on its root, the body the base.

A piece is the part of the drawing its outline claims (later pieces claim over earlier ones; the
body keeps the rest). Where a piece in front of another moves, it shows what was under it: each
piece's paper is carried on under the pieces in front of it, near the, painted in from its own colours: under a piece that hangs from it, as far as that piece's
`reveal` from its pin ('all': the whole of it); under the piece it hangs from, if that is in front,
a round end of `lobe` about its own pin. Every piece casts a small shadow on what is under it.

All coordinates are flipped source px (he faces right), as in still.py.

Usage (a check sheet: the pieces in colour with their pins, and the rig bent at its limits):
    python -I scripts/fable/rig.py OUT_DIR
"""
import math
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import still as S  # noqa: E402

WS = 2 * S.SPEC['fox_scale']   # the pieces are kept at twice his size on screen, warped down
BAND = 160    # nor further than this (source px) from its own paper
RIG_V = 5

# name: (drawing, [pieces]); each piece: name, parent, z, pivot (source px), outline (source px).
# The base piece ('body') has no outline: it keeps what no other piece claims.
RIGS = {
    'touch': ('k3-touch-1', [
        {'name': 'body', 'parent': None, 'z': 1, 'pivot': (2674, 2650)},
        {'name': 'tail', 'parent': 'body', 'z': 0, 'pivot': (2090, 2230), 'lobe': 260,
         'poly': [(80, 1880), (1500, 1800), (2010, 1930), (2110, 2080), (2090, 2330), (1900, 2480), (1500, 2700),
                  (900, 2780), (80, 2780)]},
        {'name': 'lower', 'parent': 'upper', 'z': 2, 'pivot': (3560, 1880), 'reveal': 260, 'lobe': 140,
         'poly': [(3470, 1900), (3600, 1820), (3790, 1790), (3900, 1930), (4120, 2230), (4380, 2380), (4560, 2420),
                  (4640, 2560), (4620, 2700), (4250, 2720), (4000, 2500), (3750, 2250), (3560, 2060)]},
        {'name': 'upper', 'parent': 'body', 'z': 3, 'pivot': (3440, 1200), 'reveal': 'all',
         'poly': [(3255, 1120), (3310, 1030), (3420, 985), (3530, 1010), (3600, 1090), (3640, 1230), (3680, 1420),
                  (3740, 1620), (3765, 1790), (3730, 1910), (3640, 1965), (3540, 1975), (3460, 1930), (3410, 1830),
                  (3370, 1660), (3310, 1460), (3265, 1280)]},
        {'name': 'head', 'parent': 'body', 'z': 1.5, 'pivot': (3960, 1180), 'reveal': 450,  # behind the near foreleg
         'poly': [(3880, 1060), (3960, 960), (4100, 880), (4300, 820), (4600, 760), (5120, 760), (5120, 1180),
                  (4700, 1260), (4600, 1270), (4580, 1520), (4530, 1800), (4490, 2070), (4330, 2080), (4180, 1960),
                  (4040, 1760), (3960, 1600), (3950, 1480), (3975, 1380), (3940, 1290), (3890, 1180)]},
    ]),
    'hide': ('k3-branchpose-1', [
        {'name': 'body', 'parent': None, 'z': 1, 'pivot': (1700, 2510)},
        {'name': 'head', 'parent': 'body', 'z': 2, 'pivot': (3650, 1560), 'reveal': 520,
         'poly': [(3250, 1000), (3330, 880), (3700, 880), (3820, 1060), (3950, 1160), (4250, 1240), (4550, 1340), (4750, 1520),
                  (4900, 1820), (5000, 2060), (4880, 2180), (4400, 2170), (4000, 2090), (3800, 2040), (3720, 1960),
                  (3700, 1700), (3560, 1520), (3420, 1380), (3300, 1220)]},
        {'name': 'upper', 'parent': 'body', 'z': 3, 'pivot': (3150, 1480), 'reveal': 'all',
         'poly': [(2920, 1420), (2980, 1320), (3100, 1290), (3250, 1330), (3400, 1430), (3550, 1560), (3680, 1700),
                  (3745, 1830), (3700, 1935), (3600, 1965), (3480, 1905), (3300, 1800), (3100, 1700), (2970, 1590)]},
        {'name': 'lower', 'parent': 'upper', 'z': 4, 'pivot': (3660, 1850), 'reveal': 260,
         'poly': [(3540, 1860), (3600, 1690), (3780, 1550), (3950, 1330), (4060, 1170), (4200, 1000), (4500, 880),
                  (4900, 880), (4900, 1160), (4500, 1190), (4320, 1235), (4200, 1360), (4100, 1530), (3950, 1760),
                  (3850, 1935), (3720, 1985), (3600, 1965)]},
    ]),
    'sunk': ('k3-sunk-2', [
        {'name': 'body', 'parent': None, 'z': 1, 'pivot': (2740, 2759)},
        {'name': 'head', 'parent': 'body', 'z': 2, 'pivot': (3560, 1060), 'reveal': 620,
         'poly': [(2960, 500), (3700, 480), (4700, 500), (4700, 820), (4420, 840), (4330, 1100), (4290, 1470),
                  (4100, 1520), (3900, 1420), (3700, 1320), (3560, 1260), (3460, 1160), (3420, 1010), (3300, 880),
                  (3060, 820), (2960, 660)]},
    ]),
}


def poly_mask(poly, shape, k):
    """An outline rasterised at scale k, antialiased."""
    big = np.zeros((shape[0] * 4, shape[1] * 4), np.uint8)
    pts = (np.array(poly, np.float32) * k * 4).round().astype(np.int32)
    cv2.fillPoly(big, [pts], 255, cv2.LINE_AA)
    return cv2.resize(big, (shape[1], shape[0]), interpolation=cv2.INTER_AREA).astype(np.float32) / 255


def ancestors(defs, name):
    by = {p['name']: p for p in defs}
    out, n = [], by[name]['parent']
    while n:
        out.append(n)
        n = by[n]['parent']
    return out


def build(rig):
    """The rig's pieces: for each, its premultiplied linear colour and alpha (cropped, at WS), the
    crop's origin (work px), and its definition. Cached."""
    drawing, defs = RIGS[rig]
    f = S.CACHE / f'rig-{rig}-{WS:.5f}-v{RIG_V}.npz'
    if f.exists():
        d = np.load(f, allow_pickle=True)
        return [{**p, 'pm': d[f"{p['name']}_pm"].astype(np.float32), 'a': d[f"{p['name']}_a"].astype(np.float32),
                 'o': tuple(d[f"{p['name']}_o"])} for p in defs]
    fg, a = S.cutout(drawing, flip=True)
    fg = cv2.resize(fg, None, fx=WS, fy=WS, interpolation=cv2.INTER_AREA)
    a = np.clip(cv2.resize(a, None, fx=WS, fy=WS, interpolation=cv2.INTER_AREA), 0, 1)
    L = S.grade_fox(fg, S.fox_gains())
    h, w = a.shape
    # who claims each pixel: later outlines over earlier, the base the rest
    own = {}
    taken = np.zeros((h, w), np.float32)
    for p in reversed(defs):
        if 'poly' in p:
            m = poly_mask(p['poly'], (h, w), WS) * (1 - taken)
            own[p['name']] = m
            taken = taken + m
    base = [p['name'] for p in defs if 'poly' not in p][0]
    own[base] = np.clip(1 - taken, 0, 1)
    z = {p['name']: p['z'] for p in defs}
    inside = cv2.dilate((a > 0.5).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    srgb8 = (np.clip(S.srgb(L), 0, 1) * 255).astype(np.uint8)
    YW, XW = np.mgrid[0:h, 0:w].astype(np.float32)
    out, save = [], {}
    for p in defs:
        n = p['name']
        mine = own[n] * a
        core = (mine > 0.5).astype(np.uint8)
        # its paper carried on under the pieces in front of it, only where a move can show it: under
        # a piece that hangs from it, about that piece's pin ('reveal'); under a piece it hangs
        # from, about its own pin, the round end of a card under the card it is pinned to ('lobe')
        dist = cv2.distanceTransform(1 - core, cv2.DIST_L2, 5)
        under = np.zeros((h, w), bool)
        for q in defs:
            m = q['name']
            if z[m] <= z[n]:
                continue
            if n in ancestors(defs, m):
                r, c = q.get('reveal', 0), q['pivot']
            elif m in ancestors(defs, n):
                r, c = p.get('lobe', 0), p['pivot']
            else:
                continue
            if not r:
                continue
            reg = own[m] > 0.5
            if r != 'all':  # and only where it runs on from its own paper, not out into an ear
                reg &= (XW - c[0] * WS) ** 2 + (YW - c[1] * WS) ** 2 < (r * WS) ** 2
                reg &= dist < BAND * WS
            under |= reg
        under &= inside & (core == 0)
        under = cv2.morphologyEx(under.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)) > 0
        if under.any():
            hole = ((core == 0) & (mine < 0.05)).astype(np.uint8) * 255
            painted = cv2.inpaint(srgb8, hole, 7, cv2.INPAINT_TELEA)
            grain = 1 + 0.05 * S.unit_noise((h, w), 3, 7 + len(n))[..., None]
            filled = S.lin(painted.astype(np.float32) / 255) * grain
            col = np.where(under[..., None], filled, L)
            alpha = np.maximum(mine, cv2.GaussianBlur(under.astype(np.float32), (0, 0), 0.6))
        else:
            col, alpha = L, mine
        ys, xs = np.nonzero(alpha > 0.004)
        y0, y1, x0, x1 = max(ys.min() - 4, 0), min(ys.max() + 5, h), max(xs.min() - 4, 0), min(xs.max() + 5, w)
        pm = (col * alpha[..., None])[y0:y1, x0:x1].astype(np.float32)
        al = alpha[y0:y1, x0:x1].astype(np.float32)
        out.append({**p, 'pm': pm, 'a': al, 'o': (x0, y0)})
        save[f'{n}_pm'], save[f'{n}_a'], save[f'{n}_o'] = pm.astype(np.float16), al.astype(np.float16), np.array([x0, y0])
    np.savez_compressed(f, **save)
    return out


def rot(angle, pivot, scale=(1.0, 1.0)):
    """3x3: turn `angle` degrees clockwise on screen about pivot, scaling about it too."""
    c, s = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    sx, sy = scale
    px, py = pivot
    T = np.array([[1, 0, px], [0, 1, py], [0, 0, 1]], np.float64)
    R = np.array([[c * sx, -s * sy, 0], [s * sx, c * sy, 0], [0, 0, 1]], np.float64)
    Ti = np.array([[1, 0, -px], [0, 1, -py], [0, 0, 1]], np.float64)
    return T @ R @ Ti


def place_map(anchor_src, at, lean, pivot=None):
    """3x3 from source px to matte px: the anchor to `at`, turned `lean` clockwise about the anchor
    (as still.place_fox) or about `pivot` (source px)."""
    s = S.SPEC['fox_scale']
    return np.array([[s, 0, at[0] - anchor_src[0] * s], [0, s, at[1] - anchor_src[1] * s], [0, 0, 1]]) @ \
        rot(lean, anchor_src if pivot is None else pivot)


def pose_maps(pieces, pose, root):
    """Each piece's 3x3 from source px to matte px for a pose {piece: angle or (angle, (sx, sy))},
    through its parents."""
    by = {p['name']: p for p in pieces}
    done = {}

    def world(n):
        if n in done:
            return done[n]
        p = by[n]
        v = pose.get(n, 0.0)
        ang, sc = (v, (1.0, 1.0)) if isinstance(v, (int, float)) else v
        local = rot(ang, p['pivot'], sc)
        done[n] = (world(p['parent']) if p['parent'] else root) @ local
        return done[n]
    for p in pieces:
        world(p['name'])
    return done


def render(pieces, maps, shadow=(1.6, 2.4), shade=0.38):
    """The posed puppet into the matte: linear light (unpremultiplied) and alpha, each piece over
    the ones behind it with its small shadow on them."""
    C = np.zeros((S.H, S.W, 3), np.float32)
    A = np.zeros((S.H, S.W), np.float32)
    for p in sorted(pieces, key=lambda q: q['z']):
        x0, y0 = p['o']
        src = np.array([[1 / WS, 0, x0 / WS], [0, 1 / WS, y0 / WS], [0, 0, 1]])
        M = (maps[p['name']] @ src)[:2].astype(np.float32)
        pm = cv2.warpAffine(p['pm'], M, (S.W, S.H), flags=cv2.INTER_CUBIC)
        a = np.clip(cv2.warpAffine(p['a'], M, (S.W, S.H), flags=cv2.INTER_CUBIC), 0, 1)
        if A.any():
            sh = cv2.GaussianBlur(np.roll(np.roll(a, int(round(shadow[1])), 0), int(round(shadow[0])), 1), (0, 0), 1.6)
            C *= (1 - shade * sh * A)[..., None]
        C = C * (1 - a[..., None]) + np.clip(pm, 0, None)
        A = A * (1 - a) + a
    L = C / np.maximum(A[..., None], 1e-4) * (A[..., None] > 1e-3)
    return L, A


def pivots(pieces, maps):
    """Where each pin is in the matte."""
    return {p['name']: tuple(maps[p['name']] @ np.array([*p['pivot'], 1.0]))[:2] for p in pieces}


def check(out):
    out.mkdir(parents=True, exist_ok=True)
    colours = [(230, 80, 60), (60, 160, 230), (240, 200, 40), (120, 210, 90), (200, 90, 220), (240, 140, 40)]
    for rig, (drawing, defs) in RIGS.items():
        pieces = build(rig)
        fg, a = S.cutout(drawing, flip=True)
        sm = cv2.resize(fg * a[..., None] + 0.8 * (1 - a[..., None]), None, fx=0.25, fy=0.25, interpolation=cv2.INTER_AREA)
        view = (sm * 255).astype(np.uint8).copy()
        for i, p in enumerate(defs):
            if 'poly' in p:
                pts = (np.array(p['poly']) * 0.25).round().astype(np.int32)
                cv2.polylines(view, [pts], True, colours[i % len(colours)], 2, cv2.LINE_AA)
            cx, cy = (np.array(p['pivot']) * 0.25).round().astype(int)
            cv2.circle(view, (cx, cy), 7, colours[i % len(colours)], -1, cv2.LINE_AA)
            cv2.putText(view, p['name'], (cx + 9, cy - 9), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2, cv2.LINE_AA)
        Image.fromarray(view).save(out / f'{rig}-outlines.png')
        # the rig at rest and bent at its limits, on grey, each in the matte at his place
        root = place_map(S.SPEC['anchor_src'], (700, 900), 0.0)
        tests = [{}, {'head': -18, 'upper': -25, 'lower': -40, 'tail': 6}, {'head': 16, 'upper': 18, 'lower': 25, 'tail': -6}]
        root = place_map(defs[0]['pivot'], (700, 900), 0.0)
        tiles = []
        for pose in tests:
            L, A = render(pieces, pose_maps(pieces, pose, root))
            img = S.srgb(L) * A[..., None] + 0.55 * (1 - A[..., None])
            tiles.append((np.clip(img[450:1150, 300:1300], 0, 1) * 255).astype(np.uint8))
        Image.fromarray(np.concatenate(tiles, 1)).save(out / f'{rig}-bent.png')
        print(rig, 'pieces', [(p['name'], p['pm'].shape[:2]) for p in pieces], flush=True)


if __name__ == '__main__':
    check(Path(sys.argv[1]))
