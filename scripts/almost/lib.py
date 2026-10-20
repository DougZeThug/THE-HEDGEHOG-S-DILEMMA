"""Shared pieces for "Almost" (scripts/almost/): handmade shapes and materials at miniature scale.

Everything is in metres at the scale of the set (a 1:6 miniature: a figure about 0.2 m tall), and
everything is deterministic: the same arguments give the same geometry, so a pose rendered twice is
the same photograph.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

# -- geometry -------------------------------------------------------------------------------------


def wobble(v, scale, amp, seed):
    """A smooth, low displacement at `v` (the unevenness of a hand-stuffed shape)."""
    off = Vector((seed * 7.31, seed * 3.17, seed * 5.53))
    return amp * noise.noise_vector(v / scale + off, noise_basis='PERLIN_ORIGINAL')


def link(ob, collection=None):
    (collection or bpy.context.scene.collection).objects.link(ob)
    return ob


def add_rest(me):
    """Store each vertex's rest position (metres) in two UV layers, 'rest_xy' and 'rest_z', so
    procedural textures on a mesh that bends with a puppet's armature stay put on the felt instead
    of swimming through it (Cycles' Object coordinates follow the deformed surface)."""
    xy = me.uv_layers.new(name='rest_xy')
    z = me.uv_layers.new(name='rest_z')
    for loop in me.loops:
        co = me.vertices[loop.vertex_index].co
        xy.data[loop.index].uv = (co.x, co.y)
        z.data[loop.index].uv = (co.z, 0.0)


def mesh_object(name, bm, material=None, smooth=True, subdiv=1, collection=None, rest=False):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if rest:
        add_rest(me)
    if 'UVMap' in me.uv_layers:
        # the active (and render) UV layer is what particle hair combs along and what bakes use
        me.uv_layers.active = me.uv_layers['UVMap']
        me.uv_layers['UVMap'].active_render = True
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    ob = link(bpy.data.objects.new(name, me), collection)
    if material is not None:
        me.materials.append(material)
    if subdiv:
        m = ob.modifiers.new('subdiv', 'SUBSURF')
        m.levels, m.render_levels = subdiv, subdiv + 1
    return ob


def egg(name, size, center=(0, 0, 0), wob=0.04, seed=0, taper=0.0, material=None, subdiv=1, segments=32, rings=20, rest=False):
    """A soft stuffed shape: an ellipsoid `size` (full width, depth, height), narrower toward the top
    by `taper`, its surface pushed in and out a little, as stuffing sits."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=0.5, calc_uvs=True)
    sx, sy, sz = size
    for v in bm.verts:
        p = v.co.copy()
        t = 1.0 - taper * (p.z + 0.5)
        q = Vector((p.x * sx * t, p.y * sy * t, p.z * sz))
        n = q.normalized() if q.length else Vector((0, 0, 1))
        q += n * wobble(q, max(size) * 0.6, wob * max(size), seed).dot(n)
        v.co = q + Vector(center)
    return mesh_object(name, bm, material, subdiv=subdiv, rest=rest)


def superellipsoid(name, size, power=0.7, center=(0, 0, 0), wob=0.03, seed=0, material=None, subdiv=1, segments=40, rings=24, rest=False):
    """A boxier soft shape (a stuffed torso, a cushion): each coordinate of a sphere's point raised to
    `power` (<1 squarer)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=1.0, calc_uvs=True)
    sx, sy, sz = (s / 2 for s in size)
    for v in bm.verts:
        p = v.co
        q = Vector([math.copysign(abs(c) ** power, c) for c in p])
        q = Vector((q.x * sx, q.y * sy, q.z * sz))
        n = q.normalized() if q.length else Vector((0, 0, 1))
        q += n * wobble(q, max(size) * 0.6, wob * max(size), seed).dot(n)
        v.co = q + Vector(center)
    return mesh_object(name, bm, material, subdiv=subdiv, rest=rest)


def tube(name, points, radii, segments=20, cap=True, wob=0.0, seed=0, material=None, subdiv=1, flatten=1.0, up=(0, 0, 1),
         metric=False, rest=False, rings_out=None):
    """A soft tube along `points` (a sleeve, a limb) with `radii` at each, round-capped, UVs u around
    (0 at the underside seam) and v along (in metres if `metric`: u the distance round, v along).
    `flatten` squashes it across (a felt limb is not round). `rings_out`, a list, receives each
    ring's vertex indices and its distance along (for weighting the tube to bones)."""
    pts = [Vector(p) for p in points]
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new('UVMap')
    rings = []
    upv = Vector(up)
    total = sum((pts[i + 1] - pts[i]).length for i in range(len(pts) - 1))
    along = [0.0]
    for i in range(1, len(pts)):
        along.append(along[-1] + (pts[i] - pts[i - 1]).length)
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        side = d.cross(upv)
        if side.length < 1e-6:
            side = d.cross(Vector((1, 0, 0)))
        side.normalize()
        nrm = side.cross(d).normalized()
        ring = []
        for k in range(segments):
            a = 2 * math.pi * k / segments
            off = side * math.cos(a) * radii[i] + nrm * math.sin(a) * radii[i] * flatten
            q = p + off
            if wob:
                q += off.normalized() * wobble(q, radii[i] * 4, wob * radii[i], seed).dot(off.normalized())
            ring.append(bm.verts.new(q))
        rings.append(ring)
    rmean = sum(radii) / len(radii)
    for i in range(len(rings) - 1):
        for k in range(segments):
            k2 = (k + 1) % segments
            f = bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
            for loop, (kk, ii) in zip(f.loops, ((k, i), (k + 1, i), (k + 1, i + 1), (k, i + 1))):
                loop[uv].uv = (kk / segments * 2 * math.pi * rmean, along[ii]) if metric else (kk / segments, along[ii] / total)
    if cap:
        for end, ring, sign in ((0, rings[0], -1), (len(pts) - 1, rings[-1], 1)):
            d = (pts[min(end + 1, len(pts) - 1)] - pts[max(end - 1, 0)]).normalized() * sign
            c = bm.verts.new(pts[end] + d * radii[end] * 0.6)
            for k in range(segments):
                k2 = (k + 1) % segments
                vs = (ring[k], ring[k2], c) if sign > 0 else (ring[k2], ring[k], c)
                f = bm.faces.new(vs)
                for loop in f.loops:
                    loop[uv].uv = (k / segments, 0.0 if sign < 0 else 1.0) if not metric else (k / segments * 2 * math.pi * rmean, along[end])
    if rings_out is not None:
        bm.verts.index_update()
        for i, ring in enumerate(rings):
            rings_out.append(([v.index for v in ring], along[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_object(name, bm, material, subdiv=subdiv, rest=rest)


def rounded_box(name, size, center=(0, 0, 0), bevel=0.002, material=None, segments=3):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0, calc_uvs=True)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2])) + Vector(center)
    ob = mesh_object(name, bm, material, smooth=False, subdiv=0)
    if bevel:
        b = ob.modifiers.new('bevel', 'BEVEL')
        b.width, b.segments, b.limit_method = bevel, segments, 'ANGLE'
        ob.modifiers.new('smooth', 'WEIGHTED_NORMAL') if False else None
        for p in ob.data.polygons:
            p.use_smooth = True
    return ob


def cylinder(name, radius, depth, center=(0, 0, 0), rotation=(0, 0, 0), vertices=32, material=None, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=vertices, radius1=radius, radius2=radius, depth=depth, calc_uvs=True)
    mat = Matrix.Translation(center) @ Vector(rotation).to_track_quat('Z', 'Y').to_matrix().to_4x4() if False else (Matrix.Translation(center) @ Matrix.Rotation(rotation[2], 4, 'Z') @ Matrix.Rotation(rotation[1], 4, 'Y') @ Matrix.Rotation(rotation[0], 4, 'X'))
    bmesh.ops.transform(bm, matrix=mat, verts=bm.verts)
    ob = mesh_object(name, bm, material, smooth=False, subdiv=0)
    if bevel:
        b = ob.modifiers.new('bevel', 'BEVEL')
        b.width, b.segments, b.limit_method = bevel, 2, 'ANGLE'
    for p in ob.data.polygons:
        p.use_smooth = abs(p.normal.z) < 0.9
    return ob


# -- fuzz -----------------------------------------------------------------------------------------


def fuzz(ob, count, length, material=None, children=6, rough=0.004, seed=1, root=0.00003, tip=0.000008, steps=3, clump=0.0, kink=None,
         vertex_group=None, lie=1.0, comb=0.0, spread=1.0, child_radius=0.002):
    """Loose fibres standing off a felt surface (particle hair: it is seeded, so the same fibres every
    frame, and it follows the surface as it bends: nothing crawls). Lengths in metres. `comb` lays
    them along the mesh's 'UVMap' v direction (combed hair: Blender's particle tangent follows v),
    `spread` scales their randomness. Advanced hair grows for four units of time at its emission
    speed, so the speeds are a quarter of the lengths (measured: tests in scripts/almost/README)."""
    m = ob.modifiers.new('fuzz', 'PARTICLE_SYSTEM')
    m.show_viewport = False   # rendered only: posing (which evaluates the scene often) stays quick
    psys = ob.particle_systems[-1]
    psys.seed = seed
    ps = psys.settings
    ps.type = 'HAIR'
    ps.count = count
    ps.hair_length = length
    ps.emit_from = 'FACE'
    ps.use_even_distribution = True
    ps.use_advanced_hair = True   # lengths come from the emission speeds: `length` along the normal, a
    v = length / 4.0                 # random part as long again in any direction, so fibres stand at
    ps.normal_factor = v * lie       # every angle and length, as on worked felt (`lie` < 1: lying down more)
    ps.factor_random = v * spread
    ps.tangent_factor = v * comb
    ps.render_type = 'PATH'
    ps.display_step, ps.render_step = 2, steps
    ps.child_type = 'INTERPOLATED' if children else 'NONE'
    ps.child_percent = min(children, 2)
    ps.rendered_child_count = children
    ps.child_radius = child_radius
    ps.roughness_1 = rough
    ps.roughness_1_size = 0.4
    ps.roughness_endpoint = rough * 0.8
    ps.roughness_end_shape = 1.0
    ps.roughness_2 = rough * 0.5
    ps.roughness_2_size = 1.0
    ps.clump_factor = clump
    if kink:
        ps.kink = 'CURL'
        ps.kink_amplitude, ps.kink_frequency = kink
    ps.root_radius = root
    ps.tip_radius = tip
    ps.radius_scale = 1.0
    ps.use_close_tip = True
    if material is not None:
        if material.name not in [s.material.name for s in ob.material_slots if s.material]:
            ob.data.materials.append(material)
        ps.material_slot = material.name
    if vertex_group:
        psys.vertex_group_density = vertex_group
    return psys


# -- materials ------------------------------------------------------------------------------------


class Nodes:
    """A small helper for building shader node trees."""

    def __init__(self, mat):
        mat.use_nodes = True
        self.mat, self.nt = mat, mat.node_tree
        self.nt.nodes.clear()
        self.x = 0

    def add(self, kind, **inputs):
        n = self.nt.nodes.new(kind)
        n.location = (self.x, 0)
        self.x += 220
        for k, v in inputs.items():
            if k.startswith('_'):
                setattr(n, k[1:], v)
            elif isinstance(v, bpy.types.NodeSocket):
                self.nt.links.new(v, n.inputs[k])
            else:
                n.inputs[k].default_value = v
        return n

    def link(self, a, b):
        self.nt.links.new(a, b)

    def coords(self, kind='object'):
        """A position to hang procedural texture on: 'object' (things that never bend), 'rest' (a
        puppet's rest position, from its 'rest_xy'/'rest_z' UV layers: fixed to the felt as it
        bends), 'uv' (the metric 'UVMap')."""
        if kind == 'object':
            return self.add('ShaderNodeTexCoord').outputs['Object']
        if kind == 'uv':
            return self.add('ShaderNodeUVMap', _uv_map='UVMap').outputs['UV']
        a = self.add('ShaderNodeUVMap', _uv_map='rest_xy')
        b = self.add('ShaderNodeUVMap', _uv_map='rest_z')
        sa = self.add('ShaderNodeSeparateXYZ', Vector=a.outputs['UV'])
        sb = self.add('ShaderNodeSeparateXYZ', Vector=b.outputs['UV'])
        return self.add('ShaderNodeCombineXYZ', X=sa.outputs['X'], Y=sa.outputs['Y'], Z=sb.outputs['X']).outputs['Vector']

    def math(self, op, a, b=None, clamp=False):
        n = self.add('ShaderNodeMath', _operation=op, _use_clamp=clamp)
        for i, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, bpy.types.NodeSocket):
                self.nt.links.new(v, n.inputs[i])
            else:
                n.inputs[i].default_value = v
        return n.outputs[0]

    def mix(self, fac, a, b):
        n = self.add('ShaderNodeMix', _data_type='RGBA')
        for sock, v in ((n.inputs[0], fac), (n.inputs[6], a), (n.inputs[7], b)):
            if isinstance(v, bpy.types.NodeSocket):
                self.nt.links.new(v, sock)
            else:
                sock.default_value = v
        return n.outputs[2]

    def out(self, shader):
        o = self.add('ShaderNodeOutputMaterial')
        self.nt.links.new(shader, o.inputs['Surface'])
        return o


def rgba(c):
    return (c[0], c[1], c[2], 1.0)


def srgb(h):
    """'#rrggbb' to linear RGB."""
    h = h.lstrip('#')
    def lin(v):
        v = v / 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return tuple(lin(int(h[i:i + 2], 16)) for i in (0, 2, 4))


def scaled(c, k):
    return tuple(min(1.0, x * k) for x in c)


def felt(name, color, coords='object', sheen=1.0, mottle=0.16, speck=0.22, flecks=None, bump=0.5, sss=0.15, dimples=True):
    """Needle felt: matted wool, matte, glowing a little where light grazes it (sheen), light
    scattering a short way into its fibres, mottled where it was felted thicker or thinner, flecked
    with lighter and darker fibres of the blend (`flecks`: a colour, else lighter and darker of the
    felt's own), pitted by the needle, and fibrous at the scale of a millimetre."""
    mat = bpy.data.materials.new(name)
    n = Nodes(mat)
    p = n.coords(coords)
    lumps = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=p, Scale=70.0, Detail=4.0, Roughness=0.55)
    big = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=p, Scale=22.0, Detail=2.0, Roughness=0.5)
    dark, light = scaled(color, 1.0 - mottle), scaled(color, 1.0 + mottle * 0.7)
    col = n.mix(lumps.outputs['Fac'], rgba(dark), rgba(light))
    # fibres of the blend: two high-frequency fields, thresholded into short flecks
    f1 = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=n.add('ShaderNodeMapping', Vector=p, Scale=(1.0, 1.0, 3.0), Rotation=(0.4, 0.9, 0.2)).outputs['Vector'], Scale=900.0, Detail=3.0)
    f2 = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=n.add('ShaderNodeMapping', Vector=p, Scale=(3.0, 1.0, 1.0), Rotation=(1.1, 0.3, 0.7)).outputs['Vector'], Scale=900.0, Detail=3.0)
    lightf = n.math('MULTIPLY', n.math('GREATER_THAN', f1.outputs['Fac'], 0.66), speck)
    darkf = n.math('MULTIPLY', n.math('LESS_THAN', f2.outputs['Fac'], 0.34), speck)
    col = n.mix(lightf, col, rgba(flecks[0] if flecks else scaled(color, 1.35)))
    col = n.mix(darkf, col, rgba(flecks[1] if flecks else scaled(color, 0.62)))
    # surface: fine fibrous noise, the needle's pits, the stuffing's lumps
    fine = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=p, Scale=2400.0, Detail=10.0, Roughness=0.72)
    # matted fibres: stretched noise in three directions, the strongest wins (a fibre lying on top)
    fibres = None
    for k, rot in enumerate(((0.3, 1.2, 0.4), (1.4, 0.2, 1.1), (0.7, 0.9, 2.3))):
        mp = n.add('ShaderNodeMapping', Vector=p, Rotation=rot, Scale=(1.0, 1.0, 9.0))
        fb = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=mp.outputs['Vector'], Scale=1500.0, Detail=2.0, Roughness=0.5)
        fibres = fb.outputs['Fac'] if fibres is None else n.math('MAXIMUM', fibres, fb.outputs['Fac'])
    h = n.math('ADD', n.math('MULTIPLY', fine.outputs['Fac'], 0.35), n.math('MULTIPLY', fibres, 0.7))
    h = n.math('ADD', h, n.math('MULTIPLY', n.math('MAXIMUM', f1.outputs['Fac'], f2.outputs['Fac']), 0.2))
    if dimples:
        vor = n.add('ShaderNodeTexVoronoi', _voronoi_dimensions='3D', Vector=p, Scale=520.0, Randomness=1.0)
        pit = n.math('SUBTRACT', 1.0, n.math('MINIMUM', n.math('DIVIDE', vor.outputs['Distance'], 0.22), 1.0))
        h = n.math('SUBTRACT', h, n.math('MULTIPLY', pit, 0.55))
    h = n.math('ADD', h, n.math('ADD', n.math('MULTIPLY', lumps.outputs['Fac'], 0.7), n.math('MULTIPLY', big.outputs['Fac'], 1.2)))
    col = n.mix(n.math('MULTIPLY', n.math('SUBTRACT', big.outputs['Fac'], 0.5), 0.6, clamp=True), col, rgba(scaled(color, 0.86)))
    col = n.mix(n.math('MULTIPLY', n.math('SUBTRACT', fibres, 0.5), 0.5, clamp=True), col, rgba(scaled(color, 1.12)))
    bmp = n.add('ShaderNodeBump', Strength=min(1.0, bump * 2.0), Distance=0.0005, Height=h)
    bsdf = n.add('ShaderNodeBsdfPrincipled', **{'Base Color': col, 'Roughness': 0.96, 'Sheen Weight': sheen,
                                               'Sheen Roughness': 0.38, 'Sheen Tint': rgba(scaled(color, 1.5)),
                                               'Subsurface Weight': sss * 0.5, 'Subsurface Radius': (1.0, 0.55, 0.4),
                                               'Subsurface Scale': 0.0006, 'Specular IOR Level': 0.15,
                                               'Normal': bmp.outputs['Normal']})
    n.out(bsdf.outputs['BSDF'])
    return mat


def fiber(name, color, lift=1.08):
    """Loose wool fibres (the particle hair over felt and knit): a little lighter than the felt they
    stand off, as a fibre catching the light is."""
    mat = bpy.data.materials.new(name)
    n = Nodes(mat)
    info = n.add('ShaderNodeHairInfo')
    col = n.mix(n.math('MULTIPLY', info.outputs['Random'], 0.5), rgba(scaled(color, lift)), rgba(scaled(color, lift * 0.8)))
    # wool is matte: scattered light and a soft sheen, not the glint of human hair
    b = n.add('ShaderNodeBsdfPrincipled', **{'Base Color': col, 'Roughness': 0.85, 'Sheen Weight': 0.35, 'Sheen Roughness': 0.5,
                                            'Sheen Tint': rgba(scaled(color, 1.4)), 'Specular IOR Level': 0.15,
                                            'Subsurface Weight': 0.1, 'Subsurface Radius': (1.0, 0.6, 0.4), 'Subsurface Scale': 0.0002})
    n.out(b.outputs['BSDF'])
    return mat


def knit(name, color, stitch=(0.0019, 0.0016), coords='uv', rib=False, depth=0.55, fuzz_color=None):
    """Hand-knitted wool at miniature scale (chunky: a puppet's jumper knitted on fine needles has
    stitches a couple of millimetres wide). Stockinette: columns of V-shaped stitches on the metric
    'UVMap' (u round, v along); `rib` for a ribbed cuff or collar (raised knit columns between sunk
    purl). Each stitch is a little raised, shadowed at its edges, its yarn fibrous and its colour
    varying from stitch to stitch, as hand-dyed yarn does."""
    mat = bpy.data.materials.new(name)
    n = Nodes(mat)
    p = n.coords(coords)
    sep = n.add('ShaderNodeSeparateXYZ', Vector=p)
    u = n.math('DIVIDE', sep.outputs['X'], stitch[0])
    v = n.math('DIVIDE', sep.outputs['Y'], stitch[1])
    fu = n.math('SUBTRACT', n.math('FRACT', u), 0.5)              # -0.5..0.5 across a column
    au = n.math('ABSOLUTE', fu)
    if rib:
        col_id = n.math('FLOOR', u)
        knitcol = n.math('LESS_THAN', n.math('FRACT', n.math('MULTIPLY', col_id, 0.5)), 0.25)
    legx = n.math('MULTIPLY', n.math('SUBTRACT', au, 0.25), 4.2)  # -1..1 across each leg of the V
    vv = n.math('FRACT', n.math('ADD', v, n.math('MULTIPLY', au, 1.0)))  # the legs slant
    legy = n.math('MULTIPLY', n.math('SUBTRACT', vv, 0.5), 2.0)
    d = n.math('SQRT', n.math('ADD', n.math('MULTIPLY', legx, legx), n.math('MULTIPLY', n.math('MULTIPLY', legy, legy), 0.55)))
    height = n.math('SUBTRACT', 1.0, n.math('POWER', n.math('MINIMUM', d, 1.0), 1.6))
    if rib:
        height = n.math('MULTIPLY', height, n.math('ADD', 0.25, n.math('MULTIPLY', knitcol, 0.75)))
    # the yarn's own twist and fibre
    twist = n.add('ShaderNodeTexWave', _wave_type='BANDS', _bands_direction='DIAGONAL',
                  Vector=n.add('ShaderNodeMapping', Vector=p, Scale=(1 / stitch[0], 1 / stitch[1], 1.0)).outputs['Vector'],
                  Scale=2.2, Distortion=2.0, Detail=2.0)
    fine = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=p, Scale=5200.0, Detail=8.0, Roughness=0.7)
    h2 = n.math('ADD', n.math('MULTIPLY', height, depth), n.math('ADD', n.math('MULTIPLY', twist.outputs['Fac'], 0.08 * depth),
                                                                n.math('MULTIPLY', fine.outputs['Fac'], 0.18)))
    bmp = n.add('ShaderNodeBump', Strength=0.75, Distance=0.00045, Height=h2)
    # colour: the stitch's shadowed edges darker, a stitch-to-stitch variation, slow dye mottling
    cell = n.add('ShaderNodeTexWhiteNoise', _noise_dimensions='2D',
                 Vector=n.add('ShaderNodeCombineXYZ', X=n.math('FLOOR', u), Y=n.math('FLOOR', n.math('ADD', v, n.math('MULTIPLY', au, 1.0)))).outputs['Vector'])
    shade = n.mix(n.math('POWER', height, 0.7), rgba(scaled(color, 0.5)), rgba(color))
    shade = n.mix(n.math('MULTIPLY', cell.outputs['Value'], 0.22), shade, rgba(scaled(color, 1.18)))
    mottle = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=p, Scale=60.0, Detail=3.0)
    col = n.mix(n.math('MULTIPLY', mottle.outputs['Fac'], 0.3), shade, rgba(scaled(color, 0.85)))
    bsdf = n.add('ShaderNodeBsdfPrincipled', **{'Base Color': col, 'Roughness': 0.94, 'Sheen Weight': 1.0,
                                               'Sheen Roughness': 0.42, 'Sheen Tint': rgba(scaled(fuzz_color or color, 1.5)),
                                               'Subsurface Weight': 0.1, 'Subsurface Radius': (1.0, 0.55, 0.4),
                                               'Subsurface Scale': 0.0008, 'Specular IOR Level': 0.16,
                                               'Normal': bmp.outputs['Normal']})
    n.out(bsdf.outputs['BSDF'])
    return mat


def wood(name, color, grain_scale=60.0, rings=6.0, wear=0.25, scratches=True):
    """Worn wood: long grain along X (rings stretched by noise), darker in the grain's lines, a
    duller patina, fine scratches across it and the odd dent."""
    mat = bpy.data.materials.new(name)
    n = Nodes(mat)
    tc = n.add('ShaderNodeTexCoord')
    mp = n.add('ShaderNodeMapping', Vector=tc.outputs['Object'], Scale=(grain_scale * 0.08, grain_scale, grain_scale))
    dist = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=mp.outputs['Vector'], Scale=0.6, Detail=6.0, Roughness=0.55)
    w = n.add('ShaderNodeTexWave', _wave_type='RINGS', _rings_direction='Z', Vector=mp.outputs['Vector'], Scale=rings,
              Distortion=9.0, Detail=4.0, **{'Detail Scale': 1.2})
    grain = n.math('POWER', w.outputs['Fac'], 3.0)
    col = n.mix(grain, rgba(color), rgba(scaled(color, 0.55)))
    patina = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=tc.outputs['Object'], Scale=25.0, Detail=5.0)
    col = n.mix(n.math('MULTIPLY', patina.outputs['Fac'], wear), col, rgba(scaled(color, 1.25)))
    hgt = n.math('MULTIPLY', grain, 0.6)
    if scratches:
        sm = n.add('ShaderNodeMapping', Vector=tc.outputs['Object'], Scale=(900.0, 35.0, 900.0), Rotation=(0, 0, 0.35))
        sc = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=sm.outputs['Vector'], Scale=1.0, Detail=2.0)
        scr = n.math('GREATER_THAN', sc.outputs['Fac'], 0.72)
        hgt = n.math('SUBTRACT', hgt, n.math('MULTIPLY', scr, 0.5))
        col = n.mix(n.math('MULTIPLY', scr, 0.35), col, rgba(scaled(color, 1.35)))
    bmp = n.add('ShaderNodeBump', Strength=0.25, Distance=0.0003, Height=hgt)
    rough = n.math('ADD', 0.5, n.math('MULTIPLY', patina.outputs['Fac'], 0.25))
    bsdf = n.add('ShaderNodeBsdfPrincipled', **{'Base Color': col, 'Roughness': rough, 'Specular IOR Level': 0.4,
                                               'Normal': bmp.outputs['Normal']})
    n.out(bsdf.outputs['BSDF'])
    return mat


def painted(name, color, rough=0.85, texture=0.12, scale=180.0, chips=None):
    """A painted surface (a wall, a chair, a cupboard): matte, a little uneven, with `chips` (a
    colour) showing through where paint has worn off."""
    mat = bpy.data.materials.new(name)
    n = Nodes(mat)
    tc = n.add('ShaderNodeTexCoord')
    nz = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=tc.outputs['Object'], Scale=scale, Detail=8.0, Roughness=0.6)
    col = n.mix(n.math('MULTIPLY', nz.outputs['Fac'], texture * 2), rgba(scaled(color, 0.93)), rgba(scaled(color, 1.07)))
    hgt = nz.outputs['Fac']
    if chips is not None:
        cz = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=tc.outputs['Object'], Scale=scale * 0.35, Detail=6.0, Roughness=0.7)
        ch = n.math('GREATER_THAN', cz.outputs['Fac'], 0.68)
        col = n.mix(ch, col, rgba(chips))
        hgt = n.math('SUBTRACT', hgt, n.math('MULTIPLY', ch, 0.6))
    bmp = n.add('ShaderNodeBump', Strength=0.15, Distance=0.0003, Height=hgt)
    bsdf = n.add('ShaderNodeBsdfPrincipled', **{'Base Color': col, 'Roughness': rough, 'Specular IOR Level': 0.35,
                                               'Normal': bmp.outputs['Normal']})
    n.out(bsdf.outputs['BSDF'])
    return mat


def glazed(name, color, rough=0.18, dirt=0.15):
    """Glazed ceramic or old enamel: a soft gloss, slightly dulled and uneven with age."""
    mat = bpy.data.materials.new(name)
    n = Nodes(mat)
    tc = n.add('ShaderNodeTexCoord')
    nz = n.add('ShaderNodeTexNoise', _noise_dimensions='3D', Vector=tc.outputs['Object'], Scale=90.0, Detail=6.0)
    col = n.mix(n.math('MULTIPLY', nz.outputs['Fac'], dirt), rgba(color), rgba(scaled(color, 0.8)))
    r = n.math('ADD', rough, n.math('MULTIPLY', nz.outputs['Fac'], 0.15))
    bsdf = n.add('ShaderNodeBsdfPrincipled', **{'Base Color': col, 'Roughness': r, 'Coat Weight': 0.3, 'Coat Roughness': 0.12})
    n.out(bsdf.outputs['BSDF'])
    return mat


def thread(name, color, coords='uv', sheen=0.6, rough=0.75):
    """Sewing thread, embroidery floss or a knotted eye: twisted strands (a diagonal band along the
    thread), matte with a little sheen."""
    mat = bpy.data.materials.new(name)
    n = Nodes(mat)
    p = n.coords(coords)
    tw = n.add('ShaderNodeTexWave', _wave_type='BANDS', _bands_direction='DIAGONAL', Vector=p, Scale=900.0, Distortion=1.0, Detail=1.0)
    col = n.mix(n.math('MULTIPLY', tw.outputs['Fac'], 0.35), rgba(color), rgba(scaled(color, 0.6)))
    bmp = n.add('ShaderNodeBump', Strength=0.5, Distance=0.0001, Height=tw.outputs['Fac'])
    bsdf = n.add('ShaderNodeBsdfPrincipled', **{'Base Color': col, 'Roughness': rough, 'Sheen Weight': sheen,
                                               'Sheen Roughness': 0.4, 'Specular IOR Level': 0.3, 'Normal': bmp.outputs['Normal']})
    n.out(bsdf.outputs['BSDF'])
    return mat


def checked_cloth(name, a, b, squares=90.0):
    """A woven dishcloth: a faded check, the weave's grain in the bump."""
    mat = bpy.data.materials.new(name)
    n = Nodes(mat)
    tc = n.add('ShaderNodeTexCoord')
    ch = n.add('ShaderNodeTexChecker', Vector=tc.outputs['Object'], Scale=squares, Color1=rgba(a), Color2=rgba(b))
    wv = n.add('ShaderNodeTexWave', _wave_type='BANDS', _bands_direction='X', Vector=tc.outputs['Object'], Scale=1400.0)
    wv2 = n.add('ShaderNodeTexWave', _wave_type='BANDS', _bands_direction='Y', Vector=tc.outputs['Object'], Scale=1400.0)
    hgt = n.math('MULTIPLY', wv.outputs['Fac'], wv2.outputs['Fac'])
    bmp = n.add('ShaderNodeBump', Strength=0.4, Distance=0.0002, Height=hgt)
    bsdf = n.add('ShaderNodeBsdfPrincipled', **{'Base Color': ch.outputs['Color'], 'Roughness': 0.9, 'Sheen Weight': 0.5,
                                               'Normal': bmp.outputs['Normal']})
    n.out(bsdf.outputs['BSDF'])
    return mat


def emission(name, color, strength):
    mat = bpy.data.materials.new(name)
    n = Nodes(mat)
    e = n.add('ShaderNodeEmission', Color=rgba(color), Strength=strength)
    n.out(e.outputs[0])
    return mat


def night_glass(name, color, strength=0.6):
    """A window at night: the dark sky outside, faintly lit."""
    mat = bpy.data.materials.new(name)
    n = Nodes(mat)
    tc = n.add('ShaderNodeTexCoord')
    sep = n.add('ShaderNodeSeparateXYZ', Vector=tc.outputs['Generated'])
    grad = n.mix(sep.outputs['Z'], rgba(scaled(color, 0.5)), rgba(color))
    e = n.add('ShaderNodeEmission', Color=grad, Strength=strength)
    n.out(e.outputs[0])
    return mat
