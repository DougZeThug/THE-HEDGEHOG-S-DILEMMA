"""The exposure sheet of "Almost": which pose each frame (24 a second) photographs.

Each figure has its own track: a list of drawings (key poses and the in-betweens between them),
each held for some frames. Ordinary movement is on twos; the startle is on ones; breaths are on
fours; holds are long. A frame's pose is the two figures' drawings at that frame; a frame whose
pair is unchanged is the same photograph again (it is not rendered twice).

    python3 xsheet.py            prints the sheet (pure Python: no Blender needed)
"""
import json
import math
import sys

FPS = 24


def ease(t, kind):
    if kind == 'in':           # slow out of the last pose
        return t * t
    if kind == 'out':          # slow into the next
        return 1 - (1 - t) * (1 - t)
    if kind == 'inout':
        return t * t * (3 - 2 * t)
    return t


class Track:
    """One figure's drawings: (name of the key poses it lies between, how far, frames held)."""

    def __init__(self, start):
        self.cur = start
        self.drawings = []            # (from_key, to_key, t, frames, note)

    @property
    def frames(self):
        return sum(d[3] for d in self.drawings)

    def hold(self, frames, note=''):
        if frames > 0:
            self.drawings.append((self.cur, self.cur, 1.0, frames, note))
        return self

    def to_frame(self, frame, note=''):
        """Hold until `frame`."""
        return self.hold(frame - self.frames, note)

    def move(self, key, n, frames=2, kind='inout', note='', spacing=None):
        """`n` drawings from the current pose to `key`, each held `frames` (a number or a list);
        `spacing` (a list of fractions) overrides the ease."""
        f = frames if isinstance(frames, (list, tuple)) else [frames] * n
        for i in range(n):
            t = spacing[i] if spacing else ease((i + 1) / n, kind)
            self.drawings.append((self.cur, key, round(t, 4), f[i], note if i == 0 else ''))
        self.cur = key
        return self

    def at(self, frame):
        """The drawing showing at `frame` (its index)."""
        acc = 0
        for i, d in enumerate(self.drawings):
            acc += d[3]
            if frame < acc:
                return i
        return len(self.drawings) - 1


def sheet():
    """The performance, beat by beat (frames at 24 a second; the cinematic and creative directors'
    reviews of 2026-10-20 set the spacing, the skeptic's cut it). The film's clock starts once the
    visitor is inside: its first frame is held on the wall while the fibres and the colour come, so
    "together" on the sheet is short."""
    a, b = Track('together'), Track('together')
    # 1. together (0-2.5 s): still, as they have sat many evenings; one slow breath of his, deep
    # enough to be seen (in over four drawings on fours, out over five)
    a.hold(8, 'together').move('breathe', 4, 4, 'inout').move('together', 5, 4, 'inout')
    # 2. noticing (2.5 s): his eyes, then his head, go from his cup to the fold on her sleeve, and
    # stay there
    a.to_frame(60).move('notice', 6, 2, 'out', 'noticing')
    # 3. reaching (3.75 s): the wrist lifts first; across in goes; a hesitation in which the fingers
    # draw in a little; on; low and level from his side to the fold
    a.to_frame(90).move('lift', 5, 2, 'in', 'reach')
    a.move('rise', 3, 2, 'linear').move('carry', 3, 2, 'linear').move('hesitate', 4, [2, 2, 2, 3], 'out')
    a.hold(6, 'hesitation').move('hesitate curl', 1, 6, 'linear')
    a.move('approach', 5, 2, 'inout').move('near', 4, [2, 2, 3, 3], 'out').hold(1)
    a.move('touch', 2, 2, 'out', 'touch')                       # fingertip on the fold from 156
    # 4. the corner rises under his fingertip, one drawing after the other; then, on ones, she
    # starts (a blink, the flinch, the arm snatched back), and lays her arm down again nearer her
    a.move('lift1', 1, 2, 'linear').move('lift2', 1, 4, 'linear')
    b.to_frame(158).move('touched half', 1, 2, 'linear', 'contact').move('touched', 1, 4, 'linear')
    b.move('startle1', 1, 1, 'linear', 'startle').move('startle2', 1, 1, 'linear').move('startle3', 1, 2, 'linear')
    b.move('settle', 2, 2, 'out').move('withdrawn', 2, 3, 'inout')
    # 5. realisation: on her second frame his fingertips come off the cloth, on ones (contact breaks
    # from both sides), and his hand stays there in the air; then back across the table a little
    # quicker than it came (reluctant to start), turned along the edge and slipped down past it
    # into his lap
    a.to_frame(165).move('reflex', 2, 1, note='his hand off the cloth', spacing=[0.85, 1.0])
    a.to_frame(212, 'suspended').move('back1', 4, 2, 'in', 'withdraws').move('back2', 3, 3, 'linear')
    a.move('back3', 3, 2, 'linear').move('turn', 2, 2, 'linear').move('edge', 2, 2, 'linear').move('slip', 2, 2, 'linear')
    a.move('lap left', 4, 2, 'out', 'into his lap')
    # (silence: nothing moves, 255-295; the fridge goes on)
    # 6. she looks at him, then lifts her arm, a hesitation in the air, and lays it down nearer him
    b.to_frame(295).move('look', 6, 2, 'inout', 'she looks at him')
    b.to_frame(343).move('offer1', 8, 2, 'inout', 'the offer')
    b.hold(16, 'hesitation').move('offer2', 8, 2, 'inout')
    # 7. too late: his hand stays in his lap; one slow breath, and at its top his head turns a few
    # degrees toward her (the almost), held; then back, and nothing follows
    a.to_frame(415).move('lap breathe', 4, 4, 'inout', 'too late').hold(12).move('lap left', 5, 4, 'inout')
    # 8. almost: four seconds after her offer her eyes go down to the table between them; they sit
    b.to_frame(487).move('lower', 12, 2, 'inout', 'almost')
    end = 679
    a.to_frame(end)
    b.to_frame(end)
    return a, b, end


def frames():
    """[(frame, a drawing, b drawing)] and the unique pairs in order of first use."""
    a, b, end = sheet()
    out, unique = [], {}
    for f in range(end):
        pair = (a.at(f), b.at(f))
        if pair not in unique:
            unique[pair] = len(unique)
        out.append((f, pair, unique[pair]))
    return a, b, out, unique


def describe():
    a, b, out, unique = frames()
    print(f'{len(out)} frames ({len(out) / FPS:.1f} s), {len(unique)} photographs')
    for name, tr in (('A', a), ('B', b)):
        f = 0
        for d in tr.drawings:
            if d[4]:
                print(f'  {name} {f / FPS:5.2f}s  {d[4]}')
            f += d[3]
    holds = {}
    for _, pair, u in out:
        holds[u] = holds.get(u, 0) + 1
    hist = {}
    for v in holds.values():
        hist[v] = hist.get(v, 0) + 1
    print('photographs held for n frames:', dict(sorted(hist.items())))


if __name__ == '__main__':
    describe()
