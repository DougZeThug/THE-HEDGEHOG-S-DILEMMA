"""The woodland's afternoon as one film (2026-10-24): the four selected shots, in order, at their own
24 fps and full selected lengths, precomposed into the painting's own frame so the room plays it as it
plays Almost and Things (src/memory/living/FilmScene.ts): the wall's pencil, order map and colour,
the way in and the way out, all registered on the painting, show the film's first frame on the way
in and its last on the way out.

    python3 scripts/woodland-film/assemble.py            (writes public/memories/woodland/afternoon/film*)
    python3 scripts/woodland-film/assemble.py --check    (registration and colour fits only)

The shots (references/woodland/film/, with the brief and timeline.json; hashes checked):
  01 the opening wide, both resting          132 frames   memory  9.50-15.00
  02 the two of them close, her glance       246 frames          15.00-25.25
  03 the wide again, she already toward him  126 frames          25.25-30.50
  04 the same clearing at dusk, empty        204 frames          30.50-39.00 (the hard cut on frame 504)

The frame. Each wide is the painting as the room showed it immersed: zoomed 1.06 about its middle
(coverQuad's overscan), measured by ECC on edges (a uniform scale and a shift, no rotation, no warp;
written to film.json). So the film's frame is made the painting's: each shot at its own pixels, 1:1,
placed where it registers, and round it, the 3% of the painting it does not show (registered, its
colour fitted to the shot's at the seam; the shot opaque to its own edge, carried 4 px out into it). Immersed, no screen shape shows that
border (the view is at most 1/1.06 of the painting); on the wall it is inside the window's ragged
edge. The close-up has no painting round it: its border is its own edge, reflected and blurred.

Nothing is retimed, looped, reversed, interpolated, sharpened, upscaled or warped. The clips are
untagged H.264 made with BT.601 (closest to the room's own recording when decoded so; a browser
would take untagged HD as BT.709 and shift the colour): decoded as BT.601, written tagged BT.709.
"""
import hashlib
import json
import os
import subprocess
import sys

import cv2
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'references', 'woodland', 'film')
ART = os.path.join(ROOT, 'public', 'memories', 'woodland')
OUT = os.path.join(ART, 'afternoon')
FPS = 24
FEATHER = 4
# A keyframe where each shot begins and at most every 2 s inside one (a seek decodes at most 48
# frames; the footage moves everywhere, so a keyframe in it doesn't pulse a still).
KEY_EVERY = 48
TAGS = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv']


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def decode(path, w=1280, h=720):
    """Every frame, BGR uint8, decoded with the matrix it was made with (BT.601, limited range)."""
    cmd = ['ffmpeg', '-v', 'error', '-i', path, '-vf', 'scale=in_color_matrix=bt601:in_range=tv:out_range=pc,format=bgr24',
           '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-']
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    n = len(raw) // (w * h * 3)
    return np.frombuffer(raw, np.uint8)[: n * w * h * 3].reshape(n, h, w, 3)


def edges(img):
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
    g = cv2.GaussianBlur(g, (0, 0), 2)
    return cv2.magnitude(cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1))


def register(painting, frame):
    """The affine taking a shot's pixel (x, y, 1) to the painting's: ECC on edges, coarse to fine."""
    ph, pw = painting.shape[:2]
    fh, fw = frame.shape[:2]
    # (The room's overscan about the middle as the first guess.)
    s = 1 / 1.06
    W = np.array([[pw / fw * s, 0, pw * (1 - s) / 2], [0, ph / fh * s, ph * (1 - s) / 2]], np.float32)
    ep, ef = edges(painting), edges(frame)
    for k in (0.25, 0.5, 1.0):
        tf = cv2.resize(ef, None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
        ip = cv2.resize(ep, None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
        Wk = W.copy()
        Wk[:, 2] *= k
        _, Wk = cv2.findTransformECC(tf, ip, Wk, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 400, 1e-7), None, 5)
        W = Wk.copy()
        W[:, 2] /= k
    return W.astype(np.float64)


def canvas_of(W, pw, ph):
    """The film's frame: the painting's rectangle in a shot's pixels (whole, even), and where the shot sits in it."""
    inv = cv2.invertAffineTransform(W)
    tl = inv @ np.array([0, 0, 1.0])
    br = inv @ np.array([pw, ph, 1.0])
    ox, oy = int(round(-tl[0])), int(round(-tl[1]))
    cw = int(round((br[0] - tl[0]) / 2)) * 2
    ch = int(round((br[1] - tl[1]) / 2)) * 2
    return ox, oy, cw, ch, tl, br


def backing(painting, W, ox, oy, cw, ch):
    """The painting drawn into the film's frame (canvas pixel -> shot pixel -> painting pixel)."""
    A = np.vstack([W, [0, 0, 1]]) @ np.array([[1, 0, -ox], [0, 1, -oy], [0, 0, 1.0]])
    return cv2.warpAffine(painting, A[:2], (cw, ch), flags=cv2.INTER_LANCZOS4 | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)


def colour_fit(back, frame, ox, oy, band=120):
    """Per channel gain and offset taking the painting's colour to the shot's, fitted on the band
    inside the shot's edge (blurred: colour, not detail). Returns (gain, offset) per BGR channel."""
    h, w = frame.shape[:2]
    m = np.zeros((h, w), bool)
    m[:band, :] = m[-band:, :] = True
    m[:, :band] = m[:, -band:] = True
    m[:FEATHER * 2, :] = m[-FEATHER * 2:, :] = m[:, :FEATHER * 2] = m[:, -FEATHER * 2:] = False
    a = cv2.GaussianBlur(back[oy:oy + h, ox:ox + w].astype(np.float32), (0, 0), 6)[m]
    b = cv2.GaussianBlur(frame.astype(np.float32), (0, 0), 6)[m]
    fit = []
    for c in range(3):
        g, o = np.polyfit(a[:, c], b[:, c], 1)
        fit.append((float(g), float(o)))
    return fit


def apply_fit(img, fit):
    out = img.astype(np.float32).copy()
    for c, (g, o) in enumerate(fit):
        out[..., c] = out[..., c] * g + o
    return np.clip(out, 0, 255)


def feather(ox, oy, cw, ch, w=1280, h=720):
    """The shot's own reach in the film's frame: 1 over all of it (opaque to its edge: at 16:9 the
    immersed view reaches to within half a pixel of its top and bottom, and moving footage must not
    blend with a still there), falling to 0 over FEATHER pixels outside it, where its edge, carried
    out, meets the painting."""
    ys, xs = np.arange(ch)[:, None], np.arange(cw)[None, :]
    dy = np.maximum(np.maximum(oy - ys, ys - (oy + h - 1)), 0)
    dx = np.maximum(np.maximum(ox - xs, xs - (ox + w - 1)), 0)
    d = np.hypot(dx, dy)
    return np.clip(1 - d / FEATHER, 0, 1).astype(np.float32)[..., None]


def carried_out(frame, ox, oy, cw, ch):
    """A frame's edge carried out to the film's frame (its outermost pixels, repeated)."""
    h, w = frame.shape[:2]
    return cv2.copyMakeBorder(frame, oy, ch - h - oy, ox, cw - w - ox, cv2.BORDER_REPLICATE).astype(np.float32)


def own_border(frame, ox, oy, cw, ch):
    """A frame's own edge reflected out to the film's frame and blurred (the close-up: never seen)."""
    h, w = frame.shape[:2]
    big = cv2.copyMakeBorder(frame, oy, ch - h - oy, ox, cw - w - ox, cv2.BORDER_REFLECT_101)
    return cv2.GaussianBlur(big, (0, 0), 12).astype(np.float32)


def main():
    check = '--check' in sys.argv
    t = json.load(open(os.path.join(SRC, 'timeline.json')))
    clips = []
    for c in t['clips']:
        path = os.path.join(SRC, c['file'])
        got = sha256(path)
        # (The first 16 hex digits are kept: the whole reads as a key to the credentials scan.)
        if not got.startswith(c['sha256']) or len(c['sha256']) < 16:
            raise SystemExit(f'{c["file"]}: sha256 {got} is not the selected take ({c["sha256"]})')
        frames = decode(path)
        if len(frames) != c['frames']:
            raise SystemExit(f'{c["file"]}: {len(frames)} frames decoded, {c["frames"]} selected')
        clips.append((c, frames))
        print(f'  {c["file"]}: {len(frames)} frames, sha256 ok')
    day = cv2.imread(os.path.join(ART, 'afternoon', 'plate.webp'), cv2.IMREAD_COLOR)
    dusk = cv2.imread(os.path.join(ART, 'afternoon', 'after.webp'), cv2.IMREAD_COLOR)
    ph, pw = day.shape[:2]
    first, first_dusk = clips[0][1][0], clips[3][1][0]
    W_day = register(day, first)
    W_dusk = register(dusk, first_dusk)
    ox, oy, cw, ch, tl, br = canvas_of(W_day, pw, ph)
    rec = {
        'size': [cw, ch], 'shot_at': [ox, oy], 'shot_size': [1280, 720], 'fps': FPS,
        'painting': [pw, ph],
        'painting_in_shot_px': {'top_left': [round(float(tl[0]), 3), round(float(tl[1]), 3)], 'bottom_right': [round(float(br[0]), 3), round(float(br[1]), 3)]},
        'register_day': np.round(W_day, 6).tolist(), 'register_dusk': np.round(W_dusk, 6).tolist(),
    }
    # The dusk shot sits where the day's does (they differ by under a pixel and a half, a drawing's
    # variation, not a framing: across the cut the trunk, the log and the horizon move different ways).
    d_inv = cv2.invertAffineTransform(W_dusk) @ np.array([0, 0, 1.0])
    rec['dusk_offset_vs_day_px'] = [round(float(-d_inv[0] - ox), 3), round(float(-d_inv[1] - oy), 3)]
    back_day = backing(day, W_day, ox, oy, cw, ch)
    # (Its own registration: the dusk painting sits 2-3 px from the day's against the shots.)
    back_dusk = backing(dusk, W_dusk, ox, oy, cw, ch)
    fit_day = colour_fit(back_day, first, ox, oy)
    fit_dusk = colour_fit(back_dusk, first_dusk, ox, oy)
    rec['colour_fit_bgr'] = {'day': fit_day, 'dusk': fit_dusk}
    back_day = apply_fit(back_day, fit_day)
    back_dusk = apply_fit(back_dusk, fit_dusk)
    # Seam error after the fit (mean abs, 0-255, the shot's outer 12-24 px against the backing there).
    def seam(back, frame):
        h, w = frame.shape[:2]
        m = np.zeros((h, w), bool)
        m[12:24, 12:-12] = m[-24:-12, 12:-12] = True
        m[12:-12, 12:24] = m[12:-12, -24:-12] = True
        a = cv2.GaussianBlur(back[oy:oy + h, ox:ox + w], (0, 0), 4)[m]
        b = cv2.GaussianBlur(frame.astype(np.float32), (0, 0), 4)[m]
        return round(float(np.abs(a - b).mean()), 2)
    rec['seam_mean_abs'] = {'day_first_frame': seam(back_day, first), 'dusk_first_frame': seam(back_dusk, first_dusk), 'dusk_last_frame': seam(back_dusk, clips[3][1][-1])}
    print(json.dumps(rec, indent=1))
    if check:
        return
    alpha = feather(ox, oy, cw, ch)
    shots, keys, n = [], [], 0
    for c, frames in clips:
        shots.append({'file': c['file'], 'from_frame': n, 'frames': len(frames), 'sha256': c['sha256'][:16]})
        keys += list(range(n, n + len(frames), KEY_EVERY))
        n += len(frames)
    rec['shots'] = shots
    rec['frames'] = n
    rec['keyframes'] = keys
    procs = encoders(cw, ch, keys)
    stills = {}
    k = 0
    for i, (c, frames) in enumerate(clips):
        for j, f in enumerate(frames):
            under = own_border(f, ox, oy, cw, ch) if i == 1 else (back_dusk if i == 3 else back_day)
            out = under * (1 - alpha) + carried_out(f, ox, oy, cw, ch) * alpha
            out[oy:oy + 720, ox:ox + 1280] = f
            out = np.clip(out + 0.5, 0, 255).astype(np.uint8)
            if k in (0, n - 1, 503, 504):
                stills[k] = out
            for p in procs:
                p.stdin.write(out.tobytes())
            k += 1
    for p in procs:
        p.stdin.close()
    for p in procs:
        if p.wait():
            raise SystemExit('an encoder failed')
    os.makedirs(os.path.join(ROOT, 'test-output', 'woodland-film'), exist_ok=True)
    for f, img in stills.items():
        cv2.imwrite(os.path.join(ROOT, 'test-output', 'woodland-film', f'frame-{f:04d}.png'), img)
    for name in sorted(os.listdir(OUT)):
        if name.startswith('film'):
            rec.setdefault('files', {})[name] = {'bytes': os.path.getsize(os.path.join(OUT, name)), 'sha256': sha256(os.path.join(OUT, name))[:16]}
    json.dump(rec, open(os.path.join(SRC, 'film.json'), 'w'), indent=2)
    print(f'wrote {n} frames, {cw}x{ch}; film.json')


def encoders(w, h, keys):
    """The room's four copies (FilmScene plays whichever the browser can): full, and @low at three
    quarters (phones: the old painting's phone set was 1280 wide). Keyframes on `keys` only, each
    asked for half a frame early so it lands on its own frame (scripts/almost/assemble.py)."""
    kf = ['-g', '100000', '-force_key_frames', ','.join(f'{max(0.0, (f - 0.5) / FPS):.4f}' for f in keys)]
    out = []
    lw, lh = (round(w * 0.75 / 2) * 2, round(h * 0.75 / 2) * 2)
    for suffix, (ww, hh), crf264, crf9 in (('', (w, h), '20', '28'), ('@low', (lw, lh), '22', '31')):
        scale = f'scale={ww}:{hh}:flags=lanczos:in_range=pc:out_color_matrix=bt709:out_range=tv,format=yuv420p'
        base = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{w}x{h}', '-r', str(FPS), '-i', '-',
                '-vf', scale, '-an', '-r', str(FPS), *kf, *TAGS]
        vp9 = base + ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', crf9, '-row-mt', '1', '-tile-columns', '2', '-deadline', 'good', '-cpu-used', '2',
                      os.path.join(OUT, f'film{suffix}.webm')]
        h264 = base + ['-c:v', 'libx264', '-crf', crf264, '-preset', 'slow', '-profile:v', 'high', '-level', '4.0', '-sc_threshold', '0',
                       '-movflags', '+faststart', os.path.join(OUT, f'film{suffix}.mp4')]
        out += [subprocess.Popen(vp9, stdin=subprocess.PIPE), subprocess.Popen(h264, stdin=subprocess.PIPE)]
    return out


if __name__ == '__main__':
    main()
