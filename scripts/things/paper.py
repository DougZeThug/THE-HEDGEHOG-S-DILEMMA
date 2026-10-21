"""One sheet of paper for "Things I Should Have Said" (docs/things.md): charcoal and graphite laid
on it, partly lifted by an eraser, pushed about by a finger, and never quite clean again.

The sheet is state, not a picture. Every mark is an event that changes it, so a frame is the sheet
after the events up to that frame, and what nothing touches stays exactly as it was (no mark is
drawn twice, nothing boils). Each mark's irregularity is seeded by its own name.

    loose charcoal / graphite   what an eraser can lift (most of it)
    held charcoal / graphite    what is ground into the fibres: an eraser barely moves it
    worn                        paper roughed by erasing: greyer, and it takes the next mark darker

How the materials behave (the reasons for the numbers below):
- charcoal sits on the tooth of the paper: light pressure catches only the peaks of the grain and
  leaves a broken, speckled mark; heavy pressure fills the valleys too. Its edge is ragged.
- graphite is harder: a finer, greyer, more continuous line that saturates at a mid grey (a pencil
  cannot make the black charcoal makes).
- an eraser lifts most of what lies on the peaks and less of what has sunk into the valleys, drags
  some of it in the direction it moves (a grey streak), and leaves the ground-in part behind: the
  ghost of the contour.
- the more a place is worked, the more of its pigment is ground in, and the dirtier it stays.
"""
import hashlib
import math
from collections import OrderedDict

import cv2
import numpy as np

# the west wall's plaster (src/world/surfaces.ts): the sheet is that wall, so the film taking over
# from the wall's own pencil does not change its colour (the technical artist, Proof A2)
PAPER_RGB = np.array([234, 232, 228], np.float32) / 255
# optical density per unit of pigment, per channel (charcoal a warm black; graphite a cool grey)
CHARCOAL_K = np.array([2.30, 2.36, 2.48], np.float32)
GRAPHITE_K = np.array([1.05, 1.02, 0.96], np.float32)
GRAPHITE_MAX = 1.35          # a pencil saturates: the most density graphite reaches


def seed_of(name):
    return int.from_bytes(hashlib.sha1(name.encode()).digest()[:4], 'little')


def digest(*parts):
    """A key for a mark's footprint: its name and everything that shapes it (a pose redrawn under
    the same names must not find the old footprint: the technical artist, Proof A2)."""
    h = hashlib.sha1()
    for p in parts:
        h.update(np.asarray(p, np.float32).tobytes() if isinstance(p, (list, tuple, np.ndarray)) else repr(p).encode())
    return h.hexdigest()


def noise2(h, w, scale, rng, octaves=3):
    """Smooth value noise in [0, 1], of features about `scale` px."""
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        s = max(1.0, scale / (2 ** o))
        gh, gw = int(h / s) + 3, int(w / s) + 3
        g = rng.random((gh, gw)).astype(np.float32)
        out += amp * cv2.resize(g, (w, h), interpolation=cv2.INTER_CUBIC)
        tot += amp
        amp *= 0.5
    out /= tot
    lo, hi = np.percentile(out, (1, 99))
    return np.clip((out - lo) / max(hi - lo, 1e-6), 0, 1)


class Sheet:
    def __init__(self, w, h, seed='paper'):
        self.w, self.h = w, h
        rng = np.random.default_rng(seed_of(seed))
        # the paper's tooth: fine grain (2-3 px), a coarser mottle, and a few fibres
        fine = noise2(h, w, 2.6, rng, 2)
        # the tooth runs a little one way (the paper's making), in clumps rather than salt
        aniso = cv2.resize(noise2(h, max(8, int(w / 1.7)), 2.4, rng, 2), (w, h), interpolation=cv2.INTER_CUBIC)
        mid = noise2(h, w, 9.0, rng, 2)
        grain = 0.55 * fine + 0.2 * aniso + 0.25 * mid
        grain = 1 / (1 + np.exp(-(grain - 0.5) * 5))          # plateaus of tooth and hollows
        fib = np.zeros((h, w), np.float32)
        for _ in range(int(w * h / 900)):
            x, y = rng.random() * w, rng.random() * h
            a, L = rng.random() * math.pi, 4 + rng.random() * 14
            cv2.line(fib, (int(x), int(y)), (int(x + L * math.cos(a)), int(y + L * math.sin(a))), float(0.25 + 0.5 * rng.random()), 1, cv2.LINE_AA)
        grain = np.clip(grain + 0.18 * cv2.GaussianBlur(fib, (0, 0), 0.6), 0, 1)
        lo, hi = np.percentile(grain, (0.5, 99.5))
        self.grain = np.clip((grain - lo) / (hi - lo), 0, 1).astype(np.float32)
        # the tooth as a broad stick feels it: coarser, softer (a fine point finds every pore)
        g2 = cv2.GaussianBlur(self.grain, (0, 0), 1.3)
        lo, hi = np.percentile(g2, (0.5, 99.5))
        self.grain_soft = np.clip((g2 - lo) / (hi - lo), 0, 1).astype(np.float32)
        self.mottle = noise2(h, w, 140.0, rng, 3)             # the sheet's own slight unevenness
        z = lambda: np.zeros((h, w), np.float32)
        self.coal, self.coal_held = z(), z()
        self.lead, self.lead_held = z(), z()
        self.worn = z()
        self._feet = OrderedDict()           # each mark's footprint, made once (see _foot)

    # ---- state ----
    def copy(self):
        other = Sheet.__new__(Sheet)
        other.__dict__.update({k: (v.copy() if isinstance(v, np.ndarray) else v) for k, v in self.__dict__.items()})
        return other

    def arrays(self):
        return {'coal': self.coal, 'coal_held': self.coal_held, 'lead': self.lead, 'lead_held': self.lead_held, 'worn': self.worn}

    def save(self, path):
        # (float32: a half-float round trip changed 5,313 pixels of a frame: the technical artist)
        np.savez_compressed(path, **{k: v.astype(np.float32) for k, v in self.arrays().items()})

    def load(self, path):
        d = np.load(path)
        for k in self.arrays():
            setattr(self, k, d[k].astype(np.float32))

    # ---- marks ----
    # Each mark's footprint is made once, for its whole length, every pixel tagged with how far
    # along the mark it lies; a frame lays only the pixels whose part of the length has come since
    # the last. The parts tile, so a mark made over twelve frames is the mark made at once (made
    # piece by piece, each piece's round ends stamped the eraser's sweep into a row of discs).
    def _foot(self, key, make):
        f = self._feet.get(key)
        if f is None:
            f = make()
            self._feet[key] = f
            if len(self._feet) > 1500:
                self._feet.popitem(last=False)
        else:
            self._feet.move_to_end(key)
        return f

    @staticmethod
    def _part(along, upto):
        a, b = upto
        if a <= 0 and b >= 1:
            return 1.0
        sel = along >= a if a > 0 else np.ones(along.shape, bool)
        if b < 1:
            sel &= along < b
        return sel.astype(np.float32)

    def stroke(self, name, pts, tool, pressure=None, upto=(0.0, 1.0), size=1.0):
        """A mark along `pts` (N x 2, px), its pressure along it (N, 0..1); `upto`: the part of
        its length laid now (from, to, as fractions)."""
        if upto[1] <= upto[0]:
            return
        T = TOOLS[tool]
        def make():
            q = np.asarray(pts, np.float32)
            if len(q) < 2:
                return None
            rng = np.random.default_rng(seed_of(name))
            n = len(q)
            p = np.ones(n, np.float32) if pressure is None else np.asarray(pressure, np.float32)
            if len(p) != n:
                p = np.interp(np.linspace(0, 1, n), np.linspace(0, 1, len(p)), p).astype(np.float32)
            seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(q, axis=0), axis=1))]
            if seg[-1] < 1:
                return None
            # the hand: pressure wanders a little along the stroke (fixed for this stroke)
            wob = np.interp(seg, np.linspace(0, seg[-1], 8), 1 + T['wander'] * (rng.random(8) - 0.5) * 2)
            p = np.clip(p * wob, 0.02, 1.2)
            width = T['width'] * size * (T['wmin'] + (1 - T['wmin']) * p)
            m, along, box = self._mask(q, width, T['soft'], values=p)
            if m is None:
                return None
            x0, y0, x1, y1 = box
            g = (self.grain_soft if T.get('soft_tooth') else self.grain)[y0:y1, x0:x1]
            press = np.clip(m, 0, 1.2)
            # the tooth: a light mark catches only the peaks
            reach = np.clip((g - (1 - press * T['bite'])) / T['tooth'] + 0.5, 0, 1)
            dep = T['flow'] * np.minimum(m, 1) * (T['even'] + (1 - T['even']) * reach)
            if T['ragged']:
                r = noise2(y1 - y0, x1 - x0, 2.2, rng, 2)
                edge = np.clip(1 - np.minimum(m, 1) / max(1e-3, press.max()), 0, 1)
                dep *= np.clip(1.2 - T['ragged'] * r * (0.4 + 1.8 * edge), 0, 1)
            if T.get('dust'):
                # charcoal sheds: a faint grey around the mark
                dep = dep + T['dust'] * cv2.GaussianBlur(dep, (0, 0), 2.2 + T['width'] * 0.25)
            return dep.astype(np.float32), along, box
        f = self._foot(('s', digest(name, tool, size, pts, pressure if pressure is not None else 'none')), make)
        if f is None:
            return
        dep, along, (x0, y0, x1, y1) = f
        dep = dep * self._part(along, upto)
        # a worn place takes the next mark darker (its fibres are raised)
        dep = dep * (1 + 0.6 * self.worn[y0:y1, x0:x1])
        if T['pigment'] == 'coal':
            c = self.coal[y0:y1, x0:x1]
            c += dep * (1 - 0.35 * np.clip(c, 0, 2))
            self.coal_held[y0:y1, x0:x1] += dep * T['held']
        else:
            c = self.lead[y0:y1, x0:x1]
            c += dep * (1 - 0.45 * np.clip(c, 0, 2))
            self.lead_held[y0:y1, x0:x1] += dep * T['held']

    def erase(self, name, pts, width, strength=0.85, upto=(0.0, 1.0), drag=0.25):
        """An eraser along `pts`: lifts most loose pigment from the peaks, less from the valleys,
        little of what is ground in; drags some along its way; roughs the paper."""
        if upto[1] <= upto[0]:
            return
        def make():
            q = np.asarray(pts, np.float32)
            seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(q, axis=0), axis=1))]
            if seg[-1] < 1:
                return None
            q = np.stack([np.interp(np.linspace(0, seg[-1], int(seg[-1] / 2) + 2), seg, q[:, k]) for k in (0, 1)], 1).astype(np.float32)
            m, along, box = self._mask(q, np.full(len(q), width, np.float32), 0.45)
            if m is None:
                return None
            x0, y0, x1, y1 = box
            rng = np.random.default_rng(seed_of(name))
            # pressed hardest mid-stroke, easing off at the reversals
            m = np.minimum(m, 1) * strength * (0.45 + 0.55 * np.sin(np.pi * np.clip(along, 0, 1)))
            # uneven contact: the hand's pressure wanders slowly, the rubber's edge quickly
            hh, ww = y1 - y0, x1 - x0
            contact = 0.6 + 0.4 * noise2(hh, ww, 40.0, rng, 2) * (0.4 + 0.6 * noise2(hh, ww, 6.0, rng, 2))
            lift = m * contact * (0.55 + 0.45 * self.grain[y0:y1, x0:x1])      # more from the peaks
            # what it drags it lays down at the end of its stroke (crumbs and a dark end)
            tail = np.clip((along - 0.85) / 0.15, 0, 1)
            d = q[-1] - q[max(0, len(q) - 6)]
            ang = math.degrees(math.atan2(d[1], d[0])) if np.linalg.norm(d) > 1 else 0.0
            return lift.astype(np.float32), (m * contact).astype(np.float32), tail.astype(np.float32), along, box, ang
        f = self._foot(('e', digest(name, width, strength, pts)), make)
        if f is None:
            return
        lift, rub, tail, along, (x0, y0, x1, y1), ang = f
        sel = self._part(along, upto)
        lift, rub = lift * sel, rub * sel
        for arr, held in ((self.coal, self.coal_held), (self.lead, self.lead_held)):
            loose = arr[y0:y1, x0:x1]
            taken = loose * lift
            loose -= taken
            # a little is ground in by the rubbing; a little is dragged along and laid down again
            held[y0:y1, x0:x1] += taken * 0.05
            held[y0:y1, x0:x1] *= 1 - 0.18 * rub
            if drag > 0:
                loose += _streak(taken * tail, ang, 8, forward=True) * drag
        self.worn[y0:y1, x0:x1] = np.minimum(1.0, self.worn[y0:y1, x0:x1] + 0.35 * rub)

    def smudge(self, name, pts, width, amount=0.6, upto=(0.0, 1.0)):
        """A finger or a rag along `pts`: pigment pushed the way it moves and spread into a grey,
        some of it ground in."""
        if upto[1] <= upto[0]:
            return
        def make():
            q = np.asarray(pts, np.float32)
            seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(q, axis=0), axis=1))]
            if seg[-1] < 1:
                return None
            q = np.stack([np.interp(np.linspace(0, seg[-1], int(seg[-1] / 2) + 2), seg, q[:, k]) for k in (0, 1)], 1).astype(np.float32)
            m, along, box = self._mask(q, np.full(len(q), width, np.float32), 0.8, pad=int(width * 1.5) + 12)
            if m is None:
                return None
            d = q[-1] - q[0]
            ang = math.degrees(math.atan2(d[1], d[0])) if np.linalg.norm(d) > 1 else 0.0
            return (np.minimum(m, 1) * amount).astype(np.float32), along, box, ang
        f = self._foot(('m', digest(name, width, amount, pts)), make)
        if f is None:
            return
        m, along, (x0, y0, x1, y1), ang = f
        m = m * self._part(along, upto)
        for arr, held in ((self.coal, self.coal_held), (self.lead, self.lead_held)):
            loose = arr[y0:y1, x0:x1]
            moved = cv2.GaussianBlur(_streak(loose, ang, width * 0.9), (0, 0), max(1.0, width * 0.12))
            new = loose * (1 - m) + moved * m * 0.92
            held[y0:y1, x0:x1] += (loose - new).clip(0) * 0.08 + new * m * 0.04
            loose[:] = new

    def _mask(self, pts, width, soft, pad=None, values=None):
        """A coverage mask of a polyline whose width varies along it (px), its value the pressure
        (so the deposit can read it), and each pixel's place along the line (0..1). Drawn at 2x."""
        r = float(width.max()) / 2 + 3
        pad = int(r + 4) if pad is None else pad
        x0 = int(max(0, math.floor(pts[:, 0].min() - pad)))
        y0 = int(max(0, math.floor(pts[:, 1].min() - pad)))
        x1 = int(min(self.w, math.ceil(pts[:, 0].max() + pad)))
        y1 = int(min(self.h, math.ceil(pts[:, 1].max() + pad)))
        if x1 <= x0 or y1 <= y0:
            return None, None, None
        S = 2
        m = np.zeros(((y1 - y0) * S, (x1 - x0) * S), np.float32)
        al = np.zeros_like(m)
        q = (pts - [x0, y0]) * S
        seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]
        L = max(seg[-1], 1e-6)
        wmax = float(width.max())
        for i in range(len(q) - 1):
            wi = (width[i] + width[i + 1]) / 2
            th = max(1, int(round(wi * S)))
            val = 1.0 if values is None else float(min(1.2, (values[i] + values[i + 1]) / 2))
            p0 = (int(round(q[i, 0] * 4)), int(round(q[i, 1] * 4)))
            p1 = (int(round(q[i + 1, 0] * 4)), int(round(q[i + 1, 1] * 4)))
            cv2.line(m, p0, p1, val, th, cv2.LINE_AA, shift=2)
            cv2.line(al, p0, p1, float((seg[i] + seg[i + 1]) / 2 / L) + 1e-4, th + 2, cv2.LINE_8, shift=2)
        m = cv2.resize(m, (x1 - x0, y1 - y0), interpolation=cv2.INTER_AREA)
        al = cv2.resize(al, (x1 - x0, y1 - y0), interpolation=cv2.INTER_NEAREST)
        if soft > 0:
            m = cv2.GaussianBlur(m, (0, 0), max(0.4, soft * wmax * 0.18))
        # the soft edge beyond the line belongs to the nearest part of it
        k = int(max(3, soft * wmax * 0.6 + 4)) | 1
        grown = cv2.dilate(al, np.ones((k, k), np.uint8))
        al = np.where(al > 0, al, grown)
        return m, al, (x0, y0, x1, y1)

    # ---- the picture ----
    def density(self):
        """How dark the sheet is (optical density, per unit as render() uses for charcoal)."""
        dl = self.lead + self.lead_held
        return (self.coal + self.coal_held) + GRAPHITE_MAX * (1 - np.exp(-dl / GRAPHITE_MAX)) * (GRAPHITE_K.mean() / CHARCOAL_K.mean())

    def render(self, light=1.0):
        """The sheet as seen: paper, its wear, and the pigment on it (float RGB 0..1)."""
        if getattr(self, '_paper', None) is None:
            g = (0.965 + 0.035 * self.grain) * (0.985 + 0.03 * self.mottle)
            self._paper = [(g * PAPER_RGB[c]).astype(np.float32) for c in range(3)]
            self._hollow = (0.012 + 0.02 * (1 - self.grain)).astype(np.float32)
        # (an eraser on clean paper leaves almost nothing: the nap raised, a shade greyer in the hollows)
        wear = 1 - self._hollow * self.worn
        dc = self.coal + self.coal_held
        dl = self.lead + self.lead_held
        dl = GRAPHITE_MAX * (1 - cv2.exp(-dl / GRAPHITE_MAX))
        out = [self._paper[c] * wear * cv2.exp(-(CHARCOAL_K[c] * dc + GRAPHITE_K[c] * dl)) for c in range(3)]
        return np.clip(cv2.merge(out) * light, 0, 1)

    def write(self, path, light=1.0):
        rgb = self.render(light)
        cv2.imwrite(path, (rgb[..., ::-1] * 255 + 0.5).astype(np.uint8))


def _streak(a, ang_deg, length, forward=False):
    """`a` smeared along a direction (a line kernel), as an eraser or a finger drags; `forward`:
    only ahead, the way it moves."""
    L = max(3, int(length) | 1)
    k = np.zeros((L, L), np.float32)
    c = L // 2
    dx, dy = math.cos(math.radians(ang_deg)), math.sin(math.radians(ang_deg))
    # (filter2D correlates: the kernel's offsets point back to where the pigment comes from)
    back = 0 if forward else 1
    cv2.line(k, (int(c - dx * c), int(c - dy * c)), (int(c + dx * c * back), int(c + dy * c * back)), 1.0, 1, cv2.LINE_AA)
    k /= k.sum()
    return cv2.filter2D(a, -1, k, borderType=cv2.BORDER_CONSTANT)


# width (px at 1280 wide), how much it lays down, how strongly the grain breaks it, ...
TOOLS = {
    # a soft pencil (2B): fine, grey, fairly continuous
    'pencil': dict(pigment='lead', width=1.6, wmin=0.55, flow=0.55, bite=0.95, tooth=0.30, even=0.35, ragged=0.0, held=0.10, soft=0.25, wander=0.18),
    # a hard pencil for the first construction lines (2H): faint
    'hardpencil': dict(pigment='lead', width=1.1, wmin=0.6, flow=0.22, bite=0.8, tooth=0.30, even=0.30, ragged=0.0, held=0.12, soft=0.2, wander=0.15),
    # vine charcoal's point: a dark, broken, ragged line
    'charcoal': dict(pigment='coal', width=4.2, wmin=0.35, flow=0.62, bite=1.0, tooth=0.35, even=0.45, ragged=0.45, held=0.17, soft=0.22, wander=0.3, dust=0.10),
    # compressed charcoal pressed hard: the heaviest accents
    'compressed': dict(pigment='coal', width=5.0, wmin=0.4, flow=1.0, bite=1.15, tooth=0.28, even=0.2, ragged=0.35, held=0.2, soft=0.2, wander=0.22, dust=0.08),
    # the stick on its side: a broad, grainy tone
    'side': dict(pigment='coal', width=24.0, wmin=0.75, flow=0.17, bite=0.85, tooth=0.55, even=0.5, ragged=0.08, held=0.03, soft=0.6, wander=0.35, dust=0.12, soft_tooth=True),
    # the same on a figure: firmer edged, each stroke legible (the technical artist, Proof A2)
    'side_firm': dict(pigment='coal', width=24.0, wmin=0.75, flow=0.2, bite=0.85, tooth=0.5, even=0.45, ragged=0.12, held=0.03, soft=0.3, wander=0.35, dust=0.08),
}
