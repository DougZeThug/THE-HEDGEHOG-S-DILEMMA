"""The film of "Things I Should Have Said" (docs/things.md): its exposure sheet, as moves on one
sheet (film.py), and the sound made from the same marks (foley.py).

    python3 scripts/things/story.py REF_DIR OUT_DIR [--scale 0.5] [--mix eraser|eraser-only|full]

REF_DIR holds scene.py's references for every pose named below. Writes OUT_DIR/things.mp4 (with
its sound), OUT_DIR/foley-*.wav, and OUT_DIR/sheet.json (every mark's time: the order map and the
sound are made from it).

    0-6      the goodbye drawn on the bare sheet
    6-14     what happened: her small wave; he goes, the bag lifted, and does not look back
    14-17    the door swings shut on its closer; the latch
    17-30    his almost, in line: the eraser lifts the shut door; he comes back to the jamb, his
             hand on it (the casing drawn again there), holds, is taken back
    30-41    her almost, in line, out of her own figure: half a step, her hand rising toward where
             his collar was; taken back from the hand
    41-46    she is erased
    46-54    the empty doorway, worked
"""
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import draw  # noqa: E402
import film  # noqa: E402
import foley  # noqa: E402
from timeline import Timeline  # noqa: E402

POSES = ['goodbye', 'going1', 'going2', 'going3', 'going4', 'door0', 'door1', 'door2', 'door3', 'door4', 'shut', 'jamb', 'collar', 'empty']
LATCH = 14.6


def build(ref_dir):
    R = {p: draw.load(ref_dir, p) for p in POSES}
    tl = Timeline(draw.W, draw.H, 'things')
    # the goodbye drawn on the bare sheet
    t = film.draw_on(tl, R['goodbye'], 'goodbye', 0.0, 6.0)
    # what happened: the wave and his going, a drawing every 0.6 s; the door on its closer
    t = 8.0
    keys = ['goodbye', 'going1', 'going2', 'going3', 'going4', 'door0']
    for a, b in zip(keys, keys[1:]):
        film.step(tl, R[a], R[b], t, prefix=f'real/{b}')
        t += 0.6
    for a, b in zip(['door0', 'door1', 'door2', 'door3'], ['door1', 'door2', 'door3', 'shut']):
        film.step(tl, R[a], R[b], t, people=('older',), door=True, prefix=f'real/{b}', dur=0.3)
        t += 0.55
    # (the latch: when the door is home)
    # his almost: the shut door lifted, not drawn open; him in line at the jamb, the hand first
    t = 17.0
    door = R['shut']['ids'] == 7
    t = film.erase_figure(tl, R['shut'], 'door', 'c1/door', t, 1.4, order='x+', region=door, strength=0.7, skip=0.25)
    hand = film.hand_of(R['jamb'], 'young', 'R')
    t = film.redraw(tl, R['jamb'], 'young', 'c1/jamb', t + 0.3, lines=3.6, hand=hand, line_only=True)
    t = film.restate(tl, R['jamb'], 'c1/casing', t, hand) + 2.4
    t = film.take_back(tl, R['jamb'], 'young', 'R', 'c1/back', t, 1.6)
    t = film.erase_figure(tl, R['jamb'], 'young', 'c1/out', t, 1.6, strength=0.88, skip=0.2) + 0.8
    # her almost: in line, stepping out of her own figure toward the doorway
    hand = film.hand_of(R['collar'], 'older', 'R')
    t = film.redraw(tl, R['collar'], 'older', 'c2/collar', max(t, 30.0), lines=3.4, hand=hand, line_only=True,
                    region=film.delta_mask(R['shut'], R['collar'], 'older'))
    t = film.restate(tl, R['collar'], 'c2/casing', t, hand, r=90) + 2.2
    t = film.take_back(tl, R['collar'], 'older', 'R', 'c2/back', t, 2.0)
    t = film.erase_figure(tl, R['collar'], 'older', 'c2/out', t, 1.2, strength=0.7, skip=0.35,
                          region=film.delta_mask(R['shut'], R['collar'], 'older') & film.figure_mask(R['collar'], 'older', 6)) + 0.6
    # she is erased, and what is left of every almost with her; the doorway is left
    everyone = film.figure_mask(R['shut'], 'older', 6) | film.figure_mask(R['collar'], 'older', 6) | film.figure_mask(R['jamb'], 'young', 6)
    t = film.erase_figure(tl, R['shut'], 'older', 'end/all', max(t, 41.0), 4.5, order='x+', region=everyone, strength=0.9, skip=0.1)
    return tl, max(t + 8.0, 54.0)


def main():
    ref_dir, out = sys.argv[1], sys.argv[2]
    opts = dict(zip(sys.argv[3::2], sys.argv[4::2]))
    scale = float(opts.get('--scale', 0.5))
    os.makedirs(out, exist_ok=True)
    t0 = time.time()
    tl, length = build(ref_dir)
    print(f'planned {len(tl.items)} marks, {length:.1f} s, in {time.time() - t0:.0f} s', flush=True)
    with open(os.path.join(out, 'sheet.json'), 'w') as fh:
        json.dump({'length': length, 'events': [['latch', LATCH]],
                   'items': [{'t0': round(a, 4), 't1': round(b, 4), 'mark': m} for a, b, m in tl.items]}, fh)
    items = list(tl.items)
    for mix in ('eraser', 'eraser-only', 'full'):
        foley.write(os.path.join(out, f'foley-{mix}.wav'), foley.foley(items, length, [('latch', LATCH)], mix_name=mix))
    tl.render(os.path.join(out, 'things.mp4'), until=length, scale=scale, audio=os.path.join(out, f'foley-{opts.get("--mix", "eraser")}.wav'))
    print(f'rendered in {time.time() - t0:.0f} s', flush=True)


if __name__ == '__main__':
    main()
