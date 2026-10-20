"""Contact check of "Almost", every photograph: nothing goes into the table or into the other
figure, and a resting hand is on the wood, not above it.

    blender -b --factory-startup --python scripts/almost/check.py -- [--out REPORT.json] [--only A-B]

For each photograph, posed as render.py poses it:
- **dip:** the deepest any sleeve, hand or the folded cuff goes into the tabletop (its slab: under it
  is the lap), where it is over the wood. Stuffed felt may press in up to `performance.SQUASH`
  (0.7 mm, a tenth of a sleeve's radius: an elbow resting on the table's edge), and 0.3 mm more for
  the knit's own relief.
- **into:** the deepest his hand goes inside her sleeve or its fold (along her surface's normal).
- **gap:** for a hand meant to be resting, how far its lowest felt is above the wood.

Prints one line per photograph that fails, and a summary.
"""
import json
import os
import sys

import bpy
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


def verts(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    mw = ev.matrix_world
    out = [mw @ v.co for v in me.vertices]
    tris = []
    me.calc_loop_triangles()
    for t in me.loop_triangles:
        tris.append(tuple(t.vertices))
    ev.to_mesh_clear()
    return out, tris


def dip(points):
    """The deepest any point is inside the tabletop's slab (under it is the lap: no fault)."""
    T, B = kitchen.TABLE_TOP, kitchen.TABLE_TOP - kitchen.TOP_T
    worst = 0.0
    for p in points:
        if p.y < -0.0008 and kitchen.TABLE_X[0] < p.x < kitchen.TABLE_X[1] and B < p.z < T:
            worst = max(worst, min(T - p.z, p.z - B))
    return worst


def into(points, ob):
    """How deep `points` go inside `ob` (by its surface normal at the nearest point)."""
    vs, tris = verts(ob)
    if not tris:
        return 0.0
    bvh = BVHTree.FromPolygons(vs, tris)
    worst = 0.0
    for p in points:
        hit = bvh.find_nearest(p, 0.004)
        if hit[0] is None:
            continue
        loc, nrm, _, d = hit
        depth = -(p - loc).dot(nrm)
        if depth > worst:
            worst = depth
    return worst


def main():
    opts = build.args()
    opts['res'] = (64, 72)
    figs = build.setup(opts)
    for ob in bpy.data.objects:
        for m in ob.modifiers:
            if m.type == 'PARTICLE_SYSTEM':
                m.show_viewport = False
    performance.calibrate(figs)
    performance.resolve(figs)
    a, b, frames, unique = xsheet.frames()
    order = sorted(unique.items(), key=lambda kv: kv[1])
    lo, hi = 0, len(order) - 1
    if opts.get('only'):
        lo, hi = (int(x) for x in str(opts['only']).split('-'))
    obj = {o.name: o for o in bpy.data.objects}
    parts = {k: [obj[n] for n in (f'{k} sleeve.L', f'{k} sleeve.R', f'{k} hand.L', f'{k} hand.R', f'{k} cuff fold.R') if n in obj] for k in 'ab'}
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
        for k in 'ab':
            for ob in parts[k]:
                d = dip(verts(ob)[0])
                if d > DIP_OK:
                    row.setdefault('dip', {})[ob.name] = round(d * 1000, 2)
        hand = verts(obj['a hand.L'])[0]
        for name in ('b sleeve.R', 'b cuff fold.R'):
            if name in obj:
                d = into(hand, obj[name])
                if d > INTO_OK:
                    row.setdefault('into', {})[name] = round(d * 1000, 2)
        # a hand meant to rest (its wrist given as two numbers: on the table)
        for k, p in (('a', pa), ('b', pb)):
            for side in 'LR':
                arm = p.get(f'arm.{side}')
                if arm and 'wrist' in arm and len(arm['wrist']) == 2:
                    z = min(v.z for v in verts(obj[f'{k} hand.{side}'])[0])
                    g = z - kitchen.TABLE_TOP
                    if g > GAP_OK:
                        row.setdefault('gap', {})[f'{k} hand.{side}'] = round(g * 1000, 2)
        failed = any(x in row for x in ('dip', 'into', 'gap'))
        bad += failed
        if failed:
            print('FAIL', json.dumps(row), flush=True)
        report.append(row)
    print(f'CHECKED {len(report)} photographs, {bad} with a fault (dip > {DIP_OK * 1000:.1f} mm, into > {INTO_OK * 1000:.1f} mm, gap > {GAP_OK * 1000:.1f} mm)', flush=True)
    if opts.get('out'):
        with open(opts['out'], 'w') as fh:
            json.dump(report, fh, indent=1)


if __name__ == '__main__':
    main()
