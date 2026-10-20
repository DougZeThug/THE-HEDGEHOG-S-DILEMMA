"""The look of "Almost", checked: the hero frame and its close-ups, in one session.

    blender -b --factory-startup --python scripts/almost/lookdev.py -- --out DIR [--pose A+B]
            [--samples 96] [--views hero,faces,hands,cuff] [--res 1280x720]

Writes DIR/<view>.png. `hero` is the film's own 16:9 frame (the open matte's middle band); the
others are the close views in build.VIEWS (a lens on the faces, the hands, her cuff), for judging
felt, fibres, contact and the fold. They are QA sheets, not shots in the film.
"""
import math
import os
import sys
import time

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import build  # noqa: E402
import performance  # noqa: E402


def aim(view):
    sc = bpy.context.scene
    cam = sc.camera
    focus = bpy.data.objects['focus']
    if view == 'hero':
        at, target, lens, f = build.CAMERA['at'], build.CAMERA['aim'], build.CAMERA['lens'], build.CAMERA['focus']
        fstop = build.CAMERA['fstop']
    else:
        at, target, lens, ahead = build.VIEWS[view]
        f = tuple(Vector(target) + (Vector(at) - Vector(target)).normalized() * ahead)
        fstop = 16.0
    cam.location = at
    cam.rotation_euler = (Vector(target) - Vector(at)).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = lens
    cam.data.dof.aperture_fstop = fstop
    focus.location = f


def main():
    opts = build.args()
    out = opts['out']
    os.makedirs(out, exist_ok=True)
    if '--samples' not in sys.argv:
        opts['samples'] = 96
    views = str(opts.get('views', 'hero,faces,hands,cuff')).split(',')
    figs = build.setup(opts)
    sc = bpy.context.scene
    performance.calibrate(figs)
    performance.resolve(figs)
    ka, _, kb = str(opts.get('pose', 'together+together')).partition('+')
    performance.apply(figs, {'a': performance.A[ka], 'b': performance.B[kb or 'together']})
    for view in views:
        aim(view)
        sc.render.filepath = os.path.join(os.path.abspath(out), f'{view}.png')
        t0 = time.time()
        bpy.ops.render.render(write_still=True)
        print(f'VIEW {view} {time.time() - t0:.0f}s', flush=True)


if __name__ == '__main__':
    main()
