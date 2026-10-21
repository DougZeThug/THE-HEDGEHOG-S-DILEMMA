""""Almost" as an editable Blender file: the set, the puppets and the whole exposure sheet keyed on
its frames, with constant (stepped) interpolation, so it opens as a stop-motion timeline.

    blender -b --factory-startup --python scripts/almost/keyed.py -- --out almost.blend [--draft]

Every photograph's pose is keyed on the frame it is first shown: the armatures' bones, the IK
targets (each wrist and elbow), her cuff's shape keys, the sleeves' bunching, the eyelids, and the
chairs. Held frames hold. Scrub it, or render any frame, and it is the film's photograph. To change
the performance, change `performance.py` or `xsheet.py` and run this again (the poses are made
there, not in the file).
"""
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import build  # noqa: E402
import performance  # noqa: E402
import xsheet  # noqa: E402


def key_all(figs, frame):
    """Key everything a pose sets, on `frame`."""
    for fig in figs.values():
        arm = fig.arm
        arm.keyframe_insert('location', frame=frame)
        for pb in arm.pose.bones:
            pb.keyframe_insert('rotation_quaternion', frame=frame)
        for wr, el in fig.targets.values():
            for ob in (wr, el):
                ob.keyframe_insert('location', frame=frame)
                ob.keyframe_insert('rotation_euler', frame=frame)
        for side in 'LR':
            sl = fig.sleeves[side][0]
            sl.data.shape_keys.key_blocks['bunch'].keyframe_insert('value', frame=frame)
        if hasattr(fig, 'flap'):
            for ob in (fig.flap, fig.flap_stitch):
                for name in ('lift', 'after'):
                    ob.data.shape_keys.key_blocks[name].keyframe_insert('value', frame=frame)
    for key in ('a', 'b'):
        pivot = bpy.data.objects.get(f'chair {key} pivot')
        if pivot is not None:
            pivot.keyframe_insert('location', frame=frame)
            pivot.keyframe_insert('rotation_euler', frame=frame)


def stepped():
    """Every key constant: a pose holds until the next photograph."""
    for action in bpy.data.actions:
        for fc in action.fcurves if hasattr(action, 'fcurves') else []:
            for kp in fc.keyframe_points:
                kp.interpolation = 'CONSTANT'
    # (Blender 5 keeps an action's curves in layers and strips; walk those too.)
    for action in bpy.data.actions:
        for layer in getattr(action, 'layers', []):
            for strip in layer.strips:
                for bag in getattr(strip, 'channelbags', []):
                    for fc in bag.fcurves:
                        for kp in fc.keyframe_points:
                            kp.interpolation = 'CONSTANT'


def main():
    opts = build.args()
    out = os.path.abspath(opts['out'])
    if '--res' not in sys.argv:
        opts['res'] = (1280, 1440)
    if '--samples' not in sys.argv:
        opts['samples'] = 96
    figs = build.setup(opts)
    sc = bpy.context.scene
    performance.calibrate(figs)
    performance.resolve(figs)
    a, b, frames, unique = xsheet.frames()
    first = {}
    for f, pair, u in frames:
        first.setdefault(u, f)
    for (ia, ib), u in sorted(unique.items(), key=lambda kv: kv[1]):
        da, db = a.drawings[ia], b.drawings[ib]
        performance.apply(figs, {'a': performance.mix(performance.A[da[0]], performance.A[da[1]], da[2]),
                                 'b': performance.mix(performance.B[db[0]], performance.B[db[1]], db[2])})
        key_all(figs, first[u] + 1)
        print(f'KEYED photograph {u} on frame {first[u] + 1}', flush=True)
    stepped()
    sc.frame_start, sc.frame_end = 1, len(frames)
    sc.frame_set(1)
    # (the subdivisions back on for the viewport: posing turned them off for speed)
    for ob in bpy.data.objects:
        for m in ob.modifiers:
            if m.type == 'SUBSURF':
                m.show_viewport = True
    bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
    print('SAVED', out, f'{os.path.getsize(out) / 1e6:.1f} MB', flush=True)


if __name__ == '__main__':
    main()
