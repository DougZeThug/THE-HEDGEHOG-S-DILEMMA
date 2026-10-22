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

The staging (v2, the artist's review of the first film, 2026-10-22): she stands in the room, near
us and to the left, at home; he stands between her and the door, facing her, the bag she packed in
his hand. The goodbye is ordinary: she waves, small; he lifts the bag and nods. He turns his back on
her and walks away from her, out of the doorway and to the right; she watches him go. The almosts
are revisions of that moment, in stages, each stopping before it is done: his, at the threshold,
his shoulder turning back toward her, then his head, then his free hand beginning to rise; hers,
from where she stands, a lean and her hand rising toward the doorway he left by.
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


# Where they stand: she in the room near us, left; he between her and the door, facing her (the
# door wall is y = 0, its opening x 0.30-1.20; the camera stands at y = -6.2, scene.py).
OLDER_AT = (-0.25, -0.95)
YOUNG_AT = (0.42, -0.6)
THRESHOLD = (0.72, 0.02)

LOOSE = {f'finger{f}-{j}.R': (6 + 2 * f, 0, 0) for f in range(2, 6) for j in range(1, 4)}
OPEN = {f'finger{f}-{j}.R': (2 + f, 0, 0) for f in range(2, 6) for j in range(1, 4)}
OPEN_L = {f'finger{f}-{j}.L': (4 + 2 * f, 0, 0) for f in range(2, 6) for j in range(1, 4)}
FIST = {**{f'finger{f}-{j}.R': (62 + 6 * j, 0, 0) for f in range(2, 6) for j in range(1, 4)}, 'finger1-2.R': (25, 0, 0), 'finger1-3.R': (30, 0, 0)}

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


# ---------------------------------------------------------------- the goodbye as it happened
# She faces him (and, once he turns, the door); her small wave is a lift of the fingers at her ribs
# (raised, it read as a hand to her mouth: the skeptic). He faces her, the bag hanging from his right
# hand; then he lifts it a little, a nod, and turns away.
# (v2: her hands low in front of her, one over the other's wrist: with her hand held out to him at
# the goodbye, her imagined reach revised nothing, she had already reached: the creative director)
_HANDS = {'R': {'hand': (0.0, -0.2, 0.84), 'elbow': (-0.3, 0.1, 0.5)}, 'L': {'hand': (0.07, -0.2, 0.82), 'elbow': (0.3, 0.1, 0.5)}}
SHE = dict(at=OLDER_AT, face=112, bones=_plus(STOOP, head=(-6, 0, 4)), local=LOOSE, reach=_HANDS)
SHE_DOWN = dict(SHE, local={})
HE = dict(at=YOUNG_AT, face=-62, bag='R', local=FIST, bones={'neck01': (6, 0, 0), 'head': (4, 0, -6)},
          reach={'R': {'hand': (-0.2, 0.02, 0.8), 'elbow': (-0.3, 0.3, 0.6)}})


def waving(k, base=SHE):
    """Her small wave: the right hand lifted from the other a little, at her waist, the fingers
    rocking at the wrist (an ordinary goodbye: nothing held out to him)."""
    w = dict(base)
    w['bones'] = _plus(base['bones'], wrist__R=((0, 0, 40), (0, 0, -34), (0, 0, 38), (0, 0, -14))[k % 4])
    w['reach'] = {**base['reach'], 'R': {'hand': ((-0.1, -0.13, -0.1, -0.05)[k % 4], -0.24, 0.96), 'elbow': (-0.3, 0.05, 0.5)}}
    return w


def watching(head_z, base=SHE):
    """Her, her head following him as he goes (toward the door: her right)."""
    w = dict(base)
    w['bones'] = _plus(base['bones'], head=(0, 0, head_z), neck01=(0, 0, head_z * 0.5))
    return w


# A walk's four drawings (contact, passing, contact, passing), legs and his free arm swinging.
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
# Away from her: turned (his back to her), to the threshold, through it, and right along the
# corridor behind the wall (the last: only his shoulder and the bag at the casing's edge).
PATH = [((0.5, -0.48), 160), ((0.6, -0.24), 168), ((0.72, 0.02), 172), ((0.94, 0.32), 120), ((1.2, 0.46), 96), ((1.38, 0.5), 90)]


def going(k):
    """Him, the k-th drawing of his walk away (0: turned from her, his first step)."""
    at, face = PATH[k]
    bones = {'neck01': (8, 0, 0), 'head': (6, 0, 0)}
    bones.update(WALK[k % 4])
    return dict(at=at, face=face, bag='R', local=FIST, bones=bones,
                reach={'R': {'hand': (-0.24, -0.1, 0.9), 'elbow': (-0.4, 0.4, 0.6)}})


GONE = dict(at=(2.4, 0.6), face=90, shown=False)

POSES = {
    # they face each other; she has begun her small wave
    'goodbye': {'door': -82, 'older': SHE, 'young': HE},
    'wave1': {'door': -82, 'older': waving(1), 'young': HE},
    # he lifts the bag a little, and nods (his "right, then")
    'wave2': {'door': -82, 'older': waving(2),
              'young': dict(HE, bones={'neck01': (18, 0, 0), 'head': (16, 0, -6), 'spine02': (4, 0, 0)}, reach={'R': {'hand': (-0.22, -0.16, 0.98), 'elbow': (-0.3, 0.3, 0.6)}})},
}
# (v2: the turn away is seen: three quarters round, his back coming to her, before the first step;
# a cut from facing her to his back left his turning back later nothing to answer: the cinematic
# director)
POSES['turn'] = {'door': -82, 'older': waving(3), 'young': dict(HE, at=(0.45, -0.56), face=-128, bones={'neck01': (8, 0, 0), 'head': (6, 0, 8), 'spine03': (0, 0, -6)})}
# he goes; her head follows him to the door
for _k in range(6):
    POSES[f'going{_k}'] = {'door': -82, 'older': watching((0, 4, 8, 14, 18, 20)[_k]), 'young': going(_k)}
# the door on its closer, slowing; her hand comes down
WATCH = watching(20, SHE_DOWN)
for _k, _a in enumerate((-82, -55, -30, -12, -4)):
    POSES[f'door{_k}'] = {'door': _a, 'older': watching(20) if _k < 2 else WATCH, 'young': GONE}
POSES['shut'] = {'door': 0, 'older': WATCH, 'young': GONE}
# after the latch: her head drops a little (she has stopped watching the door)
POSES['after'] = {'door': 0, 'older': dict(WATCH, bones=_plus(WATCH['bones'], head=(10, 0, -6), neck01=(4, 0, 0))), 'young': GONE}

# ---------------------------------------------------------------- what is imagined
# His: at the threshold, as he was when he passed it (his back to her), then each stage of turning
# back toward her (z positive turns a body toward its own left: toward her, behind him), the bag
# still in his right hand; his free left hand beginning to rise toward her, never arriving (at his
# chest's height, clear of the doorknob, where its impression read as the knob: the skeptic).
HIS_BACK = dict(at=THRESHOLD, face=176, bag='R', local=FIST, bones={'neck01': (8, 0, 0), 'head': (6, 0, 0)},
                reach={'R': {'hand': (-0.24, -0.1, 0.9), 'elbow': (-0.4, 0.4, 0.6)}})
_SHOULDER = {'spine04': (0, 0, 18), 'spine03': (0, 0, 16), 'spine02': (0, -3, 20), 'clavicle.L': (0, 0, 8)}
_HEAD = {'neck01': (2, 0, 25), 'head': (-2, -4, 30)}
HIS_SHOULDER = dict(HIS_BACK, bones={**HIS_BACK['bones'], **_SHOULDER, 'neck01': (8, 0, 6), 'head': (6, 0, 4)})
HIS_HEAD = dict(HIS_BACK, bones={**HIS_BACK['bones'], **_SHOULDER, **_HEAD})
HIS_HAND = dict(HIS_HEAD, local={**FIST, **OPEN_L},
                reach={**HIS_BACK['reach'], 'L': {'hand': ('world', (0.3, -0.38, 1.2)), 'elbow': (0.45, 0.3, 0.15)}})
# Hers: from where she stands, toward the doorway he left by: her weight onto the front foot, her
# back and her head leaning after him, then her right hand rising toward the doorway, opening.
# (bent at the hips with both knees bent, she read as stooping to pick something up: the weight goes
# onto the front foot, the back leg straight, the back and head only a little after it)
# (v2: further, so her head moves toward the doorway and the lean reads, not a doubled contour: the
# cinematic director)
_LEAN = {'spine05': (-3, 0, 0), 'spine03': (7, 0, -4), 'spine02': (7, 0, -5), 'neck01': (6, 0, 0), 'head': (-2, 0, 0),
         'upperleg01.R': (-11, 0, 0), 'lowerleg01.R': (-2, 0, 0), 'upperleg01.L': (9, 0, 0), 'lowerleg01.L': (-4, 0, 0)}
WRIST = 50.0              # (turned in: at -50 the palm faced him, "stop")
HER_LEAN = dict(WATCH, at=(OLDER_AT[0] + 0.1, OLDER_AT[1] + 0.05), bones=_plus(WATCH['bones'], **{k.replace('.', '__'): v for k, v in _LEAN.items()}))
# (palm out at head height, it read as "stop": the hand at his chest's height, palm turned in, the
# fingers loose; stopping a finger's width short of where his hand was drawn: touching it resolved
# what the piece keeps open: the creative director)
HER_REACH = dict(HER_LEAN, local=OPEN, bones=_plus(HER_LEAN['bones'], wrist__R=(0, WRIST, 0)),
                 reach={'R': {'hand': ('world', (0.03, -0.68, 1.06)), 'elbow': (-0.35, 0.05, -0.15)}})

POSES.update({
    'his-back': {'door': -82, 'older': WATCH, 'young': HIS_BACK},
    'his-shoulder': {'door': -82, 'older': WATCH, 'young': HIS_SHOULDER},
    'his-head': {'door': -82, 'older': WATCH, 'young': HIS_HEAD},
    'his-hand': {'door': -82, 'older': WATCH, 'young': HIS_HAND},
    'her-lean': {'door': -82, 'older': HER_LEAN, 'young': GONE},
    'her-reach': {'door': -82, 'older': HER_REACH, 'young': GONE},
    # the empty doorway, at the end: the door as the revisions left it, nobody
    'empty': {'door': -82, 'older': dict(WATCH, shown=False), 'young': GONE},
})
