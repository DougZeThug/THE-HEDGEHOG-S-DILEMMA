"""The poses of "Things I Should Have Said" (docs/things.md), for scene.py.

Each figure: `at` (x, y on the floor, m), `face` (degrees: 0 faces the camera, 90 faces right,
-90 left, 180 away), `bones`: rotations in degrees about the figure's own axes, added to the
standing rest (REST), each carried by the bones above it:
- x (its left-right axis): positive tips the top of a bone forward (the spine, neck and head bow),
  and swings a hanging limb back (a thigh back, a knee bent, a forearm back);
- y (its front-back axis): positive tips the top toward its left, swings a left arm in and a right
  arm out;
- z (up): positive turns toward its left.
`local`: a bone's own rotation (the fingers: x curls them), replacing the relaxed hand.
`reach`: an arm placed by its hand, {'L' or 'R': {'hand': ..., 'elbow': (x, y, z)}}: scene.pose().
`bag`: which hand holds the bag ('L', 'R' or None). `shown`: False when someone is gone.
`door`: its angle in degrees (0 shut; negative opens it inward, toward the camera).

The gestures are the creative director's (Proof A): small, specific, physical. The goodbye does not
match: she waves, he lifts the bag she packed instead of a hand, and does not see her wave. The
almosts: he comes back to rest a hand on the jamb, his weight on his back heel, a shoulder dropping
toward her; she takes half a step and her hand rises toward his collar, to straighten it.
"""

# MakeHuman's skeleton stands in an A pose; this brings the arms down to the sides, a little bent,
# the hands relaxed. A pose's own rotations are added to it.
REST = {'upperarm01.L': (0, 40, 0), 'upperarm01.R': (0, -40, 0), 'lowerarm01.L': (36, 0, 0), 'lowerarm01.R': (36, 0, 0)}
RELAXED = {f'finger{f}-{j}.{s}': (12 + 4 * f, 0, 0) for s in ('L', 'R') for f in range(2, 6) for j in range(1, 4)}


def elbow_of(reach, side):
    """Where a reaching arm's elbow points (the figure's own space): by default out and behind."""
    return tuple(reach.get('elbow', ((0.5 if side == 'L' else -0.5), 0.3, 0.6)))


def _lerp(a, b, t):
    if isinstance(a, (int, float)):
        return a + (b - a) * t
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def blend(a, b, t):
    """The pose `t` of the way from `a` to `b` (0..1): places, facings, rotations and the door
    interpolated; a reach both have moves between its two targets, one only one has comes or goes
    by its weight; the bag and who is shown change halfway."""
    out = {'door': _lerp(a.get('door', 0), b.get('door', 0), t)}
    for who in ('young', 'older'):
        fa, fb = a[who], b[who]
        f = {'at': _lerp(fa['at'], fb['at'], t), 'face': _lerp(fa['face'], fb['face'], t),
             'bag': (fa if t < 0.5 else fb).get('bag'), 'shown': (fa if t < 0.5 else fb).get('shown', True)}
        ba, bb = fa.get('bones', {}), fb.get('bones', {})
        f['bones'] = {k: _lerp(ba.get(k, (0, 0, 0)), bb.get(k, (0, 0, 0)), t) for k in set(ba) | set(bb)}
        la, lb = fa.get('local', {}), fb.get('local', {})
        f['local'] = {k: _lerp(la.get(k, RELAXED.get(k, (0, 0, 0))), lb.get(k, RELAXED.get(k, (0, 0, 0))), t) for k in set(la) | set(lb)}
        f['reach'] = {}
        for s in ('L', 'R'):
            ra, rb = fa.get('reach', {}).get(s), fb.get('reach', {}).get(s)
            wa, wb = (ra or {}).get('weight', 1.0 if ra else 0.0), (rb or {}).get('weight', 1.0 if rb else 0.0)
            if ra and rb:
                f['reach'][s] = {'hand': ('mix', ra['hand'], rb['hand'], t), 'elbow': _lerp(elbow_of(ra, s), elbow_of(rb, s), t), 'weight': _lerp(wa, wb, t)}
            elif ra or rb:
                r = ra or rb
                f['reach'][s] = {'hand': r['hand'], 'elbow': elbow_of(r, s), 'weight': _lerp(wa, wb, t)}
        out[who] = f
    return out


OLDER_AT = (-0.06, -0.36)
YOUNG_AT = (0.76, 0.08)

LOOSE = {f'finger{f}-{j}.R': (6 + 2 * f, 0, 0) for f in range(2, 6) for j in range(1, 4)}
FIST = {**{f'finger{f}-{j}.R': (62 + 6 * j, 0, 0) for f in range(2, 6) for j in range(1, 4)}, 'finger1-2.R': (25, 0, 0), 'finger1-3.R': (30, 0, 0)}
PINCH = {**{f'finger{f}-{j}.R': (30 + 10 * f, 0, 0) for f in range(4, 6) for j in range(1, 4)},
         'finger2-1.R': (14, 0, 0), 'finger2-2.R': (22, 0, 0), 'finger3-1.R': (20, 0, 0), 'finger3-2.R': (30, 0, 0), 'finger1-2.R': (18, 0, 0)}

# Her body at sixty: a little forward at the hips and the neck, the shoulders rounded, the knees
# not quite straight. (The creative director, Proof A2.)
STOOP = {'spine05': (5, 0, 0), 'spine03': (3, 0, 0), 'neck01': (8, 0, 0), 'clavicle.L': (0, 0, -8), 'clavicle.R': (0, 0, 8),
         'upperleg01.L': (-4, 0, 0), 'upperleg01.R': (-4, 0, 0), 'lowerleg01.L': (6, 0, 0), 'lowerleg01.R': (6, 0, 0)}


def _plus(base, **k):
    d = dict(base)
    for b, v in k.items():
        b = b.replace('__', '.')
        d[b] = tuple(x + y for x, y in zip(d.get(b, (0, 0, 0)), v))
    return d


# the goodbye: she waves, small, a lift of the fingers at her ribs, clear of her face (raised, it
# read as a hand to her mouth: the skeptic); he is going, the bag lifted to his waist instead of a
# hand, his eyes on the corridor
OLDER_WAVE = dict(at=OLDER_AT, face=80, bones=_plus(STOOP, head=(-6, -5, 0)),
                  local=LOOSE, reach={'R': {'hand': (-0.22, -0.24, 0.98), 'elbow': (-0.3, 0.05, 0.5)}})
YOUNG_GOING = dict(at=YOUNG_AT, face=100, bag='R', local=FIST,
                   bones={'neck01': (8, 0, 0), 'head': (6, 0, -10), 'spine03': (0, 0, 6),
                          'upperleg01.L': (-14, 0, 0), 'lowerleg01.L': (8, 0, 0),
                          'upperleg01.R': (10, 0, 0), 'lowerleg01.R': (16, 0, 0), 'foot.R': (-12, 0, 0)},
                   reach={'R': {'hand': (-0.24, -0.16, 1.02), 'elbow': (-0.4, 0.4, 0.6)}})

POSES = {
    'goodbye': {'door': -82, 'older': OLDER_WAVE, 'young': YOUNG_GOING},
    # the first thing imagined: past the threshold he stops, his hand comes back to the jamb (the
    # bag's handles slid to his wrist), his weight rocks onto his back heel, his shoulder and his
    # head drop back toward her; she is as she was, her hand coming down
    'jamb': {'door': -82,
             'older': dict(OLDER_WAVE, reach={'R': {'hand': (-0.2, -0.24, 0.98), 'elbow': (-0.3, -0.1, 0.5)}}),
             'young': dict(at=(0.94, 0.28), face=104, bag='R', local=FIST,
                           bones={'spine05': (-3, 0, 0), 'spine04': (-3, -4, -14), 'spine02': (0, -5, -14), 'neck01': (6, 0, -22), 'head': (8, -4, -30),
                                  'upperleg01.L': (-10, 0, 0), 'lowerleg01.L': (6, 0, 0), 'upperleg01.R': (6, 0, 0), 'foot.L': (8, 0, 0)},
                           reach={'R': {'hand': ('world', (1.17, -0.03, 1.2)), 'elbow': (-0.5, 0.0, 0.6)}})},
    # the second thing imagined: half a step, her hand rising toward his collar; he has not turned
    'collar': {'door': -82,
               'older': dict(at=(0.2, -0.2), face=80, local=PINCH,
                             bones=_plus(STOOP, spine05=(-4, 0, 0), spine02=(-2, 0, 0), neck01=(-14, 0, 0), head=(-12, 0, 0),
                                         upperleg01__R=(-12, 0, 0), lowerleg01__R=(10, 0, 0), upperleg01__L=(10, 0, 0), foot__L=(-18, 0, 0)),
                             reach={'R': {'hand': ('near', 'young', 'neck02', 0.07, -0.02), 'elbow': (-0.4, 0.1, 0.4)}}),
               'young': YOUNG_GOING},
}


# ---------------------------------------------------------------- the goodbye as it happened
# He walks out of the doorway and along the corridor to the right, behind the wall; the door, on
# its closer, swings shut after him; she waves, small, and her hand comes down. A walk's four
# drawings (contact, passing, contact, passing), legs and his free arm swinging.
WALK = [
    {'upperleg01.L': (-16, 0, 0), 'lowerleg01.L': (4, 0, 0), 'upperleg01.R': (12, 0, 0), 'lowerleg01.R': (18, 0, 0), 'foot.R': (-14, 0, 0),
     'upperarm01.L': (14, 0, 0), 'spine03': (0, 0, 5)},
    {'upperleg01.L': (2, 0, 0), 'lowerleg01.L': (6, 0, 0), 'upperleg01.R': (-14, 0, 0), 'lowerleg01.R': (40, 0, 0), 'foot.R': (-6, 0, 0),
     'upperarm01.L': (0, 0, 0)},
    {'upperleg01.R': (-16, 0, 0), 'lowerleg01.R': (4, 0, 0), 'upperleg01.L': (12, 0, 0), 'lowerleg01.L': (18, 0, 0), 'foot.L': (-14, 0, 0),
     'upperarm01.L': (-14, 0, 0), 'spine03': (0, 0, -5)},
    {'upperleg01.R': (2, 0, 0), 'lowerleg01.R': (6, 0, 0), 'upperleg01.L': (-14, 0, 0), 'lowerleg01.L': (40, 0, 0), 'foot.L': (-6, 0, 0),
     'upperarm01.L': (0, 0, 0)},
]
PATH = [((0.76, 0.08), 100), ((0.92, 0.26), 88), ((1.08, 0.42), 84), ((1.26, 0.5), 82), ((1.44, 0.52), 82)]


def going(k):
    """Him, the k-th drawing of his walk out (0 is the goodbye's own)."""
    at, face = PATH[k]
    bones = {'neck01': (8, 0, 0), 'head': (6, 0, -6 + 2 * k)}
    bones.update(WALK[k % 4])
    return dict(at=at, face=face, bag='R', local=FIST, bones=bones,
                reach={'R': {'hand': (-0.24, -0.16, 1.02 - 0.04 * min(k, 2)), 'elbow': (-0.4, 0.4, 0.6)}})


GONE = dict(at=(2.4, 0.6), face=90, shown=False)


def waving(k):
    """Her small wave: the hand rocks at the wrist, a little to and fro, then comes down."""
    w = dict(OLDER_WAVE)
    w['bones'] = _plus(OLDER_WAVE['bones'], wrist__R=((0, 0, 14), (0, 0, -10), (0, 0, 12), (0, 0, -6))[k % 4])
    return w


LOWERED = dict(OLDER_WAVE, reach={'R': {'hand': (-0.18, -0.12, 0.86), 'elbow': (-0.3, 0.1, 0.5)}}, local={})

for _k in range(1, 5):
    POSES[f'going{_k}'] = {'door': -82, 'older': waving(_k), 'young': going(_k)}
for _k, _a in enumerate((-82, -60, -34, -12, 0)):
    POSES[f'door{_k}'] = {'door': _a, 'older': waving(_k) if _k < 2 else LOWERED, 'young': GONE}
POSES['shut'] = {'door': 0, 'older': LOWERED, 'young': GONE}
# the empty doorway, at the end: the door open as the revisions left it, nobody
POSES['empty'] = {'door': -82, 'older': dict(LOWERED, shown=False), 'young': GONE}
