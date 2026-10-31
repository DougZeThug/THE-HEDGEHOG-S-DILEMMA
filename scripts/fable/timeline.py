"""The bake-off's 35 s at the pond: his withdrawal and her light, as functions of time.

Pure Python (math only), so Blender's interpreter imports it as readily as the compositor's. Both
routes take every pose, every light level and every piece's placement from here, frame by frame.

The beat (docs/reviews/2026-10-fable.md, decisions 6–7; the cinematic director's shots 4–6):
  0–3     ease: he lies loose by her reflection, breathing
  3–7     he withdraws beneath the reeds, closing inward (the reed shadows stripe him)
  7.5–9.5 "disappearing": her reflection dims and its edge softens
  10–18   "brighter": her light rises over 8 s; haze lifts the blacks, the shaft crosses the bank,
          the stripes wash out, his own reflection comes up beside hers, the mud shows
  18–19.2 (his request, in silence)
  19.2–23.2 she dims to 0.4: the blacks crush back, the stripes return, his reflection goes
  23.2–27.5 rest; he loosens
  27.5–33.5 her light creeps toward his bank in paper strips, one a second; he tightens again
  33.5–35 held
"""
import math

DURATION = 35.0
FPS = 24
ON = 2  # every drawing is held for two frames, the light with it

# Depths toward the lens (mm; a panel px is a mm), back to front.
Z = {'plate': 0, 'bank': 48, 'fox_tail': 50, 'fox_ear_far': 51, 'fox_ear_near': 51.5, 'fox_body': 53,
     'fox_foreleg': 54, 'mud': 54.5, 'fox_head': 55, 'pin': 56, 'reeds_f': 60, 'water': 70, 'refl_fox': 70.4,
     'moon_refl': 70.8, 'creep': 71, 'reeds_r': 80, 'haze': 90, 'shaft': 91}

# Her key comes from where she is: above and beyond the right of the frame, a little in front.
KEY_DIR = (0.55, -0.55, 0.62)  # toward the light (X right, Y away from the lens, Z up)
FILL_SHARE, KEY_SHARE = 0.55, 0.45  # at rest the two give back the painted value
HAZE_RGB = (0.20, 0.22, 0.30)  # linear light: at its fullest it lifts the blacks to about 20%
HAZE_AMOUNT = 0.12
SHAFT_RGB = (0.95, 0.90, 0.76)
SHAFT_AMOUNT = 0.12
WATER_LINE = 296.0  # panel px: where the bank meets the water (his reflection's mirror)


def smooth(e0, e1, x):
    if e1 == e0:
        return 1.0 if x >= e1 else 0.0
    t = min(max((x - e0) / (e1 - e0), 0.0), 1.0)
    return t * t * (3 - 2 * t)


def ramp(t, keys):
    """Piecewise eased interpolation through [(time, value), ...]."""
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            return v0 + (v1 - v0) * smooth(t0, t1, t)
    return keys[-1][1]


def frames():
    """(frame index, time of its drawing): drawings change every ON frames."""
    n = int(DURATION * FPS)
    return [(f, (f - f % ON) / FPS) for f in range(n)]


def light(t):
    return {
        'key': ramp(t, [(0, 1.0), (10, 1.0), (18, 1.6), (19.2, 1.6), (23.2, 0.4), (27.5, 0.4), (33.5, 0.62)]),
        'fill': ramp(t, [(0, 1.0), (10, 1.0), (18, 2.0), (19.2, 2.0), (23.2, 0.6), (27.5, 0.6), (33.5, 0.75)]),
        'key_size': ramp(t, [(0, 1.0), (10, 1.0), (18, 3.0), (19.2, 3.0), (23.2, 1.0)]),
        'haze': ramp(t, [(0, 0.0), (10, 0.0), (18, 1.0), (19.2, 1.0), (23.2, 0.0)]),
        'shaft': ramp(t, [(0, 0.0), (11, 0.0), (18, 1.0), (19.2, 1.0), (22.5, 0.0)]),
        'moon_gain': ramp(t, [(0, 1.0), (7.5, 1.0), (9.5, 0.75), (10, 0.75), (14, 1.12), (19.2, 1.12), (23.2, 0.45),
                              (27.5, 0.45), (33.5, 0.7)]),
        'moon_soft': ramp(t, [(0, 0.0), (7.5, 0.0), (9.5, 1.0), (10, 1.0), (13, 0.0), (19.2, 0.0), (23.2, 0.7)]),
        'refl_fox': ramp(t, [(0, 0.0), (11, 0.0), (17, 0.6), (19.2, 0.6), (22.5, 0.0)]),
        'mud': ramp(t, [(0, 0.0), (11, 0.0), (16, 1.0)]),
        'creep': [smooth(27.5 + i, 27.9 + i, t) for i in range(6)],
    }


def pose(t):
    """Each piece's (dx, dy, rot°) about its own pivot, in its parent's frame; rot is clockwise on screen."""
    withdraw = smooth(3.0, 7.0, t)
    bright = smooth(11, 17, t) * (1 - smooth(19.6, 23.2, t))
    relief = smooth(23.2, 26.0, t) * (1 - smooth(31.0, 32.0, t))
    tight = smooth(31.0, 32.0, t)
    breath = math.sin(2 * math.pi * t / (3.4 if t < 23 else 4.6)) * (0.35 + 0.25 * relief) * (1 - 0.6 * bright)
    tremble = 0.18 * math.sin(2 * math.pi * 7.3 * t) * bright
    return {
        'fox': (-34 * withdraw, -1.5 * withdraw, 0.0),
        'body': (0.0, breath * 0.6, -1.2 * withdraw),
        'tail': (2.0 * withdraw, -2.0 * withdraw, 16 * withdraw + 6 * bright - 5 * relief + 3 * tight),
        'foreleg': (-9 * withdraw, -2 * withdraw, -7 * withdraw - 3 * bright + 2 * relief),
        'head': (-6 * withdraw, 1.5 * withdraw + tremble,
                 13 * withdraw + 6 * bright - 8 * relief + 7 * tight),
        'ear_near': (0.0, 0.0, -32 * withdraw - 12 * bright + 26 * relief - 20 * tight),
        'ear_far': (0.0, 0.0, -28 * withdraw - 10 * bright + 22 * relief - 18 * tight),
    }


def affine_about(px, py, rot_deg, dx, dy):
    """2×3 affine (panel px, y down): rotate clockwise-on-screen about (px, py), then move by (dx, dy)."""
    a = math.radians(rot_deg)
    c, s = math.cos(a), math.sin(a)
    return [[c, -s, px - c * px + s * py + dx], [s, c, py - s * px - c * py + dy]]


def compose(m, n):
    return [[m[0][0] * n[0][0] + m[0][1] * n[1][0], m[0][0] * n[0][1] + m[0][1] * n[1][1],
             m[0][0] * n[0][2] + m[0][1] * n[1][2] + m[0][2]],
            [m[1][0] * n[0][0] + m[1][1] * n[1][0], m[1][0] * n[0][1] + m[1][1] * n[1][1],
             m[1][0] * n[0][2] + m[1][1] * n[1][2] + m[1][2]]]


def placements(t, layers):
    """Every fox layer's 2×3 affine (panel px) at time t, through its parents: {layer name: matrix}."""
    p = pose(t)
    by_piece = {L['piece']: L for L in layers if L.get('kind') == 'fox' and L.get('piece') not in ('pin', 'mud')}
    fdx, fdy, _ = p['fox']
    root = [[1, 0, fdx], [0, 1, fdy]]
    cache = {}

    def of(piece):
        if piece in cache:
            return cache[piece]
        L = by_piece[piece]
        dx, dy, rot = p.get(piece, (0.0, 0.0, 0.0))
        local = affine_about(L['pivot'][0], L['pivot'][1], rot, dx, dy)
        parent = L.get('parent')
        cache[piece] = compose(of(parent) if parent else root, local)
        return cache[piece]

    out = {}
    for L in layers:
        if L.get('kind') != 'fox':
            continue
        out[L['name']] = of(L['parent']) if L['piece'] in ('pin', 'mud') else of(L['piece'])
    return out


def mirror(m, line=WATER_LINE):
    """The same placement seen in the water: reflected about the water line."""
    return compose([[1, 0, 0], [0, -1, 2 * line]], m)
