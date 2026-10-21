"""How the reference becomes a drawing (docs/things.md): the marks an artist would make for one
pose of the scene, in the order they would make them, as events for paper.py's sheet.

    construction   a few faint hard-pencil lines: the gesture of each body, the doorway's verticals
    contours       freehand lines along what scene.py measured, lifted at corners, overshooting a
                   little, weighted by the light: heavy where an edge turns into shadow or overlaps
                   something behind it, almost lost where a lit edge meets a lit wall
    tone           hatching where the light falls away; the stick's side and a finger's smudge in
                   the darkest places (the corridor beyond the door, under the coats)

Nothing here is random at render time: each mark's irregularity comes from its own name.
"""
import json
import math
import os

import cv2
import numpy as np

from paper import seed_of

W, H = 1280, 1440
HATCH_ANGLE = 58.0           # degrees: a right hand's hatching, from lower left to upper right
IDS = {1: 'wall', 2: 'casing', 3: 'floor', 4: 'corridor', 6: 'table', 7: 'door', 10: 'young', 11: 'older', 12: 'his hair', 13: 'her hair'}


# ---------------------------------------------------------------- the reference
def srgb_to_linear(v):
    v = v / 255.0
    return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)


def load(ref_dir, pose):
    d = json.load(open(os.path.join(ref_dir, f'{pose}.json')))
    tone = cv2.imread(os.path.join(ref_dir, f'{pose}-tone.png'), cv2.IMREAD_UNCHANGED).astype(np.float32) / 65535
    tone = cv2.resize(tone, (W, H), interpolation=cv2.INTER_LINEAR)
    ids = cv2.imread(os.path.join(ref_dir, f'{pose}-ids.png'), cv2.IMREAD_UNCHANGED)
    ids = np.round(srgb_to_linear(ids.astype(np.float32)) * 255 / 8).astype(np.uint8)
    ids = cv2.resize(ids, (W, H), interpolation=cv2.INTER_NEAREST)
    d['tone'], d['ids'] = tone, ids
    return d


# ---------------------------------------------------------------- line handling
def resample(pts, step=3.0):
    pts = np.asarray(pts, np.float32)
    seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]
    if seg[-1] < step:
        return pts
    ts = np.linspace(0, seg[-1], max(2, int(seg[-1] / step) + 1))
    return np.stack([np.interp(ts, seg, pts[:, 0]), np.interp(ts, seg, pts[:, 1])], 1)


def smooth(pts, n=2):
    for _ in range(n):
        if len(pts) < 3:
            return pts
        q = 0.75 * pts[:-1] + 0.25 * pts[1:]
        r = 0.25 * pts[:-1] + 0.75 * pts[1:]
        pts = np.concatenate([pts[:1], np.stack([q, r], 1).reshape(-1, 2), pts[-1:]])
    return pts


def split_corners(pts, angle=55.0, min_len=6):
    """Lift the pencil where the line turns sharply."""
    if len(pts) < 5:
        return [pts]
    d = np.diff(pts, axis=0)
    a = np.degrees(np.arctan2(d[:, 1], d[:, 0]))
    turn = np.abs((np.diff(a) + 180) % 360 - 180)
    cuts = [0] + [i + 1 for i in np.nonzero(turn > angle)[0]] + [len(pts) - 1]
    out = []
    for i0, i1 in zip(cuts, cuts[1:]):
        if i1 - i0 >= 2:
            out.append(pts[i0:i1 + 1])
    return [p for p in out if len(p) >= 2 and np.linalg.norm(p[-1] - p[0]) + 0.1 >= min_len * 0.3]


def split_long(pts, most=150.0):
    """A long line is drawn in a few strokes, each picking up where the last one ended."""
    seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]
    L = seg[-1]
    if L <= most:
        return [pts]
    n = int(math.ceil(L / most))
    edges = np.linspace(0, L, n + 1)
    out = []
    for a, b in zip(edges, edges[1:]):
        k = (seg >= a - 4) & (seg <= b + 4)       # a little overlap, as a hand rejoins a line
        if k.sum() >= 2:
            out.append(pts[k])
    return out


def hand(pts, name, wobble=1.1, over=(2, 7)):
    """A freehand version of a line: a slow wobble across it, and a little overshoot at each end."""
    rng = np.random.default_rng(seed_of(name))
    pts = np.asarray(pts, np.float32)
    if len(pts) < 2:
        return pts
    t0 = pts[1] - pts[0]
    t1 = pts[-1] - pts[-2]
    t0 /= np.linalg.norm(t0) + 1e-6
    t1 /= np.linalg.norm(t1) + 1e-6
    pre = pts[0] - t0 * rng.uniform(*over)
    post = pts[-1] + t1 * rng.uniform(*over)
    pts = np.concatenate([[pre], pts, [post]])
    pts = resample(pts, 3.0)
    d = np.gradient(pts, axis=0)
    nrm = np.stack([-d[:, 1], d[:, 0]], 1)
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-6
    k = np.linspace(0, 1, len(pts))
    w = sum(rng.uniform(-1, 1) * np.sin(math.pi * (j + 1) * k + rng.uniform(0, 6.28)) / (j + 1) for j in range(3))
    return pts + nrm * (w * wobble)[:, None]


def side_tone(tone, pts, off=7.0):
    """The light on each side of a line, along it (lit 1 .. dark 0)."""
    d = np.gradient(pts, axis=0)
    nrm = np.stack([-d[:, 1], d[:, 0]], 1)
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-6
    def at(q):
        x = np.clip(q[:, 0], 0, W - 1).astype(int)
        y = np.clip(q[:, 1], 0, H - 1).astype(int)
        return tone[y, x]
    return at(pts + nrm * off), at(pts - nrm * off)


# ---------------------------------------------------------------- the drawing of a pose
class Drawing:
    """The marks for one pose, in order. Each is a dict: kind (stroke | smudge | erase), name,
    pts, tool or width, pressure, and `part` (what it draws: 'arch', 'young', ...)."""

    def __init__(self, ref, prefix):
        self.ref = ref
        self.prefix = prefix
        self.marks = []
        self.tone = ref['tone']
        self.ids = ref['ids']

    def add(self, kind, part, layer, pts, **k):
        name = f"{self.prefix}/{part}/{layer}/{len(self.marks)}"
        self.marks.append(dict(kind=kind, name=name, part=part, layer=layer, pts=np.asarray(pts, np.float32).round(2).tolist(), **k))

    # contours
    def contours(self, group, part, tool, base, gain, lost=0.0, wobble=1.0, over=(2, 7), most=150.0, double=0.0, fine=(), carry=0.0, lines=None, layer='contour',
                 outline=None):
        """`fine`: circles (x, y, r, tool, size, gain) where the line is drawn otherwise (a head
        lighter, a hand). `outline`: ids whose inside lines are left out (only the edge of the
        silhouette drawn: an imagined figure's lapel drew as a black tie, the creative director)."""
        rng = np.random.default_rng(seed_of(self.prefix + part + group))
        for li, line in enumerate(self.ref['strokes'].get(group, []) if lines is None else lines):
            pts = np.array([[p[0], p[1]] for p in line], np.float32)
            if len(pts) < 2 or np.linalg.norm(pts[-1] - pts[0]) + np.linalg.norm(np.diff(pts, axis=0), axis=1).sum() < 5:
                continue
            pts = smooth(resample(cv2.approxPolyDP(pts.reshape(-1, 1, 2), 0.6, False).reshape(-1, 2), 2.0), 1)
            for pi, piece in enumerate(split_corners(pts)):
                for si, sub in enumerate(split_long(piece, most)):
                    name = f'{self.prefix}/{part}/{group}/{li}/{pi}/{si}'
                    q = hand(sub, name, wobble, over)
                    a, b = side_tone(self.tone, q)
                    # weight: the dark side of the edge, and the step across it
                    dark = 1 - np.minimum(a, b)
                    step = np.abs(a - b)
                    w = 0.6 * dark + 0.8 * step
                    p = np.clip(base + gain * w, 0.05, 1.0)
                    if carry > 0:
                        # where the tone cannot show the edge (a lit figure on a lit wall), the
                        # line carries the form, at a weight that holds it
                        p = np.where(step < 0.25, np.maximum(p, carry), p)
                    keep = np.ones(len(q), bool)
                    if outline is not None:
                        d = np.gradient(q, axis=0)
                        nrm = np.stack([-d[:, 1], d[:, 0]], 1)
                        nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-6
                        def side(o):
                            r = q + nrm * o
                            return np.isin(self.ids[np.clip(r[:, 1].astype(int), 0, H - 1), np.clip(r[:, 0].astype(int), 0, W - 1)], outline)
                        keep &= ~(side(5.0) & side(-5.0))
                    if lost > 0:
                        # lost and found: where the tone already shows the edge (dark against
                        # light), the line comes and goes with a slow seeded rhythm, as a hand
                        # lifts; where it does not (a lit figure on a lit wall), the line holds it
                        drift = np.interp(np.linspace(0, 1, len(q)), np.linspace(0, 1, 6), rng.uniform(-1, 1, 6))
                        keep &= (step < 0.25) | ((w + 0.12 * drift) > lost * 0.55 + 0.25)
                    runs = []
                    i = 0
                    while i < len(q):
                        if keep[i]:
                            j = i
                            while j < len(q) and keep[j]:
                                j += 1
                            if j - i >= 4:
                                runs.append((i, j))
                            i = j
                        else:
                            i += 1
                    for r0, r1 in runs:
                        qq, pp = q[r0:r1], p[r0:r1].copy()
                        # the hand eases in and out of a stroke
                        pp *= np.clip(np.sin(np.linspace(0.12, 0.88, len(qq)) * math.pi) * 1.25, 0.35, 1)
                        t_, sz = tool, 1.0
                        c = qq.mean(0)
                        for fx, fy, fr, ft, fs, fg in fine:
                            if (c[0] - fx) ** 2 + (c[1] - fy) ** 2 < fr * fr:
                                t_, sz = ft, fs
                                pp = np.clip(pp * fg, 0.05, 1.0)
                                break
                        self.add('stroke', part, layer, qq, tool=t_, pressure=pp.round(3).tolist(), size=sz)
                    if double and runs and rng.random() < double:
                        q2 = hand(sub + rng.uniform(-2.2, 2.2, 2), name + 'b', wobble * 1.4, over)
                        self.add('stroke', part, layer, q2, tool='pencil', pressure=(p * 0.55).round(3).tolist())

    # tone: hatching inside a region where the light falls away
    def hatch(self, part, ids, lo, hi, tool, spacing, angle, pressure, layer='tone', length=None, curve=6.0, jitter=1.5):
        mask = np.isin(self.ids, ids)
        shade = np.clip((hi - self.tone) / max(hi - lo, 1e-3), 0, 1) * mask
        if shade.max() <= 0.02:
            return
        ys, xs = np.nonzero(shade > 0.02)
        rng = np.random.default_rng(seed_of(f'{self.prefix}/{part}/{layer}/{angle}'))
        ang = math.radians(angle)
        dv = np.array([math.cos(ang), -math.sin(ang)])        # along the hatch (screen y down)
        nv = np.array([-dv[1], dv[0]])
        P = np.stack([xs, ys], 1).astype(np.float32)
        u = P @ nv
        for k, off in enumerate(np.arange(u.min(), u.max(), spacing)):
            off = off + rng.uniform(-spacing * 0.25, spacing * 0.25)
            sel = np.abs(u - off) < 0.7
            if sel.sum() < 4:
                continue
            along = P[sel] @ dv
            order = np.argsort(along)
            pts = P[sel][order]
            vals = shade[pts[:, 1].astype(int), pts[:, 0].astype(int)]
            al = along[order]
            # runs of the line inside the shaded region
            gaps = np.nonzero(np.diff(al) > 3)[0]
            starts = np.r_[0, gaps + 1]
            ends = np.r_[gaps, len(al) - 1]
            for s0, e0 in zip(starts, ends):
                if al[e0] - al[s0] < 6:
                    continue
                seg_len = al[e0] - al[s0]
                pieces = [(al[s0], al[e0])] if length is None else [(a, min(a + length * rng.uniform(0.7, 1.2), al[e0])) for a in np.arange(al[s0], al[e0], length)]
                for a0, a1 in pieces:
                    if a1 - a0 < 5:
                        continue
                    t = np.linspace(0, 1, max(3, int((a1 - a0) / 4)))
                    base = off * nv[None, :] + (a0 + (a1 - a0) * t)[:, None] * dv[None, :]
                    bow = curve * rng.uniform(-1, 1) * np.sin(math.pi * t)
                    q = base + nv[None, :] * (bow + rng.uniform(-jitter, jitter))[:, None]
                    sv = np.interp(a0 + (a1 - a0) * t, al[s0:e0 + 1], vals[s0:e0 + 1])
                    p = np.clip(pressure * (0.35 + 0.9 * sv) * np.clip(np.sin(math.pi * (0.1 + 0.8 * t)) * 1.3, 0.3, 1), 0.04, 1.1)
                    self.add('stroke', part, layer, q, tool=tool, pressure=p.round(3).tolist())

    def smudge_region(self, part, ids, lo, hi, width=34, amount=0.5, angle=None, step=26):
        """A finger over the darkest of a region, in a few strokes along the hatching."""
        mask = (np.isin(self.ids, ids) & (self.tone < hi)).astype(np.uint8)
        if mask.sum() < 50:
            return
        rng = np.random.default_rng(seed_of(f'{self.prefix}/{part}/smudge'))
        ang = math.radians(HATCH_ANGLE if angle is None else angle)
        dv = np.array([math.cos(ang), -math.sin(ang)])
        nv = np.array([-dv[1], dv[0]])
        ys, xs = np.nonzero(mask)
        P = np.stack([xs, ys], 1).astype(np.float32)
        u = P @ nv
        for off in np.arange(u.min() + step / 2, u.max(), step):
            sel = np.abs(u - off) < step / 2
            if sel.sum() < 30:
                continue
            along = P[sel] @ dv
            a0, a1 = np.percentile(along, (4, 96))
            if a1 - a0 < 12:
                continue
            t = np.linspace(0, 1, 12)
            q = off * nv[None, :] + (a0 + (a1 - a0) * t)[:, None] * dv[None, :] + rng.uniform(-3, 3, (12, 2))
            self.add('smudge', part, 'smudge', q, width=width, amount=amount)


def apply(sheet, marks, upto=None):
    """Lay `marks` on the sheet (all of each; `upto` = {name: (from, to)} for parts of strokes)."""
    for m in marks:
        part = (upto or {}).get(m['name'], (0.0, 1.0))
        if m['kind'] == 'stroke':
            sheet.stroke(m['name'], m['pts'], m['tool'], m.get('pressure'), upto=part, size=m.get('size', 1.0))
        elif m['kind'] == 'smudge':
            sheet.smudge(m['name'], m['pts'], m['width'], m.get('amount', 0.6), upto=part)
        elif m['kind'] == 'erase':
            sheet.erase(m['name'], m['pts'], m['width'], m.get('strength', 0.85), upto=part, drag=m.get('drag', 0.25))


# ---------------------------------------------------------------- the tonal drawing
FIGURE_IDS = {'young': [10, 12], 'older': [11, 13]}
HAIR = [12, 13]
PEOPLE = [10, 11, 12, 13]
VERTICAL = [1, 2, 4, 7]          # walls, casing, corridor, door: stroked up and down
FLOOR = [3]


def target_density(tone):
    """How dark the drawing wants each place: the render's value, compressed as a drawing is (the
    darkest a charcoal black, the lightest the paper)."""
    v = 0.16 + 0.84 * np.clip(tone, 0, 1) ** 0.85
    return -np.log(v) / 2.36


def direction_field(ref, ids):
    """The way a stroke runs at each pixel (radians, screen): up and down the walls and the door,
    along the floor, along the nearest bone of a body."""
    # the walls and the casing on a right hand's diagonal (stroked down a wall, a mass reads as
    # drips: the creative director, Proof A); the door's leaf up and down
    th = np.full(ids.shape, math.radians(HATCH_ANGLE), np.float32)
    th[np.isin(ids, [7])] = math.radians(90.0)
    th[np.isin(ids, FLOOR)] = math.radians(6.0)
    for who, fid in FIGURE_IDS.items():
        m = np.isin(ids, fid)
        if not m.any():
            continue
        ys, xs = np.nonzero(m)
        P = np.stack([xs, ys], 1).astype(np.float32)
        best = np.full(len(P), np.inf)
        ang = np.zeros(len(P), np.float32)
        for bn, v in ref['landmarks'][who].items():
            a, b = np.array(v[0:2], np.float32), np.array(v[3:5], np.float32)
            ab = b - a
            L2 = float(ab @ ab)
            if L2 < 4:
                continue
            t = np.clip(((P - a) @ ab) / L2, 0, 1)
            d = np.linalg.norm(P - (a + t[:, None] * ab), axis=1)
            k = d < best
            best[k] = d[k]
            ang[k] = math.atan2(ab[1], ab[0])
        th[ys, xs] = ang
    return th


def mass(dr, sheet, part, region, need, dirf, width, length, coverage, pressure, layer, jitter_deg=9.0, tool='side'):
    """The stick's side over `region` wherever `need` (the density still wanted) is more than
    nothing: strokes along the direction field, about `coverage` of them over each place (a pass
    is one or two layers, each stroke legible: piled fifteen deep they averaged to an airbrush,
    the technical artist), row by row as a hand works down, pressed as hard as the need."""
    rng = np.random.default_rng(seed_of(f'{dr.prefix}/{part}/{layer}'))
    ys, xs = np.nonzero(region & (need > 0.03))
    if len(xs) == 0:
        return []
    spacing = math.sqrt(width * length * 0.8 / coverage)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max(), ys.max()
    marks = []
    for ri, gy in enumerate(np.arange(y0, y1 + 1, spacing)):
        cols = np.arange(x0, x1 + 1, spacing)
        for gx in (cols if ri % 2 == 0 else cols[::-1]):
            x = int(gx + rng.uniform(-spacing / 2, spacing / 2))
            y = int(gy + rng.uniform(-spacing / 2, spacing / 2))
            if not (0 <= x < W and 0 <= y < H) or not region[y, x] or need[y, x] <= 0.03:
                continue
            a = dirf[y, x] + math.radians(rng.uniform(-jitter_deg, jitter_deg))
            L = length * rng.uniform(0.6, 1.25)
            t = np.linspace(-0.5, 0.5, max(4, int(L / 6)))
            bend = rng.uniform(-0.12, 0.12) * L
            pts = np.stack([x + math.cos(a) * L * t - math.sin(a) * bend * (0.25 - t * t),
                            y + math.sin(a) * L * t + math.cos(a) * bend * (0.25 - t * t)], 1)
            # keep the stroke inside its region (an artist works up to an edge, not across it)
            inside = region[np.clip(pts[:, 1].astype(int), 0, H - 1), np.clip(pts[:, 0].astype(int), 0, W - 1)]
            if inside.sum() < 3:
                continue
            idx = np.nonzero(inside)[0]
            pts = pts[idx.min():idx.max() + 1]
            p = float(np.clip(pressure * (0.35 + 1.6 * need[y, x]), 0.08, 1.0))
            n = len(pts)
            prof = np.clip(np.sin(np.linspace(0.1, 0.9, n) * math.pi) * 1.3, 0.35, 1) * p
            marks.append(dict(kind='stroke', name=f'{dr.prefix}/{part}/{layer}/{len(dr.marks) + len(marks)}', part=part, layer=layer,
                              pts=pts.round(2).tolist(), tool=tool, pressure=prof.round(3).tolist(), size=width / 24.0 if tool.startswith('side') else 1.0))
    return marks


def lay(dr, sheet, marks):
    from paper import Sheet  # noqa
    apply(sheet, marks)
    dr.marks += marks


def lifts(dr, sheet, part, region, tone, dirf, width, layer='lift'):
    """A kneaded eraser pressed where the light catches (the brightest of a region against its
    surroundings): dabs, a few px of rubber rolled on the spot, lifting without dragging."""
    rng = np.random.default_rng(seed_of(f'{dr.prefix}/{part}/{layer}'))
    local = cv2.GaussianBlur(tone, (0, 0), 18)
    lit = region & (tone > local + 0.12) & (tone > 0.35)
    ys, xs = np.nonzero(lit)
    marks = []
    if len(xs) == 0:
        return marks
    sp = max(6, int(width * 1.1))
    for gy in np.arange(ys.min(), ys.max() + 1, sp):
        for gx in np.arange(xs.min(), xs.max() + 1, sp):
            x, y = int(gx + rng.uniform(-sp / 3, sp / 3)), int(gy + rng.uniform(-sp / 3, sp / 3))
            if not (0 <= x < W and 0 <= y < H) or not lit[y, x]:
                continue
            a = rng.uniform(0, 2 * math.pi)
            r = rng.uniform(1.5, 4.0)
            pts = [[x + r * math.cos(a + k * 2.1), y + r * math.sin(a + k * 2.1)] for k in range(4)]
            s = float(np.clip((tone[y, x] - local[y, x]) * 2.5 + 0.35, 0.5, 0.7))
            marks.append(dict(kind='erase', name=f'{dr.prefix}/{part}/{layer}/{len(dr.marks) + len(marks)}', part=part, layer=layer,
                              pts=pts, width=float(width * rng.uniform(0.8, 1.5)), strength=s, drag=0.0))
    return marks


def head_outline(ids, fid, circle):
    """The outline of a person's head (and hair) where it meets something else: the edge of
    their silhouette inside the head's circle (x, y, r, ...), as polylines."""
    x, y, r = circle[:3]
    m = np.isin(ids, fid).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    out = []
    for c in cs:
        c = c[:, 0, :].astype(np.float32)
        inside = (c[:, 0] - x) ** 2 + (c[:, 1] - y) ** 2 < r * r
        run = []
        for p, ok in zip(c, inside):
            if ok:
                run.append(p)
            elif run:
                out.append(run)
                run = []
        if run:
            out.append(run)
    return [smooth(resample(np.array(o), 3.0), 2) for o in out if len(o) > 6]


def face_marks(dr, who):
    """A face at this size is three accents, no outlines (the technical artist, Proof A2): the
    shadow of each eye's socket a dab, the nose's shadow side one pencil line from its bridge, the
    mouth a short dash. Only what the camera sees."""
    f = dr.ref.get('face', {}).get(who)
    if not f:
        return
    def pt(k):
        v = f[k]
        return np.array(v[:2], np.float32), v[3] > 0
    for e in ('eye.L', 'eye.R'):
        p, seen = pt(e)
        if seen:
            dr.add('stroke', who, 'face', [p - [1.5, 0.3], p + [1.5, 0.3]], tool='charcoal', pressure=[0.5], size=0.75)
    (b, sb), (n, sn) = pt('bridge'), pt('nose')
    if sb and sn and np.linalg.norm(n - b) > 2:
        dr.add('stroke', who, 'face', hand(np.array([b, n]), f'{dr.prefix}/{who}/nose', 0.3, (0.2, 0.8)), tool='pencil', pressure=[0.55], size=0.75)
    (ml, sl), (mr, sr) = pt('mouth.L'), pt('mouth.R')
    if sl or sr:
        c = (ml + mr) / 2
        d = mr - ml
        L = np.linalg.norm(d)
        d = d / L if L > 1e-3 else np.array([1.0, 0.0], np.float32)
        half = min(3.0, max(2.0, L / 2))
        dr.add('stroke', who, 'face', [c - d * half, c + d * half], tool='charcoal', pressure=[0.42], size=0.55)


def scene_marks(ref, prefix, sheet=None, parts=('place', 'young', 'older'), line_only=()):
    """The drawing of one pose, as an artist builds it: light construction, the big masses of tone,
    rubbed together, the lights lifted, then the lines and accents. `sheet`: the paper as it is
    (the planning reads it, and each pass is laid on it); a fresh one if None. `parts`: which of
    the place and the two people to draw (a revision redraws one person over what is there);
    `line_only`: people drawn in line, no tone (what is only imagined)."""
    from paper import Sheet
    dr = Drawing(ref, prefix)
    sheet = sheet or Sheet(W, H, 'things')
    tone, ids = ref['tone'], ref['ids']
    dirf = direction_field(ref, ids)
    want = target_density(tone)
    # the room is line: its only tone a rubbed shadow on the floor where each person stands (its
    # masses on the walls read as light through blinds: the skeptic, Proof A3)
    figmask = np.isin(ids, PEOPLE).astype(np.uint8)
    near = np.exp(-cv2.distanceTransform(1 - figmask, cv2.DIST_L2, 5) / 40.0) if figmask.any() else np.zeros_like(want)
    want = np.where(np.isin(ids, PEOPLE), want, np.where(np.isin(ids, FLOOR), want * 0.6 * near, 0.0))
    # the door at under half its weight: drawn whole, shut, it was a slab that outweighed them
    want = np.where(ids == 7, target_density(tone) * 0.42, want)
    # and a light falloff on the wall round the doorway, so the opening is the brightest place on
    # the sheet from the first frame (its emptiness, at the end, is lit) (the creative director)
    opening = (ids == 4).astype(np.uint8)
    if opening.any():
        dist = cv2.distanceTransform(1 - opening, cv2.DIST_L2, 5)
        want = want + np.where(np.isin(ids, [1, 2]), 0.03 * np.exp(-dist / 150.0) * (dist > 6), 0.0)
    place = 'place' in parts
    door = place or 'door' in parts                # the door is its own part: it can close alone
    people = [w for w in FIGURE_IDS if w in parts and ref['strokes'].get(w)]
    # 1. construction: the doorway's lines, the bodies' gestures (hard pencil, faint)
    if place:
        dr.contours('arch', 'arch', 'hardpencil', 0.5, 0.0, wobble=0.6, over=(8, 26), most=400, layer='construct')
    apply(sheet, dr.marks)
    # 2. the masses, in three passes, each laying what is still wanted
    figs = np.isin(ids, PEOPLE)
    regions = ([('arch', ~figs & ~np.isin(ids, FLOOR + [7]), 26, 120, 'side'), ('floor', np.isin(ids, FLOOR), 26, 150, 'side')] if place else []) + \
              ([('door', ids == 7, 22, 110, 'side')] if door else []) + \
              [(w, np.isin(ids, FIGURE_IDS[w]), 16, 70, 'side_firm') for w in people if w not in line_only]
    for k, (pressure, thr) in enumerate(((0.45, 0.03), (0.62, 0.05), (0.8, 0.08))):
        need = np.clip(want - sheet.density(), 0, None)
        need[need < thr] = 0
        for part, reg, width, length, tool in regions:
            lay(dr, sheet, mass(dr, sheet, part, reg, need, dirf + math.radians((0, 28, -28)[k]), width, length, 1.5, pressure, f'mass{k}', tool=tool))
    # 3. rubbed together: a finger along each region's strokes
    rubs = ([('floor', FLOOR, 40)] if place else []) + ([('door', [7], 30)] if door else []) + [(w, FIGURE_IDS[w], 18) for w in people if w not in line_only]
    for part, reg_ids, width in rubs:
        dr0 = len(dr.marks)
        dr.smudge_region(part, reg_ids, 0.0, 0.8 if part not in FIGURE_IDS else 0.3, width=width, amount=0.68 if part not in FIGURE_IDS else 0.35, angle=6 if part in ('floor', 'door') else (HATCH_ANGLE if part == 'wall' else None), step=int(width * 0.8))
        apply(sheet, dr.marks[dr0:])
    # 4. the lights lifted out with the eraser
    # (no lifts on hair: a lifted crown read as a bald, shiny head)
    lifted = [(w, np.isin(ids, FIGURE_IDS[w]) & ~np.isin(ids, HAIR), 9) for w in people if w not in line_only]
    for part, reg, width in lifted:
        lay(dr, sheet, lifts(dr, sheet, part, reg, tone, dirf, width))
    # 5. lines: the figures' contours (selective, weighted by the light), the door, the things
    n0 = len(dr.marks)
    if door:
        dr.contours('door', 'door', 'charcoal', 0.2, 0.6, lost=0.4, wobble=0.8, most=160)
    if place:
        dr.contours('things', 'things', 'pencil', 0.3, 0.7, lost=0.4, wobble=1.0, most=120, double=0.2)
        dr.contours('arch', 'arch', 'charcoal', 0.1, 0.55, lost=0.6, wobble=0.8, over=(3, 9), most=170)
    for who in people:
        lm = dr.ref['landmarks'][who]
        imagined = who in line_only
        # what is imagined is drawn in graphite, lighter than any charcoal of what happened and
        # cleaner to erase; its outline only; its hands first and heaviest (the creative director)
        line, hand_tool, hand_gain = ('pencil', 'pencil', 1.35) if imagined else ('charcoal', 'pencil', 0.8)
        fine = []
        hx0, hy0, _, hx1, hy1, _ = lm['head']
        fine.append(((hx0 + hx1) / 2, (hy0 + hy1) / 2, 0.75 * math.hypot(hx1 - hx0, hy1 - hy0) + 6, line, 0.6 if not imagined else 1.0, 0.8))
        for sd in ('L', 'R'):
            a0, b0, _, a1, b1, _ = lm[f'hand.{sd}']
            fine.append((a1, b1, 1.1 * math.hypot(a1 - a0, b1 - b0) + 5, hand_tool, 1.0, hand_gain))
        outline = FIGURE_IDS[who] if imagined else None
        dr.contours(who, who, line, 0.14, 0.75, lost=0.45, wobble=0.9, over=(1, 4), most=90, double=0.0 if imagined else 0.2, fine=fine, carry=0.5,
                    outline=outline)
        # the head's outline from the silhouette (the hair's strands drew as stripes and its
        # hairline as a scar: the reviewers), lighter, lost and found as the rest
        dr.contours(who, who, line, 0.14, 0.75, lost=0.45, wobble=0.6, over=(1, 3), most=60, fine=fine, carry=0.45,
                    lines=head_outline(ids, FIGURE_IDS[who], fine[0]))
        if who != 'young' and not imagined:
            face_marks(dr, who)          # (in his memory he does not see his own face)
    apply(sheet, dr.marks[n0:])
    return dr.marks, sheet


def casing_marks(ref, prefix, near, r=110.0):
    """The doorway's lines near a point (a hand that reached for it) restated in charcoal, a
    little off where they were: each almost works the doorway."""
    rng = np.random.default_rng(seed_of(prefix))
    cx, cy = near
    pieces = []
    for line in ref['strokes'].get('arch', []):
        p = resample(np.array([[a, b] for a, b, _ in line], np.float32), 2.0)    # (sparse vertices fell outside the circle)
        keep = (p[:, 0] - cx) ** 2 + (p[:, 1] - cy) ** 2 < r * r
        run = []
        for q, k in zip(p, keep):
            if k:
                run.append(q)
            elif run:
                pieces.append(np.array(run))
                run = []
        if run:
            pieces.append(np.array(run))
    off = rng.uniform(-2.5, 2.5, 2)
    pieces = [pc + off for pc in pieces if len(pc) > 1 and np.linalg.norm(np.diff(pc, axis=0), axis=1).sum() > 8]
    dr = Drawing(ref, prefix)
    dr.contours('arch', 'arch', 'charcoal', 0.35, 0.3, wobble=1.3, over=(2, 8), most=90, lines=pieces)
    return dr.marks


def erase_marks(prefix, part, mask, width=26, strength=0.85, angle=-60.0, spacing=None, order='top', drag=0.3, weight=None, rag=True, skip=0.0):
    """A plastic eraser over `mask`, as a hand scrubs: clusters of four to eight short strokes back
    and forth, each an arc about the wrist (below and to the right, a right hand), the cluster
    stepping sideways a few px a stroke; the clusters taken in `order` ('top': from the top down;
    'x+' / 'x-': across; or a point (x, y): outward from it, as an arm is taken first from its
    hand). The region's edge is overrun unevenly, so the ghost takes the eraser's shape, not the
    body's; `weight` (0..1 an image) scrubs harder where it is high. Then, if `rag`, one soft wipe
    over it all. Each stroke a mark of its own, so the timeline can take them in turn.
    (Parallel sweeps at one angle and one spacing printed stripes: the creative director and the
    technical artist, Proof A2.)"""
    rng = np.random.default_rng(seed_of(f'{prefix}/{part}/erase'))
    m = mask.astype(np.uint8)
    if not m.any():
        return []
    # the overrun: 6-20 px past the edge, unevenly
    dist = cv2.distanceTransform(1 - m, cv2.DIST_L2, 5)
    reach = 6 + 14 * cv2.resize(rng.random((H // 40 + 2, W // 40 + 2)).astype(np.float32), (W, H), interpolation=cv2.INTER_CUBIC)
    region = (m > 0) | (dist < reach)
    ys, xs = np.nonzero(region)
    step = spacing or width * 1.7
    centres = []
    for gy in np.arange(ys.min(), ys.max() + 1, step):
        for gx in np.arange(xs.min(), xs.max() + 1, step):
            x, y = int(gx + rng.uniform(-step / 3, step / 3)), int(gy + rng.uniform(-step / 3, step / 3))
            if 0 <= x < W and 0 <= y < H and region[y, x]:
                centres.append((x, y))
    def key(c):
        if order == 'top':
            return c[1] + rng.uniform(-step, step)
        if order == 'x+':
            return c[0] + rng.uniform(-step, step)
        if order == 'x-':
            return -c[0] + rng.uniform(-step, step)
        return float(np.hypot(c[0] - order[0], c[1] - order[1])) + rng.uniform(-step / 2, step / 2)
    centres.sort(key=key)
    # stopped when it is enough: some places never scrubbed (the skeptic, Proof A3)
    centres = [c for c in centres if rng.random() > skip]
    marks = []
    for ci, (cx, cy) in enumerate(centres):
        base = math.radians(angle + rng.uniform(-15, 15))
        dv = np.array([math.cos(base), -math.sin(base)])
        nv = np.array([-dv[1], dv[0]])
        if nv[1] < 0:
            nv = -nv                         # the wrist is below the stroke
        R = rng.uniform(250, 350)
        L = rng.uniform(30, 90)
        n = int(rng.integers(4, 9))
        adv = rng.uniform(3, 8) * (1 if rng.random() < 0.5 else -1)
        w_ = float(np.clip(weight[cy, cx], 0, 1)) if weight is not None else 0.5
        for k in range(n):
            c = np.array([cx, cy], np.float32) + nv * adv * (k - n / 2)
            pivot = c + nv * R
            th = np.linspace(-L / 2 / R, L / 2 / R, 10)
            if k % 2:
                th = th[::-1]                # back and forth
            r0 = c - pivot
            pts = np.stack([pivot[0] + r0[0] * np.cos(th) - r0[1] * np.sin(th), pivot[1] + r0[0] * np.sin(th) + r0[1] * np.cos(th)], 1)
            marks.append(dict(kind='erase', name=f'{prefix}/{part}/erase/{ci}/{k}', part=part, layer='erase', pts=pts.round(2).tolist(),
                              width=float(width * rng.uniform(0.8, 1.15)), strength=float(np.clip(strength * (0.75 + 0.5 * w_) * rng.uniform(0.85, 1.0), 0, 1)),
                              drag=drag))
    if rag:
        # a rag over it all, wide and light, merging the scrubs (along the region's long way)
        cy_, cx_ = ys.mean(), xs.mean()
        tall = (ys.max() - ys.min()) > (xs.max() - xs.min())
        for k in range(3):
            o = (k - 1) * (xs.max() - xs.min() if tall else ys.max() - ys.min()) / 3
            if tall:
                q = [[cx_ + o + rng.uniform(-6, 6), y] for y in np.linspace(ys.min(), ys.max(), 12)]
            else:
                q = [[x, cy_ + o + rng.uniform(-6, 6)] for x in np.linspace(xs.min(), xs.max(), 12)]
            marks.append(dict(kind='smudge', name=f'{prefix}/{part}/rag/{k}', part=part, layer='rag', pts=q, width=70.0, amount=0.22))
    return marks


if __name__ == '__main__':
    import sys
    import time
    from paper import Sheet
    ref_dir, pose, out = sys.argv[1], sys.argv[2], sys.argv[3]
    t = time.time()
    ref = load(ref_dir, pose)
    marks, s = scene_marks(ref, pose)
    t1 = time.time()
    s.write(out)
    with open(out.rsplit('.', 1)[0] + '.marks.json', 'w') as fh:
        json.dump(marks, fh)
    print(f'{len(marks)} marks: planned {t1 - t:.1f}s, drawn {time.time() - t1:.1f}s')
