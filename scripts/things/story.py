"""The film of "Things I Should Have Said" (docs/things.md): its exposure sheet, as moves on one
sheet (film.py), and the sound made from the same marks (foley.py).

    python3 scripts/things/story.py REF_DIR OUT_DIR [--scale 0.5] [--mix revisit|eraser-only|eraser|weight] [--until S]

REF_DIR holds scene.py's references for every pose named below. Writes OUT_DIR/things.mp4 (with
its sound), OUT_DIR/foley-*.wav, and OUT_DIR/sheet.json (every mark's time: the order map and the
sound are made from it). v2 (the artist's review of the first film, 2026-10-22, and the reviews in
docs/reviews/2026-10-things.md, section 8): an ordinary goodbye, kept as fact; then two revisions of
it, each found, drawn and taken back before it is done; both people gone at the end, the doorway
left with the two hands' impressions.

    0-6        the goodbye drawn on the bare sheet: they face each other, he with the bag
    6.6, 7.2   her small wave at her waist; he lifts the bag and nods
    8-11.1     he turns his back on her and goes: round, turned, at the threshold, half behind the
               casing; each position taken out entire (no residue: the goodbye is fact); her head
               follows him
    11.6-13.6  the door swings to on its closer, slowing; the latch; then silence (she lowers her
               head, 15.8)
    17.2-28.6  his: the eraser lifts the shut door; in the doorway, in pencil, his back as he left,
               found by its construction, held; he turns back toward her (shoulder and head, his
               face toward her); a hesitation; his free hand begins to rise, starts, stops, goes on;
               held; taken back along its own lines, the hand least
    30.6-36.2  a breath; hers: from where she stands, a lean after him, her hand rising toward the
               doorway, opening; held; taken back the same way
    37.7-40.5  a breath; she is taken, her head first; then where he stood: quieter than the almosts
    41.5-48.75 the empty doorway, the two hands' impressions facing each other across it (six seconds before
               the room lets it go: the cinematic director)
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

POSES = ['goodbye', 'wave1', 'wave2', 'turn', 'going0', 'going2', 'going4', 'door0', 'door1', 'door3',
         'shut', 'after', 'his-back', 'his-head', 'his-hand', 'her-lean', 'her-reach']
LENGTH = 48.75


def build(ref_dir):
    R = {p: draw.load(ref_dir, p) for p in POSES}
    tl = Timeline(draw.W, draw.H, 'things')
    film.draw_on(tl, R['goodbye'], 'goodbye', 0.0, 6.0)
    lm = lambda ref, who, k, end=0: ref['landmarks'][who][k][0:2] if end == 0 else ref['landmarks'][who][k][3:5]
    # the goodbye: her small wave; he lifts the bag and nods
    for t, a, b in ((6.6, 'goodbye', 'wave1'), (7.2, 'wave1', 'wave2')):
        film.step(tl, R[a], R[b], t, prefix=f'real/{b}', whole=())
    # he turns his back on her and goes: round, turned, at the threshold, half behind the casing,
    # each position taken out entire, its head and its lines (a residue of him stood in the doorway
    # to the end: the directors and the skeptic); she watches
    keys = ['wave2', 'turn', 'going0', 'going2', 'going4', 'door0']
    for t, (a, b) in zip((8.0, 8.6, 9.4, 10.3, 11.1), zip(keys, keys[1:])):
        film.step(tl, R[a], R[b], t, prefix=f'real/{b}', dur=0.4)
    # where he walked, cleared before the door closes on it (behind the light leaf his walk stayed a
    # cloud under the silence: the cinematic director)
    gone_from = film.figure_mask(R['going0'], 'young', 8) | film.figure_mask(R['going2'], 'young', 8) | film.figure_mask(R['going4'], 'young', 8)
    film.erase_figure(tl, R['going2'], 'young', 'real/clear', 11.2, 0.5, order='x+', region=gone_from, strength=1.0, skip=0.0, rag=False)
    # the door on its closer, slowing, home at the latch
    doors = ['door0', 'door1', 'door3', 'shut']
    for t, (a, b) in zip((11.6, 12.4, 13.3), zip(doors, doors[1:])):
        home = film.step(tl, R[a], R[b], t, people=('older',), door=True, prefix=f'real/{b}', dur=0.3)
    tl.latch = home                       # (the latch on the drawing that brings it home)
    # the silence: she lowers her head (she has stopped watching the door)
    film.step(tl, R['shut'], R['after'], 15.8, people=('older',), prefix='real/after', dur=0.5, whole=())
    # his: the shut door lifted (its knob too), not drawn open; in the doorway, his back as he left,
    # found by its construction and held ("this is how he left"); then he turns back toward her,
    # shoulder and head in one; a hesitation; his free hand rising, a start, a stop, the rest
    knob = np.zeros(R['shut']['ids'].shape, np.uint8)
    cv2.circle(knob, tuple(int(v) for v in R['shut']['knob'][:2]), 20, 1, -1)
    t = film.erase_figure(tl, R['shut'], 'door', 'c1/door', 17.2, 1.1, order='x+', region=(R['shut']['ids'] == 7) | (knob > 0), strength=0.97, skip=0.05, rag=False)
    t, his = film.imagine(tl, R['his-back'], 'young', 'c1/back', t + 0.1, build=0.5, lines=1.2, limbs=('arm.L', 'leg.L', 'leg.R'))
    t = film.revise(tl, his, R['his-head'], 'c1/turn', t + 0.6, rub=0.45, lines=0.9, start=lm(R['his-head'], 'young', 'clavicle.L', 1))
    t = film.revise(tl, his, R['his-hand'], 'c1/hand', t + 0.6, rub=0.25, lines=1.4, start=lm(R['his-hand'], 'young', 'upper_arm.L'), stall=(0.5, 0.5))
    his_hand = film.hand_of(R['his-hand'], 'young', 'L')
    t = film.withdraw(tl, his, 'c1/out', t + 1.9, 1.6, his_hand)
    # a breath; then hers: from where she stands, a lean after him, drawn in line over her, her hand
    # rising toward the doorway, opening (she is not rubbed back first: it read as her beginning to
    # vanish: the skeptic)
    lean = film.delta_mask(R['after'], R['her-lean'], 'older', grow=10, tone=False)
    t, her = film.imagine(tl, R['her-lean'], 'older', 'c2/lean', t + 2.0, build=0.45, lines=0.8, region=lean, limbs=('arm.R', 'leg.R'))
    t = film.revise(tl, her, R['her-reach'], 'c2/reach', t + 0.15, rub=0.25, lines=1.1, start=lm(R['her-reach'], 'older', 'upper_arm.R'))
    her_hand = film.hand_of(R['her-reach'], 'older', 'R')
    t = film.withdraw(tl, her, 'c2/out', t + 1.4, 1.4, her_hand)
    # a breath; then she is taken, her head first, the rest of her, her outline along itself; then
    # where he stood. The two hands' impressions are spared: they are what is left. (No casing
    # restated: the darkest mark of the last image, meaning nothing seen: the creative director.)
    hands = np.zeros(R['after']['ids'].shape, np.uint8)
    for (x, y) in (his_hand, her_hand):
        cv2.circle(hands, (int(x), int(y)), 32, 1, -1)
    hands = hands > 0
    real_her = film.figure_mask(R['after'], 'older', 6)
    hd = film.heads([(R['after'], 'older')])
    t = film.erase_figure(tl, R['after'], 'older', 'end/heads', t + 1.5, 0.6, order='top', region=hd, strength=1.0, skip=0.0, rag=False)
    t = film.erase_figure(tl, R['after'], 'older', 'end/her', t - 0.1, 1.1, order='top', region=real_her, strength=0.95, skip=0.08, rag=False, spare=hands)
    her_lines = [m for _, _, m in tl.items if m['part'] == 'older' and m['kind'] == 'stroke' and m['layer'] in ('contour', 'face') and not m['name'].startswith(('c1/', 'c2/'))]
    t = tl.add(draw.trace_erase('end/her-lines', 'older', her_lines, tuple(film.hand_of(R['after'], 'older', 'R')), strength=0.9, width=14.0, skip=0.1), t - 0.2, 0.5, overlap=0.5)
    where_he_was = np.zeros_like(hands)
    for p in ('goodbye', 'wave2', 'turn', 'going0', 'going2', 'going4'):
        where_he_was |= film.figure_mask(R[p], 'young', 6)
    t = film.erase_figure(tl, R['goodbye'], 'young', 'end/him', t - 0.1, 0.8, order='x+', region=where_he_was, strength=0.9, skip=0.1, rag=False, spare=hands)
    his_lines = [m for _, _, m in tl.items if m['part'] == 'young' and m['kind'] == 'stroke' and m['layer'] in ('contour', 'face') and not m['name'].startswith(('c1/', 'c2/'))]
    t = tl.add(draw.trace_erase('end/him-lines', 'young', his_lines, tuple(his_hand), strength=0.85, width=14.0, skip=0.1, passes=2,
                                spare=(his_hand[0], his_hand[1], 30.0, 0.8)), t - 0.2, 0.6, overlap=0.5)
    # the door's knobs, where it was shut and where it swung (the darkest marks in the last image,
    # a pair of eyes on a phone: the directors), and what was left of the almosts but the hands: the
    # hands are the last image's darkest marks
    knobs = np.zeros_like(hands, dtype=np.uint8)
    for p in ('door1', 'door3', 'shut'):
        cv2.circle(knobs, tuple(int(v) for v in R[p]['knob'][:2]), 20, 1, -1)
    t = film.erase_figure(tl, R['shut'], 'door', 'end/knobs', t - 0.2, 0.4, order='top', region=(knobs > 0) & ~hands, strength=1.0, skip=0.0, rag=False)
    near_her = lambda m: np.hypot(*(np.asarray(m['pts'], np.float32).mean(0) - her_hand)) < 40
    imagined = [m for _, _, m in tl.items if m['kind'] == 'stroke' and m['name'].startswith(('c1/', 'c2/')) and m['layer'] in ('contour', 'face', 'construct')
                and not near_her(m)]
    tl.add(draw.trace_erase('end/almosts', 'young', imagined, tuple(his_hand), strength=0.7, width=14.0, skip=0.05, passes=2,
                            spare=(his_hand[0], his_hand[1], 40.0, 1.0)), t - 0.2, 0.5, overlap=0.5)
    return tl, LENGTH


def main():
    ref_dir, out = sys.argv[1], sys.argv[2]
    opts = dict(zip(sys.argv[3::2], sys.argv[4::2]))
    scale = float(opts.get('--scale', 0.5))
    os.makedirs(out, exist_ok=True)
    t0 = time.time()
    tl, length = build(ref_dir)
    print(f'planned {len(tl.items)} marks, {length:.1f} s, in {time.time() - t0:.0f} s', flush=True)
    with open(os.path.join(out, 'sheet.json'), 'w') as fh:
        json.dump({'length': length, 'events': [['latch', tl.latch]],
                   'items': [{'t0': round(a, 4), 't1': round(b, 4), 'mark': m} for a, b, m in tl.items]}, fh)
    items = list(tl.items)
    for mix in foley.MIXES:
        foley.write(os.path.join(out, f'foley-{mix}.wav'), foley.foley(items, length, [('latch', tl.latch)], mix_name=mix))
    tl.render(os.path.join(out, 'things.mp4'), until=float(opts.get('--until', length)), scale=scale, audio=os.path.join(out, f'foley-{opts.get("--mix", foley.DEFAULT_MIX)}.wav'))
    print(f'rendered in {time.time() - t0:.0f} s', flush=True)


if __name__ == '__main__':
    main()
