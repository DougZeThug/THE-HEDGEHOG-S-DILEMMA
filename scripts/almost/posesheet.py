"""The pose sheet of "Almost": the story's key poses side by side, captioned.

    blender -b --factory-startup --python scripts/almost/posesheet.py -- --out PATH.jpg [--draft] [--res WxH] [--samples N]

Each cell is the film's own framing (the 16:9 band of the open matte).
"""
import os
import sys
import tempfile

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import build  # noqa: E402
import performance  # noqa: E402

KEYS = [
    ('1  together', 'together', 'together'),
    ('2  he notices the fold', 'notice', 'together'),
    ('3  he reaches (a hesitation)', 'hesitate curl', 'together'),
    ('3  the corner rises under his fingertip', 'lift2', 'touched'),
    ('4  she starts', 'lift2', 'startle1'),
    ('5  his hand left in the air', 'after drop', 'withdrawn'),
    ('5  into his lap, turned away', 'lap left', 'withdrawn'),
    ('6  she looks at him', 'lap', 'look'),
    ('6  she lays her arm nearer him', 'lap', 'offer2'),
    ('8  almost', 'lap', 'lower'),
]


def main():
    opts = build.args()
    out = opts['out']
    draft = opts.get('draft')
    if '--res' not in sys.argv:
        opts['res'] = (640, 360)
    if '--samples' not in sys.argv:
        opts['samples'] = 12 if draft else 48
    figs = build.setup(opts)
    sc = bpy.context.scene
    if draft:
        for ob in bpy.data.objects:
            for m in ob.modifiers:
                if m.type == 'PARTICLE_SYSTEM':
                    m.show_render = False
    performance.calibrate(figs)
    performance.resolve(figs)
    tmp = tempfile.mkdtemp()
    cells = []
    for i, (caption, ka, kb) in enumerate(KEYS):
        performance.apply(figs, {'a': performance.A[ka], 'b': performance.B[kb]})
        path = os.path.join(tmp, f'{i:02d}.png')
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        cells.append((caption, path))
        print('POSE', caption, flush=True)
    import subprocess
    subprocess.run(['/usr/bin/python3', os.path.join(HERE, 'tile.py'), out, '5'] + [x for c in cells for x in c], check=True)


if __name__ == '__main__':
    main()
