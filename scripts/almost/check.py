"""Contact check of "Almost", every photograph: nothing goes into the table or into the other
figure, and a resting hand is on the wood, not above it.

    blender -b --factory-startup --python scripts/almost/check.py -- [--out REPORT.json] [--only A-B]

For each photograph, posed as render.py poses it, on the surfaces the camera sees (subdivided as
they are rendered, not the cage posing works on):
- **dip:** the deepest any sleeve, hand or the folded cuff goes inside the table top (its own
  surface, worn edges and all: under it is the lap). Stuffed felt may press in up to
  `performance.SQUASH` (0.7 mm, a tenth of a sleeve's radius: an elbow resting on the table's
  edge), and 0.3 mm more for the knit's own relief.
- **into:** the deepest his hand goes inside her sleeve or its fold (along her surface's normal).
- **gap:** for a hand meant to be resting, how far its lowest felt is above the wood.
- **through:** how far a hand's wrist, where it runs up inside its own sleeve, goes out into the
  sleeve's cloth (the knit is 0.6 mm thick: deeper shows through it as a pale patch on the cuff).
  Measured from the forearm's axis toward each point of the hand behind the wrist: the wall met
  first. (A wrist that bent as one piece with the hand swung its hidden end out through the top of
  his cuff whenever the hand drooped from it, through most of the reach: final QA, 2026-10-21.)
- **paw:** a hand in the air (its lowest felt 5 mm or more above the wood) that hangs from its wrist,
  bent toward its palm more than PAW_FLEX, and so points further down the picture than PAW_DEG:
  wrist to middle fingertip, as the lens sees it. Lifted with
  the fingers toward the lens and drooping, his hand stood under a short foreshortened cuff, back
  to the lens, as a begging paw (the creative director's review of the final render, 2026-10-21).
  The wrist's own measures cannot see it: it is a bend seen in projection.

Depths are to the nearest surface, so one deeper than half the top's thickness (3.25 mm) reads as
its distance to the underside: still a fault.

Prints one line per photograph that fails, and a summary.
"""
import json
import math
import os
import sys

import bpy
import numpy as np
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import build  # noqa: E402
import kitchen  # noqa: E402
import performance  # noqa: E402
import xsheet  # noqa: E402

DIP_OK = performance.SQUASH + 0.0003
INTO_OK = 0.0004
GAP_OK = 0.0006
THROUGH_OK = 0.0005  # (the knit is 0.6 mm thick: up to half a millimetre into it is still inside it)
WALL = 0.003        # nearer a sleeve's axis than this is inside the wrist (its inner wall: 4.4 mm and more)
PAW_DEG = 55.0
PAW_FLEX = 20.0     # (hand and forearm in line, pointing at the lens, read as his resting hands do)
IN_AIR = 0.005     # (lower, in line with its forearm, a hand reads as his resting hands do)
W_PX, H = 1280, 1440    # the film's frame (the angle in its pixels)


def verts(ob):
    """World positions of the evaluated (subdivided) mesh's vertices, and its triangles."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    co = np.empty(len(me.vertices) * 3, np.float64)
    me.vertices.foreach_get('co', co)
    M = np.array(ev.matrix_world)
    co = co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]
    me.calc_loop_triangles()
    tri = np.empty(len(me.loop_triangles) * 3, np.int32)
    me.loop_triangles.foreach_get('vertices', tri)
    ev.to_mesh_clear()
    return co, tri.reshape(-1, 3)


def tree(ob):
    co, tri = verts(ob)
    return BVHTree.FromPolygons([Vector(p) for p in co], [tuple(t) for t in tri]), co


def inside(points, bvh, reach=0.005):
    """The deepest any of `points` is inside the closed surface in `bvh` (to its nearest surface)."""
    worst = 0.0
    for p in points:
        loc, nrm, _, _ = bvh.find_nearest(Vector(p), reach)
        if loc is None:
            continue
        depth = -(Vector(p) - loc).dot(nrm)
        worst = max(worst, depth)
    return worst


def through(points, bvh, E, W):
    """The furthest any of `points` between the elbow E and the wrist W is beyond the sleeve's
    inner wall: from the forearm's axis toward the point, the wall met before the point is. Only
    behind the wrist: the sleeve runs on 1.6 mm, and a bent hand's heel or thumb may lie beside its
    rounded rim without going through it. (Cloth met nearer the axis than the wall is cloth inside
    the wrist, hidden by it: the folded cuff's cut end.)"""
    df = (W - E).normalized()
    end = (W - E).length
    worst = 0.0
    for p in points:
        p = Vector(p)
        s = (p - E).dot(df)
        if s < 0 or s > end:
            continue
        c = E + df * s
        r = p - c
        dist = r.length
        if dist < WALL:
            continue
        hit, _, _, d = bvh.ray_cast(c + r / dist * WALL, r / dist, dist - WALL)
        if hit is not None:
            worst = max(worst, dist - WALL - d)
    return worst


def wrist_flex(fig, side):
    """How far the hand bends toward its palm from the forearm's line (degrees; motion.py's)."""
    fy = (fig.arm.matrix_world @ fig.arm.pose.bones[f'forearm.{side}'].matrix).to_3x3().col[1].normalized()
    H3 = (fig.arm.matrix_world @ fig.arm.pose.bones[f'hand.{side}'].matrix).to_3x3()
    hy, hz = H3.col[1].normalized(), H3.col[2].normalized()
    return math.degrees(math.atan2(fy.dot(hz), fy.dot(hy)))


def near(points, lo, hi, pad):
    """Only the points within `pad` of the box lo..hi (the rest cannot touch it)."""
    m = np.all((points > lo - pad) & (points < hi + pad), axis=1)
    return points[m]


def main():
    opts = build.args()
    opts['res'] = (64, 72)
    figs = build.setup(opts)
    sc = bpy.context.scene
    for ob in bpy.data.objects:
        for m in ob.modifiers:
            if m.type == 'PARTICLE_SYSTEM':
                m.show_viewport = False
    performance.calibrate(figs)
    performance.resolve(figs)
    obj = {o.name: o for o in bpy.data.objects}
    parts = {k: [obj[n] for n in (f'{k} sleeve.L', f'{k} sleeve.R', f'{k} hand.L', f'{k} hand.R', f'{k} cuff fold.R') if n in obj] for k in 'ab'}
    # (the surfaces as rendered: posing turned their subdivision off)
    for ob in parts['a'] + parts['b']:
        for m in ob.modifiers:
            if m.type == 'SUBSURF':
                m.show_viewport, m.levels = True, m.render_levels
    table, table_co = tree(obj['table top'])
    t_lo, t_hi = table_co.min(axis=0), table_co.max(axis=0)
    a, b, frames, unique = xsheet.frames()
    order = sorted(unique.items(), key=lambda kv: kv[1])
    lo, hi = 0, len(order) - 1
    if opts.get('only'):
        lo, hi = (int(x) for x in str(opts['only']).split('-'))
    report = []
    bad = 0
    for (ia, ib), u in order:
        if u < lo or u > hi:
            continue
        da, db = a.drawings[ia], b.drawings[ib]
        pa = performance.mix(performance.A[da[0]], performance.A[da[1]], da[2])
        pb = performance.mix(performance.B[db[0]], performance.B[db[1]], db[2])
        performance.apply(figs, {'a': pa, 'b': pb})
        row = {'photo': u, 'a': da[1], 'b': db[1]}
        co = {ob.name: verts(ob)[0] for ob in parts['a'] + parts['b']}
        for name, pts in co.items():
            d = inside(near(pts, t_lo, t_hi, 0.002), table)
            if d > DIP_OK:
                row.setdefault('dip', {})[name] = round(d * 1000, 2)
        hand = co['a hand.L']
        for name in ('b sleeve.R', 'b cuff fold.R'):
            if name in co:
                d = inside(near(hand, co[name].min(axis=0), co[name].max(axis=0), 0.004), tree(obj[name])[0], 0.004)
                if d > INTO_OK:
                    row.setdefault('into', {})[name] = round(d * 1000, 2)
        # a hand meant to rest (its wrist given as two numbers: on the table)
        for k, p in (('a', pa), ('b', pb)):
            for side in 'LR':
                arm = p.get(f'arm.{side}')
                if arm and 'wrist' in arm and len(arm['wrist']) == 2:
                    g = co[f'{k} hand.{side}'][:, 2].min() - kitchen.TABLE_TOP
                    if g > GAP_OK:
                        row.setdefault('gap', {})[f'{k} hand.{side}'] = round(g * 1000, 2)
        # each wrist inside its own sleeve; a hand in the air not hanging down the picture
        for k, fig in figs.items():
            for side in 'LR':
                E = performance.posed_head(fig, f'forearm.{side}')
                W = performance.posed_tail(fig, f'forearm.{side}')
                d = through(co[f'{k} hand.{side}'], tree(obj[f'{k} sleeve.{side}'])[0], E, W)
                if d > THROUGH_OK:
                    row.setdefault('through', {})[f'{k} hand.{side}'] = round(d * 1000, 2)
                if co[f'{k} hand.{side}'][:, 2].min() - kitchen.TABLE_TOP >= IN_AIR:
                    w2 = world_to_camera_view(sc, sc.camera, W)
                    t2 = world_to_camera_view(sc, sc.camera, performance.fingertip(fig, side, 'middle'))
                    down = math.degrees(math.atan2((w2.y - t2.y) * H, abs(t2.x - w2.x) * W_PX))
                    flex = wrist_flex(fig, side)
                    if down > PAW_DEG and flex > PAW_FLEX:
                        row.setdefault('paw', {})[f'{k} hand.{side}'] = [round(down, 1), round(flex, 1)]
        failed = any(x in row for x in ('dip', 'into', 'gap', 'through', 'paw'))
        bad += failed
        if failed:
            print('FAIL', json.dumps(row), flush=True)
        report.append(row)
    print(f'CHECKED {len(report)} photographs, {bad} with a fault (dip > {DIP_OK * 1000:.1f} mm, into > {INTO_OK * 1000:.1f} mm, gap > {GAP_OK * 1000:.1f} mm,'
          f' through > {THROUGH_OK * 1000:.1f} mm, paw > {PAW_DEG:.0f} deg)', flush=True)
    if opts.get('out'):
        with open(opts['out'], 'w') as fh:
            json.dump(report, fh, indent=1)


if __name__ == '__main__':
    main()
