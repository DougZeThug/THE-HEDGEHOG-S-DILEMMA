"""Route A of the bake-off: the same paper layers stood up in Blender and lit by EEVEE.

Each layer from cut.py is a card at its depth (timeline.Z, a panel px to a mm), seen by a locked
orthographic camera through the panel's 4:5 column. The set and the fox are diffuse paper with
the baked edge normals; her key is a sun from her side (soft by her angular size, with jittered
shadows), the fill is the world. The far plate, her reflection, the creep, the haze and the shaft
are emission, as comp.py treats them; his reflection is his cards mirrored about the water line.
Every pose and light level comes from timeline.py, the numbers comp.py uses.

EEVEE's ray tracing doesn't work on this machine's GPU (docs/reviews/2026-10-fable.md, §3), so
nothing here depends on it.

Usage:
  blender -b --factory-startup --python scripts/fable/stage.py -- [--out DIR] [--size 864x1080]
          [--still T ...] [--clip] [--samples 32] [--shadow-scale 1.0]
"""
import json
import math
import os
import shutil
import sys
import time

import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import timeline as tl  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
PIECES = os.path.join(ROOT, 'test-output', 'fable', 'pieces')
CROP = (40, 0, 442, 503)
U = 0.002  # metres per panel px (the panel is about a metre across, a toy theatre)


def args():
    a = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    o = {'out': os.path.join(ROOT, 'test-output', 'fable', 'bake', 'A'), 'size': '864x1080', 'still': [],
         'clip': False, 'samples': 32, 'shadow_scale': 1.0}
    i = 0
    while i < len(a):
        k = a[i]
        if k == '--out':
            o['out'] = a[i + 1]; i += 2
        elif k == '--size':
            o['size'] = a[i + 1]; i += 2
        elif k == '--samples':
            o['samples'] = int(a[i + 1]); i += 2
        elif k == '--shadow-scale':
            o['shadow_scale'] = float(a[i + 1]); i += 2
        elif k == '--clip':
            o['clip'] = True; i += 1
        elif k == '--still':
            i += 1
            while i < len(a) and not a[i].startswith('--'):
                o['still'].append(float(a[i])); i += 1
        else:
            raise SystemExit(f'unknown argument {k}')
    o['out'] = os.path.abspath(o['out'])  # Blender resolves a bare relative path against the drive
    return o


def depth(name):
    if name.startswith('pin'):
        return tl.Z['pin']
    if name.startswith('creep'):
        return tl.Z['creep']
    if name == 'moon_refl_soft':
        return tl.Z['moon_refl'] - 0.1
    if name == 'moon_refl':
        return tl.Z['moon_refl']
    return tl.Z[name]


def image(file, colour=True):
    im = bpy.data.images.load(os.path.join(PIECES, file), check_existing=True)
    im.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'
    im.alpha_mode = 'STRAIGHT'
    return im


def card(L, S, y_mm, name=None):
    """A quad covering the layer's box at rest, in world units (X right, Z up, Y away)."""
    ox, oy = L['origin']
    w, h = L['size_px'][0] / S, L['size_px'][1] / S
    x0, x1, y0, y1 = ox * U, (ox + w) * U, -oy * U, -(oy + h) * U
    me = bpy.data.meshes.new(name or L['name'])
    me.from_pydata([(x0, 0, y1), (x1, 0, y1), (x1, 0, y0), (x0, 0, y0)], [], [(0, 1, 2, 3)])
    uv = me.uv_layers.new()
    for li, (u, v) in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv.data[li].uv = (u, v)
    me.update()
    ob = bpy.data.objects.new(name or L['name'], me)
    ob.location.y = -y_mm * U  # the origin carries the depth, so blended cards sort by it
    bpy.context.scene.collection.objects.link(ob)
    return ob


def node_tree(mat):
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    return nt, out


def paper_material(L):
    """Diffuse paper: the painted colour, its alpha, and the cut edge's baked normal."""
    mat = bpy.data.materials.new('m_' + L['name'])
    nt, out = node_tree(mat)
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = image(L['file'])
    tex.interpolation = 'Linear'
    tex.extension = 'CLIP'
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Roughness'].default_value = 1.0
    bsdf.inputs['Specular IOR Level'].default_value = 0.0
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    gain = nt.nodes.new('ShaderNodeMath')  # an alpha multiplier the timeline drives (the mud)
    gain.operation = 'MULTIPLY'
    gain.name = 'alpha_gain'
    gain.inputs[1].default_value = 1.0
    nt.links.new(tex.outputs['Alpha'], gain.inputs[0])
    nt.links.new(gain.outputs[0], bsdf.inputs['Alpha'])
    if 'normal' in L:
        nm = nt.nodes.new('ShaderNodeTexImage')
        nm.image = image(L['normal'], colour=False)
        nm.interpolation = 'Linear'
        nm.extension = 'CLIP'
        nmap = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(nm.outputs['Color'], nmap.inputs['Color'])
        nt.links.new(nmap.outputs['Normal'], bsdf.inputs['Normal'])
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    mat.use_backface_culling = False
    if hasattr(mat, 'use_transparent_shadow'):
        mat.use_transparent_shadow = True
    return mat


def glow_material(L, rgb_scale=(1, 1, 1), rgb_add=(0, 0, 0), file=None):
    """Emission over what is behind, by the texture's alpha × a driven factor: the plate (factor 1),
    her reflection, the creep, his reflection."""
    mat = bpy.data.materials.new('g_' + L['name'])
    nt, out = node_tree(mat)
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = image(file or L['file'])
    tex.interpolation = 'Linear'
    tex.extension = 'CLIP'
    scale = nt.nodes.new('ShaderNodeMix')
    scale.data_type = 'RGBA'
    scale.blend_type = 'MULTIPLY'
    scale.inputs['Factor'].default_value = 1.0
    scale.inputs['B'].default_value = (*rgb_scale, 1)
    nt.links.new(tex.outputs['Color'], scale.inputs['A'])
    add = nt.nodes.new('ShaderNodeMix')
    add.data_type = 'RGBA'
    add.blend_type = 'ADD'
    add.inputs['Factor'].default_value = 1.0
    add.inputs['B'].default_value = (*rgb_add, 1)
    nt.links.new(scale.outputs['Result'], add.inputs['A'])
    em = nt.nodes.new('ShaderNodeEmission')
    em.name = 'emission'
    nt.links.new(add.outputs['Result'], em.inputs['Color'])
    fac = nt.nodes.new('ShaderNodeMath')
    fac.operation = 'MULTIPLY'
    fac.name = 'alpha_gain'
    fac.inputs[1].default_value = 1.0
    nt.links.new(tex.outputs['Alpha'], fac.inputs[0])
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(fac.outputs[0], mix.inputs['Fac'])
    nt.links.new(tr.outputs['BSDF'], mix.inputs[1])
    nt.links.new(em.outputs['Emission'], mix.inputs[2])
    nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])
    mat.surface_render_method = 'BLENDED'
    mat.use_backface_culling = False
    return mat


def veil_material(name, file, rgb, additive):
    """The haze (a veil over everything, lifting the blacks) or the shaft (light added)."""
    mat = bpy.data.materials.new(name)
    nt, out = node_tree(mat)
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = image(file, colour=False)
    tex.interpolation = 'Linear'
    tex.extension = 'CLIP'
    fac = nt.nodes.new('ShaderNodeMath')
    fac.operation = 'MULTIPLY'
    fac.name = 'amount'
    fac.inputs[1].default_value = 0.0
    nt.links.new(tex.outputs['Color'], fac.inputs[0])
    em = nt.nodes.new('ShaderNodeEmission')
    em.name = 'emission'
    em.inputs['Color'].default_value = (*rgb, 1)
    tr = nt.nodes.new('ShaderNodeBsdfTransparent')
    if additive:
        nt.links.new(fac.outputs[0], em.inputs['Strength'])
        sh = nt.nodes.new('ShaderNodeAddShader')
        nt.links.new(tr.outputs['BSDF'], sh.inputs[0])
        nt.links.new(em.outputs['Emission'], sh.inputs[1])
    else:
        sh = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(fac.outputs[0], sh.inputs['Fac'])
        nt.links.new(tr.outputs['BSDF'], sh.inputs[1])
        nt.links.new(em.outputs['Emission'], sh.inputs[2])
    nt.links.new(sh.outputs[0], out.inputs['Surface'])
    mat.surface_render_method = 'BLENDED'
    mat.use_backface_culling = False
    return mat


def to_world(m, y_mm):
    """A 2×3 affine in panel px (y down) as a Blender world matrix (X right, Z up), at a depth."""
    (a11, a12, b1), (a21, a22, b2) = m
    return Matrix(((a11, 0, -a12, U * b1), (0, 1, 0, -y_mm * U), (-a21, 0, a22, -U * b2), (0, 0, 0, 1)))


class Stage:
    def __init__(self, o):
        self.o = o
        self.meta = json.load(open(os.path.join(PIECES, 'pieces.json')))
        S = self.meta['scale']
        sc = bpy.context.scene
        for ob in list(bpy.data.objects):
            bpy.data.objects.remove(ob)
        sc.render.engine = 'BLENDER_EEVEE'
        w, h = (int(v) for v in o['size'].split('x'))
        sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = w, h, 100
        sc.render.film_transparent = False
        sc.eevee.taa_render_samples = o['samples']
        if hasattr(sc.eevee, 'use_raytracing'):
            sc.eevee.use_raytracing = False
        if hasattr(sc.eevee, 'shadow_resolution_scale'):
            sc.eevee.shadow_resolution_scale = o['shadow_scale']
        sc.view_settings.view_transform = 'Standard'
        sc.view_settings.look = 'None'
        sc.view_settings.exposure = 0
        sc.view_settings.gamma = 1
        sc.render.image_settings.file_format = 'PNG'
        sc.render.image_settings.color_mode = 'RGB'

        world = bpy.data.worlds.new('fill')
        world.use_nodes = True
        self.world_bg = world.node_tree.nodes['Background']
        self.world_bg.inputs['Color'].default_value = (1, 1, 1, 1)
        sc.world = world

        sun = bpy.data.lights.new('her key', 'SUN')
        if hasattr(sun, 'use_shadow_jitter'):
            sun.use_shadow_jitter = True
        self.sun = sun
        ob = bpy.data.objects.new('her key', sun)
        sc.collection.objects.link(ob)
        L = Vector(tl.KEY_DIR).normalized()
        ob.rotation_euler = L.to_track_quat('Z', 'Y').to_euler()
        self.cos = max(1e-3, L.dot(Vector((0, -1, 0))))

        cam = bpy.data.cameras.new('lens')
        cam.type = 'ORTHO'
        cam.sensor_fit = 'VERTICAL'
        x0, y0, x1, y1 = CROP
        cam.ortho_scale = (y1 - y0) * U
        cam.clip_start, cam.clip_end = 0.01, 10
        cob = bpy.data.objects.new('lens', cam)
        cob.location = ((x0 + x1) / 2 * U, -2.0, -(y0 + y1) / 2 * U)
        cob.rotation_euler = (math.pi / 2, 0, 0)
        sc.collection.objects.link(cob)
        sc.camera = cob

        self.cards, self.refl, self.mats = {}, {}, {}
        for L in self.meta['layers']:
            n = L['name']
            if n == 'plate':
                mat = glow_material(L)
                mat.surface_render_method = 'DITHERED'  # opaque, at the back
            elif n.startswith('moon_refl') or n.startswith('creep'):
                mat = glow_material(L)
            else:
                mat = paper_material(L)
            ob = card(L, S, depth(n))
            ob.data.materials.append(mat)
            self.cards[n], self.mats[n] = ob, mat
            if L['kind'] == 'fox' and n != 'mud':
                rm = glow_material(L, rgb_scale=(0.30, 0.30, 0.30), rgb_add=(0.012, 0.018, 0.04))
                rob = card(L, S, tl.Z['refl_fox'], name='refl_' + n)
                rob.data.materials.append(rm)
                self.refl[n] = (rob, rm)
        full = {'origin': [0, 0], 'size_px': self.meta['frame_px']}
        self.haze_m = veil_material('haze', 'haze.png', tl.HAZE_RGB, additive=False)
        ob = card(dict(full, name='haze'), S, tl.Z['haze'])
        ob.data.materials.append(self.haze_m)
        self.shaft_m = veil_material('shaft', 'shaft.png', tl.SHAFT_RGB, additive=True)
        ob = card(dict(full, name='shaft'), S, tl.Z['shaft'])
        ob.data.materials.append(self.shaft_m)

    def apply(self, t):
        lt = tl.light(t)
        fill = tl.FILL_SHARE * lt['fill']
        key = tl.KEY_SHARE * lt['key']
        self.world_bg.inputs['Strength'].default_value = fill
        self.sun.energy = key * math.pi / self.cos
        self.sun.angle = math.radians(3.0 * lt['key_size'])
        em = lambda m: m.node_tree.nodes['emission']
        gain = lambda m: m.node_tree.nodes['alpha_gain']
        em(self.mats['plate']).inputs['Strength'].default_value = fill + key
        g = lt['moon_gain']
        em(self.mats['moon_refl']).inputs['Strength'].default_value = g
        em(self.mats['moon_refl_soft']).inputs['Strength'].default_value = g
        gain(self.mats['moon_refl']).inputs[1].default_value = 1 - lt['moon_soft']
        gain(self.mats['moon_refl_soft']).inputs[1].default_value = lt['moon_soft']
        for L in self.meta['layers']:
            if L['name'].startswith('creep'):
                m = self.mats[L['name']]
                em(m).inputs['Strength'].default_value = g
                gain(m).inputs[1].default_value = lt['creep'][L['order']]
        gain(self.mats['mud']).inputs[1].default_value = lt['mud']
        places = tl.placements(t, self.meta['layers'])
        for n, m in places.items():
            self.cards[n].matrix_world = to_world(m, depth(n))
            if n in self.refl:
                rob, rm = self.refl[n]
                rob.matrix_world = to_world(tl.mirror(m), tl.Z['refl_fox'])
                gain(rm).inputs[1].default_value = lt['refl_fox']
        self.haze_m.node_tree.nodes['amount'].inputs[1].default_value = lt['haze'] * tl.HAZE_AMOUNT
        self.haze_m.node_tree.nodes['emission'].inputs['Strength'].default_value = 0.6 + 0.4 * lt['key']
        self.shaft_m.node_tree.nodes['amount'].inputs[1].default_value = lt['shaft'] * tl.SHAFT_AMOUNT

    def render(self, t, path):
        self.apply(t)
        bpy.context.scene.render.filepath = path
        t0 = time.perf_counter()
        bpy.ops.render.render(write_still=True)
        return time.perf_counter() - t0


def main():
    o = args()
    os.makedirs(o['out'], exist_ok=True)
    st = Stage(o)
    for t in o['still']:
        dt = st.render(t, os.path.join(o['out'], f'still_{t:05.1f}.png'))
        print(f'STILL {t} {dt:.1f}s')
    if o['clip']:
        fdir = os.path.join(o['out'], 'frames')
        os.makedirs(fdir, exist_ok=True)
        last, times, last_path = None, [], None
        for f, t in tl.frames():
            path = os.path.join(fdir, f'{f:04d}.png')
            if t != last:
                if os.path.exists(path) and os.path.getsize(path) > 0:  # resume
                    last, last_path = t, path
                    continue
                times.append(st.render(t, path))
                last, last_path = t, path
                print(f'FRAME {f} t={t:.2f} {times[-1]:.1f}s', flush=True)
            else:
                shutil.copyfile(last_path, path)
        if times:
            json.dump({'drawings': len(times), 'mean_s': sum(times) / len(times), 'total_s': sum(times),
                       'first_s': times[0]}, open(os.path.join(o['out'], 'times.json'), 'w'), indent=1)


main()
