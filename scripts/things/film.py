"""How a revision is put on the sheet (docs/things.md): the moves the film is made of, on a
Timeline (timeline.py), each planned on the film's own sheet at the moment it starts.

    draw_pose     a whole pose at once (the sheet as it was before the film's first moment)
    erase_figure  a person taken out, in scrubs, in an order
    redraw        a person drawn again in another pose, lines first (from the hand that moves),
                  then the tone; only where the pose differs, if asked (the rest is left alone);
                  what is only imagined in line alone (docs/reviews/2026-10-things.md, 7)
    take_back     a reaching arm erased from its hand back to the shoulder: the almost withdrawn
    restate       the doorway's casing near a hand drawn again in charcoal: each almost works it

Each returns the time it ends.
"""
import math

import cv2
import numpy as np

import draw
from draw import FIGURE_IDS, H, W

LINES_FIRST = ('construct', 'contour', 'face')


def figure_mask(ref, who, grow=0):
    m = np.isin(ref['ids'], FIGURE_IDS[who]).astype(np.uint8)
    if grow:
        m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * grow + 1, 2 * grow + 1)))
    return m > 0


def delta_mask(a, b, who, grow=15):
    """Where a person differs between two references: the silhouette that moved, and the light that
    changed on what stayed (the technical artist, Proof A2)."""
    ma, mb = figure_mask(a, who), figure_mask(b, who)
    d = (ma ^ mb) | (ma & mb & (np.abs(a['tone'] - b['tone']) > 0.05))
    d = cv2.morphologyEx(d.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    return cv2.dilate(d, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * grow + 1, 2 * grow + 1))) > 0


def arm_mask(ref, who, side, r=26):
    """A reaching arm: its silhouette near the line from shoulder to hand."""
    lm = ref['landmarks'][who]
    pts = [lm[f'upper_arm.{side}'][0:2], lm[f'forearm.{side}'][0:2], lm[f'hand.{side}'][0:2], lm[f'hand.{side}'][3:5]]
    m = np.zeros((H, W), np.uint8)
    cv2.polylines(m, [np.int32(pts)], False, 1, int(2 * r))
    return (m > 0) & figure_mask(ref, who, grow=6)


def _mid(m):
    return np.asarray(m['pts'], np.float32).mean(0)


def _in(m, region):
    p = np.asarray(m['pts'], np.float32)
    x = np.clip(p[:, 0].astype(int), 0, W - 1)
    y = np.clip(p[:, 1].astype(int), 0, H - 1)
    return bool(region[y, x].any())


def draw_pose(tl, ref, prefix, t=0.0):
    marks, _ = draw.scene_marks(ref, prefix)
    tl.at_once(marks, t)
    return t


def erase_figure(tl, ref, who, prefix, t, dur, order='top', region=None, strength=0.88, weight=None, skip=0.18, spare=None):
    """`who` (or `region` of them) erased over `dur` s, the scrubs taken in `order`; `skip` of
    them never made, and `spare` (a mask) left alone: stopped when it is enough."""
    m = figure_mask(ref, who, grow=4) if region is None else region
    if spare is not None:
        m = m & ~spare
    marks = draw.erase_marks(prefix, who, m, width=26, strength=strength, angle=-60, order=order, weight=weight, skip=skip)
    scrubs = [k for k in marks if k['kind'] == 'erase']
    rag = [k for k in marks if k['kind'] != 'erase']
    t = tl.add(scrubs, t, dur, overlap=0.5)
    return tl.add(rag, t - 0.1, 0.5, overlap=0.3)


def redraw(tl, ref, who, prefix, t, lines=2.0, tone=1.6, finish=0.6, region=None, hand=None, line_only=False):
    """`who` drawn in `ref`'s pose, planned on the film's sheet at `t`: the lines (nearest the
    moving `hand` first, if given), then the masses, the rubbing, the lifts. `region`: only marks
    touching it (a partial redraw). `line_only`: the lines alone (what is imagined)."""
    sheet = tl.state_at(t) if not line_only else None
    marks, _ = draw.scene_marks(ref, prefix, sheet, parts=(who,), line_only=(who,) if line_only else ())
    if region is not None:
        marks = [m for m in marks if _in(m, region)]
    first = [m for m in marks if m['layer'] in LINES_FIRST]
    if hand is not None:
        h = np.asarray(hand, np.float32)
        first.sort(key=lambda m: float(np.linalg.norm(_mid(m) - h)))
    masses = [m for m in marks if m['layer'].startswith('mass')]
    rest = [m for m in marks if m['layer'] in ('smudge', 'lift')]
    t = tl.add(first, t, lines, overlap=0.6)
    t = tl.add(masses, t - 0.2, tone, overlap=0.85)
    return tl.add(rest, t, finish, overlap=0.6)


def take_back(tl, ref, who, side, prefix, t, dur=2.4, strength=1.0, region=None):
    """The reaching arm (or `region`) erased from its hand back toward the shoulder."""
    hand = ref['landmarks'][who][f'hand.{side}'][3:5]
    region = arm_mask(ref, who, side) if region is None else region
    return erase_figure(tl, ref, who, prefix, t, dur, order=tuple(hand), region=region, strength=strength, skip=0.05)


def restate(tl, ref, prefix, t, near, dur=1.2, r=110.0):
    """The doorway's casing near `near` drawn again, a little off, in charcoal."""
    return tl.add(draw.casing_marks(ref, prefix, near, r), t, dur, overlap=0.3)


def casing_near(ref, near, r=60.0):
    """The casing's own region near a point (an erasure may take it with the hand)."""
    yy, xx = np.mgrid[0:H, 0:W]
    return np.isin(ref['ids'], [2]) & ((xx - near[0]) ** 2 + (yy - near[1]) ** 2 < r * r)


def hand_of(ref, who, side):
    return ref['landmarks'][who][f'hand.{side}'][3:5]


def step(tl, a, b, t, people=('young', 'older'), door=False, prefix='step', dur=0.3, whole=('young',)):
    """What happened, moving: from drawing `a` to drawing `b` at `t`, each part that changed
    scrubbed out where it was and drawn, in tone, where it is (a Kentridge step: the residue of the
    last position stays under the next). A person in `whole` (one walking) is taken out and drawn
    again entire, at full weight (redrawn only where he changed, he lost his tone a step at a
    time: the cinematic director); the others only where they changed."""
    end = t
    for who in people:
        if not figure_mask(a, who).any() and not figure_mask(b, who).any():
            continue
        region = delta_mask(a, b, who, grow=10)
        if not region.any():
            continue
        out = figure_mask(a, who, grow=6) if who in whole else region & figure_mask(a, who, grow=6)
        er = draw.erase_marks(f'{prefix}/{who}/out', who, out, width=24, strength=0.9, order='top', skip=0.08, rag=False)
        end = max(end, tl.add(er, t, dur * 0.6, overlap=0.7))
        if figure_mask(b, who).any():
            marks, _ = draw.scene_marks(b, f'{prefix}/{who}', None, parts=(who,))
            if who not in whole:
                marks = [m for m in marks if _in(m, region)]
            end = max(end, tl.add(marks, t + dur * 0.4, dur * 0.6, overlap=0.95))
    if door:
        da, db = a['ids'] == 7, b['ids'] == 7
        region = cv2.dilate((da ^ db).astype(np.uint8), np.ones((15, 15), np.uint8)) > 0
        er = draw.erase_marks(f'{prefix}/door/out', 'door', region & cv2.dilate(da.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool),
                              width=26, strength=0.9, order='x-', skip=0.05, rag=False)
        end = max(end, tl.add(er, t, dur * 0.6, overlap=0.7))
        marks, _ = draw.scene_marks(b, f'{prefix}/door', None, parts=('door',))
        end = max(end, tl.add(marks, t + dur * 0.4, dur * 0.6, overlap=0.95))
    return end


def draw_on(tl, ref, prefix, t, dur):
    """A whole drawing made in front of us: the doorway's construction in hard pencil, the masses,
    the rubbing and lifts, then the lines."""
    marks, _ = draw.scene_marks(ref, prefix)
    construct = [m for m in marks if m['layer'] == 'construct']
    masses = [m for m in marks if m['layer'].startswith('mass')]
    rest = [m for m in marks if m['layer'] in ('smudge', 'lift')]
    lines = [m for m in marks if m['layer'] in ('contour', 'face')]
    # (a real person is never line alone on the sheet: line is what is imagined. The masses go
    # on in passes a hand can be seen making, the lines are found last: the creative director)
    t1 = tl.add(construct, t, dur * 0.2, overlap=0.5)
    t2 = tl.add(masses, t1, dur * 0.5, overlap=0.85)
    t3 = tl.add(rest, t2, dur * 0.1, overlap=0.6)
    return tl.add(lines, t3, dur * 0.2, overlap=0.7)


def heads(refs, grow=1.3):
    """The heads of everyone drawn in `refs` [(ref, who)]: circles round each (a ghost stops being
    a person when its head is gone: the creative director)."""
    m = np.zeros((H, W), np.uint8)
    for ref, who in refs:
        x0, y0, _, x1, y1, _ = ref['landmarks'][who]['head']
        r = int(grow * 0.75 * math.hypot(x1 - x0, y1 - y0) + 8)
        cv2.circle(m, (int((x0 + x1) / 2), int((y0 + y1) / 2)), r, 1, -1)
    return m > 0
