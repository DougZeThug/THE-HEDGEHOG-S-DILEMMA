"""A film on one sheet (docs/things.md): marks laid down over time. Each mark has a start and a
length in seconds; a drawing lays on the sheet whatever part of each mark has been made since the
last drawing (a stroke drawn over half a second appears along its length, an eraser sweeps), and
nothing else, so the sheet carries everything that came before.

Drawings are made in order, on twos (12 a second, each held two frames), streamed into ffmpeg (no
frame files). The sheet is state: a drawing cannot be made out of order without it, so `state_at`
brings a sheet up to any moment without rendering (to plan the next revision on the film's own
sheet), and `render` can write checkpoints (float32) and start from one.
"""
import os
import subprocess

import cv2
import numpy as np

from paper import Sheet

FPS = 24
TWOS = 2


class Timeline:
    def __init__(self, w, h, seed='things'):
        self.w, self.h, self.seed = w, h, seed
        self.items = []           # (t0, t1, mark)

    def add(self, marks, t0, dur, each=None, overlap=0.0):
        """Lay `marks` from `t0` over `dur` seconds: one after another (each taking `each`
        seconds, or an equal share), the next starting `overlap` of the way through the last."""
        n = len(marks)
        if n == 0:
            return t0
        each = each if each is not None else dur / max(1.0, n * (1 - overlap) + overlap)
        step = each * (1 - overlap)
        t0 = max(0.0, t0)
        for i, m in enumerate(marks):
            a = t0 + i * step
            self.items.append((a, a + each, m))
        return t0 + (n - 1) * step + each

    def at_once(self, marks, t):
        for m in marks:
            self.items.append((t, t, m))
        return t

    @property
    def end(self):
        return max((t1 for _, t1, _ in self.items), default=0.0)

    def _sorted(self):
        return sorted(self.items, key=lambda r: (r[0], r[1]))

    def _advance(self, sheet, items, done, t):
        """Lay on `sheet` what has been made of each mark by time `t` and not laid yet."""
        for i, (a, b, m) in enumerate(items):
            if a > t:
                break
            frac = 1.0 if b <= a else min(1.0, max(0.0, (t - a) / (b - a)))
            prev = done.get(i, 0.0)
            if frac > prev:
                _apply_part(sheet, m, (prev, frac))
                done[i] = frac

    def state_at(self, t, sheet=None):
        """The sheet as the film shows it at time `t` (drawn on twos, exactly as `render` does)."""
        sheet = sheet or Sheet(self.w, self.h, self.seed)
        items = self._sorted()
        done = {}
        for f in range(0, int(round(t * FPS)) + 1, TWOS):
            self._advance(sheet, items, done, f / FPS)
        return sheet

    def render(self, out, until=None, scale=1.0, audio=None, checkpoints=None, every=10.0, on_drawing=None):
        """Write the film to `out` (H.264), drawing by drawing; `checkpoints`: a folder for the
        sheet every `every` seconds. Returns the number of drawings."""
        sheet = Sheet(self.w, self.h, self.seed)
        until = self.end + 1.0 if until is None else until
        items = self._sorted()
        done = {}
        ow, oh = int(round(self.w * scale)) // 2 * 2, int(round(self.h * scale)) // 2 * 2
        cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{ow}x{oh}',
               '-framerate', str(FPS / TWOS), '-i', '-']
        if audio:
            cmd += ['-i', audio, '-c:a', 'aac', '-b:a', '192k', '-shortest']
        cmd += ['-r', str(FPS), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', out]
        enc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        n = 0
        next_check = every
        if checkpoints:
            os.makedirs(checkpoints, exist_ok=True)
        for f in range(0, int(round(until * FPS)), TWOS):
            t = f / FPS                           # what has been made by this drawing's frame
            self._advance(sheet, items, done, t)
            img = sheet.render()
            if (ow, oh) != (self.w, self.h):
                img = cv2.resize(img, (ow, oh), interpolation=cv2.INTER_AREA)
            enc.stdin.write((img[..., ::-1] * 255 + 0.5).astype(np.uint8).tobytes())
            if on_drawing:
                on_drawing(n, t, sheet)
            n += 1
            if checkpoints and t >= next_check:
                sheet.save(os.path.join(checkpoints, f'{t:07.2f}.npz'))
                next_check += every
        enc.stdin.close()
        if enc.wait() != 0:
            raise RuntimeError('ffmpeg failed')
        return n


def _apply_part(sheet, m, part):
    if m['kind'] == 'stroke':
        sheet.stroke(m['name'], m['pts'], m['tool'], m.get('pressure'), upto=part, size=m.get('size', 1.0))
    elif m['kind'] == 'smudge':
        sheet.smudge(m['name'], m['pts'], m['width'], m.get('amount', 0.6), upto=part)
    elif m['kind'] == 'erase':
        sheet.erase(m['name'], m['pts'], m['width'], m.get('strength', 0.85), upto=part, drag=m.get('drag', 0.25))
