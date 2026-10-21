"""The film of "Things I Should Have Said" (docs/things.md): its exposure sheet, as moves on one
sheet (film.py), and the sound made from the same marks (foley.py).

    python3 scripts/things/story.py REF_DIR OUT_DIR [--scale 0.5] [--mix eraser-only|eraser|weight] [--erase-her 1]

REF_DIR holds scene.py's references for every pose named below. Writes OUT_DIR/things.mp4 (with
its sound), OUT_DIR/foley-*.wav, and OUT_DIR/sheet.json (every mark's time: the order map and the
sound are made from it). The ending keeps her real figure, rubbed back by half (the creative
director's ruling: the doorway is empty, the flat is not); `--erase-her`: her taken entirely too
(the brief's empty doorway, for the artist).

    0-6        the goodbye drawn on the bare sheet: the doorway's construction, the people in tone,
               their lines found last (a real person is never line alone)
    6.6, 7.3   her small wave, two rocks of the wrist
    8-10.4     he goes, the bag lifted, without looking back: four steps at full weight, each
               leaving its residue; the last behind the casing
    10.9-14.5  the door swings to on its closer, slowing; the latch, then silence
    18.5-33    his almost, in graphite: the eraser lifts the shut door; he comes back to the jamb,
               his hand on it first, the casing drawn again there; held longest; taken back from
               the hand, then the rest of him
    33-37      her almost: only her arm rises, hand first, its fingers stopping at the left casing;
               taken back while it is still being drawn (the hand changes its mind)
    38-46      every almost erased, the heads entirely, the door and its knob lifted; what touched
               the doorway left; she is rubbed back by half
    46-48.1    the casings drawn again, his side, then hers: the doorway is the last thing touched
    48.1-56    the empty doorway (held longer than the latch's silence: the cinematic director)
"""
import json
import os
import sys
import time

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import draw  # noqa: E402
import film  # noqa: E402
import foley  # noqa: E402
from timeline import Timeline  # noqa: E402

POSES = ['goodbye', 'wave1', 'wave2', 'going1', 'going2', 'going3', 'going4', 'door0', 'door1', 'door2', 'door3', 'door4', 'shut',
         'jamb', 'collar']
LENGTH = 56.0


def build(ref_dir, keep_her=True):
    R = {p: draw.load(ref_dir, p) for p in POSES}
    tl = Timeline(draw.W, draw.H, 'things')
    film.draw_on(tl, R['goodbye'], 'goodbye', 0.0, 6.0)
    # her wave, then his going: what happened, in tone
    for t, a, b in ((6.6, 'goodbye', 'wave1'), (7.3, 'wave1', 'wave2')):
        film.step(tl, R[a], R[b], t, people=('older',), prefix=f'real/{b}')
    keys = ['wave2', 'going1', 'going2', 'going3', 'going4', 'door0']
    for t, (a, b) in zip((8.0, 8.8, 9.6, 10.4, 10.9), zip(keys, keys[1:])):
        film.step(tl, R[a], R[b], t, prefix=f'real/{b}')
    # the door on its closer, slowing, home at the latch
    doors = ['door0', 'door1', 'door2', 'door3', 'door4', 'shut']
    for t, (a, b) in zip((11.2, 11.8, 12.5, 13.3, 14.25), zip(doors, doors[1:])):
        home = film.step(tl, R[a], R[b], t, people=('older',), door=True, prefix=f'real/{b}', dur=0.3)
    tl.latch = home                       # (the latch on the drawing that brings it home)
    # his almost: the shut door lifted, not drawn open; him in graphite at the jamb, the hand first
    t = 18.5
    door = R['shut']['ids'] == 7
    t = film.erase_figure(tl, R['shut'], 'door', 'c1/door', t, 1.6, order='x+', region=door, strength=0.95, skip=0.08)
    his_hand = film.hand_of(R['jamb'], 'young', 'R')
    t = film.redraw(tl, R['jamb'], 'young', 'c1/jamb', t + 0.3, lines=3.6, hand=his_hand, line_only=True)
    t = film.restate(tl, R['jamb'], 'c1/casing', t, his_hand) + 3.0
    t = film.take_back(tl, R['jamb'], 'young', 'R', 'c1/back', t, 1.6)
    t = film.erase_figure(tl, R['jamb'], 'young', 'c1/out', t, 1.4, strength=0.95, skip=0.15, order=tuple(his_hand)) + 0.8
    # her almost: only her arm (never her real body: its take-back erased her too, and "she
    # stays" could not be judged: the creative director); taken back before its lines are done
    her_hand = film.hand_of(R['collar'], 'older', 'R')
    real_her = film.figure_mask(R['shut'], 'older', 2)
    arm = film.arm_mask(R['collar'], 'older', 'R') & ~real_her
    # (Drawn whole and held, it played as his almost again, shorter: the hand only, then the
    # forearm, and the eraser catches it before the upper arm is ever drawn: the cinematic director.)
    t0 = t
    film.redraw(tl, R['collar'], 'older', 'c2/collar', t0, lines=2.0, hand=her_hand, line_only=True, region=arm, nearest=0.7)
    film.restate(tl, R['collar'], 'c2/casing', t0 + 0.6, her_hand, r=80, dur=0.8)
    t = film.take_back(tl, R['collar'], 'older', 'R', 'c2/back', t0 + 1.4, 1.6, region=arm) + 1.0
    # everyone imagined erased, the heads entirely; the door lifted, its knob too (a knob in an
    # empty doorway read as a locked door); what touched the doorway left
    touched = film.casing_near(R['jamb'], his_hand, 50) | film.casing_near(R['collar'], her_hand, 50)
    people = film.figure_mask(R['jamb'], 'young', 6) | arm | (R['shut']['ids'] == 7)
    t = film.erase_figure(tl, R['shut'], 'older', 'end/all', max(t, 38.0), 3.6, order='x+', region=people, strength=0.92, skip=0.08, spare=touched)
    knob = np.zeros(arm.shape, np.uint8)
    kx, ky = R['shut']['knob'][:2]
    cv2.circle(knob, (int(kx), int(ky)), 22, 1, -1)
    t = film.erase_figure(tl, R['shut'], 'older', 'end/knob', t - 0.3, 0.6, order='top', region=knob > 0, strength=1.0, skip=0.0)
    hd = film.heads([(R['jamb'], 'young')] + ([] if keep_her else [(R['shut'], 'older')]))
    t = film.erase_figure(tl, R['shut'], 'older', 'end/heads', t - 0.2, 1.2, order='top', region=hd, strength=1.0, skip=0.0)
    if keep_her:
        # she stayed: rubbed back evenly by half, her head kept (a headless outline was the one
        # image left of the doorway: the creative director's ruling)
        t = film.erase_figure(tl, R['shut'], 'older', 'end/her', t, 1.4, order='top', region=film.figure_mask(R['shut'], 'older', 4), strength=0.5, skip=0.0)
    else:
        # the doorway and the flat empty: her outline taken entirely, her fingers' mark at the casing left
        her = film.figure_mask(R['shut'], 'older', 6)
        for k in range(2):
            t = film.erase_figure(tl, R['shut'], 'older', f'end/her{k}', t, 1.2, order='top', region=her, strength=1.0, skip=0.0, spare=touched)
    # the casings drawn again: his side, then hers: the doorway is the last thing a hand touched
    t = film.restate(tl, R['jamb'], 'end/casing-his', max(t, 44.0), his_hand, r=160, dur=1.0) + 0.2
    film.restate(tl, R['collar'], 'end/casing-hers', t, her_hand, r=160, dur=1.0)
    return tl, LENGTH


def main():
    ref_dir, out = sys.argv[1], sys.argv[2]
    opts = dict(zip(sys.argv[3::2], sys.argv[4::2]))
    scale = float(opts.get('--scale', 0.5))
    os.makedirs(out, exist_ok=True)
    t0 = time.time()
    tl, length = build(ref_dir, keep_her=not bool(int(opts.get('--erase-her', 0))))
    print(f'planned {len(tl.items)} marks, {length:.1f} s, in {time.time() - t0:.0f} s', flush=True)
    with open(os.path.join(out, 'sheet.json'), 'w') as fh:
        json.dump({'length': length, 'events': [['latch', tl.latch]],
                   'items': [{'t0': round(a, 4), 't1': round(b, 4), 'mark': m} for a, b, m in tl.items]}, fh)
    items = list(tl.items)
    for mix in ('eraser-only', 'eraser', 'weight'):
        foley.write(os.path.join(out, f'foley-{mix}.wav'), foley.foley(items, length, [('latch', tl.latch)], mix_name=mix))
    tl.render(os.path.join(out, 'things.mp4'), until=length, scale=scale, audio=os.path.join(out, f'foley-{opts.get("--mix", "eraser-only")}.wav'))
    print(f'rendered in {time.time() - t0:.0f} s', flush=True)


if __name__ == '__main__':
    main()
