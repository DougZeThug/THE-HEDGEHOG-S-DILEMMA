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


def delta_mask(a, b, who, grow=15, tone=True):
    """Where a person differs between two references: the silhouette that moved, and (`tone`) the
    light that changed on what stayed (the technical artist, Proof A2; not for what is only drawn in
    line, where it pulled a whole lit body into a moving arm)."""
    ma, mb = figure_mask(a, who), figure_mask(b, who)
    d = (ma ^ mb) | (ma & mb & (np.abs(a['tone'] - b['tone']) > 0.05)) if tone else (ma ^ mb)
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


def erase_figure(tl, ref, who, prefix, t, dur, order='top', region=None, strength=0.88, weight=None, skip=0.18, spare=None, rag=True):
    """`who` (or `region` of them) erased over `dur` s, the scrubs taken in `order`; `skip` of
    them never made, and `spare` (a mask) left alone: stopped when it is enough."""
    m = figure_mask(ref, who, grow=4) if region is None else region
    if spare is not None:
        m = m & ~spare
    marks = draw.erase_marks(prefix, who, m, width=26, strength=strength, angle=-60, order=order, weight=weight, skip=skip, rag=rag)
    scrubs = [k for k in marks if k['kind'] == 'erase']
    rag = [k for k in marks if k['kind'] != 'erase']
    t = tl.add(scrubs, t, dur, overlap=0.5)
    return tl.add(rag, t - 0.1, 0.5, overlap=0.3)


def redraw(tl, ref, who, prefix, t, lines=2.0, tone=1.6, finish=0.6, region=None, hand=None, line_only=False, nearest=1.0):
    """`who` drawn in `ref`'s pose, planned on the film's sheet at `t`: the lines (nearest the
    moving `hand` first, if given), then the masses, the rubbing, the lifts. `region`: only marks
    touching it (a partial redraw). `line_only`: the lines alone (what is imagined). `nearest`: only
    that share of the lines nearest the hand ever made (a drawing stopped before it is done)."""
    sheet = tl.state_at(t) if not line_only else None
    marks, _ = draw.scene_marks(ref, prefix, sheet, parts=(who,), line_only=(who,) if line_only else ())
    if region is not None:
        marks = [m for m in marks if _in(m, region)]
    first = [m for m in marks if m['layer'] in LINES_FIRST]
    if hand is not None:
        h = np.asarray(hand, np.float32)
        first.sort(key=lambda m: float(np.linalg.norm(_mid(m) - h)))
        first = first[:max(1, int(round(len(first) * nearest)))]
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
        if who in whole:
            # the head of where he was taken entirely (a residue with heads was a crowd of him: the
            # directors)
            hd = draw.erase_marks(f'{prefix}/{who}/head', who, heads([(a, who)]), width=20, strength=1.0, order='top', skip=0.0, rag=False)
            end = max(end, tl.add(hd, t, dur * 0.5, overlap=0.7))
        if who in whole:
            # and its lines along themselves: the real goodbye stays fact, not residue (its ghosts in
            # the doorway made the last image a ghost image: the skeptic)
            near = figure_mask(a, who, grow=8)
            lines = [m for t0_, t1_, m in tl.items if t1_ <= t + 1e-6 and m['part'] == who and m['kind'] == 'stroke'
                     and m['layer'] in ('contour', 'face') and not m['name'].startswith(('c1/', 'c2/')) and _in(m, near)]
            end = max(end, tl.add(draw.trace_erase(f'{prefix}/{who}/lines', who, lines, tuple(np.argwhere(near).mean(0)[::-1]), strength=0.95, width=12.0),
                                  t, dur * 0.6, overlap=0.8))
        # (thoroughly: lightly, each position stayed a figure, and the walk a crowd; the bag's ghost
        # by her hand read as hers: the creative director)
        er = draw.erase_marks(f'{prefix}/{who}/out', who, out, width=24, strength=1.0, order='top', skip=0.02, rag=False)
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
        # (only where the leaf moved to: redrawn whole at every step, the closing door piled five
        # leaves of tone into a slab: v2)
        marks = [m for m in marks if _in(m, region)]
        end = max(end, tl.add(marks, t + dur * 0.4, dur * 0.6, overlap=0.95))
    return end


def draw_on(tl, ref, prefix, t, dur):
    """A whole drawing made in front of us: the doorway's construction in hard pencil, then each
    thing in turn (the door, her, him), its tone laid by a hand working down it, rubbed, its lines
    found last. (A real person is never line alone; and tone everywhere at once read as an
    apparition fading in: the creative director.)"""
    marks, _ = draw.scene_marks(ref, prefix)
    construct = [m for m in marks if m['layer'] == 'construct']
    t = tl.add(construct, t, dur * 0.18, overlap=0.5)
    parts = [p for p in ('arch', 'floor', 'door', 'older', 'young') if any(m['part'] == p and m['layer'] != 'construct' for m in marks)]
    share = (dur * 0.82) / max(1, len(parts))
    for p in parts:
        mine = [m for m in marks if m['part'] == p and m['layer'] != 'construct']
        tone = sorted([m for m in mine if m['layer'].startswith('mass')], key=lambda m: _mid(m)[1])
        rest = [m for m in mine if m['layer'] in ('smudge', 'lift')]
        lines = [m for m in mine if m['layer'] in ('contour', 'face')]
        w = share if p in ('older', 'young') else share * 0.5
        t1 = tl.add(tone, t, w * 0.55, overlap=0.8)
        t1 = tl.add(rest, t1, w * 0.1, overlap=0.6)
        t = tl.add(lines, t1, w * 0.35, overlap=0.7) - w * 0.1
    return t


def heads(refs, grow=1.3):
    """The heads of everyone drawn in `refs` [(ref, who)]: circles round each (a ghost stops being
    a person when its head is gone: the creative director)."""
    m = np.zeros((H, W), np.uint8)
    for ref, who in refs:
        x0, y0, _, x1, y1, _ = ref['landmarks'][who]['head']
        r = int(grow * 0.75 * math.hypot(x1 - x0, y1 - y0) + 8)
        cv2.circle(m, (int((x0 + x1) / 2), int((y0 + y1) / 2)), r, 1, -1)
    return m > 0


# ---------------------------------------------------------------- what is imagined (v2)
# A revision is found before it is drawn, drawn in stages, each stage rubbed where it changes and
# drawn again over its own ghost, and taken back along its own lines, the hand last and least (the
# artist's review of the first film, 2026-10-22: "the drawing actively reconsidering itself").
class Imagined:
    """One person as imagined, on the sheet: the lines a revision may rub out, and what is left."""

    def __init__(self, who, ref):
        self.who, self.ref = who, ref
        self.build, self.lines, self.ghosts = [], [], []


def _lines_of(ref, who, prefix):
    marks, _ = draw.scene_marks(ref, prefix, None, parts=(who,), line_only=(who,))
    return [m for m in marks if m['layer'] in LINES_FIRST]


def imagine(tl, ref, who, prefix, t, build=0.5, lines=1.2, region=None, limbs=('arm.L', 'arm.R', 'leg.L', 'leg.R')):
    """`who` imagined in `ref`'s pose: the construction (the back, the shoulders, the head's oval,
    the limbs), then the outline, from the head down; only inside `region`, if given (a body that
    is already there, reconsidered)."""
    im = Imagined(who, ref)
    im.build = draw.gesture_marks(ref, who, prefix, limbs)
    t = tl.add(im.build, t, build, overlap=0.3)
    new = _lines_of(ref, who, prefix)
    if region is not None:
        new = [m for m in new if _in(m, region)]
    new.sort(key=lambda m: _mid(m)[1])
    im.lines = new
    return tl.add(new, t - 0.1, lines, overlap=0.6), im


def revise(tl, im, ref, prefix, t, rub=0.4, lines=0.7, region=None, start=None, rub_strength=0.72, stall=None):
    """The next stage of `im`: its lines rubbed where `ref` differs (a few strokes of the rubber
    along them: a ghost stays), then drawn again there, from `start` outward (a shoulder before a
    hand). Returns the time it ends."""
    who = im.who
    reg = delta_mask(im.ref, ref, who, grow=10, tone=False)
    if region is not None:
        reg = reg & region
    old = [m for m in im.lines if _in(m, reg)]
    centre = np.asarray(start if start is not None else np.argwhere(reg).mean(0)[::-1], np.float32)
    if old:
        t = tl.add(draw.trace_erase(f'{prefix}/rub', who, old, tuple(centre), strength=rub_strength, width=11.0, drag=0.3, passes=2), t, rub, overlap=0.4) - rub * 0.15
    new = [m for m in _lines_of(ref, who, prefix) if _in(m, reg)]
    new.sort(key=lambda m: float(np.linalg.norm(_mid(m) - centre)))
    im.lines = [m for m in im.lines if m not in old] + new
    im.ghosts += old
    im.ref = ref
    if stall:
        # (`stall` (share, pause): that share of it drawn quickly, then a stop, then the rest slower:
        # a hand that starts and then is not sure)
        k = max(1, int(len(new) * stall[0]))
        t = tl.add(new[:k], t, lines * 0.3, overlap=0.6) + stall[1]
        return tl.add(new[k:], t, lines * 0.7, overlap=0.6)
    return tl.add(new, t, lines, overlap=0.6)


def withdraw(tl, im, prefix, t, dur, hand, kept=0.92, hand_r=40.0):
    """`im` taken back: the rubber goes to the hand first and works at it (the hand resists: what
    pressed hardest is ground in), then takes the lines back along themselves from the hand, the
    construction lightly; then once more at the hand. The hand's impression stays."""
    who = im.who
    hx, hy = hand
    yy, xx = np.mgrid[0:draw.H, 0:draw.W]
    at_hand = (xx - hx) ** 2 + (yy - hy) ** 2 < hand_r ** 2
    scrub = [m for m in draw.erase_marks(f'{prefix}/hand', who, at_hand, width=14, strength=0.2, angle=-40, order=(hx, hy), rag=False) if m['kind'] == 'erase']
    # (lightly, and once: worked at twice, the hands' impressions were gone by the last image, and they
    # are what it is for: the skeptic)
    first, again = scrub[:5], []
    t = tl.add(first, t, 0.45, overlap=0.5)
    # one band rubbed across the arm, wider than any line, stopping short of the fingers (along
    # the lines alone the taking back read as a dimming: the creative director)
    lm = im.ref['landmarks'][who]
    side = 'L' if np.hypot(*(np.array(lm['hand.L'][3:5]) - (hx, hy))) < np.hypot(*(np.array(lm['hand.R'][3:5]) - (hx, hy))) else 'R'
    e0, e1 = np.array(lm[f'forearm.{side}'][0:2], np.float32), np.array(lm[f'hand.{side}'][0:2], np.float32)
    c = e0 + 0.55 * (e1 - e0)
    d = (e1 - e0) / (np.linalg.norm(e1 - e0) + 1e-6)
    across = np.array([-d[1], d[0]], np.float32) * 0.9 + d * 0.45
    across /= np.linalg.norm(across)
    band = []
    for k in range(4):
        ends = [c - across * 34 + d * (k - 1.5) * 5, c + across * 34 + d * (k - 1.5) * 5]
        band.append(dict(kind='erase', name=f'{prefix}/band/{k}', part=who, layer='erase', width=24.0, strength=0.95, drag=0.4 if k == 3 else 0.05,
                         pts=np.array(ends[::(1 if k % 2 == 0 else -1)]).round(2).tolist()))
    t = tl.add(band, t - 0.1, 0.4, overlap=0.4)
    traces = draw.trace_erase(prefix, who, im.lines, (hx, hy), strength=0.95, width=13.0, spare=(hx, hy, hand_r, kept), skip=0.03)
    build = draw.trace_erase(f'{prefix}/build', who, im.build, (hx, hy), strength=0.45, width=10.0, skip=0.35)
    # the stages rubbed on the way (their ghosts, left standing, made a pale man in the doorway at
    # the end: the creative director)
    build += draw.trace_erase(f'{prefix}/ghosts', who, im.ghosts, (hx, hy), strength=0.85, width=13.0, spare=(hx, hy, hand_r, kept), skip=0.1, passes=2)
    t = tl.add(traces + build, t - 0.05, dur, overlap=0.55)
    # (once was not enough: the whole outline stayed a figure; the second pass misses more, and
    # spares the hand more)
    twice = draw.trace_erase(f'{prefix}/again', who, im.lines, (hx, hy), strength=0.8, width=15.0, spare=(hx, hy, hand_r * 1.3, min(1.0, kept * 1.4)), skip=0.25)
    t = tl.add(twice, t - 0.1, dur * 0.4, overlap=0.5)
    t = tl.add(again, t - 0.1, 0.35, overlap=0.5)
    im.lines = []
    return t

