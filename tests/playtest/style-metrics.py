"""Measure the room's frames against the artist's reference.

    python3 tests/playtest/style-metrics.py test-output/review/style/<label>

Reads <label>/style.json and its PNGs (from tests/playtest/style.mjs) and writes metrics.json:
- for each frame, the mean colour (sRGB 0-255) and luma round each named place in view;
- the same places read off the reference image, where they are, for the reference-framed view;
- tonal ratios that describe the composition (corners, ceiling, floor pool vs foreground);
- each piece of writing's contrast: the ink against the wall round it (Weber, luma).
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

D = Path(sys.argv[1])
data = json.loads((D / 'style.json').read_text())

# The same places on the reference (1448x1086), picked by eye, avoiding its writing and chair.
REF = {
    'backWall': (760, 430),
    'backTopLeft': (300, 175),
    'backTopRight': (1150, 175),
    'ceiling': (250, 70),
    'floorPool': (840, 840),
    'floorFront': (720, 1050),
    'floorEdge': (120, 900),
    'sideWall': (130, 500),
    'seat': (730, 745),
    'chairShadow': (650, 875),
    'panel': (720, 45),
}


def luma(rgb):
    return float(np.dot(rgb, [0.2126, 0.7152, 0.0722]))


def sample(img, xy, r):
    x, y = xy
    h, w = img.shape[:2]
    a = img[max(0, y - r):min(h, y + r + 1), max(0, x - r):min(w, x + r + 1)].reshape(-1, 3)
    m = a.mean(0)
    return {'rgb': [round(float(v), 1) for v in m], 'luma': round(luma(m), 1)}


def ratios(p):
    g = lambda k: p.get(k, {}).get('luma')
    out = {}
    wall = g('backWall')
    if wall:
        for k in ('backTopLeft', 'backTopRight', 'ceiling', 'sideWall', 'floorPool', 'floorFront', 'floorEdge'):
            if g(k):
                out[f'{k}/backWall'] = round(g(k) / wall, 3)
    if g('floorPool') and g('chairShadow'):
        out['chairShadow/floorPool'] = round(g('chairShadow') / g('floorPool'), 3)
    if g('floorPool') and g('panel'):
        out['panel/floorPool'] = round(g('panel') / g('floorPool'), 3)
    if g('floorPool') and g('floorFront'):
        out['floorFront/floorPool'] = round(g('floorFront') / g('floorPool'), 3)
    rgb = p.get('backWall', {}).get('rgb')
    if rgb:
        out['backWall R/B'] = round(rgb[0] / max(1, rgb[2]), 3)
    return out


def lab(rgb):
    c = np.asarray(rgb, float) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    M = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ M.T / np.array([0.9505, 1.0, 1.089])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def ink_contrast(img, box):
    x0, y0, x1, y1 = box
    a = img[y0:y1, x0:x1].reshape(-1, 3)
    if len(a) < 200:
        return None
    L = a @ np.array([0.2126, 0.7152, 0.0722])
    wall = float(np.percentile(L, 60))
    ink = float(np.percentile(L, 2))
    # Colour contrast too (CIE76 ΔE, and chroma difference): a warm ink on a warm wall can keep
    # its luma and still sink.
    lw, li = lab(a[L >= np.percentile(L, 60)].mean(0)), lab(a[L <= np.percentile(L, 4)].mean(0))
    dE = float(np.linalg.norm(lw - li))
    dC = float(abs(np.hypot(li[1], li[2]) - np.hypot(lw[1], lw[2])))
    return {'wall': round(wall, 1), 'ink': round(ink, 1), 'weber': round((wall - ink) / max(1.0, wall), 3), 'dE': round(dE, 1), 'dC': round(dC, 1)}


ref = np.asarray(Image.open(D / 'reference.png').convert('RGB')).astype(float) if (D / 'reference.png').exists() else None
out = {'reference': None, 'frames': []}
if ref is not None:
    pts = {k: sample(ref, xy, 9) for k, xy in REF.items()}
    out['reference'] = {'places': pts, 'ratios': ratios(pts)}

for f in data['frames']:
    if not f.get('file'):
        out['frames'].append({k: f[k] for k in ('profile', 'style', 'name') if k in f} | {'summary': {k: f.get(k) for k in ('programsAtThreshold', 'programsAfter', 'compiledBySwitching', 'errors')}})
        continue
    img = np.asarray(Image.open(D / f['file']).convert('RGB')).astype(float)
    sx, sy = img.shape[1] / f['W'], img.shape[0] / f['H']
    r = max(4, int(round(min(img.shape[:2]) * 0.012)))
    places = {k: sample(img, (int(xy[0] * sx), int(xy[1] * sy)), r) for k, xy in f['pts'].items() if xy}
    inks = []
    for it in f['ink']:
        b = [int(it['box'][0] * sx), int(it['box'][1] * sy), int(it['box'][2] * sx), int(it['box'][3] * sy)]
        c = ink_contrast(img, b)
        if c:
            inks.append({'key': it['key'], 'opacity': it['opacity'], **c})
    out['frames'].append({'profile': f['profile'], 'style': f['style'], 'name': f['name'], 'places': places, 'ratios': ratios(places), 'ink': inks})

# Screen invariance: the same patch of wall, centred and near a corner of the frame.
inv = {}
for f in out['frames']:
    if f.get('name') in ('inv-centre', 'inv-corner') and f['places'].get('invPoint'):
        inv.setdefault((f['profile'], f['style']), {})[f['name']] = f['places']['invPoint']['luma']
out['invariance'] = {f'{p} {s}': {**v, 'diff': round(v.get('inv-centre', 0) - v.get('inv-corner', 0), 1)} for (p, s), v in inv.items()}

(D / 'metrics.json').write_text(json.dumps(out, indent=1))

# A short table: the reference-framed view's ratios per style, and the median ink contrast per style.
print('reference', json.dumps(out['reference']['ratios'] if out['reference'] else None))
for f in out['frames']:
    if f.get('name') == 'reference':
        print(f"{f['profile']:7} {f['style']:9}", json.dumps(f['ratios']))
# The room's range under each look: how much a dim takes from the wall, and the pool's colour
# when the light cools (it must cool at least as far as before).
rng = {}
for f in out['frames']:
    if f.get('name') in ('reference', 'cool', 'dim') and f.get('places'):
        rng.setdefault((f['profile'], f['style']), {})[f['name']] = f['places']
out['range'] = {}
for (p, s), v in rng.items():
    r = {}
    if 'reference' in v and 'dim' in v and v['reference'].get('backWall') and v['dim'].get('backWall'):
        r['dim backWall drop'] = round(1 - v['dim']['backWall']['luma'] / v['reference']['backWall']['luma'], 3)
        if v['dim'].get('floorPool'):
            # The dim should quote the chair alone: the pool holds, the wall goes (high pool/wall).
            r['dim pool/backWall'] = round(v['dim']['floorPool']['luma'] / v['dim']['backWall']['luma'], 2)
    for n in ('reference', 'cool'):
        pool = v.get(n, {}).get('floorPool')
        if pool:
            r[f'{n} pool R/B'] = round(pool['rgb'][0] / max(1, pool['rgb'][2]), 3)
    out['range'][f'{p} {s}'] = r
# Pairs that must match: a moved chair's frame and the same with the shadow forced to redraw (a
# stale shadow differs), and the room before and after losing the GL context.
out['pairs'] = {}
for f in data['frames']:
    for a, b in (('chair-moved', 'chair-moved-redrawn'), ('ctx-before', 'ctx-after')):
        if f.get('name') == a:
            g = next((x for x in data['frames'] if x.get('name') == b and x['profile'] == f['profile'] and x['style'] == f['style']), None)
            if g:
                ia = np.asarray(Image.open(D / f['file']).convert('L')).astype(float)
                ib = np.asarray(Image.open(D / g['file']).convert('L')).astype(float)
                out['pairs'][f"{f['profile']} {f['style']} {a}"] = round(float(np.abs(ia - ib).mean()), 2)
for k, v in out['pairs'].items():
    print('pair', k, v, '(stale!)' if v > 3 else '')
for k, v in out['range'].items():
    print('range', k, v)
for k, v in out['invariance'].items():
    print('invariance', k, v)
for f in out['frames']:
    for i in f.get('ink', []):
        if 'crumbs' in i['key'] and f.get('name') in ('reference', 'chair'):
            print(f"crumbs {f['profile']:7} {f['style']:9} {f['name']:9} weber {i['weber']} dE {i['dE']} dC {i['dC']}")
for prof in sorted({f['profile'] for f in out['frames']}):
    for st in sorted({f['style'] for f in out['frames']}):
        w = [i['weber'] for f in out['frames'] if f.get('profile') == prof and f.get('style') == st and f.get('name') in ('reference', 'north-writing', 'east', 'west') for i in f.get('ink', [])]
        if w:
            print(f'ink {prof:7} {st:9} median weber {np.median(w):.3f} (n={len(w)})')
