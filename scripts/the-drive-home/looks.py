"""Palettes and value cuts for The Drive Home, one look per kind of light.

Each class has `cuts` (where the traced light is cut into flat shapes, on the shot's 0..1 tone) and
`colours` (darkest to lightest, RGB 0..1). `right` gives the right-hand person their own colours in a
two-shot: the driver's coat.
"""
from roto import hexrgb as c


def look(base, **kw):
    d = dict(base)
    d.update(kw)
    return d


FACE_MOON = [c("#0a080b"), c("#1f1517"), c("#4a3233"), c("#8f6b5b"), c("#d2b9a2")]

# moonlight on the desert road: cool key, skin kept low, the cab almost black
MOON = dict(
    black=0.02, white=0.70, gamma=0.95, l0=0.005, boil=0.007, hold=0.45, merge=2.0, soft=1.2, min_area=360,
    wash=0.03, line=2.8, line_alpha=0.92, feat_alpha=0.75, feat_lo=0.011, feat_hi=0.028, feat_min=120,
    strokes=0.78, hair_bias=1.7, ink=c("#06050a"),
    ground=dict(cuts=[0.10, 0.28, 0.55], colours=[c("#04060b"), c("#0b1220"), c("#1b2a42"), c("#45607e")]),
    hair=dict(cuts=[0.20, 0.45], colours=[c("#070609"), c("#151112"), c("#352b28")]),
    face=dict(cuts=[0.12, 0.22, 0.36, 0.56], colours=FACE_MOON),
    hands=dict(cuts=[0.12, 0.22, 0.36, 0.56], colours=FACE_MOON),
    cloth=dict(cuts=[0.09, 0.22, 0.44],
               colours=[c("#05060b"), c("#0f1624"), c("#1f2d42"), c("#43566f")],
               right=[c("#070605"), c("#17130f"), c("#30281e"), c("#5a4b37")]),
)

FACE_SODIUM = [c("#0d090c"), c("#2a1819"), c("#6a3e2e"), c("#b97945"), c("#efbf80")]

# sodium street lamps in town: warm key sweeping over, cool shadows
SODIUM = look(
    MOON,
    ground=dict(cuts=[0.10, 0.30, 0.66], colours=[c("#05050a"), c("#121522"), c("#352d33"), c("#c48446")]),
    hair=dict(cuts=[0.22, 0.55], colours=[c("#080609"), c("#1c140f"), c("#45301d")]),
    face=dict(cuts=[0.12, 0.24, 0.40, 0.62], colours=FACE_SODIUM),
    hands=dict(cuts=[0.12, 0.24, 0.40, 0.62], colours=FACE_SODIUM),
    cloth=dict(cuts=[0.09, 0.23, 0.46],
               colours=[c("#06060b"), c("#141826"), c("#2e3044"), c("#6d5a4a")],
               right=[c("#070605"), c("#1c1610"), c("#3e3021"), c("#76603f")]),
)

# the desert road at dusk, the sky the last light
ROAD = look(
    MOON, black=0.02, white=0.95, gamma=1.0, l0=0.004, min_area=200, strokes=0, feat_alpha=0, line_alpha=0,
    ground=dict(cuts=[0.08, 0.22, 0.50, 0.80],
                colours=[c("#020309"), c("#070c18"), c("#101b30"), c("#22385a"), c("#3f5d84")]),
)

# the car going away: a day shot darkened into night (day-for-night), then the real night
ROAD_DAY4NIGHT = look(
    ROAD, black=0.0, white=1.0, gamma=2.2,
    ground=dict(cuts=[0.05, 0.20, 0.45, 0.80],
                colours=[c("#010206"), c("#050913"), c("#0c1528"), c("#172742"), c("#2b4366")]),
)

# hands rubbing in a lap: the commercial's white table becomes a dark coat
HANDS = look(
    MOON, black=0.30, white=0.92, gamma=1.0, vignette=(0.62, 1.05), edges=(8, 22, 140, 0.8),
    feat_s=(4.0, 9.0), feat_blur=3.0, feat_lo=0.006, feat_hi=0.018, feat_min=400, feat_alpha=0.85,
    l0=0.004, min_area=500, strokes=0, line=3.2,
    ground=dict(cuts=[0.3, 0.6, 0.85], colours=[c("#04050a"), c("#080c16"), c("#0d1322"), c("#141d30")]),
    hands=dict(cuts=[0.18, 0.34, 0.52, 0.72], colours=FACE_MOON),
)

# the dash at night: the advert's cream dash and red seats become a dark panel and chrome
DASH = look(
    MOON, black=0.10, white=1.0, gamma=1.5, l0=0.004, min_area=260, strokes=0, line=3.2, edges=(10, 28, 120, 0.8),
    clahe=(2.0, 6),
    feat_lo=0.012, feat_hi=0.03, feat_min=200, feat_alpha=0.6,
    ground=dict(cuts=[0.12, 0.30, 0.55, 0.80],
                colours=[c("#020308"), c("#060a14"), c("#0f1828"), c("#22324a"), c("#5c7290")]),
    hands=dict(cuts=[0.15, 0.30, 0.48, 0.66], colours=FACE_MOON),
)
