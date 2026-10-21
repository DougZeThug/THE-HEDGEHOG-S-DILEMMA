"""After her startle, his hand is off her arm in the picture too: every photograph from her first
startled drawing to his retreat, the gap the camera sees between his left hand and her right arm.

    blender -b --factory-startup --python scripts/almost/apart.py -- [--out DIR] [--only A-B]

The touch has to end where she flinches. (While she snatched her arm back along its own line it
slid under his still hand, and for 0.9 s his fingertips lay on her cuff and then her forearm in the
picture: on a phone he seemed to hold her wrist while she pulled away. The creative director's
review of the final render, 2026-10-21.) `check.py` measures contact in the room; this measures
what the lens shows, where depth reads only from overlap.

A flat render of the open matte at the film's size: his left hand red, her right sleeve, cuff and
hand green, everything else black (an occluder). Her arm is grown a pixel at a time until it meets
his hand; fewer than APART_MIN pixels fails. The renders are kept in DIR/apart/NNNN.png.
"""
import json
import os
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import build  # noqa: E402
import performance  # noqa: E402
import xsheet  # noqa: E402

APART_MIN = 8       # pixels at 1280 wide


def flat(name, rgb):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    e = nt.nodes.new('ShaderNodeEmission')
    e.inputs['Color'].default_value = (*rgb, 1.0)
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(e.outputs[0], o.inputs[0])
    return m


def gap(red, green, most=60):
    """How many pixels her arm grows before it meets his hand (0: they touch or overlap)."""
    g = green.copy()
    for step in range(most + 1):
        if (g & red).any():
            return step
        n = g.copy()
        n[1:] |= g[:-1]
        n[:-1] |= g[1:]
        n[:, 1:] |= g[:, :-1]
        n[:, :-1] |= g[:, 1:]
        if step % 2:
            n[1:, 1:] |= g[:-1, :-1]
            n[:-1, :-1] |= g[1:, 1:]
            n[1:, :-1] |= g[:-1, 1:]
            n[:-1, 1:] |= g[1:, :-1]
        g = n
    return most


def main():
    opts = build.args()
    opts['res'] = (1280, 1440)
    opts['samples'] = 1
    figs = build.setup(opts)
    sc = bpy.context.scene
    performance.calibrate(figs)
    performance.resolve(figs)
    black, red, green = flat('apart k', (0, 0, 0)), flat('apart r', (1, 0, 0)), flat('apart g', (0, 1, 0))
    hers = {o.name for o in bpy.data.objects if o.name in ('b sleeve.R', 'b hand.R', 'b cuff fold.R')}
    for ob in bpy.data.objects:
        if ob.type == 'LIGHT':
            ob.hide_render = True
        if ob.type not in ('MESH', 'CURVE'):
            continue
        mat = red if ob.name == 'a hand.L' else green if ob.name in hers else black
        n = max(1, len(ob.data.materials))
        ob.data.materials.clear()
        for _ in range(n):
            ob.data.materials.append(mat)
        for m in ob.modifiers:
            if m.type == 'PARTICLE_SYSTEM':
                m.show_render = False
    w = sc.world
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    if bg:
        bg.inputs['Strength'].default_value = 0
    sc.cycles.samples = 1
    sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 0
    sc.view_settings.view_transform = 'Standard'
    sc.render.filter_size = 0.5
    sc.render.image_settings.file_format = 'PNG'
    out = os.path.join(opts.get('out', '/tmp'), 'apart')
    os.makedirs(out, exist_ok=True)
    a, b, frames, unique = xsheet.frames()
    order = sorted(unique.items(), key=lambda kv: kv[1])
    # from the frame after her first startled one (his hand comes off the cloth on the next) to
    # his first drawing of the retreat
    f0 = next(f for f, (ia, ib), u in frames if b.drawings[ib][1].startswith('startle'))
    lo = frames[f0 + 1][2]
    hi = next(u for f, (ia, ib), u in frames if a.drawings[ia][1].startswith('back'))
    if opts.get('only'):
        lo, hi = (int(x) for x in str(opts['only']).split('-'))
    report, bad = [], 0
    import OpenImageIO as oiio
    for (ia, ib), u in order:
        if u < lo or u > hi:
            continue
        da, db = a.drawings[ia], b.drawings[ib]
        performance.apply(figs, {'a': performance.mix(performance.A[da[0]], performance.A[da[1]], da[2]),
                                 'b': performance.mix(performance.B[db[0]], performance.B[db[1]], db[2])})
        path = os.path.join(out, f'{u:04d}.png')
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        im = np.asarray(oiio.ImageBuf(path).get_pixels(oiio.FLOAT))[..., :3]
        hand = (im[..., 0] > 0.5) & (im[..., 1] < 0.25)
        arm = (im[..., 1] > 0.5) & (im[..., 0] < 0.25)
        px = gap(hand, arm) if hand.any() and arm.any() else None
        row = {'photo': u, 'a': f'{da[0]}>{da[1]} {da[2]:.2f}', 'b': f'{db[0]}>{db[1]} {db[2]:.2f}', 'gap': px}
        failed = px is not None and px < APART_MIN
        bad += failed
        print('FAIL' if failed else 'APART', json.dumps(row), flush=True)
        report.append(row)
    print(f'APART {len(report)} photographs from her startle to his retreat, {bad} with his hand within {APART_MIN} px of her arm', flush=True)
    with open(os.path.join(out, 'apart.json'), 'w') as fh:
        json.dump(report, fh, indent=1)


if __name__ == '__main__':
    main()
