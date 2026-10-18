"""
The two-shot (docs/reviews/2026-10-woodland.md): the two of them close, from the artist's own
character sheet, with her look in the artist's own drawing of it. Offline.

    python3 scripts/two-shot.py

From references/woodland/upscaled/*-top@2x.webp (scripts/upscale.py) when they are there, at twice
the sheet's size (the artist's choice, 2026-10-18: crisper on large screens); else from the sheet
itself. Writes public/memories/woodland/afternoon/:

    near         an atlas: the body (her forearm's place filled with the grass beside it), then her
                 forearm (rows of the sheet's top panel, as far right as the camera ever looks),
                 keyed off the paper; their bed of grass graded toward the painting's grass where
                 they lie, and going out of focus away from them as the ground round it does
    near-lids    their lids shut and half, drawn at this size over each eye's opening, then her
                 sleeve (rows, cut to the box round their eyes and her sleeve)
    near-heads   her head turned to him as the artist redrew it (references/woodland/drawings/
                 b-look-full-b.webp: her mouth at rest), and the soft region it is laid in by
    near-ground  the meadow round and beyond them: the day painting's own grass where they lie,
                 out of focus by its distance from the camera
    near-maps    where their bed's grass moves in the air (R: none on them nor within 6 sheet px, less
                 where it is out of focus), at half the sheet's size
    heads        her head turned to him at the wide's size (its people: scripts/cut-woodland.py), so
                 her look is drawn in either shot

and `living.afternoon.near` and `living.afternoon.figures.heads` in the manifest. The wide's puppet
is this panel too (cut at 0.8), so the same deformers move both, and both are lit by the painting's
light where they lie: a cut between them keeps their breath and their light.
"""
import importlib.util
import json
import math
import os

import cv2
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
_spec = importlib.util.spec_from_file_location('cut', os.path.join(ROOT, 'scripts', 'cut-woodland.py'))
cut = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cut)

OUT = os.path.join(ROOT, 'public', 'memories', 'woodland')
MANIFEST = os.path.join(OUT, 'manifest.json')
PANEL = cut.FIG_CROP  # (0, 0, 1448, 505): sheet px
PW, PH = PANEL[2] - PANEL[0], PANEL[3] - PANEL[1]
# How much of their bed of grass is theirs: all of it this near their bodies (sheet px), none past this.
BED = (40.0, 125.0)
# The ground's margin round the panel (sheet px): the camera never sees past it.
MARGIN = 140
# How far right the camera ever looks (sheet px): the atlas stops here (her legs are never in it).
REACH = 1000
# Where their lids and her sleeve are (sheet px: x0, y0, x1, y1): the lids' atlas is cut to it.
LID_BOX = (180, 40, 640, 270)
# Her head as the artist redrew it, turned to him, her mouth at rest (the takes that smile are
# not used: a smile nobody sees is the film telling, and redrawn whole they jump her head again:
# the directors' and the technical artist's reviews, 2026-10-18).
TAKE = 'b'
# Her head halfway there, her eyes already on him (the artist's, when it is drawn: the kit's
# `b-look-full-mid.png`): laid between the panel's and the take on the way to him. Without it the
# turn is the straight cut, never a warp (the directors' evaluations of the film, 2026-10-18).
MID = 'mid'
# Their eyes (sheet px, y down; measured on the panel at twice its size): the opening below the
# lash line (centre, radii, angle: positive turns its outer end down), and the iris in it (centre,
# radius). A look moves the iris along the opening, the white filling in where it was; the lash
# line, outside the opening, stays as drawn.
EYES_A = [((211.0, 89.3, 10.3, 3.6, -0.40), (212.5, 87.2, 4.1)), ((254.0, 82.2, 6.6, 3.5, 0.23), (252.8, 81.9, 3.5))]
# (Hers reach down to her lower lids: her irises are large, and an opening cut above their lower
# rims left a dark arc of the old iris behind when her eyes moved.)
EYES_B = [((501.0, 69.8, 9.9, 4.7, -0.42), (502.9, 67.6, 5.4)), ((539.0, 59.6, 7.3, 3.9, 0.29), (538.5, 58.7, 5.0))]
# Round both their faces and the grass between them (sheet px, y down: centre, radii): their bed's
# grass moves half as much there.
FACES = (370, 100, 240, 105)
# How far their bed's grass takes the colour of the painting's grass where they lie (0..1).
GRADE = 0.7
# The painting's grass where they lie (plate px: x0, y0, x1, y1): the bed's colour, and the ground.
MEADOW = (330, 462, 1290, 773)
UPSCALED = os.path.join(cut.REF, 'upscaled')


def source(name, path, up=True):
    """The sheet's top panel (or a take's, on the sheet's grid), and its scale: twice the sheet's if
    it was upscaled (and `up`)."""
    big = os.path.join(UPSCALED, f'{name}-top@2x.webp')
    if up and os.path.exists(big):
        return cut.arr(Image.open(big).convert('RGB')), 2
    im = Image.open(path).convert('RGB')
    if im.size != (1448, 1086):
        im = im.resize((1448, 1086), Image.LANCZOS)
    return cut.arr(im)[:520], 1


def register(top, t, k):
    """A take moved onto the panel (its pixels where the panel's are: phase correlation over her
    head's surroundings), and the move (px at this size)."""
    h, w = top.shape[:2]
    x0, y0, x1, y1 = 300 * k, 0, 700 * k, 330 * k

    def grey(i):
        return cv2.cvtColor((np.clip(i[y0:y1, x0:x1], 0, 1) * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32)
    win = cv2.createHanningWindow((x1 - x0, y1 - y0), cv2.CV_32F)
    (dx, dy), _ = cv2.phaseCorrelate(grey(top), grey(t[:h, :w]), win)
    moved = cv2.warpAffine(t[:h, :w], np.float32([[1, 0, -dx], [0, 1, -dy]]), (w, h), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)
    return moved, (dx, dy)


def scaled(poly, k):
    return [(x * k, y * k) for x, y in poly]


def keyed(top, k):
    """Straight colour and alpha of the panel (at `k` times the sheet's size): its paper keyed out
    (the cutter's key), their bed of grass faded with distance from their bodies, choked a pixel and
    unmixed from the paper; specks of it lying apart from the rest gone; the key undone inside them
    (`cut.unkeyed`)."""
    h, w = top.shape[:2]
    d = np.sqrt(((top - cut.IVORY) ** 2).sum(-1))
    key = cut.unkeyed(top, cut.smooth(0.035, 0.12, d), k)
    body = cut.poly_mask((w, h), [scaled(cut.BODY, k)]) > 0.5
    dist = cv2.distanceTransform((~body).astype(np.uint8), cv2.DIST_L2, 5)
    keep = 1 - cut.smooth(BED[0] * k, BED[1] * k, dist)
    # (Nothing from the sheet's other panels: inside the generous outline, grown by the bed.)
    outline = cut.poly_mask((w, h), [scaled(cut.FIG_POLY, k)]) > 0.5
    reach = cv2.distanceTransform((~outline).astype(np.uint8), cv2.DIST_L2, 5)
    keep *= 1 - cut.smooth(BED[1] * k * 0.6, BED[1] * k, reach)
    a = key * keep
    a = np.asarray(cut.img(a).filter(ImageFilter.MinFilter(3 if k == 1 else 5)), np.float32) / 255
    a = cut.blur(a, 0.6 * k)
    # (Specks: 42 of them floated over the ground, under 40 sheet px each: the technical artist's review.)
    m = (a > 0.15).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    small = np.zeros(n, bool)
    small[1:] = st[1:, cv2.CC_STAT_AREA] < 40 * k * k
    gone = cv2.dilate(small[lab].astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    a = np.where(gone, 0, a)
    safe = np.maximum(a, 0.04)[..., None]
    straight = np.clip((top - (1 - safe) * cut.IVORY) / safe, 0, 1)
    straight = np.where(a[..., None] > 0.04, straight, top)
    return straight, a


def premul(rgb, a):
    return np.dstack([rgb * a[..., None], a])


def body_distance(w, h, k, ox=0.0, oy=0.0):
    """Each pixel's distance from their bodies (sheet px), over `w`×`h` px at `k` px a sheet px
    whose corner is at sheet (ox, oy)."""
    body = np.zeros((h, w), np.uint8)
    cv2.fillPoly(body, [np.array([[(x - ox) * k, (y - oy) * k] for x, y in cut.BODY], np.int32)], 1)
    return cv2.distanceTransform(1 - body, cv2.DIST_L2, 5) / k


def defocus(d, y):
    """How far out of focus a point is (a Gaussian's σ, sheet px) at `d` sheet px from their bodies
    and `y` down the panel: none on them, their bed sharp beside them, softer away from them, and
    softest beyond their heads (the top of the frame is the furthest from the camera, which looks
    down at them from their side: the cinematic director's review, 2026-10-18)."""
    return cut.smooth(12, 70, d) * (2.0 + 9.0 * cut.smooth(160, -140, y)) + 2.0 * cut.smooth(70, 200, d)


LEVELS = (0.0, 1.0, 2.0, 3.5, 5.5, 8.0, 11.5)


def blur_by(im, sigma, k):
    """`im` (H×W×C, premultiplied if it has alpha) out of focus by `sigma` (sheet px, each pixel; at
    `k` px a sheet px): between Gaussian blurs at a few levels."""
    s = np.clip(sigma, 0, LEVELS[-1])
    cache = {}

    def at(level):
        if level not in cache:
            cache[level] = cut.blur(im, level * k) if level > 0 else im
        return cache[level]
    out = im.copy()
    for lo, hi in zip(LEVELS[:-1], LEVELS[1:]):
        sel = (s > lo) & (s <= hi)
        if not sel.any():
            continue
        t = ((s - lo) / (hi - lo))[..., None]
        out = np.where(sel[..., None], at(lo) * (1 - t) + at(hi) * t, out)
    return out


def graded(straight, a, d, meadow):
    """Their bed's grass toward the painting's grass where they lie (its mean and spread, in Lab),
    more of it away from their bodies; their own colours stay. (The panel's grass is lighter and
    yellower, paper between its blades: a cut in on it read as a cut to the character sheet: the
    cinematic director's review, 2026-10-18.)"""
    lab = cv2.cvtColor(straight.astype(np.float32), cv2.COLOR_RGB2LAB)
    ref = cv2.cvtColor(meadow.astype(np.float32), cv2.COLOR_RGB2LAB).reshape(-1, 3)
    bed = (a > 0.5) & (d > 8)
    src = lab[bed]
    moved = (lab - src.mean(0)) * (ref.std(0) / np.maximum(src.std(0), 1e-3)) + ref.mean(0)
    t = (GRADE * cut.smooth(4, 30, d))[..., None]
    return np.clip(cv2.cvtColor((lab * (1 - t) + moved * t).astype(np.float32), cv2.COLOR_LAB2RGB), 0, 1)


def dressed(top, k, day, d, sigma, light):
    """A panel (the sheet's or a take's, at `k` times the sheet's size) as the two-shot shows it:
    keyed, its bed graded, lit as the wide lights them, its forearm apart (body with the forearm's
    place filled, the forearm, her sleeve), out of focus away from them. Premultiplied rows."""
    straight, a = keyed(top, k)
    x0, y0, x1, y1 = MEADOW
    straight = graded(straight, a, d, day[y0:y1, x0:x1])
    # (Her forearm, skin and shirt found as the cutter finds them, before the light.)
    arm = limb(straight, a, k)
    hole = cut.blur((arm > 0.05).astype(np.float32), 1.0 * k) > 0.05
    r_, g_, b_ = straight[..., 0], straight[..., 1], straight[..., 2]
    lum = 0.3 * r_ + 0.59 * g_ + 0.11 * b_
    skin = (r_ - b_ > 0.15) & (r_ > g_ + 0.03) & (lum > 0.4)
    cream = (lum > 0.62) & (r_ - b_ < 0.14)
    straight = straight * light[..., None]
    body_rgb, body_a = cut.reflect_fill(straight, a, hole, (a > 0.6) & ~skin & ~cream)
    body_rgb = cut.blur(body_rgb, 0.4 * k) * hole[..., None] + body_rgb * (1 - hole[..., None])
    sx0, sy0, sx1, sy1 = (v * k for v in cut.SLEEVE_BOX)
    sleeve = np.zeros(a.shape, np.float32)
    sleeve[sy0:sy1, sx0:sx1] = (cream & ~(arm > 0.5))[sy0:sy1, sx0:sx1]
    sleeve = np.clip(cut.blur(sleeve, 1.0 * k) * 1.4, 0, 1)
    body = blur_by(premul(body_rgb, body_a), sigma, k)
    return body, premul(straight, a * arm), sleeve, straight


def limb(straight, a, k):
    """Her forearm and hand (soft), as the cutter's `limb_mask` finds it, at `k` times its size."""
    h, w = a.shape
    r, g, b = straight[..., 0], straight[..., 1], straight[..., 2]
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    skin = (r - b > 0.17) & (r > g + 0.07) & (lum > 0.42) & (lum < 0.9) & (g - b > 0.05)
    poly = cut.poly_mask((w, h), [scaled(cut.LIMB_B, k)]) > 0.5
    m = (skin & poly).astype(np.uint8)
    n = 5 * k
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((n, n), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((n, n), np.uint8)) * poly
    count, lab, stats, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), connectivity=4)
    if count > 1:
        m = (lab == 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))).astype(np.float32)
    return np.clip(cut.blur(m.astype(np.float32), 0.7 * k) * 1.15, 0, 1) * (a > 0.2)


def local(w, h, k, eye, ox=0.0, oy=0.0):
    """Pixels' place in an eye's opening (sheet px along its axis and across it, down positive),
    over `w`×`h` px at `k` px a sheet px whose corner is at sheet (ox, oy)."""
    cx, cy, rx, ry, ang = eye
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    x, y = (x + 0.5) / k + ox - cx, (y + 0.5) / k + oy - cy
    c, s = math.cos(ang), math.sin(ang)
    return x * c + y * s, -x * s + y * c


def lids_drawn(straight, k):
    """Their lids at the panel's size (`k` px a sheet px), over each eye's opening and its lash
    line, no further (the brow and cheek stay as drawn): shut (the lid's skin, from the skin above
    the eye down to the cheek's, and the closed lash a curve along the lower lid), and half (the lid
    down to the middle of the eye, its lash line along its edge). Premultiplied RGBA."""
    h, w = straight.shape[:2]
    lum = (straight * [0.3, 0.59, 0.11]).sum(-1)
    outs = []
    for half in (False, True):
        out = straight.copy()
        cover_all = np.zeros((h, w), np.float32)
        for eye, _ in EYES_A + EYES_B:
            cx, cy, rx, ry, ang = eye
            x0, y0 = int((cx - rx - 8) * k), int((cy - ry - 8) * k)
            x1, y1 = int((cx + rx + 8) * k), int((cy + ry + 8) * k)
            u, v = local(x1 - x0, y1 - y0, k, eye, x0 / k, y0 / k)
            reg = (slice(y0, y1), slice(x0, x1))
            st, lm = straight[reg], lum[reg]
            # The skin just above the lash line and just below the opening (no lines: light pixels).
            above = (np.abs(u) < rx * 0.6) & (v < -ry - 2.5) & (v > -ry - 4.5) & (lm > 0.45)
            below = (np.abs(u) < rx * 0.6) & (v > ry + 1.5) & (v < ry + 4.0) & (lm > 0.45)
            top_c = np.median(st[above], 0) if above.sum() > 3 else np.median(st[below], 0) * 0.92
            bot_c = np.median(st[below], 0)
            lash_px = (np.abs(u) < rx * 0.8) & (v < -ry * 0.6) & (v > -ry - 2.5) & (lm < 0.3)
            lash_c = np.median(st[lash_px], 0) if lash_px.sum() > 3 else np.array([0.2, 0.13, 0.1])
            # The lid: the opening grown over its lash line above (1.8 px), barely below.
            q = np.sqrt((u / (rx + 1.6)) ** 2 + ((v + 0.7) / (ry + np.where(v < 0, 2.2, 1.2))) ** 2)
            cover = 1 - cut.smooth(1 - 0.8 / (ry + 2), 1.0, q)
            t = cut.smooth(-ry - 2, ry + 1, v)[..., None]
            lid = (top_c * (1 - t) + bot_c * t) * 0.97
            if half:
                # Down to just above the middle, its edge a curve bowing down.
                edge = ry * (0.12 * np.sqrt(np.clip(1 - (u / rx) ** 2, 0, 1)) - 0.18)
                cover = cover * (1 - cut.smooth(edge - 0.5, edge + 0.5, v))
                line = np.abs(v - (edge - 0.45)) - 0.85 * (1 - 0.5 * (u / rx) ** 2)
            else:
                curve = ry * 0.55 * np.sqrt(np.clip(1 - (u / rx) ** 2, 0, 1))
                line = np.abs(v - curve) - 0.7 * (1 - 0.6 * (u / rx) ** 2)
            ink = (1 - cut.smooth(-0.45, 0.45, line)) * (np.abs(u) < rx * 1.02) * cover
            col = lid * (1 - ink[..., None]) + lash_c * ink[..., None]
            out[reg] = out[reg] * (1 - cover[..., None]) + col * cover[..., None]
            cover_all[reg] = np.maximum(cover_all[reg], cover)
        outs.append(np.clip(premul(out, cover_all), 0, 1))
    return outs[0], outs[1]


def whites(straight, k):
    """Each eye's white (the median of the light inside its opening, round its iris)."""
    h, w = straight.shape[:2]
    lum = (straight * [0.3, 0.59, 0.11]).sum(-1)
    out = []
    for eye, iris in EYES_A + EYES_B:
        cx, cy, rx, ry, ang = eye
        u, v = local(w, h, k, eye)
        x, y = np.mgrid[0:h, 0:w][1].astype(np.float32), np.mgrid[0:h, 0:w][0].astype(np.float32)
        far = np.hypot((x + 0.5) / k - iris[0], (y + 0.5) / k - iris[1]) > iris[2] + 0.8
        inside = (np.hypot(u / rx, v / ry) < 0.85) & far
        px = straight[inside]
        lit = px[lum[inside] >= np.percentile(lum[inside], 50)] if inside.sum() > 8 else np.array([[0.93, 0.88, 0.82]])
        out.append([round(float(c), 4) for c in np.clip(np.median(lit, 0), 0, 1)])
    # An eye drawn with no white showing (the far eye, foreshortened, its iris filling the opening)
    # gives skin, and its look reads as the eye narrowing: it takes its partner's (a white is
    # cooler than skin: warmer than the partner's by more than 0.08 in red over blue).
    for a, b in ((0, 1), (2, 3)):
        warm = [out[i][0] - out[i][2] for i in (a, b)]
        if warm[1] - warm[0] > 0.08:
            out[b] = list(out[a])
        elif warm[0] - warm[1] > 0.08:
            out[a] = list(out[b])
    return out


def head_region(top1, take1):
    """Where her head as redrawn differs from the panel (sheet px, soft): the changed pixels round
    her head (its face, the hair it moved), closed, filled, grown 6 px and feathered 2 px, so its
    edge lies where the two drawings agree (never across a strand that moved)."""
    h, w = top1.shape[:2]
    d = np.abs(cv2.GaussianBlur(take1, (0, 0), 1.5) - cv2.GaussianBlur(top1, (0, 0), 1.5)).max(-1)
    yy, xx = np.mgrid[0:h, 0:w]
    core = ((d > 0.07) & (xx > 360) & (xx < 690) & (yy < 270)).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(core, connectivity=8)
    keep = np.isin(lab, [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] >= 25]).astype(np.uint8)
    ell = lambda n_: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (n_, n_))
    m = cv2.morphologyEx(keep, cv2.MORPH_CLOSE, ell(21))
    outside = m.copy()
    cv2.floodFill(outside, np.zeros((h + 2, w + 2), np.uint8), (0, h - 1), 1)
    m = m | (1 - outside)
    # (Her head only: the largest piece.)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    m = (lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
    hard = cv2.dilate(m, ell(13))
    soft = cv2.GaussianBlur(hard.astype(np.float32), (0, 0), 2.0)
    band = (soft > 0.02) & (soft < 0.98)
    return soft, float(np.percentile(d[band], 99))


def boxed(region, step=5):
    """The region's box (sheet px: x, y, w, h), on a grid of `step` (so the wide's 0.8 is whole px)."""
    x, y, w, h = cv2.boundingRect((region > 0.004).astype(np.uint8))
    x0, y0 = (x // step) * step, (y // step) * step
    x1, y1 = -(-(x + w) // step) * step, -(-(y + h) // step) * step
    return x0, y0, x1 - x0, y1 - y0


def sway_map(top1, k=0.5):
    """Where their bed's grass moves in the air (0..1, over the atlas's reach at `k` px a sheet px):
    none on them (their own pixels, not the coarse outline: the grass between them, round their
    hands, is the most seen in the shot) nor within 6 sheet px of them, all of it from 22 away;
    less where it is out of focus (motion belongs to the near, sharp grass: the technical artist's
    review). The heart was nearly still without it: the skeptic's review, 2026-10-18."""
    body = cut.figures_alone(top1, cut.smooth(0.035, 0.12, np.sqrt(((top1 - cut.IVORY) ** 2).sum(-1))))
    d = cv2.distanceTransform(1 - body, cv2.DIST_L2, 5)
    y, x = (a.astype(np.float32) for a in np.mgrid[0:PH, 0:PW])
    sw = cut.smooth(6, 22, d) * (1 - 0.5 * cut.smooth(2, 9, defocus(body_distance(PW, PH, 1), y)))
    # Half as much round both faces and the grass between them, which both looks cross (it was the
    # busiest place in the frame: the cinematic director's evaluation of the film, 2026-10-18); the
    # foreground and the grass beyond her carry it.
    cx, cy, rx, ry = FACES
    r = np.hypot((x - cx) / rx, (y - cy) / ry)
    sw *= 1 - 0.5 * (1 - cut.smooth(0.6, 1.0, r))
    return cv2.resize(sw[:, :REACH], (round(REACH * k), round(PH * k)), interpolation=cv2.INTER_AREA)


def ground(day):
    """The meadow round and beyond them, at the stage's size (sheet px, the margin round the panel):
    the day painting's own grass where they lie, a little taller than it is wide there (the painting
    sees it at a slant; the camera here looks down), out of focus by its distance from the camera."""
    gw, gh = PW + 2 * MARGIN, PH + 2 * MARGIN
    x0, y0, x1, y1 = MEADOW
    g = cv2.resize(day[y0:y1, x0:x1], (gw, gh), interpolation=cv2.INTER_CUBIC)
    d = body_distance(gw, gh, 1, -MARGIN, -MARGIN)
    y = np.mgrid[0:gh, 0:gw][0].astype(np.float32) - MARGIN
    return np.clip(blur_by(g, defocus(d, y), 1), 0, 1)


def drawing(name):
    """One of her redrawn heads as delivered (`b-look-full-<name>`, WebP or PNG), or None."""
    for ext in ('webp', 'png'):
        p = os.path.join(cut.REF, 'drawings', f'b-look-full-{name}.{ext}')
        if os.path.exists(p):
            return p
    return None


def main():
    top, k = source('02-characters', os.path.join(cut.REF, '02-characters.webp'))
    top = top[PANEL[1] * k:PANEL[3] * k, PANEL[0] * k:PANEL[2] * k]
    h, w = top.shape[:2]
    day = cut.arr(cut.load('04-day.webp'))
    d = body_distance(w, h, k)
    sigma = defocus(d, np.mgrid[0:h, 0:w][0].astype(np.float32) / k)
    light = cut.light_match(cut.load('04-day.webp'), w, h)
    body, arm, sleeve, straight = dressed(top, k, day, d, sigma, light)

    a_dir = os.path.join(OUT, 'afternoon')
    # (The phone's set at the sheet's own size: half of an upscaled one.)
    sizes = {'': cut.W, '@low': cut.W // k if k > 1 else round(cut.W * 0.766)}
    rw = REACH * k
    cut.save(cut.stack([body[:, :rw], arm[:, :rw]]), os.path.join(a_dir, 'near.webp'), sizes, q=93)
    shut, half = lids_drawn(straight, k)
    occ = np.dstack([sleeve, sleeve, sleeve, sleeve])
    lx0, ly0, lx1, ly1 = (v * k for v in LID_BOX)
    cut.save(cut.stack([r[ly0:ly1, lx0:lx1] for r in (shut, half, occ)]), os.path.join(a_dir, 'near-lids.webp'), sizes, q=93)

    # Her head turned to him (the take, then halfway there if it is drawn): where each differs, at
    # the sheet's own size (from the sheet and the take as drawn), one region round them all (its
    # edge where every drawing agrees with the panel), then each laid in at either size by it.
    sheet1, _ = source('02-characters', os.path.join(cut.REF, '02-characters.webp'), up=False)
    takes = [TAKE] + [MID] * (drawing(MID) is not None)
    regions, moves, seams = [], [], []
    for name in takes:
        take1, _ = source(f'b-look-full-{name}', drawing(name), up=False)
        take1, move1 = register(sheet1, take1, 1)
        region1, seam = head_region(sheet1[:PH], take1[:PH])
        regions.append(region1), moves.append(move1), seams.append(seam)
    region1, seam = np.maximum.reduce(regions), max(seams)
    bx, by, bw, bh = boxed(region1)
    reg_k = cv2.resize(region1, (w, h), interpolation=cv2.INTER_LINEAR)
    box_k = (slice(by * k, (by + bh) * k), slice(bx * k, (bx + bw) * k))
    rk = reg_k[box_k]
    cels = []
    for name in takes:
        takek, kk = source(f'b-look-full-{name}', drawing(name))
        if kk != k:
            takek = cv2.resize(takek, (takek.shape[1] * k // kk, takek.shape[0] * k // kk), interpolation=cv2.INTER_LANCZOS4)
        takek, _ = register(top, takek, k)
        cel, _, _, _ = dressed(takek[:h, :w], k, day, d, sigma, light)
        cels.append(cel[box_k])
    cut.save(np.concatenate(cels + [np.dstack([rk, rk, rk, np.ones_like(rk)])], 1), os.path.join(a_dir, 'near-heads.webp'), sizes, q=94)

    # The same at the wide's size: the cutter's own people from each take (only her head differs).
    t = cut.FIG_T
    wides = []
    for name, move1 in zip(takes, moves):
        full1 = cut.arr(Image.open(drawing(name)).convert('RGB').resize((1448, 1086), Image.LANCZOS))
        full1 = cv2.warpAffine(full1, np.float32([[1, 0, -move1[0]], [0, 1, -move1[1]]]), (1448, 1086), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)
        wide, _, _, _, _ = cut.figures(cut.img(full1), cut.load('04-day.webp'))
        th, tw = wide.shape[:2]
        box_t = (slice(round(by * t), round((by + bh) * t)), slice(round(bx * t), round((bx + bw) * t)))
        wides.append(wide[box_t])
    reg_t = cv2.resize(region1, (tw, th), interpolation=cv2.INTER_AREA)
    rt = reg_t[box_t]
    cut.save(np.concatenate(wides + [np.dstack([rt, rt, rt, np.ones_like(rt)])], 1), os.path.join(a_dir, 'heads.webp'), cut.LIVE, q=94)

    sw = sway_map(sheet1[:PH])
    cut.save(np.dstack([sw, sw, sw]), os.path.join(a_dir, 'near-maps.webp'), {'': cut.W}, lossless=True)

    # (Out of focus: stored at half its size; it has nothing finer.)
    g = ground(day)
    gw, gh = g.shape[1], g.shape[0]
    cut.save(g, os.path.join(a_dir, 'near-ground.webp'), {'': cut.W // 2}, q=90)

    eye = lambda e, white: [*e[0], *e[1], *white]
    wh = whites(straight, k)
    with open(MANIFEST) as f:
        manifest = json.load(f)
    aft = manifest['living']['afternoon']
    aft['near'] = {
        'file': 'afternoon/near', 'lids': 'afternoon/near-lids',
        # (Its rows' pixels as stored for the larger screens, and how far across the panel they
        # reach (sheet px); the lids' rows are the box round their eyes and her sleeve (sheet px,
        # y down: x0, y0, w, h). Places below are in the sheet's own pixels.)
        'pixels': [rw, h], 'gutter': cut.GUTTER, 'reach': REACH,
        'lidBox': [LID_BOX[0], LID_BOX[1], LID_BOX[2] - LID_BOX[0], LID_BOX[3] - LID_BOX[1]],
        # Her head turned to him: where its cells lie on the panel (sheet px, y down), and the
        # atlas's cells (the drawings, `figure:b.cel` 1 onward: the take, then halfway there if it
        # is drawn; then the region they are laid in by).
        'heads': {'file': 'afternoon/near-heads', 'box': [bx, by, bw, bh], 'takes': takes, 'cells': len(takes) + 1},
        # The ground under and round them (sheet px, y down: x0, y0, w, h), and where their bed's
        # grass moves (over the atlas's reach).
        'ground': {'file': 'afternoon/near-ground', 'box': [-MARGIN, -MARGIN, gw, gh]},
        'maps': 'afternoon/near-maps',
        # Their eyes (sheet px, y down): the opening (centre, radii, angle), the iris (centre,
        # radius), the white (rgb); his, then hers.
        'eyes': {'a': [eye(e, c) for e, c in zip(EYES_A, wh[:2])], 'b': [eye(e, c) for e, c in zip(EYES_B, wh[2:])]},
    }
    # Her head turned to him in the wide (the same box and cells, at the wide's size).
    aft['figures']['heads'] = {'file': 'afternoon/heads', 'box': [bx, by, bw, bh], 'cells': len(takes) + 1}
    with open(MANIFEST, 'w') as f:
        json.dump(manifest, f, indent=2)
        f.write('\n')
    print(f'two-shot: panel {rw}x{h} ({k}x the sheet, to x {REACH}); her head {bw}x{bh} at ({bx}, {by}) sheet px, '
          f'takes {takes} moved {[(round(float(m[0]), 2), round(float(m[1]), 2)) for m in moves]} px, seam p99 {seam:.3f}; ground {gw}x{gh}; whites {wh}')


if __name__ == '__main__':
    main()
