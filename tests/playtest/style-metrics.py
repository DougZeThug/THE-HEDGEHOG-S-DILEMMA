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
    'floorPool': (640, 880),
    'floorFront': (720, 1050),
    'floorEdge': (120, 900),
    'sideWall': (130, 500),
    'seat': (730, 745),
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
    if g('floorPool') and g('floorFront'):
        out['floorFront/floorPool'] = round(g('floorFront') / g('floorPool'), 3)
    rgb = p.get('backWall', {}).get('rgb')
    if rgb:
        out['backWall R/B'] = round(rgb[0] / max(1, rgb[2]), 3)
    return out


def ink_contrast(img, box):
    x0, y0, x1, y1 = box
    a = img[y0:y1, x0:x1].reshape(-1, 3)
    if len(a) < 200:
        return None
    L = a @ np.array([0.2126, 0.7152, 0.0722])
    wall = float(np.percentile(L, 60))
    ink = float(np.percentile(L, 2))
    return {'wall': round(wall, 1), 'ink': round(ink, 1), 'weber': round((wall - ink) / max(1.0, wall), 3)}


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

(D / 'metrics.json').write_text(json.dumps(out, indent=1))

# A short table: the reference-framed view's ratios per style, and the median ink contrast per style.
print('reference', json.dumps(out['reference']['ratios'] if out['reference'] else None))
for f in out['frames']:
    if f.get('name') == 'reference':
        print(f"{f['profile']:7} {f['style']:9}", json.dumps(f['ratios']))
for prof in sorted({f['profile'] for f in out['frames']}):
    for st in sorted({f['style'] for f in out['frames']}):
        w = [i['weber'] for f in out['frames'] if f.get('profile') == prof and f.get('style') == st and f.get('name') in ('reference', 'north-writing', 'east', 'west') for i in f.get('ink', [])]
        if w:
            print(f'ink {prof:7} {st:9} median weber {np.median(w):.3f} (n={len(w)})')
