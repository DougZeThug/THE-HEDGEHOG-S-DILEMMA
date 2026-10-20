"""Build the shot of "Almost" in Blender and render stills or poses.

    blender -b --factory-startup --python scripts/almost/build.py -- [options]

    --still PATH        render one frame to PATH (PNG)
    --pose NAME         the pose to put the figures in (performance.POSES), default 'together'
    --res WxH           resolution (default 1280x720)
    --samples N         Cycles samples, adaptive (default 128)
    --border x0,y0,x1,y1  render only this part of the frame (0..1, from the bottom left)
    --proxy             stand-in figures (layout only)
    --save PATH         save the .blend
    --lens MM --fstop F --cam x,y,z --aim x,y,z   override the camera

The set is `kitchen.py`, the figures `puppets.py`, the performance `performance.py`.
"""
import math
import os
import sys
import time

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import kitchen  # noqa: E402
import lib  # noqa: E402
from lib import srgb  # noqa: E402

# close views for looking at the puppets (not the film's shot): (camera, aim, lens)
VIEWS = {
    # name: (camera, aim, lens, focus this far in front of the aim)
    'a-head': ((-0.030, -0.115, 0.180), (-0.039, 0.019, 0.170), 85.0, 0.016),
    'b-head': ((0.030, -0.115, 0.182), (0.039, 0.022, 0.172), 85.0, 0.016),
    'faces': ((0.0, -0.20, 0.185), (0.0, 0.02, 0.165), 60.0, 0.016),
    'a-bust': ((-0.036, -0.17, 0.178), (-0.039, 0.02, 0.152), 62.0, 0.016),
    'b-bust': ((0.042, -0.17, 0.178), (0.039, 0.02, 0.152), 62.0, 0.016),
    'b-back': ((0.105, 0.128, 0.205), (0.039, 0.03, 0.15), 45.0, 0.0),
    'b-face': ((0.039, -0.10, 0.168), (0.039, 0.02, 0.166), 100.0, 0.016),
    'b-side': ((-0.06, -0.035, 0.168), (0.039, 0.0, 0.165), 70.0, 0.0),
    'hands': ((0.0, -0.17, 0.20), (0.0, -0.018, 0.118), 60.0, 0.0),
    'cuff': ((0.035, -0.09, 0.165), (0.015, -0.025, 0.12), 90.0, 0.0),
    'a-hand': ((-0.030, -0.085, 0.150), (-0.022, -0.026, 0.115), 100.0, 0.0),
}

CAMERA = {'lens': 42.0, 'fstop': 11.0, 'at': (0.0, -0.285, 0.236), 'aim': (0.0, 0.012, 0.159), 'focus': (0.0, -0.0002, 0.1387)}


def args():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    out = {'res': (1280, 720), 'samples': 128, 'pose': 'together'}
    i = 0
    while i < len(a):
        k = a[i]
        if k in ('--proxy', '--draft'):
            out[k[2:]] = True
            i += 1
            continue
        v = a[i + 1]
        if k == '--res':
            w, h = v.split('x')
            out['res'] = (int(w), int(h))
        elif k in ('--samples',):
            out['samples'] = int(v)
        elif k in ('--lens', '--fstop'):
            out[k[2:]] = float(v)
        elif k in ('--cam', '--aim', '--focus', '--border'):
            out[k[2:]] = tuple(float(x) for x in v.split(','))
        else:
            out[k[2:]] = v
        i += 2
    return out


def clear():
    for c in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.particles):
        for x in list(c):
            c.remove(x)


def collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


def camera(opts):
    sc = bpy.context.scene
    if opts.get('view'):
        at, aim, lens, ahead = VIEWS[opts['view']]
        opts.setdefault('cam', at)
        opts.setdefault('aim', aim)
        opts.setdefault('focus', tuple(Vector(aim) + (Vector(at) - Vector(aim)).normalized() * ahead))
        opts.setdefault('lens', lens)
        opts.setdefault('fstop', 16.0)
    cam = bpy.data.cameras.new('miniature camera')
    cam.lens = opts.get('lens', CAMERA['lens'])
    cam.sensor_width = 36.0
    # (The width, whatever the frame's shape: the open matte's middle band is then the 16:9 frame
    # exactly. Left to AUTO, a taller-than-wide frame put the 36 mm on its height, 12.5% tighter.)
    cam.sensor_fit = 'HORIZONTAL'
    cam.clip_start, cam.clip_end = 0.01, 5.0
    cam.dof.use_dof = True
    cam.dof.aperture_fstop = opts.get('fstop', CAMERA['fstop'])
    cam.dof.aperture_blades = 7
    cam.dof.aperture_rotation = math.radians(12)
    ob = lib.link(bpy.data.objects.new('camera', cam))
    ob.location = opts.get('cam', CAMERA['at'])
    aim = Vector(opts.get('aim', CAMERA['aim']))
    ob.rotation_euler = (aim - ob.location).to_track_quat('-Z', 'Y').to_euler()
    focus = lib.link(bpy.data.objects.new('focus', None))
    focus.location = opts.get('focus', CAMERA['focus'])
    cam.dof.focus_object = focus
    sc.camera = ob
    return ob


def lights():
    """The pendant's bulb is the key (inside the shade, which shapes it); the night window a faint
    cool fill from behind; the room itself nearly black."""
    sc = bpy.context.scene
    bulb = bpy.data.lights.new('bulb', 'POINT')
    bulb.energy = 1.6
    bulb.shadow_soft_size = 0.0055
    bulb.color = (1.0, 0.71, 0.42)
    ob = lib.link(bpy.data.objects.new('bulb light', bulb))
    ob.location = kitchen.LAMP + Vector((0.0, 0.0, kitchen.BULB_UP))
    win = bpy.data.lights.new('night window', 'AREA')
    win.shape = 'RECTANGLE'
    win.size, win.size_y = 0.13, 0.12
    win.energy = 0.55
    win.color = (0.55, 0.68, 1.0)
    wo = lib.link(bpy.data.objects.new('window light', win))
    wo.location = (-0.14, kitchen.WALL_Y + 0.03, 0.205)
    wo.rotation_euler = (math.radians(-90), 0, 0)
    wo.visible_camera = False
    wo.visible_glossy = False
    wo.visible_transmission = False
    world = bpy.data.worlds.new('night room')
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (*srgb('#141c2a'), 1.0)
    bg.inputs[1].default_value = 0.02
    sc.world = world
    # the lamp's light coming back off the wall and ceiling behind them: a faint warm edge on their
    # backs and on every fibre standing off their felt (no source anyone would see)
    back = bpy.data.lights.new('bounce', 'AREA')
    back.shape, back.size, back.size_y = 'RECTANGLE', 0.16, 0.06
    back.energy, back.color = 0.22, (1.0, 0.80, 0.58)
    bo = lib.link(bpy.data.objects.new('bounce light', back))
    bo.location = (0.0, 0.105, 0.245)
    bo.rotation_euler = (math.radians(-128), 0, 0)
    bo.visible_camera = bo.visible_glossy = False
    return ob


def render_settings(opts):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    cy = sc.cycles
    cy.device = 'CPU'
    cy.samples = opts['samples']
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = 0.015
    cy.use_denoising = True
    cy.denoiser = 'OPENIMAGEDENOISE'
    cy.denoising_input_passes = 'RGB_ALBEDO_NORMAL'
    cy.seed = 0
    cy.max_bounces, cy.diffuse_bounces, cy.glossy_bounces = 8, 4, 3
    cy.transmission_bounces, cy.transparent_max_bounces = 6, 8
    cy.caustics_reflective = cy.caustics_refractive = False
    cy.sample_clamp_indirect = 4.0
    sc.render.resolution_x, sc.render.resolution_y = opts['res']
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.exposure = float(opts.get('exposure', 0.0))
    sc.render.use_persistent_data = True     # keep the stage loaded between photographs
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_depth = '8'
    if 'border' in opts:
        x0, y0, x1, y1 = opts['border']
        sc.render.use_border, sc.render.use_crop_to_border = True, False
        sc.render.border_min_x, sc.render.border_min_y, sc.render.border_max_x, sc.render.border_max_y = x0, y0, x1, y1


def proxies(col):
    """Stand-ins for layout: a head, a body and the near arms in grey felt."""
    grey = lib.felt('proxy felt', srgb('#9a9286'))
    out = []
    for side, x in (('a', kitchen.CHAIR_X['a']), ('b', kitchen.CHAIR_X['b'])):
        s = -1 if side == 'a' else 1
        body = lib.superellipsoid(f'{side} body', (0.05, 0.034, 0.078), power=0.75, center=(x, kitchen.CHAIR_Y - 0.002, kitchen.SEAT_Z + 0.039), material=grey)
        head = lib.egg(f'{side} head', (0.036, 0.035, 0.042), center=(x, kitchen.CHAIR_Y - 0.006, kitchen.SEAT_Z + 0.102), material=grey, seed=2 if side == 'a' else 5)
        sh = Vector((x - s * 0.022, kitchen.CHAIR_Y - 0.004, kitchen.SEAT_Z + 0.072))
        el = Vector((x - s * 0.026, kitchen.CHAIR_Y - 0.012, kitchen.TABLE_TOP + 0.006))
        wr = Vector((x - s * 0.012, -0.03, kitchen.TABLE_TOP + 0.006))
        arm = lib.tube(f'{side} near arm', [sh, el, wr], [0.0075, 0.0068, 0.0064], material=grey, wob=0.04)
        out += [body, head, arm]
    for ob in out:
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
        col.objects.link(ob)
    return out


def setup(opts):
    """Build the set, the figures, the camera and the lights; returns the figures."""
    clear()
    sc = bpy.context.scene
    sc.unit_settings.system, sc.unit_settings.scale_length = 'METRIC', 1.0
    sc.render.fps = 24
    kitchen.build(collection('set'))
    figures = collection('figures')
    if opts.get('proxy'):
        proxies(figures)
        rigs = None
    else:
        import puppets
        rigs = puppets.build(figures)
    camera(opts)
    lights()
    render_settings(opts)
    # posing evaluates the scene many times: subdivide only for the camera, not while posing
    for ob in bpy.data.objects:
        for m in ob.modifiers:
            if m.type == 'SUBSURF':
                m.show_viewport = False
    return rigs


def main():
    opts = args()
    rigs = setup(opts)
    sc = bpy.context.scene
    if rigs:
        import performance
        performance.apply(rigs, performance.pose(opts['pose']))
    if opts.get('save'):
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(opts['save']), compress=True)
    if opts.get('still'):
        sc.render.filepath = os.path.abspath(opts['still'])
        t0 = time.time()
        bpy.ops.render.render(write_still=True)
        print(f'RENDERED {opts["still"]} in {time.time() - t0:.1f}s')


if __name__ == '__main__':
    main()
