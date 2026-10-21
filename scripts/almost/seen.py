"""What the camera sees of the story's parts in "Almost": her folded cuff, in each held key pose.

    blender -b --factory-startup --python scripts/almost/seen.py -- [--out DIR] [--res WxH]

The fold is why he reaches, what she looks at when she understands, and the film's last image ("the
little folded sleeve is still there"), so it has to be in the picture whenever it is held, not only
somewhere on the puppet. (Tucked in toward her, her forearm pointed at the lens and her hand hid the
fold: the skeptic's review, 2026-10-20. `check.py` measures contact; this measures the story.)

For each pose in KEYS, a flat render of the open matte with everything an occluder: the fold's
ivory lining white, her hand yellow, the figures grey, the set black. It counts the lining's pixels
seen in the 16:9 band and in the 9:16 crop, at the film's own size (1280 wide), and fails a pose with
fewer than SEEN_MIN. The renders are kept in DIR/seen/<pose>.png (`--out DIR`).
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

# (B's held poses, with A as he is then)
KEYS = [
    ('together', 'together', 'together'),
    ('touched', 'lift2', 'touched'),
    ('withdrawn', 'reflex', 'withdrawn'),
    ('look', 'lap left', 'look'),
    ('offer2', 'lap left', 'offer2'),
    ('lower', 'lap left', 'lower'),
]
SEEN_MIN = 120      # lining pixels at 1280 wide: a fold a dozen pixels across


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


def main():
    opts = build.args()
    if '--res' not in sys.argv:
        opts['res'] = (640, 720)
    opts['samples'] = 4
    figs = build.setup(opts)
    sc = bpy.context.scene
    performance.calibrate(figs)
    performance.resolve(figs)
    black, figure = flat('seen set', (0, 0, 0)), flat('seen figure', (0.25, 0.25, 0.25))
    lining, hand = flat('seen lining', (1, 1, 1)), flat('seen hand', (1, 1, 0))
    people = {ob.name for ob in bpy.data.collections['figures'].all_objects}
    for ob in bpy.data.objects:
        if ob.type == 'LIGHT':
            ob.hide_render = True
        if ob.type not in ('MESH', 'CURVE'):
            continue
        mats = [black] * max(1, len(ob.data.materials))
        if ob.name in people:
            mats = [figure] * len(mats)
            if ob.name == 'b cuff fold.R':
                mats = [lining, figure]          # (its lining, then its outer face: the solidify's shell)
            elif ob.name == 'b hand.R':
                mats = [hand] * len(mats)
        ob.data.materials.clear()
        for m in mats:
            ob.data.materials.append(m)
        for mod in ob.modifiers:
            if mod.type == 'PARTICLE_SYSTEM':
                mod.show_render = False
    w = sc.world
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    if bg:
        bg.inputs['Strength'].default_value = 0
    c = sc.cycles
    c.use_denoising = False
    c.max_bounces = 0
    sc.view_settings.view_transform = 'Standard'
    sc.render.filter_size = 0.75
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGB'
    W, H = opts['res']
    k = 1280 / W
    # (the crops as assemble.py cuts them: the 16:9 band across the middle, the 9:16 at the centre)
    bh, tw = int(round(W * 9 / 16 / 2)) * 2, int(round(H * 9 / 16 / 2)) * 2
    C = {'wide': (0, (H - bh) // 2, W, (H - bh) // 2 + bh), 'tall': ((W - tw) // 2, 0, (W - tw) // 2 + tw, H)}
    out = opts.get('out')
    tmp = os.path.join(out or '/tmp', 'seen')
    os.makedirs(tmp, exist_ok=True)
    report, bad = [], 0
    for name, ka, kb in KEYS:
        performance.apply(figs, {'a': performance.A[ka], 'b': performance.B[kb]})
        path = os.path.join(tmp, f'{name}.png')
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(path)
        px = np.array(img.pixels[:], np.float32).reshape(H, W, 4)[::-1, :, :3]
        bpy.data.images.remove(img)
        white = (px.min(axis=2) > 0.6)
        row = {'pose': name}
        for crop, (x0, y0, x1, y1) in C.items():
            row[crop] = int(round(white[y0:y1, x0:x1].sum() * k * k))
        row['ok'] = min(row['wide'], row['tall']) >= SEEN_MIN
        bad += not row['ok']
        report.append(row)
        print('SEEN', json.dumps(row), flush=True)
    print(f'SEEN {len(report)} poses, {bad} without the fold in the picture (fewer than {SEEN_MIN} lining pixels at 1280 wide)', flush=True)
    if out:
        with open(os.path.join(out, 'seen.json'), 'w') as fh:
            json.dump(report, fh, indent=1)


if __name__ == '__main__':
    main()
