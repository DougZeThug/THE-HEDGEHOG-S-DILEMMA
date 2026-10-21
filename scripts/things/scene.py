"""The reference for "Things I Should Have Said" (docs/things.md): an apartment's front door seen
from inside, two people, and a camera that never moves. Blender only measures it for the drawing:
for each pose, the contours (Grease Pencil Line Art, hidden lines removed) of each thing, a tonal
render (how the light falls), which thing each pixel belongs to, and where the long bones land
on the paper. The drawing is made from those by draw.py, on paper.py's sheet.

    blender -b --factory-startup --python scripts/things/scene.py -- --pose NAME[,NAME] --out DIR [--tone-scale 0.5]
        [--poses-json FILE] [--resume 1]

The people are MakeHuman's (CC0), built by the MPFB add-on (installed in Blender's user
extensions, its asset pack in its data folder: docs/things.md). Poses are in poses.py. Units are
metres; the door wall is y = 0, the camera stands inside at y = -6 looking at it; x runs to the
right, z up.
"""
import json
import math
import os
import sys

import bpy
from mathutils import Euler, Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import poses  # noqa: E402

W, H = 1280, 1440                   # the open matte, as "Almost"'s (the room's crops are cut from it)
# The camera stands far back with a long lens, level, so the whole doorway (its lintel and its
# threshold) is inside the band a wide screen shows (rows 360-1080): the last image is a doorway
# on every screen. (The creative director, Proof A.)
CAM = dict(loc=(0.18, -6.5, 1.0), look=(0.18, 0.0, 1.0), lens=28.0)     # (6 m left her toes on the band's edge: the cinematic director)
DOOR = dict(x0=0.30, x1=1.20, h=2.06, t=0.16)     # the opening; the wall's thickness
EXPOSURE = -1.3                     # the tonal render's: the lit walls just under white, the corridor at it

# ---------------------------------------------------------------- figures
# Two people from MakeHuman's CC0 assets, through the MPFB add-on: real anatomy, hands, clothes and
# hair, on MakeHuman's default skeleton. (The first figures, skin-modifier bodies, read as
# mannequins: the reviewers, Proof A.) `macro`: MakeHuman's phenotype (age 0.5 is 25, 1.0 is 90);
# `value`: how light each thing is in the tonal render (a drawing's values, not the textures').
MPFB_DATA = '/root/.config/blender/5.2/extensions/.user/user_default/mpfb/data'
CAUCASIAN = {'asian': 0.0, 'caucasian': 1.0, 'african': 0.0}

YOUNG = dict(
    macro=dict(gender=1.0, age=0.5, muscle=0.5, weight=0.42, proportions=0.6, height=0.55, cupsize=0.5, firmness=0.5, race=CAUCASIAN),
    clothes=['male_casualsuit05', 'shoes04'], hair='short02', hair_lines=False,
    # a dark jacket over a shirt, jeans, dark shoes, dark hair
    value={'body': 0.4, 'male_casualsuit05': 0.07, 'shoes04': 0.04, 'short02': 0.04, 'low-poly': 0.3},
)
# His mother, at home: grey hair cut short, a loose top and trousers, in her stockinged feet (he
# has his shoes on, she has not: who leaves and who stays). (The creative director, Proof A2: in a
# skirt suit and boots, with a dark ponytail, she read as a colleague or a girlfriend.)
OLDER = dict(
    macro=dict(gender=0.0, age=0.84, muscle=0.3, weight=0.66, proportions=0.4, height=0.36, cupsize=0.4, firmness=0.25, race=CAUCASIAN),
    clothes=['female_casualsuit01'], hair='short04', hair_lines=False,
    value={'body': 0.5, 'female_casualsuit01': 0.26, 'short04': 0.3, 'low-poly': 0.3},
)

# Landmarks for the drawing (draw.py): a few long bones, named as a draughtsman thinks of them,
# each from one bone's head to another's tail.
LANDMARKS = {'pelvis': ('spine05', 'spine05'), 'spine': ('spine04', 'spine03'), 'chest': ('spine02', 'spine01'), 'neck': ('neck01', 'neck03'),
             'head': ('head', 'head')}
for _s in ('L', 'R'):
    LANDMARKS.update({f'upper_arm.{_s}': (f'upperarm01.{_s}', f'upperarm02.{_s}'), f'forearm.{_s}': (f'lowerarm01.{_s}', f'lowerarm02.{_s}'),
                      f'hand.{_s}': (f'wrist.{_s}', f'finger3-1.{_s}'), f'thigh.{_s}': (f'upperleg01.{_s}', f'upperleg02.{_s}'),
                      f'shin.{_s}': (f'lowerleg01.{_s}', f'lowerleg02.{_s}'), f'foot.{_s}': (f'foot.{_s}', f'foot.{_s}'),
                      f'clavicle.{_s}': (f'clavicle.{_s}', f'shoulder01.{_s}')})


def coll(name):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(c)
    return c


def link(ob, c):
    for u in list(ob.users_collection):
        u.objects.unlink(ob)
    c.objects.link(ob)


def material(name, rgb, rough=0.8):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Roughness'].default_value = rough
    return m


def mpfb():
    import addon_utils
    addon_utils.enable('bl_ext.user_default.mpfb', default_set=True)
    from bl_ext.user_default.mpfb.services.humanservice import HumanService
    return HumanService


def tone_material(name, value):
    """A plain surface, `value` light: the tonal render wants the light on forms, not cloth prints."""
    return material(f'tone {name}', (value,) * 3, 0.75)


def human(name, spec, index):
    """One person: the body, rigged on MakeHuman's default skeleton, clothes, hair, eyes and brows,
    every piece in collection `name`, object index `index`. Returns the armature."""
    hs = mpfb()
    body = hs.create_human(macro_detail_dict=spec['macro'], scale=0.1)
    body.name = name
    rig = hs.add_builtin_rig(body, 'default', import_weights=True)
    rig.name = f'{name} rig'
    for c in spec['clothes']:
        hs.add_mhclo_asset(f'{MPFB_DATA}/clothes/{c}/{c}.mhclo', body, asset_type='Clothes', subdiv_levels=1)
    hs.add_mhclo_asset(f'{MPFB_DATA}/hair/{spec["hair"]}/{spec["hair"]}.mhclo', body, asset_type='hair', subdiv_levels=1)
    hs.add_mhclo_asset(f'{MPFB_DATA}/eyes/low-poly/low-poly.mhclo', body, asset_type='eyes', subdiv_levels=1)
    sub = body.modifiers.new('sub', 'SUBSURF')
    sub.levels = sub.render_levels = 1
    c = coll(name)
    link(rig, c)
    for ob in [body] + [o for o in rig.children if o is not body]:
        link(ob, c)
        ob.pass_index = index
        if ob.type == 'MESH':
            if ob.name.split('.', 1)[-1].split('.')[0] == spec['hair']:
                ob.pass_index = index + 2           # the hair, its own region (drawn as a mass)
            key = 'body' if ob is body else ob.name.split('.', 1)[-1].split('.')[0]
            ob.data.materials.clear()
            ob.data.materials.append(tone_material(f'{name} {key}', spec['value'].get(key, 0.3)))
            # the eyes are in the tone, not the lines (traced, they drew as goggles); dark hair is
            # a mass with no hairline
            if key == 'low-poly' or (key == spec['hair'] and not spec.get('hair_lines', True)):
                ob.lineart.usage = 'OCCLUSION_ONLY'
            elif key == spec['hair']:
                ob.lineart.use_crease_override = True       # its outline, not its strands
                ob.lineart.crease_threshold = 0.0
    # the arms reach by IK (forearm and upper arm, each two bones; the twist bones kept straight):
    # a target for each hand and a pole the elbow points toward
    for s in ('L', 'R'):
        for b in (f'upperarm02.{s}', f'lowerarm02.{s}'):
            pb = rig.pose.bones[b]
            pb.lock_ik_x = pb.lock_ik_y = pb.lock_ik_z = True
        for kind in ('target', 'pole'):
            e = bpy.data.objects.new(f'{name} {kind}.{s}', None)
            bpy.context.scene.collection.objects.link(e)
            e.parent = rig
        ik = rig.pose.bones[f'lowerarm02.{s}'].constraints.new('IK')
        ik.target = bpy.data.objects[f'{name} target.{s}']
        ik.pole_target = bpy.data.objects[f'{name} pole.{s}']
        ik.pole_angle = 0.0
        ik.chain_count = 4
        ik.influence = 0.0
    return rig


# ---------------------------------------------------------------- the place
def box(name, x0, x1, y0, y1, z0, z1, mat, c, index):
    bpy.ops.mesh.primitive_cube_add(size=1, location=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = (x1 - x0, y1 - y0, z1 - z0)
    bpy.ops.object.transform_apply(scale=True)
    ob.data.materials.append(mat)
    ob.pass_index = index
    link(ob, c)
    return ob


def place():
    arch = coll('arch')
    wall = material('wall', (0.8, 0.79, 0.77))
    wood = material('wood', (0.3, 0.25, 0.2), 0.6)
    trim = material('trim', (0.62, 0.6, 0.57), 0.6)     # the painted casing and skirting
    dark = material('dark', (0.25, 0.24, 0.23))
    d = DOOR
    # the door wall, one piece with its opening cut (in pieces, their edges drew as two lines
    # running up from the lintel)
    w = box('wall', -3.0, 3.0, 0, d['t'], 0, 5.0, wall, arch, 1)
    cut = box('cut', d['x0'], d['x1'], -0.1, d['t'] + 0.1, -0.1, d['h'], wall, arch, 1)
    bo = w.modifiers.new('opening', 'BOOLEAN')
    bo.operation = 'DIFFERENCE'
    bo.object = cut
    bpy.context.view_layer.objects.active = w
    bpy.ops.object.modifier_apply(modifier='opening')
    bpy.data.objects.remove(cut)
    # the casing round the opening, inside
    cw = 0.07
    box('casing left', d['x0'] - cw, d['x0'], -0.018, 0, 0, d['h'], trim, arch, 2)
    box('casing right', d['x1'], d['x1'] + cw, -0.018, 0, 0, d['h'], trim, arch, 2)
    box('casing top', d['x0'] - cw, d['x1'] + cw, -0.018, 0, d['h'], d['h'] + cw, trim, arch, 2)
    box('skirting', -3.0, 3.0, -0.012, 0, 0, 0.09, trim, arch, 3)     # (drawn as the floor is, along it)
    # the floor, the ceiling's edge
    box('floor', -3.0, 3.0, -5.0, 3.0, -0.02, 0, material('floor', (0.32, 0.28, 0.24), 0.5), arch, 3)
    # outside: the corridor's far wall, its floor, a light on the wall
    box('corridor wall', -3.0, 4.0, 1.55, 1.65, 0, 5.0, material('corridor', (0.75, 0.75, 0.74)), arch, 4)
    box('corridor rail', 0.9, 2.6, 1.48, 1.55, 0.92, 0.96, dark, arch, 4)
    # nothing else inside: the white wall (a table drawn in line read as a sawhorse)
    things = coll('things')
    # the door, hinged at the opening's right jamb, opening inward
    door = coll('door')
    leaf = box('door', d['x0'] + 0.01, d['x1'] - 0.01, 0.0, 0.045, 0.0, d['h'] - 0.01, wood, door, 7)
    leaf.visible_shadow = False     # (its shadow on the wall beside it drew as a slab of charcoal)
    hinge = bpy.data.objects.new('hinge', None)
    hinge.location = (d['x1'] - 0.01, 0.0, 0)
    bpy.context.scene.collection.objects.link(hinge)
    link(hinge, door)
    bpy.context.view_layer.update()      # (the hinge's matrix, before it is inverted: stale, it threw the leaf 1.19 m right)
    leaf.parent = hinge
    leaf.matrix_parent_inverse = hinge.matrix_world.inverted()
    bpy.ops.mesh.primitive_cylinder_add(radius=0.022, depth=0.06, location=(d['x0'] + 0.08, -0.03, 1.0), rotation=(math.radians(90), 0, 0))
    knob = bpy.context.active_object
    knob.name = 'knob'
    knob.data.materials.append(dark)
    knob.pass_index = 7
    link(knob, door)
    bpy.context.view_layer.update()
    knob.parent = leaf
    knob.matrix_parent_inverse = leaf.matrix_world.inverted()
    for ob in things.objects:
        ob.visible_shadow = False
    return hinge


def lights():
    """The hall inside is lit softly from the left, by a lamp; the corridor outside is bright (a
    stairwell's light), so whoever stands in the doorway is a dark shape against it. (The creative
    director, Proof A: "he is held only by his outline".)"""
    sc = bpy.context.scene
    la = bpy.data.lights.new('hall', 'AREA')
    la.energy = 260
    la.size = 1.2
    la.color = (1.0, 0.92, 0.82)
    o = bpy.data.objects.new('hall', la)
    o.location = (-2.2, -2.4, 2.55)
    o.rotation_euler = (math.radians(40), math.radians(-35), 0)
    sc.collection.objects.link(o)
    lb = bpy.data.lights.new('corridor', 'AREA')
    lb.energy = 700
    lb.size = 1.6
    lb.color = (0.95, 0.97, 1.0)
    o2 = bpy.data.objects.new('corridor', lb)
    o2.location = (0.9, 0.9, 2.6)
    o2.rotation_euler = (0, 0, 0)
    sc.collection.objects.link(o2)
    # and the room's even daylight, broad and from behind the camera: no corner of it falls into
    # shadow (a falloff drew as charcoal massed in the corners)
    lc = bpy.data.lights.new('fill', 'AREA')
    lc.energy = 550
    lc.size = 5.0
    o3 = bpy.data.objects.new('fill', lc)
    o3.location = (0.2, -5.0, 2.6)
    o3.rotation_euler = (math.radians(75), 0, 0)
    sc.collection.objects.link(o3)
    w = sc.world or bpy.data.worlds.new('w')
    sc.world = w
    w.use_nodes = True
    # a room's own bounce: shadows soft, the walls near the paper
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (1.0, 0.98, 0.95, 1)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.45


def camera():
    sc = bpy.context.scene
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    cam.location = CAM['loc']
    d = Vector(CAM['look']) - Vector(CAM['loc'])
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = CAM['lens']
    cam.data.sensor_fit = 'VERTICAL'
    cam.data.sensor_height = 24.0
    sc.camera = cam
    r = sc.render
    r.resolution_x, r.resolution_y, r.resolution_percentage = W, H, 100
    return cam


def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    camera()
    hinge = place()
    lights()
    figs = {'young': human('young', YOUNG, 10), 'older': human('older', OLDER, 11)}
    bag()
    return figs, hinge


def bag():
    """A plastic carrier bag, heavy with the food she packed for him: its knotted handles at the
    origin (his fist), a square-bottomed body hanging below, a container's corner pressing through.
    Placed by pose()."""
    import bmesh
    from mathutils import noise
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=5, use_grid_fill=True)
    for v in bm.verts:
        x, y, z = v.co                   # -0.5 .. 0.5
        u = z + 0.5                      # 0 at the bottom, 1 at the top
        # full and square below, gathered to the knot above; the box inside pushes one corner out
        k = 1.0 - 0.82 * max(0.0, u - 0.55) / 0.45
        bulge = 1 + 0.08 * noise.noise(Vector((x, y, z)) * 3.1)
        corner = 0.018 if (x > 0.3 and y < -0.3 and 0.15 < u < 0.6) else 0.0
        v.co = Vector((x * 0.25 * k * bulge + corner, y * 0.14 * k * bulge - corner, -0.07 - (1 - u) * 0.27))
    me = bpy.data.meshes.new('bag')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('bag', me)
    bpy.context.scene.collection.objects.link(ob)
    # the knot of the handles
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.022, location=(0, 0, -0.045))
    knot = bpy.context.active_object
    knot.scale = (1.3, 0.8, 1.6)
    bpy.ops.object.transform_apply(scale=True)
    bpy.ops.object.select_all(action='DESELECT')
    knot.select_set(True)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.join()
    ob.data.materials.append(tone_material('bag', 0.4))
    sd = ob.modifiers.new('sub', 'SUBSURF')
    sd.levels = sd.render_levels = 1
    ob.pass_index = 10
    link(ob, coll('young'))
    return ob


# ---------------------------------------------------------------- posing
def turned(rig, bone, r):
    """A rotation given about the figure's own axes (degrees: x its left, y its back, z up),
    applied at the bone (and carried by its parents' turns), as the bone's pose rotation."""
    m = rig.data.bones[bone].matrix_local.to_3x3()
    q = Euler(tuple(math.radians(a) for a in r), 'XYZ').to_matrix()
    return (m.inverted() @ q @ m).to_quaternion()


def pose(figs, hinge, p):
    """Apply a pose (poses.py): each figure's place, facing and bone rotations, its reaches; the
    door's angle."""
    for name, rig in figs.items():
        f = p[name]
        rig.location = (f['at'][0], f['at'][1], 0)
        rig.rotation_euler = (0, 0, math.radians(f['face']))
        for b in rig.pose.bones:
            b.rotation_mode = 'QUATERNION'
            b.rotation_quaternion = (1, 0, 0, 0)
            b.location = (0, 0, 0)
        rots = dict(poses.REST)
        for bn, r in f.get('bones', {}).items():
            base = rots.get(bn, (0, 0, 0))
            rots[bn] = tuple(a + b for a, b in zip(base, r))
        for bn, r in rots.items():
            rig.pose.bones[bn].rotation_quaternion = turned(rig, bn, r)
        for bn, r in {**poses.RELAXED, **f.get('local', {})}.items():
            rig.pose.bones[bn].rotation_quaternion = Euler(tuple(math.radians(a) for a in r), 'XYZ').to_quaternion()
        for o in rig.children:
            o.hide_render = not f.get('shown', True)
    hinge.rotation_euler = (0, 0, math.radians(p.get('door', 0)))
    bpy.context.view_layer.update()
    # the reaches, once every body is placed (a hand may reach for the other one's collar):
    # 'hand' is a point in the figure's own space (x its left, -y its front, z up from the floor),
    # ('world', point), (who, bone, fraction, lift): that far from this figure's shoulder toward
    # the other's bone, ('near', who, bone, distance, lift): just that short of it, or
    # ('mix', hand, hand, t); `weight` blends the reach with the arm as posed
    for name, rig in figs.items():
        f = p[name]
        for s in ('L', 'R'):
            ik = rig.pose.bones[f'lowerarm02.{s}'].constraints['IK']
            reach = f.get('reach', {}).get(s)
            ik.influence = reach.get('weight', 1.0) if reach else 0.0
            if not reach:
                continue

            def where(h):
                if h[0] == 'mix':                      # an in-between (poses.blend)
                    return where(h[1]).lerp(where(h[2]), h[3])
                if h[0] == 'world':
                    return rig.matrix_world.inverted() @ Vector(h[1])
                if h[0] == 'near':                     # (near, who, bone, distance, lift): just short of it
                    _, who, bone, dist, lift = h
                    other = figs[who]
                    goal = other.matrix_world @ other.pose.bones[bone].head
                    sh = rig.matrix_world @ rig.pose.bones[f'upperarm01.{s}'].head
                    return rig.matrix_world.inverted() @ (goal - (goal - sh).normalized() * dist + Vector((0, 0, lift)))
                if isinstance(h[0], str):
                    who, bone, frac, lift = h
                    other = figs[who]
                    goal = other.matrix_world @ other.pose.bones[bone].head
                    sh = rig.matrix_world @ rig.pose.bones[f'upperarm01.{s}'].head
                    return rig.matrix_world.inverted() @ (sh.lerp(goal, frac) + Vector((0, 0, lift)))
                return Vector(h)
            bpy.data.objects[f'{name} target.{s}'].location = where(reach['hand'])
            bpy.data.objects[f'{name} pole.{s}'].location = poses.elbow_of(reach, s)
    bpy.context.view_layer.update()
    # the bag she packed for him hangs from his hand (or is gone with him)
    bag = bpy.data.objects.get('bag')
    f = p['young']
    if bag:
        side = f.get('bag')
        bag.hide_render = not (side and f.get('shown', True))
        if side:
            rig = figs['young']
            pb = rig.pose.bones[f'wrist.{side}']
            grip = rig.matrix_world @ pb.tail
            bag.location = grip + Vector((0, 0, -0.02))
            bag.rotation_euler = (0, 0, math.radians(f['face']))
    bpy.context.view_layer.update()


def project(cam, co):
    from bpy_extras.object_utils import world_to_camera_view
    v = world_to_camera_view(bpy.context.scene, cam, Vector(co))
    return [v.x * W, (1 - v.y) * H, v.z]


def lineart(groups):
    """One Line Art object per group (its contours, every other thing occluding)."""
    out = {}
    for g in groups:
        gp = bpy.data.grease_pencils_v3.new(f'la {g}') if hasattr(bpy.data, 'grease_pencils_v3') else bpy.data.grease_pencils.new(f'la {g}')
        ob = bpy.data.objects.new(f'la {g}', gp)
        bpy.context.scene.collection.objects.link(ob)
        layer = gp.layers.new('lines')
        mat = bpy.data.materials.new(f'la {g}')
        bpy.data.materials.create_gpencil_data(mat)
        gp.materials.append(mat)
        m = ob.modifiers.new('lineart', 'LINEART')
        m.source_type = 'COLLECTION'
        m.source_collection = bpy.data.collections[g]
        m.target_layer = layer.name
        m.target_material = mat
        m.use_crease = True
        m.crease_threshold = math.radians(140)
        m.use_intersection = False
        m.use_material = False
        m.use_edge_mark = False
        m.use_contour = True
        m.chaining_image_threshold = 0.004
        out[g] = ob
    return out


def strokes_of(ob, cam):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    lines = []
    for layer in ev.data.layers:
        fr = layer.current_frame()
        if fr is None:
            continue
        for s in fr.drawing.strokes:
            pts = [project(cam, ev.matrix_world @ p.position) for p in s.points]
            if len(pts) >= 2:
                lines.append([[round(a, 2), round(b, 2), round(z, 3)] for a, b, z in pts])
    return lines


def landmarks(figs, cam):
    """Where each long bone (LANDMARKS) lies on the paper: [head x, y, depth, tail x, y, depth]."""
    out = {}
    for name, rig in figs.items():
        pb = rig.pose.bones
        out[name] = {k: project(cam, rig.matrix_world @ pb[a].head) + project(cam, rig.matrix_world @ pb[b].tail) for k, (a, b) in LANDMARKS.items()}
    return out


# the few places a face is drawn at this size (the technical artist, Proof A2): each eye, the
# bridge of the nose and its tip, the mouth's corners; (bone, end) with end 1 its tail
FACE = {'eye.L': ('eye.L', 1), 'eye.R': ('eye.R', 1), 'nose': ('special03', 1), 'mouth.L': ('oris07.L', 1), 'mouth.R': ('oris07.R', 1)}


def face_points(figs, cam):
    """Each face's points on the paper, each marked seen or hidden (a ray from the camera: the
    head turned away hides them)."""
    sc = bpy.context.scene
    dg = bpy.context.evaluated_depsgraph_get()
    origin = cam.matrix_world.translation
    out = {}
    for who, rig in figs.items():
        d = {}
        pts = {k: rig.matrix_world @ (rig.pose.bones[b].tail if end else rig.pose.bones[b].head) for k, (b, end) in FACE.items()}
        mid = (pts['eye.L'] + pts['eye.R']) / 2
        pts['bridge'] = mid + (pts['nose'] - mid) * 0.2
        for k, w in pts.items():
            v = w - origin
            dist = v.length
            hit, loc, *_ = sc.ray_cast(dg, origin, v.normalized(), distance=dist + 0.05)
            seen = (not hit) or (loc - origin).length >= dist - 0.015
            d[k] = [round(c, 2) for c in project(cam, w)] + [1 if seen else 0]
        out[who] = d
    return out


def render_tone(path, scale):
    """The light on the scene (PNG, 16 bit) and which thing each pixel is (PNG: object index x 8)."""
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 24
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 3
    sc.render.resolution_percentage = int(scale * 100)
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.exposure = EXPOSURE
    im = sc.render.image_settings
    im.file_format = 'PNG'
    im.color_mode = 'BW'
    im.color_depth = '16'
    sc.render.filepath = path + '-tone.png'
    bpy.ops.render.render(write_still=True)
    # the ids: every surface glowing its own object index, one sample, no filtering
    m = bpy.data.materials.get('ids') or bpy.data.materials.new('ids')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    info = nt.nodes.new('ShaderNodeObjectInfo')
    mul = nt.nodes.new('ShaderNodeMath')
    mul.operation = 'MULTIPLY'
    mul.inputs[1].default_value = 8 / 255
    em = nt.nodes.new('ShaderNodeEmission')
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(info.outputs['Object Index'], mul.inputs[0])
    nt.links.new(mul.outputs[0], em.inputs['Strength'])
    nt.links.new(em.outputs[0], out.inputs[0])
    vl = sc.view_layers[0]
    vl.material_override = m
    sc.view_settings.exposure = 0.0
    sc.cycles.samples = 1
    sc.cycles.use_denoising = False
    sc.render.filter_size = 0.01
    sc.view_settings.view_transform = 'Raw' if 'Raw' in [i.identifier for i in sc.view_settings.bl_rna.properties['view_transform'].enum_items] else 'Standard'
    im.color_depth = '8'
    sc.render.filepath = path + '-ids.png'
    bpy.ops.render.render(write_still=True)
    vl.material_override = None
    sc.render.filter_size = 1.5
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.exposure = 0.0
    sc.render.resolution_percentage = 100


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    opts = dict(zip(argv[::2], argv[1::2]))
    out = opts.get('--out', '/tmp/things')
    os.makedirs(out, exist_ok=True)
    table = dict(poses.POSES)
    if opts.get('--poses-json'):
        # poses made elsewhere (a performance's in-betweens: poses.blend), by name
        with open(opts['--poses-json']) as fh:
            table.update(json.load(fh))
    names = opts['--pose'].split(',') if opts.get('--pose') else list(json.load(open(opts['--poses-json'])))
    scale = float(opts.get('--tone-scale', 0.5))
    figs, hinge = setup()
    cam = bpy.context.scene.camera
    las = lineart(['arch', 'things', 'door', 'young', 'older'])
    for n in names:
        if opts.get('--resume') and os.path.exists(os.path.join(out, f'{n}-ids.png')):
            continue
        p = table[n]
        pose(figs, hinge, p)
        for g, ob in las.items():
            ob.hide_viewport = False
        bpy.context.view_layer.update()
        data = {'pose': n, 'size': [W, H], 'strokes': {g: strokes_of(ob, cam) for g, ob in las.items()}, 'landmarks': landmarks(figs, cam), 'face': face_points(figs, cam),
                'knob': project(cam, bpy.data.objects['knob'].matrix_world.translation)}
        for f in ('young', 'older'):
            if not p[f].get('shown', True):
                data['strokes'][f] = []
        with open(os.path.join(out, f'{n}.json'), 'w') as fh:
            json.dump(data, fh)
        for ob in las.values():
            ob.hide_render = True
        if not opts.get('--no-tone'):
            render_tone(os.path.join(out, n), scale)
        print('POSE', n, {g: len(v) for g, v in data['strokes'].items()}, flush=True)


if __name__ == '__main__':
    main()
