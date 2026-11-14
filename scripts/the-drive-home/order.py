"""The Drive Home in the room: the wall's art round the film (docs/drive-home.md).

    python3 scripts/the-drive-home/order.py FILM.mp4 OUT_DIR

Writes, into OUT_DIR (public/memories/drive/film/):
  order.webp          G (R the same): when the dusk reaches each point of the patch, read by
                      `window.reveal` over the film's first frame (src/world/MemoryWindow.ts): a soft
                      dusk out from the middle, the corners last, as the room's light goes down. Its
                      darkness comes as `layer:scene.opacity` rises, all together.
                      B: what the passing streetlights leave found, read by `window.found`: the two
                      faces first, then their hands and shoulders, then the car round them (the
                      cinematic director's and the skeptic's reviews, 2026-11-09: faces first).
  scene.webp, @low    the poster (the still the wall keeps if the film can't be had): the two of
                      them as the first streetlight crosses them, from FILM (film.py room).

The clocks below are the timeline's (`window.sketch` and `window.reveal`, src/memory/memories/drive.ts DRIVE):
tests/memory-defs.test.ts holds them together.
"""
import json, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image

DRAWN = (0.6, 3.0, 'linear')
COLOURED = (0.6, 3.0, 'linear')

W, H = 1024, 576            # the map (16:9, as the film and the patch of wall: 3.2 x 1.8 m)
PW, PH = 3.2, 1.8           # the patch, metres
POSTER_AT = 1.95            # the film's first lamp across them (film 7.8 s; the room's cut begins at 6.0)

# Where the two faces are in the room cut's first frame (u, v from the top left; radii as u, v):
# the driver on the left, in the dark; the passenger on the right, at his window.
FACES = [((0.265, 0.45), (0.085, 0.17)), ((0.715, 0.30), (0.08, 0.17))]
# Then their hands between them, and their shoulders.
NEXT = [((0.44, 0.74), (0.09, 0.16)), ((0.24, 0.80), (0.16, 0.22)), ((0.72, 0.70), (0.17, 0.30))]


def noise(w, h, cells, seed):
    rng = np.random.default_rng(seed)
    g = rng.random((cells[1] + 1, cells[0] + 1)).astype(np.float32)
    return np.asarray(Image.fromarray(g, mode="F").resize((w, h), Image.BICUBIC), dtype=np.float32)


def blobs(xx, yy, spots):
    """0 at a spot's centre, 1 at its rim and beyond (the nearest spot)."""
    d = np.full(xx.shape, 9.0, np.float32)
    for (u, v), (ru, rv) in spots:
        d = np.minimum(d, np.hypot((xx - u) / ru, (yy - v) / rv))
    return d


def order_map():
    yy, xx = (np.mgrid[0:H, 0:W].astype(np.float32) + 0.5) / np.array([H, W], np.float32)[:, None, None]
    # The dusk: out from the middle, the corners last, a soft uneven front (low frequencies only).
    d = np.hypot((xx - 0.5) * PW, (yy - 0.5) * PH)
    d = d + (noise(W, H, (4, 3), 7) - 0.5) * 0.25 + (noise(W, H, (9, 5), 11) - 0.5) * 0.06
    g = np.clip(d / np.percentile(d, 99.5), 0.0, 1.0)
    # (The shader takes the front as g +- 0.08: kept inside 0.04..0.96, inside the clock.)
    g = 0.04 + 0.92 * g
    # Found: the faces (0..0.3), their hands and shoulders (0.3..0.65), the rest by distance from
    # them (0.65..0.96), softened so no ring shows.
    f = blobs(xx, yy, FACES)
    n = blobs(xx, yy, NEXT)
    b = np.where(f < 1.0, 0.3 * f, np.where(n < 1.0, 0.3 + 0.35 * n, 0.65 + 0.31 * np.clip((np.minimum(f, n) - 1.0) / 2.5, 0, 1)))
    b = b + (noise(W, H, (12, 7), 23) - 0.5) * 0.04
    b = np.clip(b, 0.04, 0.96)
    gv = (g * 255 + 0.5).astype(np.uint8)
    bv = (b * 255 + 0.5).astype(np.uint8)
    return np.dstack([gv, gv, bv])


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
