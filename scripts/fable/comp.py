"""Route B of the bake-off: the pond composited in 2D from cut.py's paper layers.

Every layer is a painted card. Light is arithmetic on them: a fill and her key share the painted
value at rest (FILL_SHARE + KEY_SHARE = 1), the fox's cut edges catch the key through their baked
normals, cards in front throw blurred, offset shadows onto cards behind (offset by the depth gap
along her direction, blurred by her size), haze lifts the blacks, the shaft is added light. His
reflection is his pieces flipped about the water line. Poses and light come from timeline.py, the
same numbers stage.py gives Blender.

Usage: python -I scripts/fable/comp.py [--out DIR] [--size 864x1080] [--still T ...] [--clip]
"""
import argparse
import json
import math
import os
import sys
import time

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import timeline as tl  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PIECES = os.path.join(ROOT, 'test-output', 'fable', 'pieces')
CROP = (40, 0, 442, 503)  # panel px: the 4:5 column of panel 2
RIM = 0.7  # how much a cut edge facing her gains
LUMA = np.array([0.2126, 0.7152, 0.0722], np.float32)
REFLECT = 0.3  # how much of his light the water gives back
WATER_TINT = np.array([0.90, 0.95, 1.10], np.float32)  # and a little cooler
CREEP = 1.8  # the creep's glints: added light, at her gain


def load(name):
    return np.asarray(Image.open(os.path.join(PIECES, name))).astype(np.float32) / 255


def linear(c):
    """Light adds and multiplies in linear light, as it does in Blender."""
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4).astype(np.float32)


def display(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


class Stage:
    def __init__(self):
        self.meta = json.load(open(os.path.join(PIECES, 'pieces.json')))
        self.S = self.meta['scale']
        self.W, self.H = self.meta['frame_px']
        self.layers = []
        for L in self.meta['layers']:
            rgba = load(L['file'])
            rec = dict(L, rgb=linear(rgba[..., :3]), a=rgba[..., 3].copy())
            if 'normal' in L:
                n = load(L['normal']) * 2 - 1
                rec['n'] = n
            self.layers.append(rec)
        self.by = {L['name']: L for L in self.layers}
        self.haze = load('haze.png')
        self.shaft = load('shaft.png')
        kx, ky, kz = tl.KEY_DIR
        k = math.sqrt(kx * kx + ky * ky + kz * kz)
        self.key = (kx / k, ky / k, kz / k)
        # The key's direction on screen (x right, y down) for edges, and its fall per mm of depth.
        self.key_screen = np.array([self.key[0], -self.key[2]], np.float32)
        self.key_screen /= np.linalg.norm(self.key_screen)
        self.shadow_per_mm = (-self.key[0] / -self.key[1], self.key[2] / -self.key[1])  # (dx, dy) px / mm

    def depth(self, L):
        n = L['name']
        if n.startswith('mud_'):
            return tl.mud_z(n)
        if n.startswith('fox_') or n.startswith('pin'):
            return tl.Z['pin'] if n.startswith('pin') else tl.Z[n]
        if n.startswith('creep'):
            return tl.Z['creep']
        if n.startswith('moon_refl'):
            return tl.Z['moon_refl']
        return tl.Z[n]

    def place(self, L, m=None):
        """The layer in the crop (rgb, alpha, normal or None), moved by m (2×3, panel px)."""
        S = self.S
        ox, oy = L['origin']
        if m is None:
            m = [[1, 0, 0], [0, 1, 0]]
        # crop px ← layer px: x_c = S * (A @ (ox + x/S, oy + y/S) + b) - crop origin
        A = np.array([[m[0][0], m[0][1]], [m[1][0], m[1][1]]], np.float64)
        b = np.array([m[0][2], m[1][2]], np.float64)
        M = np.zeros((2, 3), np.float64)
        M[:, :2] = A
        M[:, 2] = S * (A @ np.array([ox, oy]) + b) - np.array(self.c0)
        args = dict(dsize=self.csize, flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        rgb = cv2.warpAffine(L['rgb'], M, **args)
        a = cv2.warpAffine(L['a'], M, **args)
        n = None
        if 'n' in L:
            n = cv2.warpAffine(L['n'][..., :2], M, **args)
            # turn the normals with the piece (A's rotation; a mirror flips y)
            nx, ny = n[..., 0], -n[..., 1]  # map space (y up) → screen (y down)
            sx = A[0, 0] * nx + A[0, 1] * ny
            sy = A[1, 0] * nx + A[1, 1] * ny
            n = np.dstack([sx, sy])
        return rgb, a, n

    def frame(self, t, crop=CROP, size=None):
        S = self.S
        x0, y0, x1, y1 = [round(v * S) for v in crop]
        self.c0, self.csize = (x0, y0), (x1 - x0, y1 - y0)
        W, H = self.csize
        lt = tl.light(t)
        places = tl.placements(t, self.meta['layers'])
        fill = tl.FILL_SHARE * lt['fill']
        key = tl.KEY_SHARE * lt['key']
        soft = math.radians(3.0 * lt['key_size'])  # her angular size, as stage.py gives the sun

        # Everything on the frame, back to front, with depth for shadows.
        stack = []
        for L in self.layers:
            n = L['name']
            if n in ('moon_refl', 'moon_refl_soft') or n.startswith('creep'):
                continue
            m = places.get(n)
            rgb, a, nm = self.place(L, m)
            if n.startswith('mud'):
                a = a * lt['mud']
            stack.append((self.depth(L), n, rgb, a, nm, L['kind']))
        stack.sort(key=lambda s: s[0])

        # His reflection: the fox, mud and all, flipped about the water line and broken into the
        # water's strips.
        refl_rgb = np.zeros((H, W, 3), np.float32)
        refl_a = np.zeros((H, W), np.float32)
        if lt['refl_fox'] > 0.001:
            for L in sorted((L for L in self.layers if L['kind'] == 'fox'), key=self.depth):
                rgb, a, _ = self.place(L, tl.mirror(places[L['name']]))
                if L['name'].startswith('mud'):
                    a = a * lt['mud']
                refl_rgb = refl_rgb * (1 - a[..., None]) + rgb * a[..., None]
                refl_a = refl_a * (1 - a) + a
            refl_rgb, refl_a = self._ripple(refl_rgb, refl_a, t)

        # Shadows are soft, so they are worked at half size.
        half = (W // 2, H // 2)
        small = {n: cv2.resize(a, half, interpolation=cv2.INTER_AREA) for z, n, _, a, _, _ in stack}
        out = np.zeros((H, W, 3), np.float32)
        for z, n, rgb, a, nm, kind in stack:
            if n == 'plate':
                out = rgb * (fill + key)
                continue
            # light on this card: fill + key × (shadow from every card in front) × edge
            shade = np.ones(half[::-1], np.float32)
            for z2, n2, _, _, _, k2 in stack:
                gap = z2 - z
                if gap <= 0.5 or n2 == 'water' or gap > 25 or n in ('reeds_r',):
                    continue
                dx, dy = self.shadow_per_mm[0] * gap * S / 2, self.shadow_per_mm[1] * gap * S / 2
                sh = cv2.warpAffine(small[n2], np.float32([[1, 0, dx], [0, 1, dy]]), half)
                sigma = max(0.4, (gap * soft * S * 0.5 + 0.5) / 2)
                sh = cv2.GaussianBlur(sh, (0, 0), sigma)
                shade *= 1 - 0.92 * sh
            shade = cv2.resize(shade, (W, H), interpolation=cv2.INTER_LINEAR)
            k_term = key * shade
            if nm is not None:
                facing = nm[..., 0] * self.key_screen[0] + nm[..., 1] * self.key_screen[1]
                tilt = np.sqrt(nm[..., 0] ** 2 + nm[..., 1] ** 2)
                k_term = k_term * (1 + RIM * facing / max(1e-3, 1.0)) * (1 - 0.15 * tilt)
            lit = rgb * (fill + k_term)[..., None]
            out = out * (1 - a[..., None]) + lit * a[..., None]
            if n == 'water':
                # her reflection and his, on the water and under the reeds that stand in it
                out = self._reflections(out, t, lt, refl_rgb, refl_a, a, fill + key)

        # Haze lifts the blacks; the shaft is added light.
        h = lt['haze'] * tl.HAZE_AMOUNT * self.haze[y0:y1, x0:x1]
        out = out * (1 - h[..., None]) + np.array(tl.HAZE_RGB, np.float32) * h[..., None] * (0.6 + 0.4 * lt['key'])
        out = out + np.array(tl.SHAFT_RGB, np.float32) * (lt['shaft'] * tl.SHAFT_AMOUNT
                                                          * self.shaft[y0:y1, x0:x1])[..., None]
        if size:
            out = cv2.resize(out, size, interpolation=cv2.INTER_AREA)
        return display(out)

    def _ripple(self, rgb, a, t):
        """Break a reflection into the water's horizontal strips, as the panel breaks hers: each slid
        a little sideways (more the nearer the lens), so its edges go ragged; taller strips toward
        the lens, and fainter with depth."""
        H, W = a.shape
        S = self.S
        d = np.maximum((np.arange(H, dtype=np.float32) + self.c0[1]) / S - tl.WATER_LINE, 0)
        n = np.floor(25 * np.log1p(0.016 * d))  # strip number: 2.5 px tall at the line, taller by 4% of the depth
        shift = (S * (0.8 + 0.015 * d) * np.sin(2.3 * n + 0.8 * t)).astype(np.float32)
        mx = np.arange(W, dtype=np.float32)[None, :] - shift[:, None]
        my = np.repeat(np.arange(H, dtype=np.float32)[:, None], W, 1)
        args = dict(interpolation=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)
        rgb = cv2.remap(rgb, mx, my, **args)
        a = cv2.remap(a, mx, my, **args)
        return rgb, a * (1 - 0.4 * np.clip(d / 110, 0, 1)).astype(np.float32)[:, None]

    def _reflections(self, out, t, lt, refl_rgb, refl_a, water_a, light):
        if lt['refl_fox'] > 0.001:
            # as lit as he is, darker and a little cooler in the water; the water's own glints stay
            # over him
            grey = (refl_rgb * LUMA).sum(2, keepdims=True)
            col = (refl_rgb * 0.6 + grey * 0.4) * WATER_TINT * (REFLECT * light)
            glint = np.clip(((out * LUMA).sum(2) - 0.05) / 0.15, 0, 1)
            f = (refl_a * water_a * lt['refl_fox'] * (1 - 0.8 * glint))[..., None]
            out = out * (1 - f) + col * f
        # the soft copy with its own blurred colour, under the sharp one, each at its share
        g, s = lt['moon_gain'], lt['moon_soft']
        for name, share in (('moon_refl_soft', s), ('moon_refl', 1 - s)):
            rgb, a, _ = self.place(self.by[name])
            f = (a * share)[..., None]
            out = out * (1 - f) + rgb * g * f
        for L in self.layers:
            if L['name'].startswith('creep'):
                c = lt['creep'][L['order']]
                if c > 0.001:
                    # each glint slides its last few px toward his bank as it comes, then shimmers
                    rgb, ca, _ = self.place(L, [[1, 0, 6 * (1 - c)], [0, 1, 0]])
                    shimmer = 0.85 + 0.15 * math.sin(2 * math.pi * (0.7 * t + 0.37 * L['order']))
                    out = out + rgb * (ca * c * g * CREEP * shimmer)[..., None]
        return out


def save(a, path):
    Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB').save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(ROOT, 'test-output', 'fable', 'bake', 'B'))
    ap.add_argument('--size', default='864x1080')
    ap.add_argument('--still', type=float, nargs='*', default=[])
    ap.add_argument('--clip', action='store_true')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    st = Stage()
    size = tuple(int(v) for v in args.size.split('x'))
    for t in args.still:
        save(st.frame(t, size=size), os.path.join(args.out, f'still_{t:05.1f}.png'))
    if args.clip:
        fdir = os.path.join(args.out, 'frames')
        os.makedirs(fdir, exist_ok=True)
        last, times = None, []
        for f, t in tl.frames():
            path = os.path.join(fdir, f'{f:04d}.png')
            if t != last:
                t0 = time.perf_counter()
                img = st.frame(t, size=size)
                times.append(time.perf_counter() - t0)
                save(img, path)
                last, last_path = t, path
            else:
                import shutil
                shutil.copyfile(last_path, path)
        json.dump({'drawings': len(times), 'mean_s': sum(times) / len(times), 'total_s': sum(times)},
                  open(os.path.join(args.out, 'times.json'), 'w'), indent=1)
        print(f'{len(times)} drawings, mean {sum(times) / len(times):.2f} s, total {sum(times) / 60:.1f} min')


if __name__ == '__main__':
    main()
