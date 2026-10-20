"""The performance of "Almost": the figures' poses, and how each pose is put on the puppets.

A pose says, for each figure:
- **the spine:** how much each joint turns (`nod` forward, `lean` toward the lens's right, `turn`
  toward the lens's right, in degrees, about the joint);
- **the shoulders:** `up` and `fwd`;
- **each arm:** where its wrist is in the room, which way the hand points, which way its back faces,
  and where the elbow goes (`on: 'table'` lays the forearm on the wood);
- **the fingers:** how far they curl;
- **B's cuff:** its shape keys.

The poses are the animator's key drawings. The exposure sheet (`xsheet.py`) says which pose each
frame shows.
"""
import math

import bpy
from mathutils import Euler, Matrix, Vector

import kitchen
import puppets

TABLE_Z = kitchen.TABLE_TOP


def _rot(fig, bone, nod=0.0, lean=0.0, turn=0.0):
    """Turn `bone` about its head by angles given in the figure's axes (as if its parent were at
    rest): nod +x (forward), lean +y (toward the lens's right), turn +z (toward the lens's right)."""
    pb = fig.arm.pose.bones[bone]
    q = Euler((math.radians(nod), math.radians(lean), math.radians(turn)), 'XYZ').to_matrix()
    M = pb.bone.matrix_local.to_3x3()
    pb.rotation_quaternion = (M.inverted() @ q @ M).to_quaternion()


def _shoulder(fig, side, up=0.0, fwd=0.0):
    m = 1 if side == 'L' else -1
    _rot(fig, f'shoulder.{side}', lean=-up * m, turn=-fwd * m)


def world(fig, local):
    return fig.arm.matrix_world @ Vector(local)


def posed_head(fig, bone):
    return fig.arm.matrix_world @ fig.arm.pose.bones[bone].head


def posed_tail(fig, bone):
    return fig.arm.matrix_world @ fig.arm.pose.bones[bone].tail


def _frame(fingers, back):
    y = Vector(fingers).normalized()
    z = Vector(back)
    z = (z - y * z.dot(y)).normalized()
    x = y.cross(z)
    return Matrix((x, y, z)).transposed()


def _dip(S, E, W, radii):
    """How far the arm goes into the table (m; 0 if it is clear). Along the upper arm and the
    forearm, each point over the wood must stay its sleeve's radius above it. Felt may press in
    by SQUASH, as a forearm lying on the table does."""
    r_sh, r_el, r_wr = radii
    worst = 0.0
    for P0, P1, r0, r1 in ((S, E, r_sh, r_el), (E, W, r_el, r_wr)):
        for k in range(1, 9):
            t = k / 8
            P = P0.lerp(P1, t)
            r = r0 + (r1 - r0) * t
            if P.y < kitchen.TABLE_Y[1] + r * 0.6 and kitchen.TABLE_X[0] < P.x < kitchen.TABLE_X[1]:
                # in the top's slab: the shorter way out, up over it or down under it
                up = TABLE_Z + r - SQUASH - P.z
                down = P.z + r - (TABLE_Z - kitchen.TOP_T)
                if up > 0 and down > 0:
                    worst = max(worst, min(up, down))
    return worst


SQUASH = 0.0007
ELBOW_BUNCH = 0.0011


def elbow_for(S, W, upper, fore, mode, side_sign, body, radii, tuck=None):
    """Where the elbow goes for a shoulder S and wrist W. It lies on the circle the two bone lengths
    allow, at the point that best fits `mode`:
    - 'table': the forearm lying on the wood;
    - 'down': hanging;
    - 'air': the forearm held up, the elbow as low as it can be, behind the hand;
    - a Vector: the direction the elbow should point.
    Whatever the mode, the arm never goes into the table (`_dip`). `tuck` is how far from the
    body's middle the elbow would rather be (m)."""
    d = W - S
    L = d.length
    L = min(L, upper + fore - 1e-5)
    a = (upper * upper - fore * fore + L * L) / (2 * L)
    h = math.sqrt(max(upper * upper - a * a, 0.0))
    axis = d.normalized()
    C = S + axis * a
    u = axis.cross(Vector((0, 0, 1)))
    if u.length < 1e-6:
        u = axis.cross(Vector((1, 0, 0)))
    u.normalize()
    v = axis.cross(u).normalized()
    best, bestc = None, None
    for k in range(720):
        phi = 2 * math.pi * k / 720
        E = C + (u * math.cos(phi) + v * math.sin(phi)) * h
        out = (E.x - body.x) * side_sign          # the elbow away from the body's middle
        if mode == 'table':
            # (the elbow's own sleeve on the wood, pressed in as the wrist's is)
            c = (E.z - (TABLE_Z + radii[1] + 0.0001)) ** 2 * 4 + max(0.0, 0.006 - out) ** 2 * 8 + max(0.0, E.z - S.z) ** 2
        elif mode == 'down':
            c = E.z * 0.02 + max(0.0, 0.007 - out) ** 2 * 8
        elif mode == 'air':
            # a forearm held up off the table: the elbow low and out a little, as a puppet's wire
            # arm settles when it is bent and let go; behind the hand, never ahead of it
            c = E.z * 0.05 + max(0.0, 0.006 - out) ** 2 * 8 + max(0.0, W.y + 0.004 - E.y) ** 2 * 200
        else:
            c = -(E - C).normalized().dot((Vector(mode) - C).normalized())
        if tuck is not None:
            c += (out - tuck) ** 2 * 20
        # (a constraint, not a preference: an in-between's elbow, aimed between two elbows, traded
        # 3 mm of table for a few degrees of aim at 4000)
        c += _dip(S, E, W, radii) ** 2 * 4e5
        if bestc is None or c < bestc:
            best, bestc = E, c
    return best, C


def place_arm(fig, side, wrist, fingers, back, on='table', reach=None, tuck=None):
    """Put the wrist target at `wrist` (world) with the hand pointing along `fingers`, its back
    toward `back`; the elbow as `on` says."""
    wr_t, el_t = fig.targets[side]
    S = posed_head(fig, f'upper_arm.{side}')
    W = Vector(wrist)
    m = 1 if side == 'L' else -1
    body = posed_head(fig, 'chest')
    sl = fig.spec['sleeve']
    # (the sleeve is fuller at a bent elbow than its radius: its bunched folds, about a millimetre)
    E, C = elbow_for(S, W, fig.spec['upper'], fig.spec['fore'], on, m, body, (sl[0], sl[2] + ELBOW_BUNCH, sl[4]), tuck)
    wr_t.location = W
    wr_t.rotation_euler = _frame(fingers, back).to_euler()
    el_t.location = E + (E - C).normalized() * 0.03
    return E


def lowest(ob):
    """The lowest point of an object as it is posed now (world z)."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    mw = ev.matrix_world
    z = min((mw @ v.co).z for v in me.vertices)
    ev.to_mesh_clear()
    return z


def rest_hand(fig, side, wrist_xy, heading, table_z=TABLE_Z, roll=0.0, squash=0.0002, tuck=None):
    """Lay a forearm on the table and let its hand drape from the wrist onto the wood: the wrist at
    the sleeve's height, the hand tipped down until its lowest felt just meets the table (pressed
    in by `squash`). `heading` is the way the fingers point across the table; `roll` turns the hand
    on its side (degrees, + toward the little finger)."""
    vl = bpy.context.view_layer
    hand = next(o for o in fig.objects if o.name == f'{fig.key} hand.{side}')
    # (the sleeve's own felt lying on the wood, pressed in a little, never into it: check.py)
    wz = table_z + fig.spec['sleeve'][4] + 0.0001
    # the same arm lying the same way has the same answer (the body above it may differ only a
    # little: the tilt is re-checked once and searched again only if it no longer touches)
    key = (fig.key, side, round(wrist_xy[0], 6), round(wrist_xy[1], 6), round(heading[0], 4), round(heading[1], 4), round(roll, 3), tuck,
           tuple(round(fig.arm.pose.bones[f'{f}{j}.{side}'].rotation_quaternion.x, 4) for f in puppets.FINGERS for j in (1, 2)))
    cache = _REST_CACHE
    h = Vector((heading[0], heading[1], 0.0)).normalized()
    side_ax = Vector((0, 0, 1)).cross(h).normalized()   # positive tilt tips the fingers down
    m = 1 if side == 'L' else -1

    def put(tilt):
        R = Matrix.Rotation(math.radians(tilt), 3, side_ax)
        fingers = R @ h
        back = Matrix.Rotation(math.radians(roll * m), 3, fingers) @ (R @ Vector((0, 0, 1)))
        place_arm(fig, side, (wrist_xy[0], wrist_xy[1], wz), fingers, back, 'table', tuck=tuck)
        vl.update()
        return lowest(hand)
    if key in cache:
        z = put(cache[key])
        if table_z - squash - 0.0002 < z < table_z + 0.0002:
            return cache[key]
    lo, hi = -10.0, 70.0
    for _ in range(9):
        mid = (lo + hi) / 2
        if put(mid) > table_z - squash:
            lo = mid
        else:
            hi = mid
    put(lo)
    cache[key] = lo
    return lo


_REST_CACHE = {}


def curl(fig, side, fingers=None, thumb=(10, 8)):
    """Curl each finger's two joints toward the palm (degrees beyond the rest curl)."""
    fingers = fingers or {}
    for f in puppets.FINGERS:
        a, b = thumb if f == 'thumb' else fingers.get(f, fingers.get('all', (8, 10)))
        for j, ang in ((1, a), (2, b)):
            pb = fig.arm.pose.bones[f'{f}{j}.{side}']
            pb.rotation_quaternion = Euler((math.radians(-ang), 0, 0), 'XYZ').to_quaternion()


def calibrate(figs):
    """Find each IK chain's pole angle: the one at which the rest wrist and its elbow reproduce the
    rest arm exactly."""
    vl = bpy.context.view_layer
    for fig in figs.values():
        for side in 'LR':
            wr_t, el_t = fig.targets[side]
            S = world(fig, fig.joints[f'upper_arm.{side}'][0])
            E0 = world(fig, fig.joints[f'upper_arm.{side}'][1])
            W = world(fig, fig.joints[f'forearm.{side}'][1])
            _, X, Y, Z, m = fig.hand_frame[side]
            wr_t.location = W
            wr_t.rotation_euler = _frame(Y, Z).to_euler()
            C = S + (W - S).normalized() * (W - S).normalized().dot(E0 - S)
            el_t.location = E0 + (E0 - C).normalized() * 0.03
            ik = fig.arm.pose.bones[f'forearm.{side}'].constraints['IK']

            def err(ang):
                ik.pole_angle = math.radians(ang)
                vl.update()
                return (posed_head(fig, f'forearm.{side}') - E0).length
            best = min(range(-180, 180, 6), key=err)
            fine = min([best + k * 0.25 for k in range(-24, 25)], key=err)
            ik.pole_angle = math.radians(fine)
            vl.update()
            fig.pole_error = getattr(fig, 'pole_error', {})
            fig.pole_error[side] = err(fine)


# -- the parts of a pose that are not bones -------------------------------------------------------


def lids(fig, closure):
    """Close each felt eyelid (0 open as made, 1 shut; below 0 lifts it, eyes wider)."""
    e = fig.spec['eye']
    for side, c in zip(('L', 'R'), closure):
        pb = fig.arm.pose.bones.get(f'lid.{side}')
        if pb is None:
            continue
        ang = (112.0 - e['lid']) * c if c >= 0 else 18.0 * c
        pb.rotation_quaternion = Euler((math.radians(ang), 0, 0), 'XYZ').to_quaternion()


def chair(fig, dy=0.0, rot=0.0):
    pivot = bpy.data.objects.get(f'chair {fig.key} pivot')
    if pivot is not None:
        pivot.location.y = kitchen.CHAIR_Y + dy
        pivot.rotation_euler.z = math.radians(rot)


def root(fig, d=(0.0, 0.0, 0.0)):
    fig.arm.location = fig.origin + Vector(d)


def corner(figs):
    """Where the free corner of B's folded cuff is now (world), lifted as its shape keys say."""
    b = figs['b']
    pb = b.arm.pose.bones['forearm.R']
    M = b.arm.matrix_world @ pb.matrix @ pb.bone.matrix_local.inverted()
    end, D, up, across, r, th_a, th_b = b.flap_frame
    lift = b.flap.data.shape_keys.key_blocks['lift'].value
    c = Vector(b.flap_corner)
    out = (c - (end - D * (end - c).dot(D))).normalized()
    return M @ (c + out * 0.0016 * lift + D * 0.0005 * lift), (M.to_3x3() @ out).normalized()


def fingertip(fig, side, finger='index'):
    pb = fig.arm.pose.bones[f'{finger}2.{side}']
    tail = fig.arm.matrix_world @ pb.tail
    d = (tail - fig.arm.matrix_world @ pb.head).normalized()
    return tail + d * 0.0007


def touch(figs, fig, side, target, fingers, back, steps=5, on='air'):
    """Move the wrist until the index fingertip is at `target` (world); the elbow as `on` says."""
    vl = bpy.context.view_layer
    wr_t = fig.targets[side][0]
    w = Vector(wr_t.location) if wr_t.location.length > 0 else Vector(target) - Vector(fingers).normalized() * 0.014
    for _ in range(steps):
        place_arm(fig, side, w, fingers, back, on)
        vl.update()
        w = w + (Vector(target) - fingertip(fig, side))
    place_arm(fig, side, w, fingers, back, on)
    vl.update()
    return w


# -- applying a pose ------------------------------------------------------------------------------


def apply(figs, p):
    """Put the figures in pose `p` ({'a': {...}, 'b': {...}})."""
    vl = bpy.context.view_layer
    if not getattr(figs['a'], 'pole_error', None):
        calibrate(figs)
    for key, fig in figs.items():
        q = p.get(key, {})
        root(fig, q.get('root', (0.0, 0.0, 0.0)))
        chair(fig, *q.get('chair', (0.0, 0.0)))
        for bone in ('spine', 'chest', 'neck', 'head'):
            _rot(fig, bone, *q.get(bone, (0, 0, 0)))
        for side in 'LR':
            _shoulder(fig, side, *q.get(f'shoulder.{side}', (0, 0)))
        lids(fig, q.get('lids', (0.0, 0.0)))
    vl.update()
    # B first: A's touch is placed on B's cuff
    for key in ('b', 'a'):
        fig = figs[key]
        q = p.get(key, {})
        if 'cuff' in q and hasattr(fig, 'flap'):
            keys = fig.flap.data.shape_keys.key_blocks
            for k, v in q['cuff'].items():
                keys[k].value = v
        for side in 'LR':
            curl(fig, side, q.get(f'curl.{side}'))
            a = q.get(f'arm.{side}')
            if not a:
                continue
            if 'touch' in a:
                c, out = corner(figs)
                off = Vector(a['touch'])
                touch(figs, fig, side, c + out * off.z + Vector((off.x, off.y, 0.0)), a['fingers'], a['back'], on=a.get('on', 'air'))
                continue
            w = a['wrist']
            if len(w) == 2:
                # resting on the table: the hand drapes onto the wood
                rest_hand(fig, side, w, a['fingers'], roll=a.get('roll', 0.0), tuck=a.get('tuck'))
            else:
                place_arm(fig, side, w, a['fingers'], a['back'], a.get('on', 'table'), tuck=a.get('tuck'))
        vl.update()
        for side in 'LR':
            # the sleeve bunches as the elbow bends (none straight, full at a right angle)
            u = posed_tail(fig, f'upper_arm.{side}') - posed_head(fig, f'upper_arm.{side}')
            f = posed_tail(fig, f'forearm.{side}') - posed_head(fig, f'forearm.{side}')
            bend = math.degrees(u.angle(f))
            sl = fig.sleeves[side][0]
            sl.data.shape_keys.key_blocks['bunch'].value = max(0.0, min(1.3, bend / 85.0))
    vl.update()


def mix(p0, p1, t):
    """A pose a fraction `t` of the way from p0 to p1 (every number in between; words from the
    nearer)."""
    if isinstance(p0, dict) and isinstance(p1, dict):
        out = {}
        for k in set(p0) | set(p1):
            if k in p0 and k in p1:
                out[k] = mix(p0[k], p1[k], t)
            else:
                out[k] = (p1 if k in p1 else p0)[k]
        return out
    if isinstance(p0, (tuple, list)) and isinstance(p1, (tuple, list)) and len(p0) == len(p1):
        return tuple(mix(a, b, t) for a, b in zip(p0, p1))
    if isinstance(p0, (int, float)) and isinstance(p1, (int, float)):
        return p0 + (p1 - p0) * t
    return p1 if t >= 0.5 else p0


# -- the key poses --------------------------------------------------------------------------------
# Wrist positions are in the room (metres); two numbers mean the forearm lies on the table there.

T = TABLE_Z


def _with(base, **changes):
    out = {k: (dict(v) if isinstance(v, dict) else v) for k, v in base.items()}
    for k, v in changes.items():
        k = k.replace('__', '.')
        out[k] = v
    return out


A = {}
# (Wrists are where the chairs now stand, 3 mm further apart than in the prototype: a strip of
# chair back between their near elbows, which are tucked in toward their own bodies.)
A['together'] = {
    'spine': (3, 0.5, 2), 'chest': (5, 0, 3), 'neck': (2, 0, 2), 'head': (9, -1.5, 6),
    'shoulder.L': (0, 4), 'shoulder.R': (-1, 3),
    'arm.L': dict(wrist=(-0.0245, -0.0205), fingers=(-0.30, -0.95), tuck=0.013),
    # his other hand rests by his cup (the two arms are not a mirror)
    'arm.R': dict(wrist=(-0.0600, -0.0215), fingers=(-0.22, -0.97)),
    'curl.L': {'all': (8, 10), 'index': (4, 6)}, 'curl.R': {'all': (14, 16)},
    'lids': (0.0, 0.0),
}
A['breathe'] = _with(A['together'], chest=(4, 0, 3), shoulder__L=(1, 4), shoulder__R=(0, 3))
# 2. noticing: his eyes, then his head, go to the fold on her sleeve
A['notice'] = _with(A['together'], head=(15, -2, 22), neck=(4, 0, 5), chest=(5, 0.5, 4), spine=(3, 1.0, 2), lids=(-0.25, -0.25))
# 3. reaching: the wrist lifts first, the fingers trailing; across in three goes, a hesitation (the
# fingers drawing in a little further while it lasts), on
A['lift'] = _with(A['notice'], spine=(3, 1.5, 2), shoulder__L=(1, 6),
                  arm__L=dict(wrist=(-0.0222, -0.0228, T + 0.0088), fingers=(0.25, -0.88, -0.45), back=(0.1, -0.35, 0.9), on='air'),
                  curl__L={'all': (14, 18), 'index': (8, 10)})
A['carry'] = _with(A['lift'], spine=(3, 2.5, 3), chest=(5, 1.5, 5), shoulder__L=(2, 8),
                   arm__L=dict(wrist=(-0.0135, -0.0242, T + 0.0108), fingers=(0.55, -0.75, -0.40), back=(0.1, -0.35, 0.9), on='air'))
A['hesitate'] = _with(A['carry'], arm__L=dict(wrist=(-0.0075, -0.0248, T + 0.0094), fingers=(0.74, -0.58, -0.34), back=(0.12, -0.25, 0.95), on='air'),
                      curl__L={'all': (18, 22), 'index': (10, 12)})
A['hesitate curl'] = _with(A['hesitate'], curl__L={'all': (21, 25), 'index': (13, 15)})
A['approach'] = _with(A['hesitate'], spine=(3, 3.5, 4), chest=(5, 2.5, 6), shoulder__L=(2, 10), head=(17, -2.5, 26),
                      arm__L=dict(wrist=(0.0000, -0.0258, T + 0.0085), fingers=(0.88, -0.40, -0.22), back=(0.10, -0.18, 1.0), on='air'),
                      curl__L={'all': (12, 16), 'index': (5, 7), 'middle': (7, 10)})
# the touch: low and level, from his side, the index and middle fingers leading (a hand putting a
# fold right, not pointing at it); his elbow out to his side and back, so the forearm crosses the
# table instead of pointing into the lens
TOUCH_ELBOW = (-0.047, 0.010, T + 0.004)
A['near'] = _with(A['approach'], arm__L=dict(touch=(-0.0022, -0.0002, 0.0007), fingers=(0.94, -0.30, -0.14), back=(0.10, -0.15, 1.0), on=TOUCH_ELBOW))
A['touch'] = _with(A['near'], arm__L=dict(touch=(-0.0006, 0.0, 0.0004), fingers=(0.95, -0.28, -0.14), back=(0.10, -0.15, 1.0), on=TOUCH_ELBOW),
                   curl__L={'all': (10, 14), 'index': (4, 6), 'middle': (6, 9)})
# the fold's corner rises under his fingertip, one drawing after the other (see resolve)
A['lift1'] = dict(A['touch'])
A['lift2'] = dict(A['touch'])
# 5. realisation: the hand left in the air where the cuff was, a little drop, the fingers drawing in
A['after touch'] = dict(A['touch'])
A['blink'] = _with(A['touch'], lids=(1.0, 1.0))
A['half blink'] = _with(A['touch'], lids=(0.5, 0.5))
# then back across the table, a little quicker than he came, and down off its edge into his lap;
# his look goes from her sleeve, down and to his own side (embarrassed: never at her)
A['back1'] = _with(A['notice'], spine=(3, 2.0, 3), chest=(6, 1.5, 4), shoulder__L=(0, 7), head=(16, -2, 16),
                   arm__L=dict(wrist=(-0.0060, -0.0200, T + 0.0080), fingers=(0.10, -0.90, -0.45), back=(0.0, -0.3, 0.95), on='air'),
                   curl__L={'all': (20, 24), 'index': (16, 18)}, lids=(0.15, 0.15))
A['back2'] = _with(A['back1'], spine=(3, 1.0, 2), chest=(7, 0.5, 3), shoulder__L=(-1, 5), head=(15, -1.5, 8),
                   arm__L=dict(wrist=(-0.0175, -0.0150, T + 0.0074), fingers=(-0.20, -0.92, -0.30), back=(0.0, -0.3, 0.95), on='air'))
# (level over the wood until the wrist is at its edge, then turned down past it, between the table
# and his body: turned down while still over the wood, its fingers went into the table)
A['back3'] = _with(A['back2'], shoulder__L=(-2, 3), head=(14, -1, 3), neck=(3, 0, 1),
                   arm__L=dict(wrist=(-0.0260, -0.0010, T + 0.0088), fingers=(-0.30, -0.90, -0.30), back=(0.0, -0.3, 0.95), on='air'))
# (lifted off the wood a little, fingers curled in, and turned down in the air: there are 9 mm
# between the table's edge and his jumper, and turned down any lower its fingers swept through
# the wood)
A['back3b'] = _with(A['back3'], head=(13, -1, 1),
                    arm__L=dict(wrist=(-0.0272, 0.0045, T + 0.0145), fingers=(-0.20, -0.26, -0.94), back=(0.0, -0.95, 0.25), on='air'),
                    curl__L={'all': (34, 40), 'index': (30, 35)})
# (then down through the gap between the table's edge and his body, upright, its palm to him)
A['back4'] = _with(A['back3b'], head=(13, -1, 0),
                   arm__L=dict(wrist=(-0.0275, 0.0045, T + 0.0040), fingers=(-0.15, -0.05, -0.99), back=(0.0, -1.0, 0.1), on='air'))
# 7. too late: a little lower than he sat at first, turned some twenty degrees from her, toward his
# own side and his cup; nothing hangs
A['lap left'] = _with(A['back3'], spine=(3, 0.0, 1), chest=(7, 0.0, 0), neck=(3, 0, 0), head=(12, -1, -8), shoulder__L=(-3, 3),
                      arm__L=dict(wrist=(-0.0315, 0.0080, 0.0930), fingers=(-0.20, -0.75, -0.62), back=(0.0, -0.5, 0.85), on='down'),
                      curl__L={'all': (22, 26), 'index': (18, 20)}, lids=(0.1, 0.1))
# his other hand, from beside his cup: drawn back to the edge, turned down past it, into his lap
A['lap right'] = _with(A['lap left'], shoulder__R=(-2, 2),
                       arm__R=dict(wrist=(-0.0600, -0.0040, T + 0.0080), fingers=(0.15, -0.95, -0.25), back=(0.0, -0.3, 0.95), on='air'),
                       curl__R={'all': (18, 22)})
A['lap right lift'] = _with(A['lap right'],
                            arm__R=dict(wrist=(-0.0580, 0.0045, T + 0.0145), fingers=(0.12, -0.26, -0.96), back=(0.0, -0.95, 0.25), on='air'),
                            curl__R={'all': (34, 40)})
A['lap right down'] = _with(A['lap right lift'],
                            arm__R=dict(wrist=(-0.0560, 0.0045, T + 0.0035), fingers=(0.10, -0.05, -0.99), back=(0.0, -1.0, 0.1), on='air'))
A['lap'] = _with(A['lap right down'], shoulder__R=(-3, 2),
                 arm__R=dict(wrist=(-0.0508, 0.0070, 0.0930), fingers=(0.35, -0.75, -0.55), back=(0.0, -0.5, 0.85), on='down'),
                 curl__R={'all': (22, 26)})
# his one slow breath after her offer: he gathers himself, and nothing follows
A['lap breathe'] = _with(A['lap'], chest=(5, 0, 0), shoulder__L=(-2, 4), shoulder__R=(-2, 3), head=(11, -1, -8))

B = {}
# 1. together: inward and a little tired, looking at the table in front of her, not at the lens
B['together'] = {
    'spine': (0, -0.5, -1), 'chest': (-1, 0, -2), 'neck': (2, 0, 2), 'head': (10, 0, 5),
    'shoulder.L': (0, 1), 'shoulder.R': (1, 3),
    'arm.R': dict(wrist=(0.0215, -0.0215), fingers=(0.30, -0.95), tuck=0.012),
    'arm.L': dict(wrist=(0.0575, 0.0050, 0.0915), fingers=(-0.55, -0.7, -0.2), back=(0.0, 0.3, 1.0), on='down'),
    'curl.L': {'all': (20, 25)}, 'curl.R': {'all': (10, 12), 'index': (6, 8)},
    'cuff': {'lift': 0.0, 'after': 0.0}, 'lids': (0.0, 0.0), 'chair': (0.0, 0.0), 'root': (0.0, 0.0, 0.0),
}
B['breathe'] = _with(B['together'], chest=(-2, 0, -2), shoulder__L=(1, 1), shoulder__R=(2, 3))
B['touched half'] = _with(B['together'], cuff={'lift': 0.3, 'after': 0.0})
B['touched'] = _with(B['together'], cuff={'lift': 0.55, 'after': 0.0})
# 4. the startle: a reflex, not a stance. On ones: a blink, the neck and shoulders flinching forward
# and up, the arm snatched back (most of it on the first frame); her head goes with her body. The
# chair moves a millimetre on the second frame.
B['startle1'] = _with(B['together'], spine=(1, -0.5, -1), chest=(1, 0, -2), head=(13, 0, 5), shoulder__R=(4, 0), shoulder__L=(2, 0), lids=(1.0, 1.0),
                      arm__R=dict(wrist=(0.0247, -0.0130, T + 0.0080), fingers=(0.30, -0.95, -0.10), back=(0.05, 0.2, 1.0), on='table'),
                      cuff={'lift': 0.2, 'after': 0.0})
B['startle2'] = _with(B['startle1'], spine=(0, 2.0, 2), chest=(0, 1.5, 3), head=(12, 0.5, 5), shoulder__R=(5, -4), lids=(0.5, 0.5),
                      arm__R=dict(wrist=(0.0268, -0.0074, T + 0.0100), fingers=(0.20, -0.90, -0.20), back=(0.05, 0.2, 1.0), on='table'),
                      cuff={'lift': 0.0, 'after': 0.6}, chair=(0.0006, 0.8), root=(0.0, 0.0006, 0.0))
B['startle3'] = _with(B['startle2'], spine=(-0.5, 2.6, 2.5), chest=(-0.5, 1.8, 3.5), head=(11, 1.0, 5), shoulder__R=(4, -6), lids=(0.0, 0.0),
                      arm__R=dict(wrist=(0.0278, -0.0046, T + 0.0105), fingers=(0.15, -0.85, -0.30), back=(0.05, 0.2, 1.0), on='table'),
                      cuff={'lift': 0.0, 'after': 1.0}, chair=(0.0010, 1.2), root=(0.0, 0.0010, 0.0))
# the release: shoulders down, the forearm laid back on the wood a centimetre nearer her, the fold
# still there; she looks at her own wrist, where she was touched
B['settle'] = _with(B['startle3'], spine=(-0.5, 2.0, 2), chest=(0, 1.2, 2), neck=(3, 0, 0), head=(16, 0.5, -6), shoulder__R=(2, -3), shoulder__L=(1, 0),
                    arm__R=dict(wrist=(0.0275, -0.0125), fingers=(0.20, -0.98), tuck=0.012))
B['withdrawn'] = _with(B['settle'], head=(17, 0.5, -8), shoulder__R=(1, -2))
# 6. repair: she looks from her wrist to him (the first time she looks at him), then lifts her arm,
# a hesitation in the air, and lays it back on the table nearer him than before, the fold toward
# him; a lean toward him so small it could be missed
B['look'] = _with(B['withdrawn'], head=(8, 0, -20), neck=(2, 0, -4), chest=(-1, 1.0, 0))
B['offer1'] = _with(B['look'], spine=(-0.5, 0.0, 0), chest=(-0.5, -0.5, -2),
                    arm__R=dict(wrist=(0.0230, -0.0110, T + 0.0080), fingers=(-0.05, -0.98, -0.15), back=(0.0, 0.1, 1.0), on='table'))
B['offer2'] = _with(B['offer1'], spine=(0, -2.5, -3), chest=(0, -1.5, -5), shoulder__R=(1, 5), head=(8, -1, -18),
                    arm__R=dict(wrist=(0.0140, -0.0165), fingers=(-0.10, -0.99), tuck=0.011))
# 8. almost: her eyes go down to the table between them; she breathes once
B['lower'] = _with(B['offer2'], head=(14, -1, -8), neck=(3, 0, -2), lids=(0.0, 0.0))
B['lower breathe'] = _with(B['lower'], chest=(-1, -1.5, -5), shoulder__R=(2, 5), shoulder__L=(1, 1))


def resolve(figs):
    """Turn the touches into wrist positions: where the hand is when its index fingertip meets the
    fold (B as she is then), so the drawings before and after can be in-betweened, and the hand can
    stay in the air where the cuff was after she has drawn it away. The corner rises under his
    fingertip over two drawings (`lift1`, `lift2`), the fingertip with it."""
    vl = bpy.context.view_layer
    for name, bkey in (('near', 'together'), ('touch', 'together'), ('lift1', 'touched half'), ('lift2', 'touched')):
        apply(figs, {'a': A[name], 'b': B[bkey]})
        wr = figs['a'].targets['L'][0]
        w = tuple(round(x, 6) for x in wr.location)
        arm = dict(A[name]['arm.L'])
        arm.pop('touch')
        arm.update(wrist=w)
        A[name] = _with(A[name], arm__L=arm)
    t = A['lift2']['arm.L']
    drop = dict(t, wrist=(t['wrist'][0] - 0.0004, t['wrist'][1] + 0.0006, t['wrist'][2] - 0.0016))
    A['after touch'] = _with(A['lift2'])
    A['after drop'] = _with(A['lift2'], arm__L=drop, curl__L={'all': (17, 21), 'index': (9, 11), 'middle': (11, 14)})
    A['blink'] = _with(A['after drop'], lids=(1.0, 1.0))
    A['half blink'] = _with(A['after drop'], lids=(0.5, 0.5))
    bake(figs)
    vl.update()


def bake(figs):
    """Write every key pose's arms out in full: the wrist where it is, the way the hand points and
    its back faces, and the elbow where it went. Then an in-between is every number in between. A
    hand lying on the wood (two numbers, draped by `rest_hand`) and a hand lifted off it (three)
    have no numbers in between otherwise, and the hand jumped from one to the other halfway."""
    for key, poses, other in (('a', A, B), ('b', B, A)):
        fig = figs[key]
        for name, pose in list(poses.items()):
            sides = [sd for sd in 'LR' if pose.get(f'arm.{sd}')]
            if not sides:
                continue
            apply(figs, {key: pose, 'b' if key == 'a' else 'a': other['together']})
            new = dict(pose)
            for sd in sides:
                arm = pose[f'arm.{sd}']
                wr_t = fig.targets[sd][0]
                M = wr_t.rotation_euler.to_matrix()
                baked = dict(wrist=tuple(round(x, 6) for x in wr_t.location),
                             fingers=tuple(round(x, 5) for x in M.col[1]),
                             back=tuple(round(x, 5) for x in M.col[2]),
                             on=tuple(round(x, 6) for x in posed_head(fig, f'forearm.{sd}')))
                if 'tuck' in arm:
                    baked['tuck'] = arm['tuck']
                new[f'arm.{sd}'] = baked
            poses[name] = new


POSES = {'together': lambda: {'a': A['together'], 'b': B['together']}}


def pose(name):
    if name in POSES:
        return POSES[name]()
    ka, _, kb = name.partition('+')
    return {'a': A[ka], 'b': B[kb or 'together']}
