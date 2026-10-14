"""Turn Poly Haven (CC0) material scans into the room's detail maps.

    pip install pillow numpy
    python3 scripts/scan-detail.py <dir of downloaded 1k maps>

The room's colour, warmth and marks are its own (baked in `src/world/surfaces.ts` and measured
against the artist's reference). From a scan it takes only what a code-painted canvas can't hold:
- `<name>-detail.jpg`: the scan's luminance, high-passed (nothing broader than ~15 cm, so the
  bake's own mottle carries the large scale and the tile never shows), as a z-score:
  128 + 40·z, clipped at ±3σ, at the size the bake can hold. The bake multiplies its colour by
  1 + amp·z; detail finer than the bake's texels is the normal map's.
- `<name>-normal.jpg` / `-normal-512.jpg`: the scan's OpenGL normal map, high-passed above
  ~20 cm (a glossy floor would otherwise show the tile in its sheen), at 1K and 512 (phones).
- `<name>-rough.jpg` (floor only): roughness, high-passed, as a z-score like the detail.

Every filter wraps around, so the outputs tile as the scans do. Inputs are the files fetched as
`<id>_<Diffuse|nor_gl|Rough>_1k.jpg` (the Poly Haven API's names).
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path(sys.argv[1])
OUT = Path(__file__).resolve().parent.parent / 'public' / 'textures' / 'scan'
OUT.mkdir(parents=True, exist_ok=True)

# id, our name, the scan's real width (m), whether its roughness is used, and the detail map's
# size: what the bake it goes into can hold (200 px/m for the room; the chair's atlas is denser).
MATERIALS = [
    ('white_plaster_02', 'plaster', 1.0, False, 256),
    ('concrete_floor_worn_001', 'concrete', 3.0, True, 640),
    ('fine_grained_wood', 'wood-grain', 0.6, False, 384),
    ('wood_table_worn', 'wood-seat', 0.55, False, 384),
]
DETAIL_CUT_M = 0.15
NORMAL_CUT_M = 0.20


def blur_wrap(a: np.ndarray, sigma_px: float) -> np.ndarray:
    """Gaussian blur on a torus (the scans tile), via the FFT."""
    h, w = a.shape[:2]
    fy = np.fft.fftfreq(h)[:, None]
    fx = np.fft.fftfreq(w)[None, :]
    g = np.exp(-2 * (np.pi * sigma_px) ** 2 * (fx ** 2 + fy ** 2))
    if a.ndim == 2:
        return np.real(np.fft.ifft2(np.fft.fft2(a) * g))
    return np.stack([np.real(np.fft.ifft2(np.fft.fft2(a[..., c]) * g)) for c in range(a.shape[2])], -1)


def zscore_jpg(hp: np.ndarray, path: Path, size: int) -> float:
    sd = float(hp.std()) or 1.0
    z = np.clip(hp / sd, -3, 3)
    img = Image.fromarray(np.round(128 + 40 * z).astype(np.uint8), 'L')
    img.resize((size, size), Image.LANCZOS).save(path, quality=90, optimize=True)
    return sd


def load(id_: str, kind: str) -> np.ndarray:
    return np.asarray(Image.open(SRC / f'{id_}_{kind}_1k.jpg').convert('RGB')).astype(np.float64)


manifest = {}
for id_, name, metres, rough, size in MATERIALS:
    rgb = load(id_, 'Diffuse')
    px_per_m = rgb.shape[1] / metres
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722])
    # High-pass relative to the local mean: contrast, not brightness.
    low = blur_wrap(lum, DETAIL_CUT_M * px_per_m / 2.0)
    sd = zscore_jpg((lum - low) / np.maximum(low, 1.0), OUT / f'{name}-detail.jpg', size)
    entry = {'source': id_, 'metres': metres, 'detailStd': round(sd, 5), 'detailSize': size}

    n = load(id_, 'nor_gl') / 255.0 * 2 - 1
    xy = n[..., :2] - blur_wrap(n[..., :2], NORMAL_CUT_M * px_per_m / 2.0)
    z = np.sqrt(np.clip(1 - (xy ** 2).sum(-1), 0.04, 1))
    nn = np.concatenate([xy, z[..., None]], -1)
    nn /= np.linalg.norm(nn, axis=-1, keepdims=True)
    img = Image.fromarray(np.round((nn * 0.5 + 0.5) * 255).astype(np.uint8), 'RGB')
    img.save(OUT / f'{name}-normal.jpg', quality=88, subsampling=0, optimize=True)
    img.resize((512, 512), Image.LANCZOS).save(OUT / f'{name}-normal-512.jpg', quality=88, subsampling=0, optimize=True)

    if rough:
        r = load(id_, 'Rough')[..., 0] / 255.0
        hp = r - blur_wrap(r, DETAIL_CUT_M * px_per_m / 2.0)
        entry['roughStd'] = round(zscore_jpg(hp, OUT / f'{name}-rough.jpg', size), 5)
    manifest[name] = entry

(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=1) + '\n')
for f in sorted(OUT.iterdir()):
    print(f'{f.name:28} {f.stat().st_size / 1024:7.0f} KB')
print(json.dumps(manifest))
