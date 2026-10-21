"""The kitchen of "Almost": a 1:6 miniature set, built as a model maker would build it.

A worn plank table under a hanging enamel lamp, two mismatched chairs, papered wall, a dark
window, a clock and the edge of an old fridge. Nothing else: the figures and the table top between
them are the film.

Coordinates in metres. The figures sit side by side behind the table (y > 0) facing the camera
(-y); x = 0 is the middle of the gap between them; z = 0 is the floor.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

import lib
from lib import Nodes, rgba, scaled, srgb

# the top's height: 27 mm above the seat, an adult's table to these figures (their shoulders 59 mm
# above the seat, upper arms 29 mm). At 41 mm, a child's at a grown-up table, a forearm laid on the
# wood had nowhere to put its elbow but out to the side or up over the shoulder (the artist: "his
# left arm bends at a completely unnatural angle", 2026-10-21)
TABLE_TOP = 0.098
TABLE_X = (-0.112, 0.112)
TABLE_Y = (-0.160, 0.0)    # the far edge, nearest the figures, at y = 0 (the near edge out of frame)
TOP_T = 0.0065             # thickness of the top
WARP = 0.0004              # the top rises this much toward its middle (old wood is never flat)
WALL_Y = 0.150             # the back wall's face
SEAT_Z = 0.071             # chair seat surface
CHAIR_X = {'a': -0.041, 'b': 0.041}   # a strip of chair back between their near elbows (reviews, 2026-10-20)
CHAIR_Y = 0.031          # (room between their laps and the table's edge for a hand to go down)
LAMP = Vector((0.0, -0.016, 0.233))  # the shade's bottom rim centre (just above the 16:9 frame: its light, not its rim)
BULB_UP = 0.021                       # the bulb sits this far up inside the shade

PALETTE = {
    'amber': srgb('#e0a253'), 'cream': srgb('#e6dcc2'), 'ivory': srgb('#efe6cf'), 'tobacco': srgb('#6e4a2c'),
    'bluegrey': srgb('#73808b'), 'rust': srgb('#9b5a43'), 'sage': srgb('#97a084'), 'night': srgb('#1b2433'),
}


# -- materials ------------------------------------------------------------------------------------


def table_wood():
    """Pine planks under old varnish, flat-sawn: each plank cut from its own log, so its rings
    cross the face as long bands and arches (the log's heart below the board, bending along it);
    dark latewood, fine streaks along the grain; the seams between three planks; a cup ring;
    finish worn pale and rough along the far edge where forearms rest; fine scratches."""
    mat = bpy.data.materials.new('table wood')
    n = Nodes(mat)
    tc = n.add('ShaderNodeTexCoord')
    obj = tc.outputs['Object']
    sep = n.add('ShaderNodeSeparateXYZ', Vector=obj)
    x, y, z = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
    width = 0.128 / 3
    pid = n.math('FLOOR', n.math('DIVIDE', n.math('ADD', y, 0.128), width))
    r1 = n.add('ShaderNodeTexWhiteNoise', _noise_dimensions='1D', W=pid).outputs['Value']
    r2 = n.add('ShaderNodeTexWhiteNoise', _noise_dimensions='1D', W=n.math('ADD', pid, 7.3)).outputs['Value']
    centre = n.math('ADD', n.math('MULTIPLY', pid, width), -0.128 + width / 2)
    y0 = n.math('ADD', centre, n.math('MULTIPLY', n.math('SUBTRACT', r1, 0.5), 0.05))
    rise = n.add('ShaderNodeTexNoise', _noise_dimensions='2D', Vector=n.add('ShaderNodeCombineXYZ', X=n.math('MULTIPLY', x, 14.0), Y=n.math('ADD', pid, 3.1)).outputs['Vector'],
                 Scale=1.0, Detail=1.0)
    z0 = n.math('SUBTRACT', n.math('SUBTRACT', TABLE_TOP - 0.004, n.math('MULTIPLY', r2, 0.010)), n.math('MULTIPLY', rise.outputs['Fac'], 0.025))
    bend = n.add('ShaderNodeTexNoise', _noise_dimensions='2D', Vector=n.add('ShaderNodeCombineXYZ', X=n.math('MULTIPLY', x, 6.0), Y=pid).outputs['Vector'],
                 Scale=1.0, Detail=2.0)
    yy = n.math('SUBTRACT', n.math('ADD', y, n.math('MULTIPLY', n.math('SUBTRACT', bend.outputs['Fac'], 0.5), 0.012)), y0)
    zz = n.math('SUBTRACT', z, z0)
    r = n.math('SQRT', n.math('ADD', n.math('MULTIPLY', yy, yy), n.math('MULTIPLY', zz, zz)))
    jitter = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=n.add('ShaderNodeMapping', Vector=obj, Scale=(0.15, 1.0, 1.0)).outputs['Vector'],
                   Scale=160.0, Detail=3.0)
    r = n.math('ADD', r, n.math('MULTIPLY', jitter.outputs['Fac'], 0.0007))
    # (a good year and a dry one: each ring its own width, ±0.8 mm, not corduroy)
    years = n.add('ShaderNodeTexNoise', _noise_dimensions='1D', W=n.math('ADD', n.math('MULTIPLY', r, 260.0), n.math('MULTIPLY', pid, 5.7)),
                  Scale=1.0, Detail=1.0)
    r = n.math('ADD', r, n.math('MULTIPLY', n.math('SUBTRACT', years.outputs['Fac'], 0.5), 0.0016))
    ring = n.math('FRACT', n.math('DIVIDE', r, 0.0019))
    late = n.math('MULTIPLY', n.math('SMOOTHSTEP' if False else 'GREATER_THAN', ring, 0.70), n.math('LESS_THAN', ring, 0.95))
    soft = n.math('POWER', ring, 3.0)
    streak = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=n.add('ShaderNodeMapping', Vector=obj, Scale=(0.03, 1.0, 1.0)).outputs['Vector'],
                   Scale=1400.0, Detail=2.0)
    # (an old tobacco varnish, half the albedo of the first pine: the felt hands and the fold read
    # light on it, and the lamp's pool shows its fall-off: the directors' reviews, 2026-10-20)
    early, latec = srgb('#75593c'), srgb('#3e2816')
    figure = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=obj, Scale=30.0, Detail=3.0)
    col = n.mix(n.math('MULTIPLY', figure.outputs['Fac'], 0.6), rgba(early), rgba(scaled(early, 0.8)))
    col = n.mix(n.math('ADD', n.math('MULTIPLY', late, 0.42), n.math('MULTIPLY', soft, 0.18)), col, rgba(latec))
    col = n.mix(n.math('MULTIPLY', n.math('GREATER_THAN', streak.outputs['Fac'], 0.62), 0.25), col, rgba(scaled(latec, 0.8)))
    # plank seams
    seam = None
    for y_s in (-0.128 + width, -0.128 + 2 * width):
        d = n.math('ABSOLUTE', n.math('SUBTRACT', n.math('ADD', y, n.math('MULTIPLY', bend.outputs['Fac'], 0.0004)), y_s))
        sm = n.math('SUBTRACT', 1.0, n.math('MINIMUM', n.math('DIVIDE', d, 0.0005), 1.0))
        seam = sm if seam is None else n.math('MAXIMUM', seam, sm)
    col = n.mix(n.math('MULTIPLY', seam, 0.9), col, rgba(srgb('#2a1a0e')))
    # a pale cup ring on her side, where no cup stands tonight (many evenings, without an object)
    ring2 = n.math('ABSOLUTE', n.math('SUBTRACT', _dist(n, obj, (0.066, -0.044)), 0.0072))
    ring2 = n.math('SUBTRACT', 1.0, n.math('MINIMUM', n.math('DIVIDE', ring2, 0.0007), 1.0))
    col = n.mix(n.math('MULTIPLY', ring2, 0.35), col, rgba(srgb('#4a3018')))
    # worn finish toward the far edge, where forearms rest
    wear_y = n.math('MAXIMUM', 0.0, n.math('SUBTRACT', 1.0, n.math('DIVIDE', n.math('ABSOLUTE', y), 0.035)))
    wear_n = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=obj, Scale=140.0, Detail=4.0)
    wear = n.math('MULTIPLY', wear_y, n.math('MULTIPLY', wear_n.outputs['Fac'], 1.3), clamp=True)
    col = n.mix(n.math('MULTIPLY', wear, 0.45), col, rgba(srgb('#9a7a58')))
    grime = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=obj, Scale=45.0, Detail=5.0, Roughness=0.7)
    col = n.mix(n.math('MULTIPLY', n.math('SUBTRACT', grime.outputs['Fac'], 0.45), 0.9, clamp=True), col, rgba(srgb('#3b2716')))
    # scratches, mostly along the grain, a few across
    sm = n.add('ShaderNodeMapping', Vector=obj, Scale=(30.0, 1400.0, 1400.0), Rotation=(0, 0, 0.12))
    sc = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=sm.outputs['Vector'], Scale=1.0, Detail=1.0)
    scr = n.math('GREATER_THAN', sc.outputs['Fac'], 0.75)
    sm2 = n.add('ShaderNodeMapping', Vector=obj, Scale=(1200.0, 25.0, 1200.0), Rotation=(0, 0, -0.5))
    sc2 = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=sm2.outputs['Vector'], Scale=1.0, Detail=1.0)
    scr = n.math('MAXIMUM', scr, n.math('GREATER_THAN', sc2.outputs['Fac'], 0.80))
    col = n.mix(n.math('MULTIPLY', scr, 0.25), col, rgba(srgb('#dcc09a')))
    height = n.math('SUBTRACT', n.math('MULTIPLY', late, 0.25), n.math('ADD', n.math('MULTIPLY', seam, 1.5), n.math('MULTIPLY', scr, 0.3)))
    height = n.math('ADD', height, n.math('MULTIPLY', streak.outputs['Fac'], 0.2))
    bump = n.add('ShaderNodeBump', Strength=0.3, Distance=0.00025, Height=height)
    rough = n.math('ADD', n.math('ADD', 0.38, n.math('MULTIPLY', wear, 0.35)), n.math('MULTIPLY', late, 0.08))
    bsdf = n.add('ShaderNodeBsdfPrincipled', **{'Base Color': col, 'Roughness': rough, 'Specular IOR Level': 0.45,
                                               'Coat Weight': 0.15, 'Coat Roughness': 0.3, 'Normal': bump.outputs['Normal']})
    n.out(bsdf.outputs['BSDF'])
    return mat


def _dist(n, vec, xy):
    """Distance in the xy plane from `vec` to the point `xy` (a node output)."""
    sep = n.add('ShaderNodeSeparateXYZ', Vector=vec)
    dx = n.math('SUBTRACT', sep.outputs['X'], xy[0])
    dy = n.math('SUBTRACT', sep.outputs['Y'], xy[1])
    return n.math('SQRT', n.math('ADD', n.math('MULTIPLY', dx, dx), n.math('MULTIPLY', dy, dy)))


def wallpaper():
    """Old wallpaper, yellowed: faded sage stripes on cream, the paper's fibre, strips butted at
    seams 0.088 m apart (53 cm real), darker toward the floor and the corners."""
    mat = bpy.data.materials.new('wallpaper')
    n = Nodes(mat)
    tc = n.add('ShaderNodeTexCoord')
    obj = tc.outputs['Object']
    sep = n.add('ShaderNodeSeparateXYZ', Vector=obj)
    x = sep.outputs['X']
    # stripes: a broad faded band and a pair of fine lines, period 0.022 m
    f = n.math('FRACT', n.math('DIVIDE', x, 0.022))
    band = n.math('MULTIPLY', n.math('GREATER_THAN', f, 0.62), n.math('LESS_THAN', f, 0.86))
    fine = n.math('ADD', n.math('MULTIPLY', n.math('GREATER_THAN', f, 0.27), n.math('LESS_THAN', f, 0.295)),
                  n.math('MULTIPLY', n.math('GREATER_THAN', f, 0.33), n.math('LESS_THAN', f, 0.355)))
    paper, stripe = srgb('#b9aa88'), srgb('#8e9278')
    col = n.mix(n.math('MULTIPLY', band, 0.55), rgba(paper), rgba(stripe))
    col = n.mix(n.math('MULTIPLY', fine, 0.4), col, rgba(scaled(stripe, 0.85)))
    blot = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=obj, Scale=14.0, Detail=5.0, Roughness=0.65)
    col = n.mix(n.math('MULTIPLY', n.math('SUBTRACT', blot.outputs['Fac'], 0.35), 0.5, clamp=True), col, rgba(srgb('#a8946a')))
    # seams between strips
    fs = n.math('FRACT', n.math('DIVIDE', n.math('ADD', x, 0.031), 0.088))
    seam = n.math('LESS_THAN', n.math('ABSOLUTE', n.math('SUBTRACT', fs, 0.5)), 0.004)
    col = n.mix(n.math('MULTIPLY', seam, 0.25), col, rgba(srgb('#8f7f5c')))
    fib = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=obj, Scale=2600.0, Detail=8.0, Roughness=0.7)
    bump = n.add('ShaderNodeBump', Strength=0.2, Distance=0.0002, Height=n.math('ADD', fib.outputs['Fac'], n.math('MULTIPLY', seam, 0.8)))
    bsdf = n.add('ShaderNodeBsdfPrincipled', **{'Base Color': col, 'Roughness': 0.88, 'Specular IOR Level': 0.3,
                                               'Normal': bump.outputs['Normal']})
    n.out(bsdf.outputs['BSDF'])
    return mat


def enamel(name, outside, inside=None, chips=None):
    """Old enamel (the lamp shade, the fridge): soft gloss, faintly crazed, small chips."""
    mat = bpy.data.materials.new(name)
    n = Nodes(mat)
    tc = n.add('ShaderNodeTexCoord')
    obj = tc.outputs['Object']
    nz = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=obj, Scale=70.0, Detail=6.0)
    col = n.mix(n.math('MULTIPLY', nz.outputs['Fac'], 0.25), rgba(outside), rgba(scaled(outside, 0.82)))
    if inside is not None:
        geo = n.add('ShaderNodeNewGeometry')
        col = n.mix(geo.outputs['Backfacing'], col, rgba(inside))
    height = n.math('MULTIPLY', nz.outputs['Fac'], 0.1)
    if chips is not None:
        cz = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=obj, Scale=95.0, Detail=4.0, Roughness=0.7)
        ch = n.math('GREATER_THAN', cz.outputs['Fac'], 0.71)
        col = n.mix(ch, col, rgba(chips))
        height = n.math('SUBTRACT', height, n.math('MULTIPLY', ch, 0.5))
    bump = n.add('ShaderNodeBump', Strength=0.2, Distance=0.0002, Height=height)
    rough = n.math('ADD', 0.22, n.math('MULTIPLY', nz.outputs['Fac'], 0.2))
    bsdf = n.add('ShaderNodeBsdfPrincipled', **{'Base Color': col, 'Roughness': rough, 'Specular IOR Level': 0.5,
                                               'Normal': bump.outputs['Normal']})
    n.out(bsdf.outputs['BSDF'])
    return mat


def metal(name, color, rough=0.3):
    mat = bpy.data.materials.new(name)
    n = Nodes(mat)
    tc = n.add('ShaderNodeTexCoord')
    nz = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=tc.outputs['Object'], Scale=200.0, Detail=4.0)
    r = n.math('ADD', rough, n.math('MULTIPLY', nz.outputs['Fac'], 0.15))
    bsdf = n.add('ShaderNodeBsdfPrincipled', **{'Base Color': rgba(color), 'Metallic': 1.0, 'Roughness': r})
    n.out(bsdf.outputs['BSDF'])
    return mat


def glass():
    mat = bpy.data.materials.new('window glass')
    n = Nodes(mat)
    tc = n.add('ShaderNodeTexCoord')
    nz = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=tc.outputs['Object'], Scale=30.0, Detail=3.0)
    bump = n.add('ShaderNodeBump', Strength=0.05, Distance=0.0003, Height=nz.outputs['Fac'])
    bsdf = n.add('ShaderNodeBsdfPrincipled', **{'Base Color': (0.9, 0.93, 0.95, 1), 'Roughness': 0.03, 'IOR': 1.5,
                                               'Transmission Weight': 1.0, 'Normal': bump.outputs['Normal']})
    n.out(bsdf.outputs['BSDF'])
    mat.surface_render_method = 'BLENDED' if False else mat.surface_render_method
    return mat


def night(strength):
    """Outside the window: deep blue night, a little lighter low down (a town's glow)."""
    mat = bpy.data.materials.new('night')
    n = Nodes(mat)
    tc = n.add('ShaderNodeTexCoord')
    sep = n.add('ShaderNodeSeparateXYZ', Vector=tc.outputs['Generated'])
    col = n.mix(sep.outputs['Z'], rgba(srgb('#2b3a4f')), rgba(srgb('#0d1522')))
    nz = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=tc.outputs['Object'], Scale=6.0, Detail=2.0)
    col = n.mix(n.math('MULTIPLY', nz.outputs['Fac'], 0.3), col, rgba(srgb('#1a2333')))
    e = n.add('ShaderNodeEmission', Color=col, Strength=strength)
    n.out(e.outputs[0])
    return mat


def clock_face():
    """A clock face: cream, twelve short marks, a printed ring."""
    mat = bpy.data.materials.new('clock face')
    n = Nodes(mat)
    tc = n.add('ShaderNodeTexCoord')
    sep = n.add('ShaderNodeSeparateXYZ', Vector=tc.outputs['Object'])
    r = n.math('SQRT', n.math('ADD', n.math('MULTIPLY', sep.outputs['X'], sep.outputs['X']), n.math('MULTIPLY', sep.outputs['Z'], sep.outputs['Z'])))
    ang = n.math('ARCTAN2', sep.outputs['X'], sep.outputs['Z'])
    k = n.math('FRACT', n.math('ADD', n.math('DIVIDE', ang, 2 * math.pi / 12), 0.5))
    mark = n.math('MULTIPLY', n.math('LESS_THAN', n.math('ABSOLUTE', n.math('SUBTRACT', k, 0.5)), 0.06),
                  n.math('MULTIPLY', n.math('GREATER_THAN', r, 0.0118), n.math('LESS_THAN', r, 0.0142)))
    ring = n.math('MULTIPLY', n.math('GREATER_THAN', r, 0.0148), n.math('LESS_THAN', r, 0.0152))
    ink = n.math('MAXIMUM', mark, ring)
    col = n.mix(ink, rgba(srgb('#e4dcc4')), rgba(srgb('#2b2620')))
    aged = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=tc.outputs['Object'], Scale=120.0, Detail=4.0)
    col = n.mix(n.math('MULTIPLY', aged.outputs['Fac'], 0.3), col, rgba(srgb('#b9a77e')))
    bsdf = n.add('ShaderNodeBsdfPrincipled', **{'Base Color': col, 'Roughness': 0.6})
    n.out(bsdf.outputs['BSDF'])
    return mat


# -- geometry -------------------------------------------------------------------------------------


def top_at(x, y):
    """The table top's height at (x, y), warp and all (what a hand laid there rests on)."""
    u = (x - TABLE_X[0]) / (TABLE_X[1] - TABLE_X[0])
    v = (y - TABLE_Y[0]) / (TABLE_Y[1] - TABLE_Y[0])
    if not (0.0 <= u <= 1.0 and 0.0 <= v <= 1.0):
        return TABLE_TOP
    return TABLE_TOP + WARP * math.sin(u * math.pi) * math.sin(v * math.pi * 0.7 + 0.3)


def plank_top(name, x0, x1, y0, y1, z, t, mat, seed=0):
    """The table top: a slab with softened, unevenly worn edges and a slight warp."""
    bm = bmesh.new()
    nx, ny = 56, 34
    verts = {}
    for i in range(nx + 1):
        for j in range(ny + 1):
            u, v = i / nx, j / ny
            x, y = x0 + (x1 - x0) * u, y0 + (y1 - y0) * v
            warp = WARP * math.sin(u * math.pi) * math.sin(v * math.pi * 0.7 + 0.3)
            verts[i, j, 1] = bm.verts.new((x, y, z + warp))
            verts[i, j, 0] = bm.verts.new((x, y, z - t + warp))
    for i in range(nx):
        for j in range(ny):
            bm.faces.new((verts[i, j, 1], verts[i + 1, j, 1], verts[i + 1, j + 1, 1], verts[i, j + 1, 1]))
            bm.faces.new((verts[i, j + 1, 0], verts[i + 1, j + 1, 0], verts[i + 1, j, 0], verts[i, j, 0]))
    for i in range(nx):
        for j, flip in ((0, False), (ny, True)):
            q = (verts[i, j, 0], verts[i + 1, j, 0], verts[i + 1, j, 1], verts[i, j, 1])
            bm.faces.new(q[::-1] if flip else q)
    for j in range(ny):
        for i, flip in ((0, True), (nx, False)):
            q = (verts[i, j, 0], verts[i, j + 1, 0], verts[i, j + 1, 1], verts[i, j, 1])
            bm.faces.new(q[::-1] if flip else q)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = lib.mesh_object(name, bm, mat, smooth=False, subdiv=0)
    b = ob.modifiers.new('worn edge', 'BEVEL')
    b.width, b.segments, b.limit_method = 0.0016, 4, 'ANGLE'
    ob.modifiers.new('normals', 'WEIGHTED_NORMAL').keep_sharp = False
    # small nicks along the near and far edges: dents pushed into the top
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def leg(name, x, y, z0, z1, w, mat):
    ob = lib.rounded_box(name, (w, w, z1 - z0), center=(x, y, (z0 + z1) / 2), bevel=0.0007, material=mat)
    return ob


def table(mat):
    x0, x1 = TABLE_X
    y0, y1 = TABLE_Y
    top = plank_top('table top', x0, x1, y0, y1, TABLE_TOP, TOP_T, mat)
    zap = TABLE_TOP - TOP_T
    parts = [top]
    ap_h, ap_t = 0.006, 0.004      # (shallow: the knees go under it)
    parts.append(lib.rounded_box('apron front', (x1 - x0 - 0.03, ap_t, ap_h), center=(0, y0 + 0.012, zap - ap_h / 2), bevel=0.0005, material=mat))
    parts.append(lib.rounded_box('apron back', (x1 - x0 - 0.03, ap_t, ap_h), center=(0, y1 - 0.012, zap - ap_h / 2), bevel=0.0005, material=mat))
    for sx in (x0 + 0.013, x1 - 0.013):
        parts.append(lib.rounded_box('apron side', (ap_t, y1 - y0 - 0.026, ap_h), center=(sx, (y0 + y1) / 2, zap - ap_h / 2), bevel=0.0005, material=mat))
        for sy in (y0 + 0.011, y1 - 0.011):
            parts.append(leg('table leg', sx, sy, 0.0, zap, 0.0085, mat))
    return parts


def chair_spindle(mat, x, y, seed=1):
    """B's chair: a spindle-back kitchen chair, painted."""
    parts = []
    sw, sd, st = 0.054, 0.05, 0.0045
    parts.append(lib.rounded_box('seat', (sw, sd, st), center=(x, y, SEAT_Z - st / 2), bevel=0.0012, material=mat))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(lib.cylinder('chair leg', 0.0028, SEAT_Z - st, center=(x + sx * (sw / 2 - 0.004), y + sy * (sd / 2 - 0.004), (SEAT_Z - st) / 2), material=mat))
    top_z = SEAT_Z + 0.078
    back_y = y + sd / 2 - 0.003
    for sx in (-1, 1):
        parts.append(lib.cylinder('back post', 0.0026, top_z - SEAT_Z + 0.002, center=(x + sx * (sw / 2 - 0.004), back_y, (top_z + SEAT_Z) / 2), material=mat))
    parts.append(lib.rounded_box('top rail', (sw + 0.002, 0.005, 0.011), center=(x, back_y + 0.0005, top_z - 0.004), bevel=0.0015, material=mat))
    for k in range(4):
        sx = (k - 1.5) * 0.0095
        parts.append(lib.cylinder('spindle', 0.0014, 0.064, center=(x + sx, back_y, SEAT_Z + 0.034), material=mat))
    return parts


def chair_ladder(mat, x, y):
    """A's chair: the white room's own chair at the puppets' size (src/world/Chair.ts), half
    recognised: a plain ladder-back in pale oiled wood, square legs, the back posts raked back and
    running on above a wider top rail to rounded caps, two slats, the middle one not quite level."""
    parts = []
    sw, sd, st = 0.054, 0.050, 0.0045
    parts.append(lib.rounded_box('seat', (sw, sd, st), center=(x, y, SEAT_Z - st / 2), bevel=0.0012, material=mat))
    leg = 0.0048
    for sx in (-1, 1):
        parts.append(lib.rounded_box('chair leg', (leg, leg, SEAT_Z - st), center=(x + sx * (sw / 2 - 0.0035), y - sd / 2 + 0.0035, (SEAT_Z - st) / 2), bevel=0.0006, material=mat))
    # the back posts: from the floor, raked back, on above the top rail (the left a little short)
    rake = 0.0075
    rail_z = SEAT_Z + 0.072
    for sx, top in ((-1, SEAT_Z + 0.0815), (1, SEAT_Z + 0.0835)):
        x0, y0 = x + sx * (sw / 2 - 0.0035), y + sd / 2 - 0.0035
        a, b = Vector((x0, y0, 0.0)), Vector((x0 - sx * 0.0015, y0 + rake, top))
        post = lib.rounded_box('back post', (leg, leg, (b - a).length), bevel=0.0006, material=mat)
        d = (b - a).normalized()
        post.data.transform(Matrix.Translation((a + b) / 2) @ Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4())
        parts.append(post)
        parts.append(lib.egg('post cap', (leg * 0.5, leg * 0.5, leg * 0.26), center=(b.x, b.y, top + leg * 0.12), wob=0.0, material=mat, subdiv=1))
    # the top rail and two slats, following the rake
    def back_y(z):
        return y + sd / 2 - 0.0035 + rake * z / (SEAT_Z + 0.083)
    for z, h, tilt in ((rail_z, 0.0105, 0.0), (rail_z - 0.019, 0.0068, math.radians(3.2)), (rail_z - 0.037, 0.0068, 0.0)):
        slat = lib.rounded_box('slat', (sw - 0.002, 0.0034, h), bevel=0.0007, material=mat)
        slat.data.transform(Matrix.Translation((x, back_y(z) + 0.0004, z)) @ Matrix.Rotation(tilt, 4, 'Y') @ Matrix.Rotation(-math.atan2(rake, SEAT_Z + 0.083), 4, 'X'))
        parts.append(slat)
    # square stretchers, low at the sides
    for sx in (-1, 1):
        parts.append(lib.rounded_box('stretcher', (0.0032, sd - 0.006, 0.0032), center=(x + sx * (sw / 2 - 0.0035), y, 0.018), bevel=0.0004, material=mat))
    parts.append(lib.rounded_box('stretcher', (sw - 0.006, 0.0032, 0.0032), center=(x, y - sd / 2 + 0.0035, 0.029), bevel=0.0004, material=mat))
    return parts


def chair_painted(mat, x, y):
    """B's chair: a painted ladder-back, the paint worn through to wood."""
    parts = []
    sw, sd, st = 0.052, 0.049, 0.0042
    parts.append(lib.rounded_box('seat', (sw, sd, st), center=(x, y, SEAT_Z - st / 2), bevel=0.0009, material=mat))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(lib.rounded_box('chair leg', (0.0046, 0.0046, SEAT_Z - st), center=(x + sx * (sw / 2 - 0.0035), y + sy * (sd / 2 - 0.0035), (SEAT_Z - st) / 2), bevel=0.0006, material=mat))
    top_z = SEAT_Z + 0.082
    back_y = y + sd / 2 - 0.0028
    for sx in (-1, 1):
        parts.append(lib.rounded_box('back post', (0.0046, 0.0046, top_z - SEAT_Z + 0.004), center=(x + sx * (sw / 2 - 0.0035), back_y, (top_z + SEAT_Z) / 2 + 0.002), bevel=0.0006, material=mat))
    for z in (top_z - 0.006, top_z - 0.026, top_z - 0.046):
        parts.append(lib.rounded_box('slat', (sw - 0.004, 0.0032, 0.0085), center=(x, back_y, z), bevel=0.0007, material=mat))
    return parts


def lamp(shade_mat, inside_mat, dark):
    """A modest enamel pendant: a deep dome, cream inside, on a cloth cord. Deep, so it flags its
    own bulb: a pool on the table between them, the table's ends and the room in the dark."""
    bm = bmesh.new()
    prof = [(0.0295, 0.0), (0.0285, 0.004), (0.0262, 0.011), (0.0228, 0.018), (0.018, 0.025), (0.012, 0.030), (0.0072, 0.033), (0.0058, 0.036)]
    seg = 64
    rings = []
    for r, h in prof:
        rings.append([bm.verts.new((LAMP.x + r * math.cos(2 * math.pi * k / seg), LAMP.y + r * math.sin(2 * math.pi * k / seg), LAMP.z + h)) for k in range(seg)])
    for a, b in zip(rings, rings[1:]):
        for k in range(seg):
            bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
    # a rolled rim
    rim = [bm.verts.new((LAMP.x + 0.0300 * math.cos(2 * math.pi * k / seg), LAMP.y + 0.0300 * math.sin(2 * math.pi * k / seg), LAMP.z - 0.0008)) for k in range(seg)]
    for k in range(seg):
        bm.faces.new((rim[k], rim[(k + 1) % seg], rings[0][(k + 1) % seg], rings[0][k]))
    ob = lib.mesh_object('lamp shade', bm, shade_mat, subdiv=1)
    sol = ob.modifiers.new('enamel', 'SOLIDIFY')
    sol.thickness = 0.0007
    # (the inner shell is the inside: its own cream enamel, which the bulb lights; a material that
    # asked whether a face was seen from behind never saw the inside, which faces the bulb)
    ob.data.materials.append(inside_mat)
    sol.material_offset = 1
    ob.modifiers.move(1, 0)
    cord = lib.cylinder('lamp cord', 0.0011, 0.2, center=(LAMP.x, LAMP.y, LAMP.z + 0.135), material=dark)
    cap = lib.cylinder('lamp socket', 0.0052, 0.011, center=(LAMP.x, LAMP.y, LAMP.z + 0.032), material=dark, bevel=0.001)
    bulb = lib.egg('bulb', (0.010, 0.010, 0.013), center=(LAMP.x, LAMP.y, LAMP.z + BULB_UP), wob=0.0, material=lib.emission('bulb glow', srgb('#ffd59a'), 30.0), subdiv=1)
    bulb.visible_shadow = False
    return [ob, cord, cap, bulb]


WINDOW = (-0.225, -0.095, 0.142, 0.268)   # x0, x1, z0, z1 of the opening in the back wall (its sill clear of his head)


def wall(paper):
    """The back wall, built round the window's opening."""
    x0, x1, z0, z1 = WINDOW
    L, R, B, T = -0.35, 0.35, 0.0, 0.42
    y, t = WALL_Y + 0.005, 0.01
    boxes = [((L, x0), (B, T)), ((x1, R), (B, T)), ((x0, x1), (B, z0)), ((x0, x1), (z1, T))]
    return [lib.rounded_box('back wall', (xb - xa, t, zb - za), center=((xa + xb) / 2, y, (za + zb) / 2), bevel=0, material=paper)
            for (xa, xb), (za, zb) in boxes]


def window(frame_mat):
    """A small sash window in the back wall, behind A, dark."""
    x0, x1, z0, z1 = WINDOW
    parts = []
    t = 0.006
    parts.append(lib.rounded_box('sill', (x1 - x0 + 0.018, 0.016, 0.0045), center=((x0 + x1) / 2, WALL_Y - 0.004, z0 - 0.0022), bevel=0.0008, material=frame_mat))
    for x in (x0, x1):
        parts.append(lib.rounded_box('jamb', (t, 0.007, z1 - z0), center=(x, WALL_Y - 0.002, (z0 + z1) / 2), bevel=0.0006, material=frame_mat))
    parts.append(lib.rounded_box('head', (x1 - x0 + t, 0.007, t), center=((x0 + x1) / 2, WALL_Y - 0.002, z1), bevel=0.0006, material=frame_mat))
    parts.append(lib.rounded_box('meeting rail', (x1 - x0, 0.006, 0.004), center=((x0 + x1) / 2, WALL_Y - 0.001, (z0 + z1) / 2), bevel=0.0005, material=frame_mat))
    parts.append(lib.rounded_box('glazing bar', (0.0028, 0.005, z1 - z0), center=((x0 + x1) / 2, WALL_Y - 0.0005, (z0 + z1) / 2), bevel=0.0004, material=frame_mat))
    pane = lib.rounded_box('glass', (x1 - x0, 0.0008, z1 - z0), center=((x0 + x1) / 2, WALL_Y + 0.001, (z0 + z1) / 2), bevel=0, material=glass())
    # (the night outside comes through it: as a shadow-caster the glass kept the window's light
    # out of the room, and the table had no cool side)
    pane.visible_shadow = False
    parts.append(pane)
    out = lib.rounded_box('outside', (0.5, 0.002, 0.4), center=((x0 + x1) / 2, WALL_Y + 0.09, (z0 + z1) / 2), bevel=0, material=night(0.25))
    parts.append(out)
    return parts, (x0, x1, z0, z1)


def clock(rim_mat, hand_mat):
    c = Vector((0.092, WALL_Y - 0.004, 0.236))
    rim = lib.cylinder('clock rim', 0.0175, 0.006, center=c, rotation=(math.pi / 2, 0, 0), material=rim_mat, bevel=0.0012)
    face = lib.cylinder('clock face', 0.0158, 0.0007, center=c + Vector((0, -0.0031, 0)), rotation=(math.pi / 2, 0, 0), material=clock_face())
    face_ob = face
    # hands at ten to eleven, the time it always is at this table
    parts = [rim, face_ob]
    for ang, ln, wd in ((math.radians(-35), 0.0085, 0.0011), (math.radians(-60 + 360 * 50 / 60), 0.0125, 0.0008)):
        h = lib.rounded_box('clock hand', (wd, 0.0004, ln), center=(0, 0, ln / 2 - 0.0015), bevel=0, material=hand_mat)
        h.matrix_world = Matrix.Translation(c + Vector((0, -0.0038, 0))) @ Matrix.Rotation(ang, 4, 'Y')
        parts.append(h)
    return parts


def fridge(mat, handle_mat):
    """The corner of an old rounded fridge at the right, mostly in shadow."""
    body = lib.rounded_box('fridge', (0.1, 0.092, 0.25), center=(0.205, 0.07, 0.125), bevel=0.012, material=mat, segments=6)
    handle = lib.rounded_box('fridge handle', (0.004, 0.006, 0.04), center=(0.159, 0.02, 0.17), bevel=0.0015, material=handle_mat)
    return [body, handle]


def cup(glaze_mat):
    """A chipped cup by A's right hand: ivory glaze, a notch knocked out of the rim."""
    c = Vector((-0.082, -0.040, TABLE_TOP))
    bm = bmesh.new()
    seg = 48
    prof = [(0.0, 0.0), (0.0068, 0.0), (0.0074, 0.0012), (0.0078, 0.006), (0.0083, 0.0128), (0.0085, 0.0138),
            (0.0078, 0.0138), (0.0076, 0.0125), (0.0071, 0.006), (0.0064, 0.0016), (0.0, 0.0016)]
    # the chip: 3 mm of the rim, toward the lens, knocked a millimetre down, unevenly (a notch in
    # the rim's line; a clay patch on it read as a strip of tape: the creative director's gate review)
    notch = -math.pi / 4
    jag = [0.75, 1.0, 0.55, 0.95, 0.7, 1.0, 0.6]

    def chipped(k):
        d = math.remainder(2 * math.pi * k / seg - notch, 2 * math.pi) * 0.0085
        return max(0.0, 1.0 - (d / 0.0016) ** 2) * jag[k % len(jag)]
    rings = []
    for i, (r, h) in enumerate(prof):
        ring = []
        for k in range(seg):
            dz = -0.0011 * chipped(k) * {4: 0.35, 5: 1.0, 6: 1.0, 7: 0.45}.get(i, 0.0)
            th = 2 * math.pi * k / seg
            ring.append(bm.verts.new(c + Vector((r * math.cos(th), r * math.sin(th), h + dz))))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for k in range(seg):
            bm.faces.new((a[k], a[(k + 1) % seg], b[(k + 1) % seg], b[k]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = lib.mesh_object('cup', bm, glaze_mat, subdiv=1)
    handle = lib.tube('cup handle', [c + Vector((-0.0078, 0.0, 0.0115)), c + Vector((-0.0118, 0.0, 0.0105)), c + Vector((-0.0128, 0.0, 0.0068)),
                                     c + Vector((-0.0112, 0.0, 0.0035)), c + Vector((-0.0076, 0.0, 0.003))],
                      [0.0011] * 5, segments=12, material=glaze_mat, subdiv=1, flatten=0.7, up=(0, 1, 0))
    # tea, low in the cup
    tea = lib.cylinder('tea', 0.0068, 0.0004, center=c + Vector((0, 0, 0.0062)), material=bpy.data.materials.get('tea') or _tea())
    return [ob, handle, tea]


def _tea():
    mat = bpy.data.materials.new('tea')
    n = Nodes(mat)
    bsdf = n.add('ShaderNodeBsdfPrincipled', **{'Base Color': rgba(srgb('#3a2412')), 'Roughness': 0.05, 'Specular IOR Level': 0.6})
    n.out(bsdf.outputs['BSDF'])
    return mat


def dishcloth(mat):
    """A folded dishcloth at the table's right end: a soft slab, its folded edge rounded, a corner
    turned up."""
    c = Vector((0.083, -0.07, TABLE_TOP))
    bm = bmesh.new()
    nx, ny = 24, 18
    w, d, h = 0.032, 0.024, 0.0026
    grid = {}
    for i in range(nx + 1):
        for j in range(ny + 1):
            u, v = i / nx, j / ny
            x = (u - 0.5) * w
            y = (v - 0.5) * d
            z = h * (0.75 + 0.25 * math.sin(math.pi * u)) * (0.85 + 0.15 * math.sin(math.pi * v * 1.3))
            lift = max(0.0, (u - 0.8) / 0.2) * max(0.0, (v - 0.75) / 0.25)
            grid[i, j] = bm.verts.new(c + Vector((x, y, z + lift * 0.002)))
    for i in range(nx):
        for j in range(ny):
            bm.faces.new((grid[i, j], grid[i + 1, j], grid[i + 1, j + 1], grid[i, j + 1]))
    ob = lib.mesh_object('dishcloth', bm, mat, subdiv=1)
    sol = ob.modifiers.new('cloth', 'SOLIDIFY')
    sol.thickness = 0.0022
    sol.offset = -1
    ob.modifiers.move(1, 0)
    return [ob]


def floor(boards, skirting):
    """Old floorboards under the table (seen only on an upright screen), and the skirting."""
    f = lib.rounded_box('floor', (0.9, 0.6, 0.004), center=(0.0, WALL_Y - 0.3, -0.002), bevel=0, material=boards)
    k = lib.rounded_box('skirting', (0.9, 0.004, 0.016), center=(0.0, WALL_Y - 0.002, 0.008), bevel=0.0008, material=skirting)
    return [f, k]


def floorboards():
    """Floorboards, 10 cm real (1.75 cm here), dark with old wax, worn pale down the middle of
    each where feet go, a black line between them."""
    mat = bpy.data.materials.new('floorboards')
    n = Nodes(mat)
    tc = n.add('ShaderNodeTexCoord')
    obj = tc.outputs['Object']
    sep = n.add('ShaderNodeSeparateXYZ', Vector=obj)
    w = 0.0175
    fb = n.math('FRACT', n.math('DIVIDE', sep.outputs['X'], w))
    bid = n.math('FLOOR', n.math('DIVIDE', sep.outputs['X'], w))
    rnd = n.add('ShaderNodeTexWhiteNoise', _noise_dimensions='1D', W=bid).outputs['Value']
    gap = n.math('LESS_THAN', n.math('ABSOLUTE', n.math('SUBTRACT', fb, 0.5)), 0.47)
    mp = n.add('ShaderNodeMapping', Vector=obj, Scale=(1.0, 0.06, 1.0))
    grain = n.add('ShaderNodeTexWave', _wave_type='BANDS', _bands_direction='X', Vector=mp.outputs['Vector'], Scale=220.0, Distortion=5.0, Detail=3.0)
    base = srgb('#4b3526')
    col = n.mix(n.math('MULTIPLY', rnd, 0.5), rgba(base), rgba(scaled(base, 1.25)))
    col = n.mix(n.math('MULTIPLY', n.math('POWER', grain.outputs['Fac'], 4.0), 0.5), col, rgba(scaled(base, 0.6)))
    col = n.mix(n.math('SUBTRACT', 1.0, gap), col, rgba(srgb('#120c08')))
    bsdf = n.add('ShaderNodeBsdfPrincipled', **{'Base Color': col, 'Roughness': 0.55, 'Specular IOR Level': 0.4})
    n.out(bsdf.outputs['BSDF'])
    return mat


def build(collection):
    """Build the set into `collection`; returns a dict of named parts for the shot to refer to."""
    wood = table_wood()
    paper = wallpaper()
    pale_oak = lib.wood('oiled oak', srgb('#a88d6a'), grain_scale=110.0, rings=4.0, wear=0.45)
    sage_paint = lib.painted('sage paint', srgb('#8e9878'), rough=0.7, texture=0.1, scale=260.0, chips=srgb('#a88a64'))
    cream_paint = lib.painted('cream paint', srgb('#ddd2b6'), rough=0.6, texture=0.08, scale=300.0, chips=srgb('#9b8c70'))
    shade = enamel('lamp enamel', srgb('#9aa287'), chips=srgb('#2b2b28'))
    shade_inside = enamel('lamp enamel inside', srgb('#d9cdb0'))
    fridge_enamel = enamel('fridge enamel', srgb('#d9d0b6'), chips=srgb('#5c574c'))
    dark = lib.painted('dark cloth', srgb('#2a2622'), rough=0.8)
    chrome = metal('chrome', srgb('#c8c8c4'), rough=0.25)
    glaze = lib.glazed('cup glaze', srgb('#ece3cd'), rough=0.12, dirt=0.1)
    cloth = lib.checked_cloth('dishcloth', srgb('#ddd5bf'), srgb('#b98e78'), squares=120.0)
    clock_rim = lib.painted('clock rim', srgb('#3a2e24'), rough=0.45)

    before = set(bpy.data.objects)
    parts = {}
    parts['table'] = table(wood)
    # (his chair is the white room's chair, in pale oiled wood; hers a sage-painted spindle-back:
    # the creative director's review, 2026-10-20)
    parts['chair a'] = chair_ladder(pale_oak, CHAIR_X['a'], CHAIR_Y)
    parts['chair b'] = chair_spindle(sage_paint, CHAIR_X['b'], CHAIR_Y)
    parts['wall'] = wall(paper)
    parts['window'], parts['window box'] = window(cream_paint)
    # (The clock is heard, never seen: a visible clock in a film whose tragedy is its timing is the
    # symbol the brief warns against. The dishcloth was in neither crop, and a second fold.)
    parts['fridge'] = fridge(fridge_enamel, chrome)
    parts['lamp'] = lamp(shade, shade_inside, dark)
    parts['cup'] = cup(glaze)
    parts['floor'] = floor(floorboards(), cream_paint)
    # each chair on its own pivot (on the floor under the seat), so it can scrape back a little
    for key in ('a', 'b'):
        pivot = lib.link(bpy.data.objects.new(f'chair {key} pivot', None))
        pivot.location = (CHAIR_X[key], CHAIR_Y, 0.0)
        bpy.context.view_layer.update()
        for ob in parts[f'chair {key}']:
            ob.parent = pivot
            ob.matrix_parent_inverse = pivot.matrix_world.inverted()
        parts[f'chair {key} pivot'] = pivot
    for ob in set(bpy.data.objects) - before:
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
        collection.objects.link(ob)
    return parts
