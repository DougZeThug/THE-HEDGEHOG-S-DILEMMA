"""The two felt figures of "Almost", made as a puppet maker would make them, in code.

Each figure is a stuffed felt body on a wire armature, dressed. A, the one who reaches, wears a
hand-knitted rust jumper. B, the one who startles, wears a felted blue-grey cardigan over an olive
rib-knit roll-neck, the cardigan's right cuff turned back on itself so a wedge of ivory lining shows. Both have:
- felt hands with short wire-stiffened fingers;
- a needle-felted head with knotted eyes, a felt nose and a stitched mouth;
- wool hair.

Nothing is symmetrical: each part is pushed a little out of true by its figure's seed.

**Coordinates** are the puppet's own: origin on the seat under the middle of the hips, +z up,
facing -y (the lens), +x the figure's left. Bone names follow Blender's: `.L` is the figure's left
(+x), `.R` its right (-x).

**Bones:**
- the spine: root (the seat) → spine → chest → neck → head;
- each arm: shoulder → upper_arm → forearm → hand;
- each hand's fingers (index, middle, ring, little, thumb): two bones each;
- each leg: thigh → shin → foot.

The arms are placed by their wrists: an IK target `<fig> wrist.L` gives the position and the hand's
orientation, and the elbow stays in the plane of the pole `<fig> elbow.L`. Everything else turns
about its joint (`Figure.turn`).
"""
import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector
from mathutils.bvhtree import BVHTree

import kitchen
import lib
from lib import Nodes, rgba, scaled, srgb

P = kitchen.PALETTE
FINGERS = ('index', 'middle', 'ring', 'little', 'thumb')


def sstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


# -- the two figures ------------------------------------------------------------------------------

SPECS = {
    # A: the one who reaches. Rounder, softer, shoulders a little forward; a broad face, wide-set
    # eyes, a low broad nose; short tousled tobacco hair; a rust jumper, hand-knitted.
    'a': dict(
        seed=3,
        origin=(kitchen.CHAIR_X['a'] - 0.0005, kitchen.CHAIR_Y - 0.004, kitchen.SEAT_Z),
        # torso loft: (z, half width, half depth, y offset, squareness)
        sections=[(0.000, 0.0212, 0.0158, 0.0000, 2.3), (0.004, 0.0243, 0.0176, 0.0000, 2.4), (0.014, 0.0258, 0.0184, -0.0005, 2.4),
                  (0.026, 0.0259, 0.0181, -0.0010, 2.4), (0.038, 0.0260, 0.0172, -0.0016, 2.5), (0.049, 0.0263, 0.0162, -0.0026, 2.7),
                  (0.0565, 0.0257, 0.0152, -0.0035, 2.8), (0.0620, 0.0226, 0.0140, -0.0042, 2.5), (0.0660, 0.0160, 0.0117, -0.0043, 2.2),
                  (0.0686, 0.0094, 0.0087, -0.0040, 2.0), (0.0702, 0.0068, 0.0067, -0.0037, 2.0)],
        shoulder=(0.0219, -0.0042, 0.0600), clav=(0.0040, -0.0036, 0.0585),
        upper=0.0290, fore=0.0272,
        sleeve=(0.0072, 0.0070, 0.0064, 0.0057, 0.0052),
        neck=(0.0061, (0.0, -0.0037, 0.0650), (0.0, -0.0041, 0.0812)),
        head=dict(size=(0.0362, 0.0346, 0.0390), at=(0.0, -0.0043, 0.0978), cheek=0.07, flat=0.14, lop=0.03, top=0.02, chin=0.06),
        eye=dict(z=0.0020, dx=0.0068, r=0.00138, socket=0.00035, lid=58.0, brow=True),
        nose=dict(size=(0.0062, 0.0047, 0.0054), z=-0.0036, push=0.48),
        mouth=dict(z=-0.0100, w=0.0036, curve=-0.0002, tilt=0.0002),
        ear=dict(size=(0.0023, 0.0046, 0.0068), z=-0.0005, y=0.0012),
        skin=srgb('#cba98b'), hand_col=srgb('#b38a6c'), blush=srgb('#d49a8c'), nose_col=srgb('#d8b3a0'), eye_col=srgb('#211915'), mouth_col=srgb('#7a4b41'),
        hair=dict(style='bald', color=srgb('#55402e'), grey=srgb('#8f877c'), thick=0.0015),
        jumper=('knit', P['rust']), trousers=srgb('#3e3a33'), shoes=srgb('#2e2a26'),
        # (a tenth smaller head and bigger hands than first made: a third of the seated height is a
        # child's proportion, and the hands carry the story, on a phone too: the creative
        # director's review, 2026-10-20; the hands a tenth bigger again after the skeptic's, as
        # the tighter frame had taken back what they gained)
        head_scale=0.90,
        hand=1.14,
    ),
    # B: the one who startles. Slimmer, upright; a longer face, eyes closer, a small straight nose;
    # long blonde hair from under a knitted hat; a felted blue-grey cardigan over a dark olive
    # rib-knit roll-neck.
    'b': dict(
        seed=11,
        origin=(kitchen.CHAIR_X['b'] + 0.0005, kitchen.CHAIR_Y - 0.003, kitchen.SEAT_Z),
        sections=[(0.000, 0.0193, 0.0147, 0.0000, 2.3), (0.004, 0.0220, 0.0161, 0.0000, 2.4), (0.014, 0.0230, 0.0166, 0.0000, 2.4),
                  (0.026, 0.0224, 0.0158, 0.0000, 2.4), (0.038, 0.0222, 0.0151, -0.0002, 2.5), (0.049, 0.0230, 0.0146, -0.0006, 2.6),
                  (0.0580, 0.0230, 0.0140, -0.0010, 2.7), (0.0645, 0.0200, 0.0128, -0.0012, 2.4), (0.0686, 0.0140, 0.0104, -0.0012, 2.2),
                  (0.0713, 0.0085, 0.0079, -0.0012, 2.0), (0.0729, 0.0060, 0.0059, -0.0012, 2.0)],
        shoulder=(0.0197, -0.0013, 0.0622), clav=(0.0036, -0.0012, 0.0606),
        upper=0.0292, fore=0.0275,
        sleeve=(0.0068, 0.0066, 0.0061, 0.0055, 0.0053),
        neck=(0.0064, (0.0, -0.0012, 0.0670), (0.0, -0.0015, 0.0795)),
        head=dict(size=(0.0336, 0.0330, 0.0396), at=(0.0, -0.0018, 0.0960), cheek=0.03, flat=0.13, lop=-0.025, top=0.0, chin=0.04),
        eye=dict(z=0.0025, dx=0.0060, r=0.00128, socket=0.0003, lid=42.0),
        nose=dict(size=(0.0042, 0.0030, 0.0037), z=-0.0033, push=0.50, sculpt=0.085),
        mouth=dict(z=-0.0101, w=0.0029, curve=0.0, tilt=0.0003),
        ear=dict(size=(0.0022, 0.0045, 0.0066), z=0.0005, y=0.0012),
        skin=srgb('#dcc4ae'), hand_col=srgb('#c19a80'), blush=srgb('#dba697'), nose_col=srgb('#dfbfae'), eye_col=srgb('#1d1816'), mouth_col=srgb('#86594d'),
        hair=dict(style='hat', color=srgb('#d2b27c'), hat=srgb('#57524c'), front=0.64, back=-0.10, thick=0.0026, crown=(0.0, 0.006, 0.020), part=0.0),
        jumper=('felt', P['bluegrey']), shirt=srgb('#5a5848'), trousers=srgb('#4a4e50'), shoes=srgb('#2b2725'),
        # (a chin and the hat higher on her brow: a round face under a hat pulled to the brows read
        # as a child's. The roll-neck is dark, under her face and her hair, and up to her jaw: an
        # oatmeal one read as a bare chest and a choker. The creative director's reviews)
        head_scale=0.90,
        hand=1.09,
    ),
}


# -- materials ------------------------------------------------------------------------------------


def skin(name, spec, cheeks=()):
    """The figure's felt skin, with a needle-felted blush on the cheeks: a little rose worked into
    the surface, soft-edged, not painted."""
    # (less sheen and glow than first made: with them the faces read as vinyl and foam)
    mat = lib.felt(name, spec['skin'], coords='rest', sheen=0.55, mottle=0.14, speck=0.10, bump=0.45, sss=0.0, fleck_tones=(1.12, 0.85))
    if cheeks:
        n = Nodes.__new__(Nodes)
        n.mat, n.nt, n.x = mat, mat.node_tree, 2000
        bsdf = next(nd for nd in mat.node_tree.nodes if nd.type == 'BSDF_PRINCIPLED')
        base = bsdf.inputs['Base Color'].links[0].from_socket
        p = n.coords('rest')
        w = None
        for c, r in cheeks:
            d = n.add('ShaderNodeVectorMath', _operation='DISTANCE', Vector=p)
            d.inputs[1].default_value = c
            g = n.math('EXPONENT', n.math('MULTIPLY', n.math('POWER', n.math('DIVIDE', d.outputs['Value'], r), 2.0), -1.0))
            w = g if w is None else n.math('MAXIMUM', w, g)
        nz = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=p, Scale=900.0, Detail=4.0)
        w = n.math('MULTIPLY', w, n.math('ADD', 0.55, n.math('MULTIPLY', nz.outputs['Fac'], 0.6)))
        col = n.mix(n.math('MULTIPLY', w, 0.32), base, rgba(spec['blush']))
        n.link(col, bsdf.inputs['Base Color'])
    return mat


def hair_felt(name, color, crown):
    """Wool hair felted onto the head: felt, with fibres combed in streaks running out from the
    crown (or, for a bun, in toward it)."""
    mat = lib.felt(name, color, coords='rest', sheen=1.0, mottle=0.22, speck=0.35, bump=0.8, sss=0.06)
    n = Nodes.__new__(Nodes)
    n.mat, n.nt, n.x = mat, mat.node_tree, 2400
    bsdf = next(nd for nd in mat.node_tree.nodes if nd.type == 'BSDF_PRINCIPLED')
    base = bsdf.inputs['Base Color'].links[0].from_socket
    p = n.coords('rest')
    v = n.add('ShaderNodeVectorMath', _operation='SUBTRACT', Vector=p)
    v.inputs[1].default_value = crown
    sep = n.add('ShaderNodeSeparateXYZ', Vector=v.outputs['Vector'])
    az = n.math('ARCTAN2', sep.outputs['X'], sep.outputs['Y'])
    el = n.math('ARCTAN2', sep.outputs['Z'], n.math('SQRT', n.math('ADD', n.math('MULTIPLY', sep.outputs['X'], sep.outputs['X']), n.math('MULTIPLY', sep.outputs['Y'], sep.outputs['Y']))))
    uv = n.add('ShaderNodeCombineXYZ', X=n.math('MULTIPLY', az, 150.0), Y=n.math('MULTIPLY', el, 6.0))
    streak = n.add('ShaderNodeTexNoise', _noise_dimensions='2D', Vector=uv.outputs['Vector'], Scale=1.0, Detail=4.0, Roughness=0.6, Distortion=1.5)
    col = n.mix(n.math('MULTIPLY', n.math('SUBTRACT', streak.outputs['Fac'], 0.4), 0.8, clamp=True), rgba(scaled(color, 0.82)), base)
    n.link(col, bsdf.inputs['Base Color'])
    bmp = next(nd for nd in mat.node_tree.nodes if nd.type == 'BUMP')
    h0 = bmp.inputs['Height'].links[0].from_socket
    n.link(n.math('ADD', h0, n.math('MULTIPLY', streak.outputs['Fac'], 0.6)), bmp.inputs['Height'])
    return mat


def lining_felt(name, color):
    """The cuff's lining: fine, mottled felted cotton with a faint weave a quarter of a millimetre
    across (pale and plain, it read as card)."""
    mat = lib.felt(name, color, coords='rest', sheen=0.8, mottle=0.12, speck=0.1, bump=0.35, dimples=False)
    n = Nodes.__new__(Nodes)
    n.mat, n.nt, n.x = mat, mat.node_tree, 2400
    sep = n.add('ShaderNodeSeparateXYZ', Vector=n.coords('rest'))
    k = 2 * math.pi / 0.00025
    warp = n.math('SINE', n.math('MULTIPLY', n.math('ADD', sep.outputs['X'], sep.outputs['Z']), k))
    weft = n.math('SINE', n.math('MULTIPLY', sep.outputs['Y'], k))
    bmp = next(nd for nd in mat.node_tree.nodes if nd.type == 'BUMP')
    h0 = bmp.inputs['Height'].links[0].from_socket
    n.link(n.math('ADD', h0, n.math('MULTIPLY', n.math('MULTIPLY', warp, weft), 0.12)), bmp.inputs['Height'])
    return mat


def strand_felt(name, color):
    """Long wool hair laid in a mass: felt, streaked along its fall (the metric 'UVMap' v runs down
    each lock), paler where the lamp catches its tops."""
    mat = bpy.data.materials.new(name)
    n = Nodes(mat)
    p = n.coords('uv')
    sep = n.add('ShaderNodeSeparateXYZ', Vector=p)
    uv = n.add('ShaderNodeCombineXYZ', X=n.math('MULTIPLY', sep.outputs['Y'], 60.0), Y=n.math('MULTIPLY', sep.outputs['X'], 500.0))
    streak = n.add('ShaderNodeTexNoise', _noise_dimensions='2D', Vector=uv.outputs['Vector'], Scale=1.0, Detail=5.0, Roughness=0.6, Distortion=0.6)
    fine = n.add('ShaderNodeTexNoise', _noise_dimensions='2D', Vector=uv.outputs['Vector'], Scale=6.0, Detail=3.0)
    col = n.mix(n.math('MULTIPLY', n.math('SUBTRACT', streak.outputs['Fac'], 0.3), 1.1, clamp=True), rgba(scaled(color, 0.5)), rgba(color))
    col = n.mix(n.math('MULTIPLY', fine.outputs['Fac'], 0.3), col, rgba(scaled(color, 1.15)))
    # each lock a little lighter or darker than the next (±12%), as hand-dyed wool is
    shade = n.math('ADD', n.math('MULTIPLY', n.add('ShaderNodeObjectInfo').outputs['Random'], 0.24), 0.88)
    vm = n.add('ShaderNodeVectorMath', _operation='MULTIPLY')
    n.link(col, vm.inputs[0])
    n.link(n.add('ShaderNodeCombineXYZ', X=shade, Y=shade, Z=shade).outputs['Vector'], vm.inputs[1])
    col = vm.outputs['Vector']
    bmp = n.add('ShaderNodeBump', Strength=0.8, Distance=0.0004, Height=n.math('ADD', streak.outputs['Fac'], n.math('MULTIPLY', fine.outputs['Fac'], 0.4)))
    # (no tinted sheen and little gloss: with them each lock shaded as one smooth tube with a bright
    # band down it, a moulded ribbon: the creative director's gate review)
    bsdf = n.add('ShaderNodeBsdfPrincipled', **{'Base Color': col, 'Roughness': 0.95, 'Sheen Weight': 0.1, 'Sheen Roughness': 0.6,
                                               'Sheen Tint': (1.0, 1.0, 1.0, 1.0), 'Specular IOR Level': 0.05,
                                               'Normal': bmp.outputs['Normal']})
    n.out(bsdf.outputs['BSDF'])
    return mat


def materials(key, spec):
    m = {}
    m['skin'] = skin(f'{key} skin', spec)
    m['hand'] = lib.felt(f'{key} hand felt', spec['hand_col'], coords='rest', sheen=0.55, mottle=0.14, speck=0.12, bump=0.5, sss=0.0, fleck_tones=(1.12, 0.85))
    m['hand fibre'] = lib.fiber(f'{key} hand fibre', spec['hand_col'], lift=1.0)
    m['nose'] = lib.felt(f'{key} nose', spec['nose_col'], coords='rest', sheen=0.8, mottle=0.08, speck=0.1, bump=0.4, sss=0.25)
    m['eye'] = lib.thread(f'{key} eye knot', spec['eye_col'], coords='rest', sheen=0.4, rough=0.42)
    m['mouth'] = lib.thread(f'{key} mouth thread', spec['mouth_col'], coords='rest', sheen=0.5)
    if spec['hair']['style'] == 'bald':
        m['beard'] = lib.felt(f'{key} beard', spec['hair']['color'], coords='rest', sheen=1.0, mottle=0.22, speck=0.45,
                              flecks=(spec['hair']['grey'], scaled(spec['hair']['color'], 0.6)), bump=0.8, sss=0.05)
        m['beard fibre'] = lib.fiber(f'{key} beard fibre', scaled(spec['hair']['color'], 1.1), lift=1.0)
        m['grey fibre'] = lib.fiber(f'{key} grey fibre', spec['hair']['grey'], lift=1.0)
        m['hair'] = m['beard']
    elif spec['hair']['style'] == 'hat':
        m['hat'] = lib.knit(f'{key} hat', spec['hair']['hat'], coords='uv', stitch=(0.0017, 0.0015), depth=0.6)
        m['hat rib'] = lib.knit(f'{key} hat brim', scaled(spec['hair']['hat'], 0.95), coords='uv', rib=True, stitch=(0.0014, 0.0015), depth=0.6)
        m['hat fibre'] = lib.fiber(f'{key} hat fibre', spec['hair']['hat'], lift=1.15)
        m['hair'] = strand_felt(f'{key} long hair', spec['hair']['color'])
    else:
        m['hair'] = hair_felt(f'{key} hair', spec['hair']['color'], tuple(Vector(spec['head']['at']) + Vector(spec['hair']['crown'])))
    m['hair fibre'] = lib.fiber(f'{key} hair fibre', spec['hair']['color'], lift=1.25)
    m['skin fibre'] = lib.fiber(f'{key} skin fibre', spec['skin'], lift=1.1)
    kind, colour = spec['jumper']
    if kind == 'knit':
        m['jumper'] = lib.knit(f'{key} jumper', colour, coords='uv')
        m['rib'] = lib.knit(f'{key} rib', scaled(colour, 0.95), coords='uv', rib=True, stitch=(0.0013, 0.0015))
        m['inside'] = lib.felt(f'{key} jumper inside', scaled(colour, 0.7), coords='rest', sheen=0.6, speck=0.3)
    else:
        m['jumper'] = lib.felt(f'{key} cardigan', colour, coords='rest', sheen=1.0, mottle=0.14, speck=0.28,
                               flecks=(scaled(colour, 1.45), srgb('#4b5560')), bump=0.55)
        m['lining'] = lining_felt(f'{key} lining', P['ivory'])
        m['lining fibre'] = lib.fiber(f'{key} lining fibre', P['ivory'], lift=1.0)
        # (one rib-knit roll-neck, in the cardigan's V and round her throat: a smooth felt the colour
        # of her skin read as a bare chest, the brief's doll: the creative director's gate review)
        m['roll'] = lib.knit(f'{key} roll neck', spec['shirt'], coords='uv', rib=True, stitch=(0.0011, 0.0013), depth=0.4)
        m['shirt'] = m['roll']
        m['button'] = lib.glazed(f'{key} button', srgb('#6b5038'), rough=0.35, dirt=0.3)
        m['hem thread'] = lib.thread(f'{key} hem thread', srgb('#a89874'), coords='rest', sheen=0.4)
    m['seam'] = lib.thread(f'{key} seam', scaled(colour, 0.8), coords='rest', sheen=0.4)
    m['jumper fibre'] = lib.fiber(f'{key} jumper fibre', colour, lift=1.3)
    m['trousers'] = lib.felt(f'{key} trousers', spec['trousers'], coords='rest', sheen=0.7)
    m['shoes'] = lib.felt(f'{key} shoes', spec['shoes'], coords='rest', sheen=0.5)
    return m


# -- shapes ---------------------------------------------------------------------------------------


class Part:
    """A mesh being built in the figure's rest pose, with its bone weights."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new('UVMap')
        self.weights = {}   # vertex -> {bone: weight}

    def vert(self, co, w):
        v = self.bm.verts.new(co)
        self.weights[v] = w
        return v

    def finish(self, figure, materials, subdiv=1, smooth=True):
        bm = self.bm
        bm.verts.index_update()
        groups = {}
        for v, w in self.weights.items():
            tot = sum(w.values()) or 1.0
            for b, x in w.items():
                if x > 1e-4:
                    groups.setdefault(b, []).append((v.index, x / tot))
        ob = lib.mesh_object(f'{figure.key} {self.name}', bm, None, smooth=smooth, subdiv=0, rest=True)
        for mat in materials:
            ob.data.materials.append(mat)
        for b, items in groups.items():
            vg = ob.vertex_groups.new(name=b)
            for i, x in items:
                vg.add([i], x, 'REPLACE')
        figure.attach(ob, subdiv)
        return ob


def loft(part, sections, segs, seed, wob, weight):
    """A stuffed body: closed horizontal sections lofted bottom to top, its seam at the back.
    UVs in metres (u round from the back, v up) for the knit."""
    rings = []
    for (z, a, b, yo, pw) in sections:
        pts = []
        for k in range(segs):
            t = math.pi / 2 + 2 * math.pi * k / segs
            c, s = math.cos(t), math.sin(t)
            x = a * math.copysign(abs(c) ** (2 / pw), c)
            y = b * math.copysign(abs(s) ** (2 / pw), s)
            q = Vector((x, y + yo, z))
            nrm = Vector((x / (a * a), y / (b * b), 0.0)).normalized()
            q += nrm * lib.wobble(q, 0.012, wob, seed).dot(nrm)
            pts.append(q)
        rings.append([part.vert(p, weight(p)) for p in pts])
    per = []
    for ring in rings:
        acc = [0.0]
        for k in range(1, segs + 1):
            acc.append(acc[-1] + (ring[k % segs].co - ring[k - 1].co).length)
        per.append(acc)
    for i in range(len(rings) - 1):
        for k in range(segs):
            k2 = (k + 1) % segs
            f = part.bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
            for loop, (kk, ii) in zip(f.loops, ((k, i), (k + 1, i), (k + 1, i + 1), (k, i + 1))):
                loop[part.uv].uv = (per[ii][kk], sections[ii][0])
    bottom = part.vert(Vector((0.0, sections[0][3], sections[0][0] - 0.0007)), weight(Vector((0, 0, 0))))
    top = part.vert(Vector((0.0, sections[-1][3], sections[-1][0] + 0.0012)), weight(Vector((0, 0, sections[-1][0]))))
    for k in range(segs):
        k2 = (k + 1) % segs
        part.bm.faces.new((rings[0][k2], rings[0][k], bottom))
        part.bm.faces.new((rings[-1][k], rings[-1][k2], top))
    return rings


def ring_tube(part, loop_pts, radius, weight, segs=6, mat=0):
    """A closed tube round `loop_pts` (a seam's ridge, a collar's rib)."""
    n = len(loop_pts)
    rings = []
    for i, p in enumerate(loop_pts):
        d = (loop_pts[(i + 1) % n] - loop_pts[i - 1]).normalized()
        c = sum(loop_pts, Vector()) / n
        out = (p - c)
        out = (out - d * out.dot(d)).normalized()
        side = d.cross(out).normalized()
        rings.append([part.vert(p + out * math.cos(2 * math.pi * k / segs) * radius + side * math.sin(2 * math.pi * k / segs) * radius, weight(p))
                      for k in range(segs)])
    for i in range(n):
        a, b = rings[i], rings[(i + 1) % n]
        for k in range(segs):
            f = part.bm.faces.new((a[k], a[(k + 1) % segs], b[(k + 1) % segs], b[k]))
            f.material_index = mat


def path_tube(part, pts, radii, weight, segs=16, cap_end=True, cap_start=False, metric=True, mat_at=None, flatten=1.0, up=Vector((0, 0, 1))):
    """An open tube along `pts` (resampled smooth), weighted per ring by `weight(point, s)` where s
    is the distance along; `mat_at(s)` picks a face's material index."""
    # Catmull-Rom resample, about every 0.9 mm
    dense = []
    for i in range(len(pts) - 1):
        p0, p1, p2, p3 = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, len(pts) - 1)]
        r1, r2 = radii[i], radii[i + 1]
        steps = max(2, int((p2 - p1).length / 0.0009))
        for j in range(steps):
            t = j / steps
            t2, t3 = t * t, t * t * t
            p = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            dense.append((p, r1 + (r2 - r1) * t))
    dense.append((pts[-1], radii[-1]))
    along = [0.0]
    for i in range(1, len(dense)):
        along.append(along[-1] + (dense[i][0] - dense[i - 1][0]).length)
    rings = []
    rmean = sum(radii) / len(radii)
    prev_side = None
    for i, (p, r) in enumerate(dense):
        d = (dense[min(i + 1, len(dense) - 1)][0] - dense[max(i - 1, 0)][0]).normalized()
        side = d.cross(up)
        if side.length < 1e-6:
            side = d.cross(Vector((1, 0, 0)))
        side.normalize()
        if prev_side is not None and side.dot(prev_side) < 0:
            side = -side
        prev_side = side
        nrm = side.cross(d).normalized()
        ring = []
        for k in range(segs):
            a = 2 * math.pi * k / segs
            q = p + side * math.cos(a) * r + nrm * math.sin(a) * r * flatten
            ring.append(part.vert(q, weight(p, along[i])))
        rings.append(ring)
    # faces wound so their normals point away from the tube's axis
    p0, p1 = dense[0][0], dense[1][0]
    q = (rings[0][0].co + rings[0][1].co + rings[1][1].co + rings[1][0].co) / 4
    nrm = (rings[0][1].co - rings[0][0].co).cross(rings[1][0].co - rings[0][0].co)
    flip = nrm.dot(q - (p0 + p1) / 2) < 0
    for i in range(len(rings) - 1):
        for k in range(segs):
            k2 = (k + 1) % segs
            quad = (rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k])
            f = part.bm.faces.new(quad[::-1] if flip else quad)
            if mat_at:
                f.material_index = mat_at((along[i] + along[i + 1]) / 2)
            for loop, (kk, ii) in zip(f.loops, ((k, i), (k + 1, i), (k + 1, i + 1), (k, i + 1))):
                loop[part.uv].uv = (kk / segs * 2 * math.pi * rmean, along[ii]) if metric else (kk / segs, along[ii] / along[-1])
    for end, flag in ((0, cap_start), (len(rings) - 1, cap_end)):
        if not flag:
            continue
        p, r = dense[end]
        d = (dense[min(end + 1, len(dense) - 1)][0] - dense[max(end - 1, 0)][0]).normalized() * (1 if end else -1)
        c = part.vert(p + d * r * 0.75, weight(p, along[end]))
        for k in range(segs):
            k2 = (k + 1) % segs
            tri = (rings[end][k], rings[end][k2], c) if end else (rings[end][k2], rings[end][k], c)
            f = part.bm.faces.new(tri[::-1] if flip else tri)
            if mat_at:
                f.material_index = mat_at(along[end])
    return rings, dense, along


def deformed_sphere(part, center, size, shape, weight, seed, u=48, v=32, lumps=0.0):
    """A head-like stuffed sphere: `shape(x, y, z)` (unit sphere point) returns a scale vector;
    `lumps` adds broad unevenness, as wool sits when it is stuffed and needled by hand."""
    bm = part.bm
    tmp = bmesh.new()
    bmesh.ops.create_uvsphere(tmp, u_segments=u, v_segments=v, radius=1.0)
    lut = {}
    for tv in tmp.verts:
        x, y, z = tv.co
        s = shape(x, y, z)
        q = Vector((x * size[0] / 2 * s[0], y * size[1] / 2 * s[1], z * size[2] / 2 * s[2]))
        nrm = q.normalized()
        q += nrm * lib.wobble(q, 0.3 * max(size), 0.018 * max(size), seed).dot(nrm)
        if lumps:
            q += nrm * lib.wobble(q, 0.75 * max(size), lumps * max(size), seed + 101).dot(nrm)
        lut[tv] = part.vert(Vector(center) + q, weight(Vector(center) + q))
    for tf in tmp.faces:
        bm.faces.new([lut[tv] for tv in tf.verts])
    tmp.free()


# -- the figure -----------------------------------------------------------------------------------


class Figure:
    def __init__(self, key, collection):
        self.key, self.spec = key, SPECS[key]
        self.collection = collection
        self.objects = []
        self.mats = materials(key, self.spec)
        self.origin = Vector(self.spec['origin'])
        self.joints = {}
        self.arm = None

    # bones in rest pose ----------------------------------------------------------------------

    def layout(self):
        """Every joint of the rest pose, in the figure's coordinates."""
        s = self.spec
        J = self.joints
        J['root'] = (Vector((0, 0, 0)), Vector((0, 0, 0.008)))
        spine0 = Vector((0, s['sections'][2][3], 0.006))
        chest0 = Vector((0, s['sections'][4][3], 0.034))
        neck0, neck1 = Vector(s['neck'][1]), Vector(s['neck'][2])
        J['spine'] = (spine0, chest0)
        J['chest'] = (chest0, neck0)
        J['neck'] = (neck0, neck1)
        J['head'] = (neck1, neck1 + Vector((0, -0.0002, 0.040)))
        for side, m in (('L', 1), ('R', -1)):
            mx = Vector((m, 1, 1))
            clav, sh = Vector(s['clav']) * mx, Vector(s['shoulder']) * mx
            du = Vector((0.10 * m, -0.30, -0.95)).normalized()
            el = sh + du * s['upper']
            df = Vector((-0.18 * m, -0.97, -0.15)).normalized()
            wr = el + df * s['fore']
            back = (Vector((0, 0, 1)) - df * df.z).normalized()
            J[f'shoulder.{side}'] = (clav, sh)
            J[f'upper_arm.{side}'] = (sh, el)
            J[f'forearm.{side}'] = (el, wr)
            k = s['hand']
            J[f'hand.{side}'] = (wr, wr + df * 0.0092 * k)
            self.hand_frame = getattr(self, 'hand_frame', {})
            X = df.cross(back)
            self.hand_frame[side] = (wr, X, df, back, m)
            for f, (base, splay, lens) in self.finger_layout().items():
                b = wr + (X * base[0] * m + df * base[1] + back * base[2]) * k
                if f == 'thumb':
                    d1 = (X * 0.62 * m + df * 0.76 - back * 0.16).normalized()
                else:
                    d1 = Matrix.Rotation(math.radians(splay * m), 3, back) @ df
                d1 = (Matrix.Rotation(math.radians(-6), 3, X) @ d1).normalized()
                j1 = b + d1 * lens[0] * k
                d2 = (Matrix.Rotation(math.radians(-8), 3, X) @ d1).normalized()
                j2 = j1 + d2 * lens[1] * k
                J[f'{f}1.{side}'] = (b, j1)
                J[f'{f}2.{side}'] = (j1, j2)
            hip = Vector((0.0105 * m, -0.002, 0.0075))
            knee = Vector((0.0118 * m, -0.041, 0.0078))
            ankle = Vector((0.0122 * m, -0.044, -kitchen.SEAT_Z + 0.008))
            toe = ankle + Vector((0.0004 * m, -0.011, -0.004))
            J[f'thigh.{side}'] = (hip, knee)
            J[f'shin.{side}'] = (knee, ankle)
            J[f'foot.{side}'] = (ankle, toe)

    @staticmethod
    def finger_layout():
        """Base (x toward the thumb, along, up) in the hand, splay (degrees toward the thumb),
        two segment lengths: a felt puppet's short fingers."""
        return {
            'index': ((0.0021, 0.0089, -0.0002), 1.0, (0.0030, 0.0025)),
            'middle': ((0.0007, 0.0092, -0.0001), 0.0, (0.0032, 0.0027)),
            'ring': ((-0.0007, 0.0090, -0.0002), -1.0, (0.0030, 0.0025)),
            'little': ((-0.0020, 0.0084, -0.0004), -3.0, (0.0024, 0.0021)),
            'thumb': ((0.0033, 0.0026, -0.0006), 0.0, (0.0028, 0.0024)),
        }

    PARENTS = {'spine': 'root', 'chest': 'spine', 'neck': 'chest', 'head': 'neck'}

    def parent_of(self, name):
        if name in self.PARENTS:
            return self.PARENTS[name], True
        base, side = name.split('.') if '.' in name else (name, None)
        chain = {'shoulder': ('chest', False), 'upper_arm': ('shoulder', True), 'forearm': ('upper_arm', True), 'hand': ('forearm', True),
                 'thigh': ('root', False), 'shin': ('thigh', True), 'foot': ('shin', True)}
        if base in chain:
            p, c = chain[base]
            return (p if p in ('chest', 'root') else f'{p}.{side}'), c
        if base.endswith('1'):
            return f'hand.{side}', False
        return f'{base[:-1]}1.{side}', True

    def build_armature(self):
        data = bpy.data.armatures.new(f'{self.key} armature')
        data.display_type = 'STICK'
        arm = bpy.data.objects.new(f'{self.key} armature', data)
        self.collection.objects.link(arm)
        arm.location = self.origin
        bpy.context.view_layer.objects.active = arm
        arm.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT')
        order = ['root', 'spine', 'chest', 'neck', 'head']
        for side in 'LR':
            order += [f'shoulder.{side}', f'upper_arm.{side}', f'forearm.{side}', f'hand.{side}']
            for f in FINGERS:
                order += [f'{f}1.{side}', f'{f}2.{side}']
            order += [f'thigh.{side}', f'shin.{side}', f'foot.{side}']
        ebs = {}
        for name in order:
            h, t = self.joints[name]
            eb = data.edit_bones.new(name)
            eb.head, eb.tail = h, t
            side = name.split('.')[1] if '.' in name else None
            if side and (name.startswith(('hand', 'forearm')) or name[:-2].rstrip('12') in FINGERS):
                eb.align_roll(self.hand_frame[side][3])
            elif name in ('spine', 'chest', 'neck', 'head', 'root'):
                eb.align_roll(Vector((0, -1, 0)))
            if name != 'root':
                p, connect = self.parent_of(name)
                eb.parent = ebs[p]
                eb.use_connect = connect and (ebs[p].tail - eb.head).length < 1e-6
            ebs[name] = eb
        bpy.ops.object.mode_set(mode='OBJECT')
        arm.select_set(False)
        self.arm = arm
        for pb in arm.pose.bones:
            pb.rotation_mode = 'QUATERNION'
        # the arms: IK to a wrist target, the hand turned as the target is, the elbow by a pole
        self.targets = {}
        for side in 'LR':
            wr = bpy.data.objects.new(f'{self.key} wrist.{side}', None)
            wr.empty_display_size = 0.006
            el = bpy.data.objects.new(f'{self.key} elbow.{side}', None)
            el.empty_display_size = 0.004
            for e in (wr, el):
                self.collection.objects.link(e)
            self.targets[side] = (wr, el)
            ik = arm.pose.bones[f'forearm.{side}'].constraints.new('IK')
            ik.target, ik.pole_target, ik.chain_count = wr, el, 2
            ik.use_stretch = False
            cr = arm.pose.bones[f'hand.{side}'].constraints.new('COPY_ROTATION')
            cr.target, cr.target_space, cr.owner_space = wr, 'WORLD', 'WORLD'
        return arm

    def lid_bones(self):
        bpy.context.view_layer.objects.active = self.arm
        self.arm.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT')
        eb = self.arm.data.edit_bones
        for side, (c, n, sx) in self.lid_frames.items():
            b = eb.new(f'lid.{side}')
            b.head, b.tail = c, c + n * 0.003
            b.align_roll(n.cross(sx))
            b.parent = eb['head']
        bpy.ops.object.mode_set(mode='OBJECT')
        self.arm.select_set(False)
        for side in self.lid_frames:
            self.arm.pose.bones[f'lid.{side}'].rotation_mode = 'QUATERNION'

    def attach(self, ob, subdiv):
        """Parent a part to the armature, deform it by the armature first, then smooth it."""
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
        self.collection.objects.link(ob)
        ob.parent = self.arm
        mod = ob.modifiers.new('armature', 'ARMATURE')
        mod.object = self.arm
        mod.use_deform_preserve_volume = True
        if subdiv:
            sd = ob.modifiers.new('subdiv', 'SUBSURF')
            sd.levels, sd.render_levels = subdiv, subdiv
        self.objects.append(ob)
        return ob

    # weights --------------------------------------------------------------------------------

    def torso_weight(self, p):
        z = p.z
        w = {'root': 1 - sstep(0.0, 0.010, z)}
        w['spine'] = sstep(0.0, 0.010, z) * (1 - sstep(0.024, 0.044, z))
        chest = sstep(0.024, 0.044, z)
        for side, m in (('L', 1), ('R', -1)):
            sh = sstep(0.047, 0.063, z) * sstep(0.007, 0.019, p.x * m)
            w[f'shoulder.{side}'] = chest * sh
            chest *= (1 - sh)
        w['chest'] = chest
        nk = sstep(0.0665, 0.072, z) * (1 - sstep(0.008, 0.012, abs(p.x)))
        w['neck'] = nk
        w['chest'] *= (1 - nk)
        return w

    def arm_weight(self, side, s_sh, s_el):
        def w(p, s):
            a = sstep(s_sh - 0.004, s_sh + 0.003, s)
            b = sstep(s_el - 0.0032, s_el + 0.0032, s)
            return {f'shoulder.{side}': 1 - a, f'upper_arm.{side}': a * (1 - b), f'forearm.{side}': a * b}
        return w

    # parts ------------------------------------------------------------------------------------

    def build(self):
        self.layout()
        self.build_armature()
        s, M = self.spec, self.mats
        self.body()
        n0 = len(self.objects)
        self.head()
        self.scale_head(self.objects[n0:])
        self.lid_bones()
        for side in 'LR':
            self.sleeve(side)
            self.hand(side)
            self.leg(side)
        if s['jumper'][0] == 'felt':
            self.cardigan_front()
            self.cuff_fold('R')
        self.fuzz()
        return self

    def scale_head(self, objs):
        """Make the head smaller (`head_scale`), with everything on it: the face, the beard or the
        hat, and the hair as far down as the jaw, all toward the chin. Hair lying on the shoulders
        stays where it lies, blended over the neck. (Textures keep their rest positions, so they
        shrink with it.)"""
        k = self.spec.get('head_scale', 1.0)
        if abs(k - 1.0) < 1e-6:
            return
        h = self.spec['head']
        P = Vector(h['at']) - Vector((0.0, 0.0, h['size'][2] * 0.5))
        lo, hi = P.z - 0.004, P.z + 0.002
        for ob in objs:
            me = ob.data
            for v in me.vertices:
                w = sstep(lo, hi, v.co.z)
                v.co = P + (v.co - P) * (1.0 + (k - 1.0) * w)
            me.update()
        self.lid_frames = {sd: (P + (c - P) * k, n, sx) for sd, (c, n, sx) in self.lid_frames.items()}

    def body(self):
        s, M = self.spec, self.mats
        part = Part('jumper')
        loft(part, s['sections'], 56, s['seed'], 0.0007, self.torso_weight)
        mats = [M['jumper']] + ([M['shirt']] if 'shirt' in M else [])
        if 'shirt' in M:
            # the shirt shows in the cardigan's V, from the collar down to the top button
            for f in part.bm.faces:
                c = f.calc_center_median()
                v_half = 0.0012 + max(0.0, c.z - 0.047) * 0.30
                if c.y < -0.004 and abs(c.x) < v_half and c.z > 0.047:
                    f.material_index = 1
        self.jumper = part.finish(self, mats, subdiv=1)
        # the neck, skin; the collar over its foot
        r, a, b = s['neck']
        nk = Part('neck')
        path_tube(nk, [Vector(a) - Vector((0, 0, 0.004)), Vector(a), Vector(b), Vector(b) + Vector((0, 0, 0.003))], [r, r, r * 0.97, r * 0.95],
                  lambda p, t: {'chest': 1 - sstep(0.0025, 0.009, t), 'neck': sstep(0.0025, 0.009, t) * (1 - sstep(0.016, 0.02, t)), 'head': sstep(0.016, 0.02, t)},
                  segs=20, cap_end=False)
        nk.finish(self, [M['skin']], subdiv=1)
        top = s['sections'][-2]
        z, yo = top[0] + 0.0004, top[3]
        if 'shirt' in M:
            # B: an olive-grey roll-neck under the cardigan, up to the jaw (lowered, its rolled lip
            # read as a choker on a bare throat)
            rn = Part('roll neck')
            z0, z1 = z - 0.003, Vector(b).z - 0.0032
            path_tube(rn, [Vector((0, yo, z0)), Vector((0, yo, (z0 + z1) / 2)), Vector((0, yo - 0.0002, z1))], [r + 0.0024, r + 0.0018, r + 0.0016],
                      lambda p, t: {'chest': 1 - sstep(0.002, 0.008, t), 'neck': sstep(0.002, 0.008, t)}, segs=28, cap_end=False)
            loop = [Vector((math.cos(2 * math.pi * k / 48) * (r + 0.0021), yo - 0.0002 + math.sin(2 * math.pi * k / 48) * (r + 0.0021), z1)) for k in range(48)]
            ring_tube(rn, loop, 0.0011, lambda p: {'neck': 1.0}, segs=8)
            rn.finish(self, [M['roll']], subdiv=1)
        else:
            col = Part('collar')
            loop = [Vector((math.cos(2 * math.pi * k / 40) * (r + 0.0012), yo + math.sin(2 * math.pi * k / 40) * (r + 0.0012), z
                            - 0.0012 * max(0.0, -math.sin(2 * math.pi * k / 40)))) for k in range(40)]
            ring_tube(col, loop, 0.0016, lambda p: {'chest': 0.6, 'neck': 0.4}, segs=8)
            col.finish(self, [M['rib']], subdiv=1)

    def sleeve(self, side):
        s, M = self.spec, self.mats
        J = self.joints
        clav, sh = J[f'shoulder.{side}']
        el = J[f'upper_arm.{side}'][1]
        wr = J[f'forearm.{side}'][1]
        df = (wr - el).normalized()
        start = sh + (clav - sh).normalized() * 0.0065 + Vector((0, 0, -0.0015))
        pts = [start, sh, sh.lerp(el, 0.5), el, el.lerp(wr, 0.5), wr, wr + df * 0.0016]
        r = s['sleeve']
        radii = [r[0] * 0.95, r[0], r[1], r[2], r[3], r[4] * 0.98, r[4]]
        s_sh = (sh - start).length
        s_el = s_sh + s['upper']
        cuff_at = s_el + s['fore'] - 0.0030
        knit = s['jumper'][0] == 'knit'
        part = Part(f'sleeve.{side}')
        rings, dense, along = path_tube(part, pts, radii, self.arm_weight(side, s_sh, s_el), segs=22, cap_end=False, cap_start=True,
                                        mat_at=(lambda t: 1 if t > cuff_at else 0) if knit else None)
        mats = [M['jumper'], M['rib'], M['inside']] if knit else [M['jumper'], M['lining']]
        i = min(range(len(along)), key=lambda k: abs(along[k] - (s_sh + 0.0012)))
        ring = [v.co.copy() for v in rings[i]]
        part.bm.verts.index_update()
        ring_idx = [[v.index for v in rg] for rg in rings]
        ob = part.finish(self, mats, subdiv=1)
        # fabric bunching in the crook of the elbow: folds across the arm on its inner side,
        # as a shape key the pose sets by how far the elbow bends
        me = ob.data
        ob.shape_key_add(name='rest', from_mix=False)
        bunch = ob.shape_key_add(name='bunch', from_mix=False)
        inner = ((sh + wr) / 2 - el).normalized()
        for ii, idxs in enumerate(ring_idx):
            sa = along[ii]
            near = math.exp(-((sa - s_el) / 0.0065) ** 2)
            if near < 0.01:
                continue
            c = dense[ii][0]
            phase = math.sin(2 * math.pi * (sa - s_el) / 0.0034 + 0.6 * (1 if side == 'L' else -1))
            for k, vi in enumerate(idxs):
                co = me.vertices[vi].co
                rdir = (co - c).normalized()
                w_in = max(0.0, rdir.dot(inner)) ** 1.2
                w_side = max(0.0, 1 - abs(rdir.dot(inner))) * 0.35
                dz = rdir * (0.00075 * phase * (w_in + w_side) + 0.00035 * w_in) * near
                bunch.data[vi].co = co + dz
        sol = ob.modifiers.new('cloth thickness', 'SOLIDIFY')
        sol.thickness, sol.offset = 0.0006, -1.0
        sol.material_offset = 2 if knit else 1
        sol.use_rim = True
        ob.modifiers.move(len(ob.modifiers) - 1, 1)
        self.sleeves = getattr(self, 'sleeves', {})
        self.sleeves[side] = (ob, rings, dense, along, s_sh, s_el, ring_idx)
        # the armhole seam: a slight ridge of the sewn edge round the top of the sleeve
        c = sum(ring, Vector()) / len(ring)
        loop = [c + (q - c) * 1.03 for q in ring]
        seam = Part(f'armhole seam.{side}')
        ring_tube(seam, loop, 0.00032, lambda p: self.arm_weight(side, s_sh, s_el)(p, along[i]), segs=5)
        seam.finish(self, [M['seam']], subdiv=1)

    def hand(self, side):
        s, M = self.spec, self.mats
        wr, X, Y, Z, m = self.hand_frame[side]
        k = s['hand']
        frame = Matrix((X * m, Y, Z)).transposed()  # columns: toward the thumb, along, back
        part = Part(f'hand.{side}')
        hw = {f'hand.{side}': 1.0}
        # the palm: a soft flattened pad
        tmp = bmesh.new()
        bmesh.ops.create_uvsphere(tmp, u_segments=20, v_segments=14, radius=1.0)
        lut = {}
        for tv in tmp.verts:
            x, y, z = tv.co
            q = Vector((math.copysign(abs(x) ** 0.8, x) * 0.0044, math.copysign(abs(y) ** 0.85, y) * 0.0051, math.copysign(abs(z) ** 0.9, z) * 0.0020))
            q.x *= 1.0 - 0.12 * (1 - (y + 1) / 2)   # narrower at the wrist
            q.z += 0.0004 * (1 - x * x) * max(0.0, z)  # the back of the hand rounded
            lut[tv] = part.vert(wr + frame @ (Vector((0, 0.0047, -0.0002)) + q) * k, hw)
        for tf in tmp.faces:
            part.bm.faces.new([lut[tv] for tv in tf.verts])
        tmp.free()
        # the wrist, running up into the cuff. It bends at the joint, its hidden end going with the
        # forearm: in one piece with the hand, a hand drooping from the wrist swung that end out
        # through the top of the cuff, a pale patch on the knit through most of his reach (final QA,
        # 2026-10-21; check.py's `through`)
        def ww(p, t):
            a = sstep(0.0030, 0.0048, t)     # (the joint is 4.5 mm along)
            return {f'forearm.{side}': 1 - a, f'hand.{side}': a}
        path_tube(part, [wr - Y * 0.0045, wr + Y * 0.0012], [0.0030 * k, 0.0030 * k], ww, segs=14, cap_end=True, cap_start=True)
        # fingers: skinned to their two bones, bending smoothly at the knuckles
        radius = {'index': 0.00094, 'middle': 0.00098, 'ring': 0.00093, 'little': 0.00084, 'thumb': 0.00110}
        for f in FINGERS:
            b, j1 = self.joints[f'{f}1.{side}']
            j2 = self.joints[f'{f}2.{side}'][1]
            l1 = (j1 - b).length
            r = radius[f] * k
            inset = (j1 - b).normalized() * 0.0016
            pts = [b - inset, b, j1, j2]

            def fw(p, t, f=f, l1=l1):
                t = t - 0.0016
                a = sstep(-0.0008, 0.0008, t)
                c = sstep(l1 - 0.0006, l1 + 0.0006, t)
                return {f'hand.{side}': 1 - a, f'{f}1.{side}': a * (1 - c), f'{f}2.{side}': a * c}
            path_tube(part, pts, [r * 1.05, r, r * 0.96, r * 0.86], fw, segs=10, cap_end=True, flatten=0.88, up=Z)
        part.finish(self, [M['hand']], subdiv=1)

    def leg(self, side):
        s, M = self.spec, self.mats
        hip, knee = self.joints[f'thigh.{side}']
        ankle, toe = self.joints[f'foot.{side}']
        part = Part(f'leg.{side}')
        path_tube(part, [hip + Vector((0, 0.006, 0)), hip, knee, ankle], [0.0078, 0.0080, 0.0068, 0.0055], lambda p, t: {'root': 1.0}, segs=14, cap_end=True, cap_start=True)
        part.finish(self, [M['trousers']], subdiv=1)
        shoe = Part(f'shoe.{side}')
        deformed_sphere(shoe, ankle.lerp(toe, 0.55) + Vector((0, 0, 0.0012)), (0.0085, 0.017, 0.0065), lambda x, y, z: (1, 1, 1), lambda p: {'root': 1.0}, self.spec['seed'] + 5, u=16, v=10)
        shoe.finish(self, [M['shoes']], subdiv=1)

    # the head -----------------------------------------------------------------------------------

    def head(self):
        s, M = self.spec, self.mats
        h = s['head']
        H = Vector(h['at'])
        w, d, hh = h['size']
        hw = {'head': 1.0}

        e = s['eye']
        ex, ez = e['dx'] / (w / 2), e['z'] / (hh / 2)

        def bump(x, y, z, cx, cz, rx, rz):
            return math.exp(-((x - cx) / rx) ** 2 - ((z - cz) / rz) ** 2) * max(0.0, -y) ** 1.5

        def shape(x, y, z):
            cheek = math.exp(-((z + 0.30) / 0.42) ** 2)
            sx = 1.0 + h['cheek'] * cheek - h['top'] * max(0.0, z) ** 2
            sy = 1.0 - h['flat'] * max(0.0, -y) ** 3
            sz = 1.0 + h['chin'] * max(0.0, -z) * max(0.0, -y)
            # the face, worked with the needle: a soft brow, eye sockets, full cheeks, a chin
            relief = (0.030 * bump(x, y, z, 0.0, ez + 0.20, 0.55, 0.10)
                      - 0.030 * (bump(x, y, z, ex, ez, 0.16, 0.13) + bump(x, y, z, -ex, ez, 0.16, 0.13))
                      + 0.040 * (bump(x, y, z, 0.42, -0.28, 0.24, 0.22) + bump(x, y, z, -0.42, -0.28, 0.24, 0.22))
                      + 0.025 * bump(x, y, z, 0.0, -0.74, 0.22, 0.14)
                      - 0.012 * bump(x, y, z, 0.0, -0.47, 0.20, 0.07))
            nzs = s['nose'].get('sculpt')
            if nzs:
                # a nose felted out of the face itself, its bridge running up toward the brow
                nz = s['nose']['z'] / (hh / 2)
                relief += nzs * bump(x, y, z, 0.0, nz, 0.11, 0.13) + nzs * 0.35 * bump(x, y, z, 0.0, nz + 0.16, 0.07, 0.16)
            sy += relief
            return (sx + h['lop'] * z * 0.3, sy, sz)
        part = Part('head')
        # (not a sphere: a head needled by hand is uneven: the creative director's review)
        deformed_sphere(part, H, h['size'], shape, lambda p: hw, s['seed'], u=64, v=48, lumps=0.022)
        bm = part.bm
        bm.normal_update()
        bvh = BVHTree.FromBMesh(bm)

        def surface(x, z, toward=Vector((0, 1, 0))):
            o = H + Vector((x, 0, z)) - toward * 0.05
            loc, nrm, _, _ = bvh.ray_cast(o, toward)
            if nrm.dot(-toward) < 0:
                nrm = -nrm
            return loc, nrm
        eyes = []
        for m in (-1, 1):
            p, n = surface(m * e['dx'], e['z'])
            eyes.append((p, n))
            # a soft socket round the knot
            for v in bm.verts:
                dd = (v.co - p).length
                if dd < e['r'] * 1.9:
                    v.co -= n * e['socket'] * (1 - (dd / (e['r'] * 1.9)) ** 2)
        self.cheeks = [(surface(m * e['dx'] * 1.2, e['z'] - 0.0068)[0], 0.0046) for m in (-1, 1)]
        if s['nose'].get('sculpt'):
            self.cheeks.append((surface(0.0, s['nose']['z'] - 0.0004)[0], 0.0022))
        self.face = {'eyes': eyes, 'H': H}
        ob = part.finish(self, [M['skin']], subdiv=1)
        # blush, now that we know where the cheeks are
        ob.data.materials[0] = skin(f'{self.key} skin (face)', s, cheeks=[(tuple(c), r) for c, r in self.cheeks])
        self.head_ob = ob
        # eyes: dark wool knots set into their sockets
        for i, (p, n) in enumerate(eyes):
            kn = Part(f'eye{i}')
            deformed_sphere(kn, p - n * e['r'] * 0.3, (e['r'] * 2, e['r'] * 2, e['r'] * 1.9), lambda x, y, z: (1, 0.8, 1), lambda q: hw, s['seed'] + i, u=14, v=10)
            kn.finish(self, [M['eye']], subdiv=1)
        # the nose: a small felted ball worked into the face (unless it was felted out of the face)
        nz = s['nose']
        if not nz.get('sculpt'):
            p, n = surface(0.0, nz['z'])
            nose = Part('nose')
            sz = nz['size']
            deformed_sphere(nose, p + n * sz[1] * (0.5 - nz['push']) + Vector((0, 0, -0.0004)), sz, lambda x, y, z: (1 - 0.15 * max(0, z), 1, 1), lambda q: hw, s['seed'] + 7, u=18, v=12)
            nose.finish(self, [M['nose']], subdiv=1)
        # the mouth: a few stitches of thread
        mo = s['mouth']
        pts = []
        for t in (-1.0, -0.5, 0.0, 0.5, 1.0):
            x = t * mo['w'] / 2
            z = mo['z'] + mo['curve'] * t * t + mo['tilt'] * t
            q, qn = surface(x, z)
            pts.append(q + qn * 0.00018)
        mouth = Part('mouth')
        path_tube(mouth, pts, [0.00026] * 5, lambda q, t: hw, segs=6, cap_end=True, cap_start=True)
        mouth.finish(self, [M['mouth']], subdiv=1)
        # ears
        ea = s['ear']
        for m in (-1, 1):
            q, qn = surface(0.0, ea['z'], toward=Vector((-m, 0, 0)))
            o = H + Vector((0, ea['y'], ea['z'])) + Vector((m, 0, 0)) * 0.05
            loc, nrm, _, _ = bvh.ray_cast(o, Vector((-m, 0, 0)))
            if nrm.x * m < 0:
                nrm = -nrm
            ear = Part(f'ear{m}')
            deformed_sphere(ear, loc + nrm * ea['size'][0] * 0.15, ea['size'], lambda x, y, z: (1, 1, 1), lambda q: hw, s['seed'] + 3 + m, u=14, v=10)
            ear.finish(self, [M['skin']], subdiv=1)
        self.hair(bvh, H, h['size'])
        self.lid_frames = self.lids(H)

    def hair(self, bvh, H, size):
        """Wool hair: a felted cap laid over the head, its hairline soft and uneven (cut along the
        line itself, not along the mesh), thinning toward it; on A, locks over the hairline and a
        few standing at the crown; on B, drawn back into a small bun."""
        s, M = self.spec, self.mats
        hs = s['hair']
        if hs['style'] == 'hat':
            return self.hat(bvh, H, size)
        if hs['style'] == 'bald':
            return self.beard(bvh, H, size)
        hw = {'head': 1.0}
        part = Part('hair')
        tmp = bmesh.new()
        bmesh.ops.create_uvsphere(tmp, u_segments=112, v_segments=84, radius=1.0)

        def line_at(x, y, z):
            front = max(0.0, -y)
            line = hs['front'] * front + hs['back'] * (1 - front) - 0.12 * abs(x) * front
            line -= hs['part'] * front * max(0.0, -x)   # swept down on one side
            return line + 0.05 * lib.wobble(Vector((x, y, z)), 0.35, 1.0, s['seed'] + 2).x

        depth = {tv: tv.co.z - line_at(*tv.co) for tv in tmp.verts}
        # move the outside corners of the faces the line crosses onto the line
        moved = {}
        for tv in tmp.verts:
            if depth[tv] > 0:
                continue
            ins = [e.other_vert(tv) for e in tv.link_edges if depth[e.other_vert(tv)] > 0]
            if not ins:
                continue
            pts = []
            for o in ins:
                t = depth[tv] / (depth[tv] - depth[o])
                pts.append(tv.co.lerp(o.co, min(0.97, t + 0.02)))
            moved[tv] = (sum(pts, Vector()) / len(pts)).normalized()
        lut = {}
        for tv in tmp.verts:
            if depth[tv] <= 0 and tv not in moved:
                continue
            dirn = moved.get(tv, tv.co).normalized()
            loc, nrm, _, _ = bvh.ray_cast(H + dirn * 0.04, -dirn)
            if loc is None:
                continue
            if nrm.dot(loc - H) < 0:
                nrm = -nrm
            dd = max(0.0, depth[tv])
            t = hs['thick'] * (0.35 + 0.65 * sstep(0.0, 0.18, dd)) * (0.75 + 0.55 * max(0.0, dirn.z))
            if hs['style'] == 'tousled':
                t += 0.0009 * max(0.0, lib.wobble(dirn, 0.25, 1.0, s['seed'] + 9).x) * sstep(0.0, 0.2, dd)
            lut[tv] = part.vert(loc + nrm * t, hw)
        crown = (Vector(hs['crown']) + H - H).normalized() if hs['style'] == 'tousled' else Vector((0.0, 0.26 * size[1], 0.50 * size[2])).normalized()
        ref = Vector((0, -1, 0)) if abs(crown.y) < 0.9 else Vector((1, 0, 0))
        e1 = (ref - crown * ref.dot(crown)).normalized()
        e2 = crown.cross(e1)
        for tf in tmp.faces:
            if all(tv in lut for tv in tf.verts):
                f = part.bm.faces.new([lut[tv] for tv in tf.verts])
                # 'UVMap' v: how far from the crown round the head, so fibres grown along v are
                # combed out from it
                for loop in f.loops:
                    dv = (loop.vert.co - H).normalized()
                    u = math.acos(max(-1.0, min(1.0, dv.dot(crown))))
                    v = math.atan2(dv.dot(e2), dv.dot(e1))
                    loop[part.uv].uv = ((v + math.pi) * 0.02, u * 0.02)
        tmp.free()
        ob = part.finish(self, [M['hair']], subdiv=1)
        sol = ob.modifiers.new('felt thickness', 'SOLIDIFY')
        sol.thickness, sol.offset = 0.0010, -1.0
        ob.modifiers.move(len(ob.modifiers) - 1, 1)
        self.hair_ob = ob

        def on_head(dirn, lift):
            loc, nrm, _, _ = bvh.ray_cast(H + dirn.normalized() * 0.04, -dirn.normalized())
            if nrm.dot(loc - H) < 0:
                nrm = -nrm
            return loc + nrm * lift, nrm

        def lock(name, root, toward, length, r0, curl, lift_tip):
            """A lock of wool lying along the head from `root` (a direction from the head's
            centre) toward `toward` (a direction), lifting off at its tip, curling a little."""
            pts, d = [], root.normalized()
            step = length / 5
            for k in range(6):
                p, n = on_head(d, hs['thick'] * 0.8 + lift_tip * (k / 5) ** 2)
                pts.append(p)
                tang = (toward - n * toward.dot(n)).normalized()
                tang = (Matrix.Rotation(curl * k / 5, 3, n) @ tang).normalized()
                d = (p + tang * step - H).normalized()
            radii = [r0 * (1 - 0.8 * (k / 5) ** 1.3) for k in range(6)]
            lp = Part(name)
            path_tube(lp, pts, radii, lambda q, t: hw, segs=8, cap_end=True, cap_start=True, flatten=0.55, up=(pts[0] - H).normalized())
            return lp.finish(self, [M['hair']], subdiv=1)

        self.locks = []
        rnd = lambda k: lib.wobble(Vector((k * 1.7, k * 0.3, 1.1)), 1.0, 1.0, s['seed'] + 31)
        if hs['style'] == 'tousled':
            # a handful of locks swept across the forehead to one side, two standing at the crown
            for k, (root, toward, ln, r0) in enumerate((
                    (Vector((-0.45, -0.62, 0.62)), Vector((0.9, -0.2, -0.45)), 0.0105, 0.0019),
                    (Vector((-0.15, -0.70, 0.66)), Vector((0.9, -0.25, -0.55)), 0.0090, 0.0017),
                    (Vector((0.15, -0.70, 0.66)), Vector((0.75, -0.3, -0.7)), 0.0072, 0.0015),
                    (Vector((0.48, -0.58, 0.60)), Vector((0.45, -0.3, -0.9)), 0.0060, 0.0014),
                    (Vector((-0.75, -0.35, 0.50)), Vector((0.1, -0.2, -1.0)), 0.0055, 0.0013),
                    (Vector((0.78, -0.30, 0.48)), Vector((-0.05, -0.2, -1.0)), 0.0050, 0.0012))):
                w = rnd(k)
                self.locks.append(lock(f'lock{k}', root, toward, ln, r0, 0.35 * w.x, 0.0003))
            for k, (root, toward) in enumerate(((Vector((0.15, 0.35, 1.0)), Vector((0.4, 0.6, 0.6))), (Vector((-0.05, 0.45, 0.95)), Vector((-0.5, 0.4, 0.8))))):
                self.locks.append(lock(f'crown lock{k}', root, toward, 0.0055, 0.0013, 0.8, 0.0016))
        else:
            # a couple of strands escaped at the temples and the nape
            for k, (root, toward) in enumerate(((Vector((0.72, -0.35, 0.45)), Vector((0.2, -0.3, -1.0))), (Vector((-0.70, -0.30, 0.40)), Vector((-0.15, -0.3, -1.0))),
                                                (Vector((0.25, 0.85, -0.15)), Vector((0.1, 0.4, -1.0))))):
                self.locks.append(lock(f'strand{k}', root, toward, 0.0055, 0.00045, 0.4, 0.0002))
            bun = Part('bun')
            c = H + Vector((0.0004, size[1] * 0.26, size[2] * 0.50))
            deformed_sphere(bun, c, (0.0150, 0.0138, 0.0122), lambda x, y, z: (1, 1, 1 - 0.1 * z), lambda q: hw, s['seed'] + 4, u=24, v=16)
            self.bun_ob = bun.finish(self, [M['hair']], subdiv=1)

    def beard(self, bvh, H, size):
        """A's beard, on a bald head: felt laid over the jaw from sideburns to chin, a moustache
        under the nose, the mouth left clear between them, thickest at the chin; fibres combed
        down; grey coming in at the chin. And felt eyebrows."""
        s, M = self.spec, self.mats
        hs = s['hair']
        hw = {'head': 1.0}
        w, d, hh = size
        nose_bot = (s['nose']['z'] - s['nose']['size'][2] * 0.5) / (hh / 2)
        mouth_z = s['mouth']['z'] / (hh / 2)

        def top(x):
            ax = abs(x)
            if ax >= 0.80:
                return 0.06
            if ax >= 0.42:
                return 0.06 + (ax - 0.80) / (0.42 - 0.80) * (-0.30 - 0.06)
            if ax >= 0.18:
                return -0.30 + (ax - 0.42) / (0.18 - 0.42) * (nose_bot + 0.02 + 0.30)
            return nose_bot + 0.02

        def depth(x, y, z):
            """How far inside the beard (unit-sphere z units), < 0 outside it."""
            dd = top(x) + 0.03 * lib.wobble(Vector((x, y, z)), 0.3, 1.0, s['seed'] + 5).x - z
            back_lim = 0.12 if z > -0.30 else 0.40
            dd = min(dd, (back_lim - y) * 1.5)
            if abs(x) < 0.21 and mouth_z - 0.07 < z < mouth_z + 0.05:
                dd = min(dd, max(z - (mouth_z + 0.05), (mouth_z - 0.07) - z, abs(x) - 0.21) * 1.0)
            return dd
        part = Part('beard')
        tmp = bmesh.new()
        bmesh.ops.create_uvsphere(tmp, u_segments=120, v_segments=90, radius=1.0)
        dep = {tv: depth(*tv.co) for tv in tmp.verts}
        moved = {}
        for tv in tmp.verts:
            if dep[tv] > 0:
                continue
            ins = [e.other_vert(tv) for e in tv.link_edges if dep[e.other_vert(tv)] > 0]
            if ins:
                pts = [tv.co.lerp(o.co, min(0.97, dep[tv] / (dep[tv] - dep[o]) + 0.02)) for o in ins]
                moved[tv] = (sum(pts, Vector()) / len(pts)).normalized()
        lut = {}
        for tv in tmp.verts:
            if dep[tv] <= 0 and tv not in moved:
                continue
            dirn = moved.get(tv, tv.co).normalized()
            loc, nrm, _, _ = bvh.ray_cast(H + dirn * 0.04, -dirn)
            if loc is None:
                continue
            if nrm.dot(loc - H) < 0:
                nrm = -nrm
            dd = max(0.0, dep[tv])
            chin = sstep(-0.35, -0.95, dirn.z)
            t = hs['thick'] * (0.45 + 0.55 * sstep(0.0, 0.10, dd)) * (0.75 + 1.35 * chin)
            t *= 1.0 + 0.25 * lib.wobble(dirn, 0.2, 1.0, s['seed'] + 6).x
            lut[tv] = part.vert(loc + nrm * t, hw)
        for tf in tmp.faces:
            if all(tv in lut for tv in tf.verts):
                f = part.bm.faces.new([lut[tv] for tv in tf.verts])
                for loop in f.loops:
                    dv = (loop.vert.co - H).normalized()
                    # 'UVMap' v runs down the face, so its fibres are combed down
                    loop[part.uv].uv = (math.atan2(dv.x, -dv.y) * 0.02, (1.0 - dv.z) * 0.02)
        tmp.free()
        ob = part.finish(self, [M['beard']], subdiv=1)
        sol = ob.modifiers.new('felt thickness', 'SOLIDIFY')
        sol.thickness, sol.offset = 0.0010, -1.0
        ob.modifiers.move(len(ob.modifiers) - 1, 1)
        self.beard_ob = ob
        # eyebrows: two short felted tufts, the inner ends a little raised
        e = s['eye']
        for m in (-1, 1):
            pts = []
            for k in range(5):
                t = k / 4
                x = m * (e['dx'] - 0.0026 + 0.0052 * t)
                z = e['z'] + 0.0036 + 0.0006 * math.sin(math.pi * t) - 0.0005 * t
                loc, nrm, _, _ = bvh.ray_cast(H + Vector((x, -0.05, z)), Vector((0, 1, 0)))
                if nrm.dot(loc - H) < 0:
                    nrm = -nrm
                pts.append(loc + nrm * 0.0005)
            br = Part(f'brow{m}')
            path_tube(br, pts, [0.00055, 0.00072, 0.00070, 0.00060, 0.00038], lambda q, t: hw, segs=8, cap_end=True, cap_start=True, flatten=0.55,
                      up=Vector((0, -1, 0.3)))
            br.finish(self, [M['beard']], subdiv=1)

    def hat(self, bvh, H, size):
        """B's knitted hat, pulled down over long blonde hair: a beanie (stockinette, a rolled rib
        brim, a yarn pompom) and, from under its edge at the temples, round the back and over the
        shoulders, the hair, draped as it would fall."""
        s, M = self.spec, self.mats
        hs = s['hair']
        hw = {'head': 1.0}

        def line_at(x, y, z):
            front = max(0.0, -y)
            line = hs['front'] * front + hs['back'] * (1 - front) - 0.10 * abs(x) * front
            return line + 0.03 * lib.wobble(Vector((x, y, z)), 0.35, 1.0, s['seed'] + 2).x

        def on_head(dirn, lift):
            dirn = dirn.normalized()
            loc, nrm, _, _ = bvh.ray_cast(H + dirn * 0.04, -dirn)
            if nrm.dot(loc - H) < 0:
                nrm = -nrm
            return loc + nrm * lift, nrm

        def edge_dir(az, below=0.0):
            """The direction from the head's centre to the hat's edge at azimuth `az` (0 the back,
            +90 degrees the figure's left), `below` that far under it."""
            dx, dy = math.sin(az), math.cos(az)
            z = 0.0
            for _ in range(8):
                r = math.sqrt(max(0.0, 1 - z * z))
                z = line_at(dx * r, dy * r, z)
            z -= below
            r = math.sqrt(max(0.0, 1 - z * z))
            return Vector((dx * r, dy * r, z))

        # the crown of the hat: the same soft-edged cap as hair, thicker, sitting over the hair
        part = Part('hat')
        tmp = bmesh.new()
        bmesh.ops.create_uvsphere(tmp, u_segments=96, v_segments=72, radius=1.0)
        depth = {tv: tv.co.z - line_at(*tv.co) for tv in tmp.verts}
        moved = {}
        for tv in tmp.verts:
            if depth[tv] > 0:
                continue
            ins = [e.other_vert(tv) for e in tv.link_edges if depth[e.other_vert(tv)] > 0]
            if ins:
                pts = [tv.co.lerp(o.co, min(0.97, depth[tv] / (depth[tv] - depth[o]) + 0.02)) for o in ins]
                moved[tv] = (sum(pts, Vector()) / len(pts)).normalized()
        lut = {}
        for tv in tmp.verts:
            if depth[tv] <= 0 and tv not in moved:
                continue
            dirn = moved.get(tv, tv.co).normalized()
            p, n = on_head(dirn, hs['thick'] * (0.9 + 0.35 * max(0.0, dirn.z)))
            lut[tv] = part.vert(p, hw)
        for tf in tmp.faces:
            if all(tv in lut for tv in tf.verts):
                f = part.bm.faces.new([lut[tv] for tv in tf.verts])
                for loop in f.loops:
                    dv = (loop.vert.co - H).normalized()
                    loop[part.uv].uv = (math.atan2(dv.x, -dv.y) * 0.01894, (dv.z + 1.0) * 0.021)   # (70 whole columns, joined at the back)
        tmp.free()
        ob = part.finish(self, [M['hat']], subdiv=1)
        sol = ob.modifiers.new('knit thickness', 'SOLIDIFY')
        sol.thickness, sol.offset = 0.0012, -1.0
        ob.modifiers.move(len(ob.modifiers) - 1, 1)
        self.hat_ob = ob
        # the brim, rolled up round the edge
        loop = [on_head(edge_dir(2 * math.pi * k / 72, below=0.0), hs['thick'] + 0.0004)[0] for k in range(72)]
        brim = Part('hat brim')
        ring_tube(brim, loop, 0.0020, lambda p: hw, segs=10)
        bm = brim.bm
        for f in bm.faces:
            for lp in f.loops:
                c = lp.vert.co - H
                lp[brim.uv].uv = (math.atan2(c.x, -c.y) * 0.020945, (c.z + 0.03) * 0.5)   # (94 whole ribs, joined at the back)
        brim.finish(self, [M['hat rib']], subdiv=1)
        # the pompom
        pom = Part('pompom')
        c = H + Vector((0.0004, size[1] * 0.18, size[2] * 0.5 + 0.0034))
        deformed_sphere(pom, c, (0.0128, 0.0124, 0.0118), lambda x, y, z: (1, 1, 1), lambda q: hw, s['seed'] + 4, u=24, v=16)
        self.bun_ob = pom.finish(self, [M['hat']], subdiv=1)
        self.long_hair(bvh, H, size, edge_dir, on_head)

    def long_hair(self, bvh, H, size, edge_dir, on_head):
        """Long hair falling from under the hat: forty locks round the head from temple to temple,
        each dropped from under the brim and let fall (down the head, off the jaw, over the roll-
        neck, onto the shoulders and the back), pushed out of the head, the neck, the body and the
        upper arms as it goes. Neighbouring locks are felted together in a dozen strips, parting
        below the jaw, with combed fibres on them; their ends are left uneven. (One curtain read
        as a moulded plastic ribbon: the technical artist's review.)"""
        s, M = self.spec, self.mats
        hw = {'head': 1.0}
        sec = s['sections']
        J = self.joints
        neck_r = s['neck'][0] + 0.0026
        neck_y = sec[-1][3]

        def section(z):
            for k in range(len(sec) - 1):
                z0, z1 = sec[k][0], sec[k + 1][0]
                if z0 <= z <= z1:
                    t = (z - z0) / (z1 - z0)
                    return [sec[k][i] + (sec[k + 1][i] - sec[k][i]) * t for i in range(1, 5)]
            return None

        def push_out(p, clear):
            loc, nrm, _, _ = bvh.find_nearest(p)
            if loc is not None:
                if nrm.dot(loc - H) < 0:
                    nrm = -nrm
                d = (p - loc).dot(nrm)
                if d < clear and (p - H).length < size[2] * 0.62:
                    p = p + nrm * (clear - d)
            if 0.062 < p.z < H.z - size[2] * 0.25:
                v = Vector((p.x, p.y - neck_y, 0.0))
                if v.length < neck_r + clear:
                    p = p + v.normalized() * (neck_r + clear - v.length)
            sc = section(p.z)
            if sc:
                a, b, yo, pw = sc
                v = Vector((p.x, p.y - yo, 0.0))
                f = ((abs(v.x) / a) ** pw + (abs(v.y) / b) ** pw) ** (1 / pw) if v.length > 1e-9 else 0.0
                if f > 1e-9:
                    rb = v.length / f
                    if v.length < rb + clear:
                        p = Vector((0, yo, p.z)) + v.normalized() * (rb + clear)
            return p

        def surface_y(x, z, back):
            """The body's surface at (x, z), on its back (back=True) or front."""
            sc = section(min(max(z, sec[0][0]), sec[-1][0]))
            a, b, yo, pw = sc
            t = max(0.0, 1 - min(1.0, abs(x) / a) ** pw) ** (1 / pw)
            return yo + (b * t if back else -b * t)

        def catmull(pts, n):
            out = []
            for i in range(len(pts) - 1):
                p0, p1, p2, p3 = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, len(pts) - 1)]
                for j in range(n):
                    t = j / n
                    t2, t3 = t * t, t * t * t
                    out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
            out.append(pts[-1])
            return out

        z_land = sec[-4][0] + 0.0012              # the top of the shoulders, beside the neck
        jaw_z = -0.42

        def shoulder_top(x):
            """How high the body reaches at |x| (the slope from the neck out over the shoulder)."""
            for k in range(len(sec) - 1, 0, -1):
                if sec[k - 1][1] >= abs(x):
                    z0, z1 = sec[k - 1][0], sec[k][0]
                    a0, a1 = sec[k - 1][1], sec[k][1]
                    t = (a0 - abs(x)) / max(1e-9, a0 - a1)
                    return z0 + (z1 - z0) * min(1.0, t)
            return sec[0][0]

        def strand(az, back, x_land, z_end, i, volume=0.0016):
            """One lock: from under the brim, down the head (standing off it by `volume` at the jaw),
            onto the body beside the neck or over the shoulder, then down the back (or the front)."""
            p0, n0 = on_head(edge_dir(az, below=0.05), 0.0009)
            r = math.sqrt(1 - jaw_z * jaw_z)
            p1, _ = on_head(Vector((math.sin(az) * r, math.cos(az) * r, jaw_z)), volume)
            over = sstep(math.radians(45), math.radians(92), abs(az)) if back else 1.0
            zt = shoulder_top(x_land)
            y_back = surface_y(x_land, z_land, back) + (0.0016 if back else -0.0016)
            sc = section(min(zt, sec[-1][0]))
            y_top = sc[2] + (0.25 * sc[1] if back else -0.25 * sc[1])
            p2 = Vector((x_land, y_back + (y_top - y_back) * over, z_land + (zt + 0.0018 - z_land) * over))
            zm = (min(p2.z, z_land) + z_end) / 2
            xm = x_land * 1.03
            p3 = Vector((xm, surface_y(xm, zm, back) + (0.0018 if back else -0.0018), zm))
            xe = x_land * 1.05
            p4 = Vector((xe, surface_y(xe, z_end, back) + (0.0020 if back else -0.0020), z_end))
            path = catmull([p0, p1, p2, p3, p4], 10)
            return [push_out(q, 0.0010) for q in path]

        def curtain(name, strands, Mn=30):
            """Felted wool between neighbouring locks; 'UVMap' u runs down each lock (in metres)."""
            grid = []
            for pts in strands:
                acc = [0.0]
                for k in range(1, len(pts)):
                    acc.append(acc[-1] + (pts[k] - pts[k - 1]).length)
                row = []
                for j in range(Mn):
                    t = acc[-1] * j / (Mn - 1)
                    k = next((m for m in range(1, len(acc)) if acc[m] >= t), len(acc) - 1)
                    a = (t - acc[k - 1]) / max(1e-9, acc[k] - acc[k - 1])
                    row.append((pts[k - 1].lerp(pts[k], a), t))
                grid.append(row)
            N = len(grid)

            def weight(p):
                hd = sstep(H.z - size[2] * 0.62, H.z - size[2] * 0.30, p.z)
                w = {'head': hd}
                rest = 1 - hd
                for side, m in (('L', 1), ('R', -1)):
                    sh = rest * 0.5 * sstep(0.006, 0.012, p.x * m)
                    w[f'shoulder.{side}'] = sh
                    rest -= sh
                w['chest'] = rest
                return w
            part = Part(name)
            verts = [[part.vert(p, weight(p)) for p, t in row] for row in grid]
            i0, j0 = N // 2, Mn // 2
            q = grid[i0][j0][0]
            nrm = (grid[min(i0 + 1, N - 1)][j0][0] - grid[max(i0 - 1, 0)][j0][0]).cross(grid[i0][j0 + 1][0] - q)
            axis = Vector((0.0, (H.y + sec[-1][3]) / 2, q.z))
            flip = nrm.dot(q - axis) < 0
            for i in range(N - 1):
                for j in range(Mn - 1):
                    quad = (verts[i][j], verts[i + 1][j], verts[i + 1][j + 1], verts[i][j + 1])
                    f = part.bm.faces.new(quad[::-1] if flip else quad)
                    for lp in f.loops:
                        ii = i if lp.vert in (verts[i][j], verts[i][j + 1]) else i + 1
                        jj = j if lp.vert in (verts[i][j], verts[i + 1][j]) else j + 1
                        lp[part.uv].uv = (ii * 0.0015, grid[ii][jj][1])
            ob = part.finish(self, [M['hair']], subdiv=1)
            sol = ob.modifiers.new('hair thickness', 'SOLIDIFY')
            sol.thickness, sol.offset = 0.0011, -1.0
            ob.modifiers.move(len(ob.modifiers) - 1, 1)
            return ob

        def parted(name, strands, sizes, Mn=30):
            """The strands felted into locks of `sizes` strands each. A lock's two edge strands are
            drawn in toward it below the jaw (a quarter of the way to their neighbours), so the
            locks part there and lie together under the brim."""
            obs, i = [], 0
            for g, k in enumerate(sizes):
                group = [list(st) for st in strands[i:i + k]]
                i += k
                L = len(group[0])
                for e, inner in ((0, 1), (k - 1, k - 2)):
                    group[e] = [q.lerp(group[inner][j], 0.24 * sstep(0.12, 0.5, j / (L - 1))) for j, q in enumerate(group[e])]
                ob = curtain(f'{name} {g}', group, Mn)
                ob['share'] = k / len(strands)     # (its part of the fibres)
                obs.append(ob)
            return obs

        def lock_of(sizes):
            return [g for g, k in enumerate(sizes) for _ in range(k)]

        # the back: from temple to temple round the back of the head, down to mid-back, in twelve
        # locks whose ends are 2-5 mm apart
        sizes = (3, 3, 4, 3, 3, 4, 3, 3, 3, 4, 3, 2)
        ends = (0.003, -0.002, 0.005, -0.003, 0.002, -0.004, 0.004, -0.002, 0.003, -0.005, 0.002, -0.003)
        g = lock_of(sizes)
        back = []
        for i in range(38):
            az = math.radians(-95 + 190 * i / 37)
            w = lib.wobble(Vector((i * 0.37, 0.5, 0.2)), 1.0, 1.0, s['seed'] + 41)
            x_land = 0.0124 * math.sin(az)
            back.append(strand(az, True, x_land, 0.034 + 0.004 * w.x - 0.004 * math.cos(az) + ends[g[i]], i,
                               volume=0.0016 + 0.0014 * abs(math.sin(az))))
        self.long_hair_obs = parted('long hair', back, sizes)
        # and three locks in front of each shoulder, from the temple over the collar onto the chest
        sizes = (3, 4, 3)
        g = lock_of(sizes)
        for side, m in (('R', -1), ('L', 1)):
            ends = (0.002, -0.003, 0.004) if side == 'R' else (-0.002, 0.003, -0.004)
            locks = []
            for i in range(10):
                az = m * math.radians(124 - 26 * i / 9)
                w = lib.wobble(Vector((i * 0.53, 0.9, 0.1 * m)), 1.0, 1.0, s['seed'] + 43)
                locks.append(strand(az, False, m * (0.0058 + 0.0064 * i / 9), 0.046 + 0.004 * w.x - 0.002 * i / 9 + ends[g[i]], i, volume=0.0026))
            parted(f'front hair.{side}', locks, sizes, Mn=26)
        # two locks escaping at the temples, in front of the ears
        for k, m in enumerate((-1, 1)):
            base = edge_dir(math.radians(m * 128), below=0.04)
            pts = []
            d = base.normalized()
            for j in range(7):
                p, n = on_head(d, 0.0011 + 0.0003 * j)
                pts.append(p)
                tang = (Vector((0.15 * m, -0.25, -1.0)) - n * Vector((0.15 * m, -0.25, -1.0)).dot(n)).normalized()
                d = (p + tang * 0.0016 - H).normalized()
            lk = Part(f'temple lock{k}')
            path_tube(lk, pts, [0.0012 * (1 - 0.75 * (j / 6) ** 1.4) for j in range(7)], lambda q, t: hw, segs=8, cap_end=True, cap_start=True, flatten=0.5,
                      up=(pts[0] - H).normalized())
            lk.finish(self, [M['hair']], subdiv=1)

    def lids(self, H):
        """Felt eyelids: a thin cap over the top of each knotted eye, on its own bone, so an eye can
        close (rotate `lid.L`/`lid.R` about their x axis)."""
        s, M = self.spec, self.mats
        e = s['eye']
        out = {}
        for i, (p, n) in enumerate(self.face['eyes']):
            side = 'R' if i == 0 else 'L'
            c = p - n * e['r'] * 0.3
            up = (Vector((0, 0, 1)) - n * n.z).normalized()
            sx = n.cross(up).normalized()
            R = e['r'] * 1.16
            part = Part(f'lid.{side}')
            na, nb = 10, 16
            grid = {}
            edge = math.radians(e['lid'])
            for a in range(na + 1):
                al = edge * a / na
                for b in range(nb + 1):
                    be = math.radians(-105 + 210 * b / nb)
                    dvec = up * math.cos(al) + (n * math.cos(be) + sx * math.sin(be)) * math.sin(al)
                    grid[a, b] = part.vert(c + dvec * R, {f'lid.{side}': 1.0})
            for a in range(na):
                for b in range(nb):
                    part.bm.faces.new((grid[a, b], grid[a, b + 1], grid[a + 1, b + 1], grid[a + 1, b]))
            bmesh.ops.recalc_face_normals(part.bm, faces=part.bm.faces)
            ob = part.finish(self, [M['skin']], subdiv=1)
            sol = ob.modifiers.new('felt', 'SOLIDIFY')
            sol.thickness, sol.offset = 0.00028, 1.0
            ob.modifiers.move(len(ob.modifiers) - 1, 1)
            out[side] = (c, n, sx)
        return out

    # B's cardigan and its cuff ---------------------------------------------------------------------

    def cardigan_front(self):
        """The cardigan's front edges (a V to the top button, then the button band) and its buttons."""
        s, M = self.spec, self.mats
        me = self.jumper.data
        bvh = BVHTree.FromPolygons([v.co for v in me.vertices], [tuple(p.vertices) for p in me.polygons])

        def onto(x, z):
            loc, nrm, _, _ = bvh.ray_cast(Vector((x, -0.05, z)), Vector((0, 1, 0)))
            return loc, nrm
        for m in (-1, 1):
            pts = []
            for z in (0.0695, 0.066, 0.061, 0.056, 0.051, 0.047, 0.040, 0.030):
                x = m * (0.0012 + max(0.0, z - 0.047) * 0.30) if z >= 0.047 else m * 0.0012
                q, n = onto(x, z)
                if q is not None:
                    pts.append(q + n * 0.0006)
            band = Part(f'front band{m}')
            path_tube(band, pts, [0.0009] * len(pts), lambda p, t: self.torso_weight(p), segs=8, cap_end=True, cap_start=True, flatten=0.5, up=Vector((0, -1, 0)))
            band.finish(self, [M['jumper']], subdiv=1)
        for i, z in enumerate((0.0455, 0.034, 0.0225)):
            q, n = onto(0.0, z)
            b = Part(f'button{i}')
            deformed_sphere(b, q + n * 0.0011, (0.0026, 0.0012, 0.0026), lambda x, y, zz: (1, 1, 1), lambda p: self.torso_weight(p), s['seed'] + i, u=14, v=8)
            b.finish(self, [M['button']], subdiv=1)

    def cuff_fold(self, side):
        """The fold that motivates everything: a corner of the cuff caught and turned back over a
        diagonal crease, as a sleeve folds when it has been pushed up without looking. The flap
        lies on the outside of the sleeve showing its ivory lining; the sleeve's end is cut back
        along the crease where the corner came from; the hem's small stitches run along the flap's
        edge. It is built on the forearm, so it goes where the arm goes. Shape keys: 'lift' (its
        corner rising toward a fingertip) and 'after' (lying a little askew once the arm has been
        pulled back across the table)."""
        s, M = self.spec, self.mats
        el, wr = self.joints[f'forearm.{side}']
        D = (wr - el).normalized()
        up = (Vector((0, 0, 1)) - D * D.z).normalized()
        across = D.cross(up).normalized()          # for B's right forearm: toward A
        ob_s, _, dense, along, s_sh, s_el, ring_idx = self.sleeves[side]
        s_end = along[-1]
        end = dense[-1][0]
        r = s['sleeve'][4]
        T = 0.0006                                 # the cloth's thickness
        th_a, th_b, L = math.radians(-35), math.radians(108), 0.0070
        ua, ub = th_a * r, th_b * r
        A2, B2, C2 = Vector((ua, 0.0)), Vector((ub, L)), Vector((ub, 0.0))
        ln = (B2 - A2).normalized()
        nl = Vector((-ln.y, ln.x))

        def fold_e(u):
            return L * (u - ua) / (ub - ua)

        def reflect(P):
            return P - nl * 2 * (P - A2).dot(nl)

        def radial(th):
            return up * math.cos(th) + across * math.sin(th)

        # 1. the sleeve's end, cut back along the crease where the corner was folded away
        me = ob_s.data
        keys = list(me.shape_keys.key_blocks) if me.shape_keys else []
        E = 0.011
        for ii, idxs in enumerate(ring_idx):
            e = s_end - along[ii]
            if e > E:
                continue
            c = dense[ii][0]
            for vi in idxs:
                co = me.vertices[vi].co.copy()
                rv = co - c
                rv = rv - D * rv.dot(D)
                th = math.atan2(rv.dot(across), rv.dot(up))
                if not th_a <= th <= th_b:
                    continue
                f = fold_e(th * r)
                e_new = f + e * (1 - f / E)
                delta = -D * (e_new - e)
                me.vertices[vi].co = co + delta
                for kb in keys:
                    kb.data[vi].co = kb.data[vi].co + delta
        # 1b. a few soft wrinkles round the sleeve just above the cuff, where it was pushed up
        # without looking (on the shape keys too, so they go where the sleeve goes)
        for ii, idxs in enumerate(ring_idx):
            e = s_end - along[ii]
            if not 0.0035 < e < 0.017:
                continue
            env = math.sin(math.pi * (e - 0.0035) / 0.0135) ** 2
            c = dense[ii][0]
            for vi in idxs:
                co = me.vertices[vi].co.copy()
                rv = co - c
                rv = rv - D * rv.dot(D)
                if rv.length < 1e-9:
                    continue
                th = math.atan2(rv.dot(across), rv.dot(up))
                ridge = math.sin(e * 2 * math.pi / 0.0052 + 1.7 * math.sin(th + 0.4) + 0.6 * th) * 0.00024 * env
                delta = rv.normalized() * ridge
                me.vertices[vi].co = co + delta
                for kb in keys:
                    kb.data[vi].co = kb.data[vi].co + delta
        # how far the flap stands off the sleeve, and how its two shape keys move it, at (a, b) on
        # it: the hem's stitches use the same, so they lie in the cloth and go where it goes
        def lift_at(a, b):
            # never pressed flat: the crease a soft roll of cloth, not a pressed edge; the free
            # corner stands off a little; the edge waves
            crease = max(0.0, 1.0 - (1.0 - b) * a * 6.0)            # 1 on the crease
            return (T * (1.15 + 1.1 * crease ** 2) + 0.00055 * a ** 2.5 * (1 - b) + 0.00012 * math.sin(a * math.pi * 3.2) * (1 - b)
                    + 0.00018 * lib.wobble(Vector((a, b, 0.3)), 0.4, 1.0, s['seed'] + 17).x)

        def moves(a, b, Q):
            """The 'lift' and 'after' offsets of the point at (a, b)."""
            out = radial(Q.x / r)
            # lift: the corner (a near 1, at the hem) comes up off the sleeve toward the hand
            w = (a ** 2.2) * (1 - b) ** 1.5
            # after: the arm drawn back across the table has dragged the flap a little round
            w2 = a * (1 - b * 0.5)
            return out * 0.0016 * w + D * 0.0005 * w, across * 0.0007 * w2 * (1 - b) + out * 0.0003 * w2 - D * 0.0004 * a * a

        # 2. the flap: the triangle of cloth beyond the crease, mirrored across it onto the sleeve
        fw = {f'forearm.{side}': 1.0}
        part = Part(f'cuff fold.{side}')
        na, nb = 30, 12
        grid, info = {}, {}
        for i in range(na + 1):
            a = i / na
            for j in range(nb + 1):
                b = j / nb
                P = A2 + (C2 - A2) * a + (B2 - C2) * a * b
                Q = reflect(P)
                pos = end - D * Q.y + radial(Q.x / r) * (r + lift_at(a, b))
                grid[i, j] = part.vert(pos, fw)
                info[i, j] = (a, b, Q)
        q = grid[na // 2, nb // 2].co
        nrm = (grid[na // 2 + 1, nb // 2].co - q).cross(grid[na // 2, nb // 2 + 1].co - q)
        flip = nrm.dot(q - (end - D * (end - q).dot(-D) * -1)) < 0
        axis_pt = lambda v: end - D * (end - v).dot(D)
        flip = nrm.dot(q - axis_pt(q)) < 0
        for i in range(na):
            for j in range(nb):
                quad = (grid[i, j], grid[i + 1, j], grid[i + 1, j + 1], grid[i, j + 1])
                part.bm.faces.new(quad[::-1] if flip else quad)
        part.bm.verts.index_update()
        idx = {key: v.index for key, v in grid.items()}
        corner = grid[na, 0].co.copy()                 # the free corner (where C folded to)
        ob = part.finish(self, [M['lining'], M['jumper']], subdiv=1)
        sol = ob.modifiers.new('cloth thickness', 'SOLIDIFY')
        sol.thickness, sol.offset, sol.material_offset = 0.00055, -1.0, 1
        sol.use_rim = True
        ob.modifiers.move(len(ob.modifiers) - 1, 1)
        mf = ob.data
        ob.shape_key_add(name='rest', from_mix=False)
        lift_k = ob.shape_key_add(name='lift', from_mix=False)
        after_k = ob.shape_key_add(name='after', from_mix=False)
        for (i, j), vi in idx.items():
            a, b, Q = info[i, j]
            co = mf.vertices[vi].co.copy()
            dl, da = moves(a, b, Q)
            lift_k.data[vi].co = co + dl
            after_k.data[vi].co = co + da
        self.flap = ob
        self.flap_frame = (end, D, up, across, r, th_a, th_b)
        self.flap_corner = corner
        # 3. the hem's running stitch along the flap's edge, small and not quite even: each dash
        # sunk into the cloth (its centre 0.4 of its radius above the flap's face), with the flap's
        # own shape keys
        stitch = Part(f'hem stitch.{side}')
        rad = 0.00008
        dashes = []
        k, a = 0, 0.06
        while a < 0.95:
            w = lib.wobble(Vector((k * 0.7, 0.2, 0.9)), 1.0, 1.0, s['seed'] + 19)
            a0, a1 = a, a + 0.045 + 0.008 * w.x
            bb = 0.09 + 0.02 * w.y
            pts = []
            for aa in (a0, a1):
                Q = reflect(A2 + (C2 - A2) * aa + (B2 - C2) * aa * bb)
                pts.append(end - D * Q.y + radial(Q.x / r) * (r + lift_at(aa, bb) + 0.4 * rad))
            v0 = len(stitch.bm.verts)
            path_tube(stitch, pts, [rad, rad], lambda p, t: fw, segs=5, cap_end=True, cap_start=True, flatten=0.6, up=radial(Q.x / r))
            dashes.append((v0, len(stitch.bm.verts), a0, a1, bb, pts[0], pts[1]))
            a = a1 + 0.03 + 0.006 * w.z
            k += 1
        sob = stitch.finish(self, [M['hem thread']], subdiv=0)
        sob.shape_key_add(name='rest', from_mix=False)
        s_lift = sob.shape_key_add(name='lift', from_mix=False)
        s_after = sob.shape_key_add(name='after', from_mix=False)
        for v0, v1, a0, a1, bb, p0, p1 in dashes:
            seg = p1 - p0
            for vi in range(v0, v1):
                co = sob.data.vertices[vi].co.copy()
                aa = a0 + (a1 - a0) * min(1.0, max(0.0, (co - p0).dot(seg) / seg.length_squared))
                dl, da = moves(aa, bb, reflect(A2 + (C2 - A2) * aa + (B2 - C2) * aa * bb))
                s_lift.data[vi].co = co + dl
                s_after.data[vi].co = co + da
        self.flap_stitch = sob

    # fibres ---------------------------------------------------------------------------------------

    def fuzz(self):
        """Loose wool standing off every felt and knitted surface, seeded so the same fibres are in
        every photograph, grown from the deformed surface so they go where the felt goes."""
        M = self.mats
        knit = self.spec['jumper'][0] == 'knit'
        for ob in self.objects:
            n = ob.name.split(' ', 1)[1]
            if n == 'head':
                # (a halo where the lamp grazes the head, as the pompom has: before, fibres a
                # twentieth of a pixel lay flat and the heads read as polystyrene)
                lib.fuzz(ob, 12000, 0.0017, M['skin fibre'], children=5, rough=0.0007, seed=11, root=0.000022, tip=0.000006, lie=0.65, clump=0.25)
            elif n == 'hair':
                if self.spec['hair']['style'] == 'tousled':
                    # loose wool, falling from the crown in soft clumps
                    lib.fuzz(ob, 4200, 0.0030, M['hair fibre'], children=8, rough=0.0006, seed=12, root=0.000020, tip=0.000006,
                             clump=0.5, lie=0.15, comb=1.0, spread=0.35, child_radius=0.0011, steps=4)
                else:
                    # combed back into the bun
                    lib.fuzz(ob, 3200, 0.0030, M['hair fibre'], children=8, rough=0.0003, seed=12, root=0.000018, tip=0.000006,
                             clump=0.3, lie=0.05, comb=-1.0, spread=0.12, child_radius=0.0008, steps=4)
            elif n.startswith(('lock', 'crown lock')):
                lib.fuzz(ob, 260, 0.0018, M['hair fibre'], children=5, rough=0.0008, seed=21 + len(n), root=0.000014, tip=0.000004, clump=0.3, lie=0.4)
            elif n == 'beard':
                lib.fuzz(ob, 5200, 0.0022, M['beard fibre'], children=7, rough=0.0005, seed=31, root=0.000016, tip=0.000005, steps=4,
                         clump=0.4, lie=0.12, comb=1.0, spread=0.25, child_radius=0.0008)
                lib.fuzz(ob, 900, 0.0020, M['grey fibre'], children=5, rough=0.0005, seed=32, root=0.000014, tip=0.000005, steps=4,
                         clump=0.3, lie=0.15, comb=1.0, spread=0.3, child_radius=0.0008)
            elif n.startswith('brow'):
                lib.fuzz(ob, 160, 0.0012, M['beard fibre'], children=5, rough=0.0003, seed=33 + len(n), root=0.000012, tip=0.000004, lie=0.3)
            elif n == 'hat':
                lib.fuzz(ob, 4500, 0.0012, M['hat fibre'], children=5, rough=0.0006, seed=24, root=0.000011, tip=0.000004, lie=0.5)
            elif n == 'hat brim':
                lib.fuzz(ob, 1500, 0.0011, M['hat fibre'], children=5, rough=0.0006, seed=25, root=0.000011, tip=0.000004, lie=0.5)
            elif n == 'pompom':
                lib.fuzz(ob, 2600, 0.0020, M['hat fibre'], children=6, rough=0.0010, seed=26, root=0.000016, tip=0.000005, lie=0.8, spread=0.5, clump=0.3)
            elif n.startswith('long hair'):
                # (lifted a little off the felt and clumped, so the locks read as wool, not a moulding)
                lib.fuzz(ob, int(6500 * ob.get('share', 1.0)), 0.0070, M['hair fibre'], children=8, rough=0.0010, seed=27 + len(n) + ord(n[-1]),
                         root=0.000020, tip=0.000005, steps=5, clump=0.6, lie=0.13, comb=1.0, spread=0.3, child_radius=0.0010)
            elif n.startswith('front hair'):
                lib.fuzz(ob, int(1600 * ob.get('share', 1.0)), 0.0065, M['hair fibre'], children=8, rough=0.0010, seed=29 + len(n) + ord(n[-1]),
                         root=0.000020, tip=0.000005, steps=5, clump=0.6, lie=0.13, comb=1.0, spread=0.3, child_radius=0.0010)
            elif n.startswith('temple lock'):
                lib.fuzz(ob, 300, 0.0030, M['hair fibre'], children=6, rough=0.0004, seed=28 + len(n), root=0.000016, tip=0.000005, clump=0.4, lie=0.2)
            elif n == 'bun':
                lib.fuzz(ob, 900, 0.0012, M['hair fibre'], children=6, rough=0.0009, seed=13, root=0.000014, tip=0.000004, clump=0.2, lie=0.3)
            elif n == 'jumper':
                lib.fuzz(ob, 9000, 0.0022 if knit else 0.0016, M['jumper fibre'], children=5, rough=0.0008, seed=14, root=0.000011, tip=0.000004, lie=0.6)
            elif n.startswith('sleeve'):
                lib.fuzz(ob, 4000, 0.0022 if knit else 0.0016, M['jumper fibre'], children=5, rough=0.0008, seed=15 + len(n), root=0.000011, tip=0.000004, lie=0.6)
            elif n.startswith('cuff fold'):
                # (its cut edge and its face fuzzy, as felt is where it was cut)
                lib.fuzz(ob, 700, 0.0011, M['lining fibre'], children=4, rough=0.0005, seed=41, root=0.000010, tip=0.000004, lie=0.55)
            elif n.startswith('hand'):
                lib.fuzz(ob, 1800, 0.00125, M['hand fibre'], children=5, rough=0.0005, seed=16 + len(n), root=0.000018, tip=0.000005, lie=0.6, clump=0.2)


def build(collection):
    """Both figures, in their rest poses. Returns {'a': Figure, 'b': Figure}."""
    figs = {}
    for key in ('a', 'b'):
        f = Figure(key, collection)
        f.build()
        figs[key] = f
    bpy.context.view_layer.update()
    return figs
