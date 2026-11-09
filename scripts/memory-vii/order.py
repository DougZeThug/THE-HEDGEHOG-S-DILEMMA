"""Memory VII in the room: the wall's art round the film (docs/shadows.md).

    python3 scripts/memory-vii/order.py FILM.mp4 OUT_DIR

Writes, into OUT_DIR (public/memories/shadows/film/):
  order.webp          when the shade reaches each point of the wall (G; R the same), read by
                      `window.reveal` over the film's first frame (src/world/MemoryWindow.ts):
                      0 first, 1 last. It spreads out from the chair's shadow, which the room's
                      lamp throws up the patch's middle from its foot (src/world/Lighting.ts:
                      aimed a little under the patch's centre), a soft low front reaching the
                      patch's corners last; going out, the same map backwards: it drains back
                      into the chair's shadow (the skeptic's review, 2026-11-09). Its darkness
                      comes as `layer:scene.opacity` rises, all together, as dusk does: a front
                      of full shade crossing bright plaster read as damp.
  scene.webp, @low    the film's held embrace (its poster: the still the wall keeps if the film
                      can't be had), from FILM (render.py --room).

The clocks below are the timeline's (`window.sketch` and `window.reveal`, src/memory/defs.ts
SHADOWS): tests/memory-defs.test.ts holds the three of them together.
"""
import json, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image

DRAWN = (1.0, 4.0, 'linear')
COLOURED = (1.0, 4.0, 'linear')

W, H = 1024, 576            # the map (16:9, as the film and the patch of wall: 3.2 x 1.8 m)
PW, PH = 3.2, 1.8           # the patch, metres
POSTER_AT = 14.6            # the embrace, held (render.py: GAP at its least, both arms up)


def noise(w, h, cells, seed):
    rng = np.random.default_rng(seed)
    g = rng.random((cells[1] + 1, cells[0] + 1)).astype(np.float32)
    return np.asarray(Image.fromarray(g, mode="F").resize((w, h), Image.BICUBIC), dtype=np.float32)


def order_map():
    yy, xx = (np.mgrid[0:H, 0:W].astype(np.float32) + 0.5) / np.array([H, W], np.float32)[:, None, None]
    # The chair's shadow: up the middle, from the patch's foot to a little under its centre (m).
    x = (xx - 0.5) * PW
    up = (1.0 - yy) * PH
    d = np.hypot(x, np.maximum(up - 0.65 * PH, 0.0))
    # A soft front, a little uneven: low frequencies only.
    d = d + (noise(W, H, (4, 3), 7) - 0.5) * 0.25 + (noise(W, H, (9, 5), 11) - 0.5) * 0.06
    d = np.clip(d, 0.0, None)
    g = np.clip(d / np.percentile(d, 99.5), 0.0, 1.0)
    # (The shader takes the colour's front as g ± 0.08: kept inside 0.04..0.96 so the first and
    # last of it are inside the clock, not before it or after.)
    g = 0.04 + 0.92 * g
    v = (g * 255 + 0.5).astype(np.uint8)
    return np.dstack([v, v, np.zeros_like(v)])


def poster(film, out):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(POSTER_AT), "-i", film, "-frames:v", "1",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], check=True, capture_output=True).stdout
    im = Image.frombytes("RGB", (1920, 1080), raw)
    im.save(out / "scene.webp", quality=88, method=6)
    im.resize((1280, 720), Image.LANCZOS).save(out / "scene@low.webp", quality=84, method=6)


def main():
    film, out = sys.argv[1], Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    Image.fromarray(order_map(), "RGB").save(out / "order.webp", lossless=True)
    poster(film, out)
    man = out.parent / "manifest.json"
    if man.exists():
        m = json.loads(man.read_text())
        m["living"]["film"]["orderClocks"] = {"drawn": list(DRAWN), "coloured": list(COLOURED), "lag": 0.0}
        man.write_text(json.dumps(m, indent=2) + "\n")


if __name__ == "__main__":
    main()
