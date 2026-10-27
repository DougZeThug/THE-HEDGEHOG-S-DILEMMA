"""Where the two figures are in "Almost"'s first photograph, for its way through the wall.

    blender -b --factory-startup --python scripts/almost/masks.py -- --out PATH.png [--res WxH]

The film's open matte at its first pose, flat:
- R: the two figures;
- G: their hands and her folded cuff, the place of the almost (emergence.py finds these last).
The set is black. Nothing is lit: every surface is its own flat value.
"""
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import build  # noqa: E402
import performance  # noqa: E402
import xsheet  # noqa: E402


def flat(name, rgb):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    e = nt.nodes.new('ShaderNodeEmission')
    e.inputs['Color'].default_value = (*rgb, 1.0)
    e.inputs['Strength'].default_value = 1.0
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(e.outputs[0], o.inputs[0])
    return m


def main():
    opts = build.args()
    if '--res' not in sys.argv:
        opts['res'] = (640, 720)
    opts['samples'] = 4
    figs = build.setup(opts)
    sc = bpy.context.scene
    performance.calibrate(figs)
    performance.resolve(figs)
    # The first photograph's pose, as render.py makes it.
    a, b, frames, unique = xsheet.frames()
    (ia, ib), _ = min(unique.items(), key=lambda kv: kv[1])
    da, db = a.drawings[ia], b.drawings[ib]
    performance.apply(figs, {'a': performance.mix(performance.A[da[0]], performance.A[da[1]], da[2]),
                             'b': performance.mix(performance.B[db[0]], performance.B[db[1]], db[2])})
    black, figure, hand = flat('mask set', (0, 0, 0)), flat('mask figure', (1, 0, 0)), flat('mask hand', (1, 1, 0))
    people = {ob.name for ob in bpy.data.collections['figures'].all_objects}
    for ob in bpy.data.objects:
        if ob.type == 'LIGHT':
            ob.hide_render = True
        if ob.type not in ('MESH', 'CURVE'):
            continue
        m = black
        if ob.name in people:
            m = hand if (' hand.' in ob.name or ' cuff fold.' in ob.name) else figure
        ob.data.materials.clear()
        ob.data.materials.append(m)
        # (Fibres would be the set's colour at their roots: off, the figure's own shape.)
        for mod in ob.modifiers:
            if mod.type == 'PARTICLE_SYSTEM':
                mod.show_render = False
    w = sc.world
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    if bg:
        bg.inputs['Color'].default_value = (0, 0, 0, 1)
        bg.inputs['Strength'].default_value = 0
    c = sc.cycles
    c.use_denoising = False
    c.max_bounces = 0
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.render.filter_size = 0.75
    # Focus as the film's (its depth of field softens the edges the same way).
    sc.render.filepath = os.path.abspath(opts['out'])
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGB'
    bpy.ops.render.render(write_still=True)
    print('MASK', opts['out'], flush=True)


if __name__ == '__main__':
    main()
