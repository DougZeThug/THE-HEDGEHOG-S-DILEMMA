"""The Drive Home, rotoscoped: traces public-domain live action into flat painted shapes and ink.

How a frame is drawn (one drawing every two frames, 12 a second, like Rotoshop):
  1. the source frame is denoised over its neighbours (film grain is not drawing) and cropped;
  2. MediaPipe's multiclass segmenter separates hair, face, hands, clothes and the rest, and each
     keeps its own colours (skin is warm, coats are dark, the car is blue-black); in a two-shot a
     watershed from each face decides whose coat is whose;
  3. inside each class the real light is cut into a few flat value shapes; the cuts follow the
     actor's own face, so the light shapes are traced, not invented;
  4. the shapes are held from one drawing to the next by warping the last drawing with optical
     flow and blending, and crumbs are absorbed, so only a gentle boil is left;
  5. ink: a contour round each figure, the strongest dark valleys inside the face, and the
     features a painter always draws (brows, upper lids, nostrils, the line between the lips),
     placed on MediaPipe face landmarks and redrawn with a small wobble every drawing;
  6. light can be added before the cut (a passing street lamp, the indicator), so it moves over
     the traced forms the way real light does.
The shots (sources, crops, timing, light) are in shots.py; the palettes in looks.py.
"""
import os
import atexit
import cv2
import numpy as np

cv2.setNumThreads(1)
HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.environ.get("DRIVE_HOME_MODELS", os.path.join(HERE, "models"))
W, H = 1920, 1080          # finished drawing
WW, WH = 960, 540          # working size for the shapes (probabilities are upsampled before the cut)
CLASSES = ("ground", "hair", "face", "hands", "cloth")

_mp = {}


def _tasks():
    if not _mp:
        import mediapipe as mp
        from mediapipe.tasks import python as mpt
        from mediapipe.tasks.python import vision as V
        _mp["mp"] = mp
        _mp["seg"] = V.ImageSegmenter.create_from_options(V.ImageSegmenterOptions(
            base_options=mpt.BaseOptions(model_asset_path=MODELS + "/selfie_multiclass_256x256.tflite"),
            output_confidence_masks=True))
        _mp["face"] = V.FaceLandmarker.create_from_options(V.FaceLandmarkerOptions(
            base_options=mpt.BaseOptions(model_asset_path=MODELS + "/face_landmarker.task"),
            num_faces=3, min_face_detection_confidence=0.25, min_face_presence_confidence=0.25))
    return _mp


@atexit.register
def _close():
    # close MediaPipe before the interpreter tears down, or it complains on the way out
    for k in ("seg", "face"):
        if k in _mp:
            try:
                _mp[k].close()
            except Exception:
                pass
    _mp.clear()


def segment(rgb):
    """Confidence masks (6, h, w): background, hair, body skin, face skin, clothes, other."""
    m = _tasks()
    r = m["seg"].segment(m["mp"].Image(image_format=m["mp"].ImageFormat.SRGB, data=np.ascontiguousarray(rgb)))
    return np.stack([c.numpy_view().astype(np.float32).squeeze() for c in r.confidence_masks])


def faces(rgb):
    """Face landmarks as arrays of (x, y) in 0..1, one per face."""
    m = _tasks()
    r = m["face"].detect(m["mp"].Image(image_format=m["mp"].ImageFormat.SRGB, data=np.ascontiguousarray(rgb)))
    return [np.array([(p.x, p.y, p.z) for p in lm], np.float32) for lm in r.face_landmarks]


def hexrgb(s):
    s = s.lstrip("#")
    return [int(s[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


class Source:
    """Reads source frames by time, cropped and denoised over a small temporal window."""

    def __init__(self, path, crop=None, gray=True, flip=False):
        self.cap = cv2.VideoCapture(path)
        self.fps = self.cap.get(cv2.CAP_PROP_FPS)
        self.n = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.crop = crop
        self.gray = gray
        self.flip = flip
        self.cache = {}
        self.pos = -1

    def raw(self, i):
        i = max(0, min(self.n - 1, i))
        if i not in self.cache:
            if i != self.pos + 1:
                self.cap.set(cv2.CAP_PROP_POS_FRAMES, i)
            ok, f = self.cap.read()
            self.pos = i
            if not ok:
                f = self.cache.get(i - 1)
            self.cache[i] = f
            while len(self.cache) > 24:  # forget the frame farthest from here (shots also run backwards)
                self.cache.pop(max(self.cache, key=lambda j: abs(j - i)))
        return self.cache[i]

    def frame(self, t, denoise=5.0):
        i = int(round(t * self.fps))
        fr = [self.raw(j) for j in range(i - 2, i + 3)]
        if self.crop:
            x, y, w, h = self.crop
            fr = [f[y:y + h, x:x + w] for f in fr]
        if self.flip:
            fr = [f[:, ::-1].copy() for f in fr]
        if denoise > 0:
            if self.gray:
                g = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY) for f in fr]
                d = cv2.fastNlMeansDenoisingMulti(g, 2, 5, None, denoise, 5, 15)
                return cv2.cvtColor(d, cv2.COLOR_GRAY2BGR)
            return cv2.fastNlMeansDenoisingColoredMulti(fr, 2, 5, None, denoise, denoise, 5, 15)
        return fr[2]


FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377,
             152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
EYES = [([33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7], 468),
        ([263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249], 473)]

# landmark polylines a painter draws, with stroke weight (relative to face width)
FEATURES = [
    ([46, 53, 52, 65, 55], 0.028, 0.8),                         # brow
    ([276, 283, 282, 295, 285], 0.028, 0.8),
    ([33, 246, 161, 160, 159, 158, 157, 173, 133], 0.013, 0.95),  # upper lid
    ([263, 466, 388, 387, 386, 385, 384, 398, 362], 0.013, 0.95),
    ([78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308], 0.011, 0.8),  # between the lips
    ([64, 98, 97, 2], 0.009, 0.6),                              # nostrils
    ([2, 326, 327, 294], 0.009, 0.6),
]


class Tracer:
    """One shot's tracer. `look` holds the class palettes and the value cuts."""

    def __init__(self, look, seed=1):
        self.look = look
        self.rng = np.random.default_rng(seed)
        self.prev_prob = None
        self.prev_gray = None
        self.prev_cls = None
        self.prev_faces = []
        self.n = 0

    def find_faces(self, img):
        """Face landmarks for this drawing: in wide shots also looked for half a frame at a time, one
        per head, and a face lost for a drawing or two is kept where it was."""
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        found = []
        if self.look.get("tiles"):
            h, w = img.shape[:2]
            for x0 in (0, w - h):
                for lm in faces(np.ascontiguousarray(rgb[:, x0:x0 + h])):
                    lm = lm.copy()
                    lm[:, 0] = (x0 + lm[:, 0] * h) / w
                    found.append(lm)
        found += faces(rgb)

        def centre(lm):
            return lm[:468, :2].mean(0), np.linalg.norm(lm[454, :2] - lm[234, :2])

        def near(lm, others):
            c, fw = centre(lm)
            return any(np.linalg.norm(c - centre(o)[0]) < 0.5 * fw for o in others)
        out = []
        for lm in found:
            if not near(lm, out):
                out.append(lm)
        kept = [(lm, age + 1) for lm, age in self.prev_faces if age < 3 and not near(lm, out)]
        self.prev_faces = [(lm, 0) for lm in out] + kept
        return out + [lm for lm, _ in kept]

    # ---- classes -------------------------------------------------------------------------
    def classes(self, img, lms=None):
        """Per-pixel class weights at working size: ground, hair, face, hands, cloth."""
        lk = self.look
        conf = segment(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
        conf = np.stack([cv2.resize(c, (WW, WH), interpolation=cv2.INTER_LINEAR) for c in conf])
        if lk.get("tiles"):
            # in a wide shot a hand is a few dozen pixels to a 256 px segmenter and comes and goes;
            # looked at again half a frame at a time it is found nearly every frame
            acc = np.zeros_like(conf)
            n = np.zeros((WH, WW), np.float32)
            for x0 in (0, WW - WH):
                half = cv2.resize(img[:, x0:x0 + WH], (WW, WH), interpolation=cv2.INTER_LINEAR)
                t = segment(cv2.cvtColor(half, cv2.COLOR_BGR2RGB))
                acc[:, :, x0:x0 + WH] += np.stack([cv2.resize(c, (WH, WH), interpolation=cv2.INTER_LINEAR) for c in t])
                n[:, x0:x0 + WH] += 1
            conf = 0.5 * conf + 0.5 * acc / np.maximum(n, 1)
        if lms is not None:
            # dark hair against a dark cab is ambiguous: hair only grows round a head, and a found face
            # stops at its own outline (the landmarks); the rest of that head is hair
            zero = np.zeros((WH, WW), np.float32)
            head = self.head_prior(lms) if len(lms) else zero
            oval = self.face_oval(lms) if len(lms) else zero
            # a face the landmarker missed is still a face: away from the found heads the segmenter's
            # face stands, and a blob of it gets a head of its own for its hair
            keep = np.clip(oval + (1 - head), 0, 1)
            spill = conf[3] * (1 - keep)
            conf[3] = conf[3] * keep
            heads = np.maximum(head, self.unfound_heads(conf[3], head))
            # skin past the face: above the eyes it is the hairline, below them it is a neck or a hand
            # raised to the mouth, never hair
            low = self.below_eyes(lms) if len(lms) else zero
            conf[1] = (conf[1] + spill * (1 - low)) * heads
            conf[2] = conf[2] + spill * low * head
            conf[0] = conf[0] + spill * (1 - head)
        cls = np.stack([conf[0] * lk.get("ground_bias", 1.0), conf[1] * lk.get("hair_bias", 1.6),
                        conf[3], conf[2] * lk.get("hands_bias", 1.0), conf[4] + conf[5]])
        # the segmenter thinks at 256 px: snap its soft edges to the edges in the picture
        guide = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        cls = np.stack([cv2.ximgproc.guidedFilter(guide, c, lk.get("snap_r", 8), lk.get("snap_eps", 300.0)) for c in cls])
        cls = np.clip(cls, 0, None)
        # masks also hold over time, so a cap or a hand does not flicker between classes
        if self.prev_cls is not None:
            cls = 0.6 * cls + 0.4 * self.prev_cls
        self.prev_cls = cls
        return cls / (cls.sum(0, keepdims=True) + 1e-6)

    def face_oval(self, lms):
        m = np.zeros((WH, WW), np.uint8)
        for lm in lms:
            p = lm[:, :2] * np.array([WW, WH], np.float32)
            fw = np.linalg.norm(p[454] - p[234])
            # the outline plus everything the mesh covers (in three-quarter view the nose and lips
            # stand out past the oval), a little past the edge: the painter's margin
            poly = cv2.convexHull(p[:468]).reshape(-1, 2)
            c = poly.mean(0)
            poly = c + (poly - c) * 1.07
            cv2.fillPoly(m, [np.round(poly).astype(np.int32)], 255)
        return cv2.GaussianBlur(m.astype(np.float32) / 255, (0, 0), 2.0)

    def unfound_heads(self, face, head):
        """Heads round blobs of face skin that no found face covers."""
        m = ((face > 0.5) & (head < 0.3)).astype(np.uint8)
        cnt, _, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
        out = np.zeros((WH, WW), np.float32)
        for i in range(1, cnt):
            x, y, w, h, a = st[i]
            if a < 0.002 * WW * WH:
                continue
            cv2.ellipse(out, (int(x + w / 2), int(y + 0.25 * h)), (int(0.75 * w) + 1, int(0.85 * h) + 1), 0, 0, 360, 1.0, -1)
        return cv2.GaussianBlur(out, (0, 0), 6)

    def below_eyes(self, lms):
        """0..1: how far below the eye line a pixel is, along each face's own up-down axis."""
        ys, xs = np.mgrid[0:WH, 0:WW].astype(np.float32)
        low = np.zeros((WH, WW), np.float32)
        near = np.full((WH, WW), np.inf, np.float32)
        for lm in lms:
            p = lm[:, :2] * np.array([WW, WH], np.float32)
            top, chin = p[10], p[152]
            fh = np.linalg.norm(chin - top) + 1e-6
            axis = (chin - top) / fh
            eye = (p[33] + p[263]) / 2
            u = ((xs - eye[0]) * axis[0] + (ys - eye[1]) * axis[1]) / fh
            # each pixel answers to the nearest face, measured in that face's size
            d = np.hypot(xs - eye[0], ys - eye[1]) / fh
            mine = d < near
            low = np.where(mine, smoothstep(0.05, 0.25, u), low)
            near = np.where(mine, d, near)
        return low

    def head_prior(self, lms):
        ys, xs = np.mgrid[0:WH, 0:WW].astype(np.float32)
        prior = np.zeros((WH, WW), np.float32)
        for lm in lms:
            p = lm[:, :2] * np.array([WW, WH], np.float32)
            top, chin = p[10], p[152]
            fh = np.linalg.norm(chin - top) + 1e-6
            fw = np.linalg.norm(p[454] - p[234])
            down = (chin - top) / fh
            side = np.array([-down[1], down[0]], np.float32)
            # the skull sits behind the face: away from where the nose points, along the face's own
            # axes, so a head turned or tipped back keeps its hair on the far side
            facing = p[1] - p[:468].mean(0)
            mag = np.linalg.norm(facing)
            facing = facing / (mag + 1e-6) * min(mag, 0.35 * fw)
            c = (top + chin) / 2 + (top - chin) * 0.12 - facing * 1.3
            u = (xs - c[0]) * side[0] + (ys - c[1]) * side[1]
            v = (xs - c[0]) * down[0] + (ys - c[1]) * down[1]
            r = np.sqrt((u / (0.82 * max(fw, fh * 0.7))) ** 2 + (v / (0.70 * fh)) ** 2)
            prior = np.maximum(prior, 1 - smoothstep(0.85, 1.1, r))
        return prior

    def people(self, split):
        """0..1 map of 'the right-hand person': right of a line from (top x) to (bottom x)."""
        top, bottom = split if isinstance(split, (tuple, list)) else (split, split)
        xs = np.arange(WW, dtype=np.float32)[None, :] / WW
        ys = np.arange(WH, dtype=np.float32)[:, None] / WH
        edge = top + (bottom - top) * ys
        return smoothstep(edge - 0.012, edge + 0.012, xs).astype(np.float32)

    # ---- one drawing -----------------------------------------------------------------------
    def draw(self, img, light=None, split=None, mask_fn=None, feats=True):
        """img: BGR crop of the source. light(tone) -> (gain map, add map RGB) at working size."""
        lk = self.look
        if lk.get("clahe"):
            # soft, low-contrast footage (a commercial's hands): bring out the forms before cutting
            clip, tiles = lk["clahe"]
            lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
            lab[..., 0] = cv2.createCLAHE(clip, (tiles, tiles)).apply(lab[..., 0])
            img = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
        work = cv2.resize(img, (WW, WH), interpolation=cv2.INTER_CUBIC)
        g = cv2.cvtColor(work, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
        g = np.clip((g - lk["black"]) / (lk["white"] - lk["black"]), 0, 1) ** lk.get("gamma", 1.0)
        if lk.get("vignette"):
            # a pool of light: the edges of the frame fall away into the dark of the car
            r0, r1 = lk["vignette"]
            yy, xx = np.mgrid[0:WH, 0:WW].astype(np.float32)
            rr = np.sqrt(((xx - WW / 2) / (WW / 2)) ** 2 + ((yy - WH / 2) / (WH / 2)) ** 2) / np.sqrt(2)
            g = g * (1 - smoothstep(r0, r1, rr))
        # flatten the texture, keep the edges of the light: L0 smoothing gives piecewise-flat value
        g = g.astype(np.float32)
        tone = cv2.bilateralFilter(g, 9, 0.10, 5)
        base = (tone * 255).astype(np.uint8)
        tone = cv2.ximgproc.l0Smooth(base, None, lk.get("l0", 0.012), 2.0).astype(np.float32) / 255
        # cloth is painted broader than skin: its folds and weave would otherwise break into camouflage
        coarse = cv2.ximgproc.l0Smooth(base, None, lk.get("cloth_l0", 0.03), 2.0).astype(np.float32) / 255
        lms = self.find_faces(img) if (feats or lk.get("hair_prior", True)) else []
        cls = self.classes(work, lms if lk.get("hair_prior", True) else None)
        if mask_fn is not None:
            cls = mask_fn(cls, self.n)
        if lms:
            neck = np.zeros((WH, WW), np.float32)
            for lm in lms:
                p = lm[:, :2] * np.array([WW, WH], np.float32)
                fw = np.linalg.norm(p[454] - p[234])
                cv2.ellipse(neck, (int(p[152, 0]), int(p[152, 1] + 0.35 * fw)), (int(0.45 * fw), int(0.5 * fw)), 0, 0, 360, 1.0, -1)
            lit = np.maximum(smoothstep(0.10, 0.22, tone), cv2.GaussianBlur(neck, (0, 0), 6))
        else:
            lit = smoothstep(0.10, 0.22, tone)
        moved = cls[3] * (1 - lit)
        cls[3] -= moved
        cls[4] += moved
        add = None
        if light is not None:
            gain, add = light(tone)
            tone = np.clip(tone * gain, 0, 1.2)
            coarse = np.clip(coarse * gain, 0, 1.2)
        right = self.people(split) if split is not None else None
        # per-class value cuts -> one probability plane per flat shape
        planes, colours = [], []
        jitter = self.rng.normal(0, lk.get("boil", 0.007), 32)
        k = 0
        for c, name in enumerate(CLASSES):
            pal = lk[name]
            cuts = np.array(pal["cuts"], np.float32) + jitter[k:k + len(pal["cuts"])]
            k += len(pal["cuts"])
            lev = np.digitize(coarse if name == "cloth" else tone, cuts)
            two = right is not None and "right" in pal
            for li in range(len(cuts) + 1):
                m = cv2.GaussianBlur((lev == li).astype(np.float32), (0, 0), lk.get("soft", 1.2))
                if two:
                    planes.append(cls[c] * m * (1 - right)); colours.append(pal["colours"][li])
                    planes.append(cls[c] * m * right); colours.append(pal["right"][li])
                else:
                    planes.append(cls[c] * m); colours.append(pal["colours"][li])
        prob = np.stack(planes).astype(np.float32)
        # temporal hold: warp the last drawing's shapes onto this frame and blend
        gray8 = (g * 255).astype(np.uint8)
        if self.prev_prob is not None and self.prev_prob.shape == prob.shape:
            flow = cv2.calcOpticalFlowFarneback(gray8, self.prev_gray, None, 0.5, 3, 21, 3, 5, 1.1, 0)
            gx, gy = np.meshgrid(np.arange(WW, dtype=np.float32), np.arange(WH, dtype=np.float32))
            warped = np.stack([cv2.remap(p, gx + flow[..., 0], gy + flow[..., 1], cv2.INTER_LINEAR,
                                         borderMode=cv2.BORDER_REPLICATE) for p in self.prev_prob])
            hold = lk.get("hold", 0.45)
            prob = (1 - hold) * prob + hold * warped
        self.prev_prob, self.prev_gray = prob, gray8
        prob = np.stack([cv2.GaussianBlur(p, (0, 0), lk.get("merge", 2.0)) for p in prob])
        # cut at full size so the edges are clean curves
        big = np.stack([cv2.resize(p, (W, H), interpolation=cv2.INTER_CUBIC) for p in prob])
        lab = self.despeckle(big.argmax(0), lk.get("min_area", 320))
        out = np.array(colours, np.float32)[lab]
        if lk.get("wash", 0) > 0:
            out = self.wash(out, lk["wash"])
        if add is not None:
            out = out + cv2.resize(add, (W, H))
        out = self.ink(out, cls, tone, img, lms if feats else None)
        self.n += 1
        return np.clip(out, 0, 1)

    def despeckle(self, lab, min_area):
        """Painters never leave crumbs: regions under min_area take their surroundings' colour."""
        lab = lab.astype(np.int32)
        for _ in range(2):
            small = np.zeros(lab.shape, bool)
            for v in np.unique(lab):
                cnt, cc, stats, _ = cv2.connectedComponentsWithStats((lab == v).astype(np.uint8), connectivity=4)
                tiny = np.where(stats[1:, cv2.CC_STAT_AREA] < min_area)[0] + 1
                if len(tiny):
                    small |= np.isin(cc, tiny)
            if not small.any():
                break
            _, idx = cv2.distanceTransformWithLabels(small.astype(np.uint8), cv2.DIST_L2, 3,
                                                     labelType=cv2.DIST_LABEL_PIXEL)
            ys, xs = np.nonzero(~small)
            lut = np.zeros(idx.max() + 1, np.int32)
            lut[idx[ys, xs]] = lab[ys, xs]
            lab = np.where(small, lut[idx], lab)
        return lab

    @staticmethod
    def clean_mask(m, min_area):
        """No floating rings: drop small islands and fill small holes before drawing a contour."""
        for val in (1, 0):
            cnt, cc, stats, _ = cv2.connectedComponentsWithStats((m == val).astype(np.uint8), connectivity=8)
            small = np.where(stats[1:, cv2.CC_STAT_AREA] < min_area)[0] + 1
            if len(small):
                m = np.where(np.isin(cc, small), 1 - val, m).astype(np.uint8)
        return m

    def wash(self, out, amt):
        nz = self.rng.normal(0, 1, (H // 24 + 2, W // 24 + 2)).astype(np.float32)
        nz = cv2.GaussianBlur(cv2.resize(nz, (W, H), interpolation=cv2.INTER_CUBIC), (0, 0), 6)
        return out * (1 + amt * nz[..., None])

    def ink(self, out, cls, tone, img, lms):
        lk = self.look
        inkc = np.array(lk.get("ink", [0.03, 0.025, 0.04]), np.float32)
        t = cv2.resize(tone, (W, H))
        # 1) figure contour: the edge between the background and the people, thicker in shadow
        fig = (cv2.resize(1 - cls[0], (W, H)) > 0.5).astype(np.uint8)
        fig = self.clean_mask(fig, lk.get("fig_min", 6000))
        edge = cv2.morphologyEx(fig, cv2.MORPH_GRADIENT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
        d = cv2.distanceTransform((edge == 0).astype(np.uint8), cv2.DIST_L2, 3)
        width = lk.get("line", 2.8) * (1.25 - 0.7 * t)
        line = 1 - smoothstep(width * 0.5, width * 0.5 + 1.2, d)
        # 2) inner valleys of the face and hands: the darkest creases only
        skin = cv2.resize(cls[2] + cls[3] + 0.5 * cls[1], (W, H))
        g = cv2.resize(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (W, H), interpolation=cv2.INTER_CUBIC).astype(np.float32) / 255
        g = cv2.GaussianBlur(g, (0, 0), lk.get("feat_blur", 2.4))
        s1, s2 = lk.get("feat_s", (2.0, 3.4))
        dog = cv2.GaussianBlur(g, (0, 0), s2) - cv2.GaussianBlur(g, (0, 0), s1)
        feat = smoothstep(lk.get("feat_lo", 0.010), lk.get("feat_hi", 0.026), dog) * smoothstep(0.35, 0.7, skin)
        fm = (feat > 0.5).astype(np.uint8)
        cnt, cc, stats, _ = cv2.connectedComponentsWithStats(fm, connectivity=8)
        keep = np.zeros(cnt, bool)
        keep[1:] = stats[1:, cv2.CC_STAT_AREA] >= lk.get("feat_min", 110)
        feat = cv2.GaussianBlur(feat * keep[cc], (0, 0), 0.8)
        a = np.maximum(line * lk.get("line_alpha", 0.92), feat * lk.get("feat_alpha", 0.8))
        if lk.get("edges"):
            # contour lines from the picture's own edges (finger outlines, knobs), long ones only
            lo, hi, min_len, alpha = lk["edges"]
            g8 = cv2.resize(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), (W, H), interpolation=cv2.INTER_CUBIC)
            g8 = cv2.bilateralFilter(cv2.GaussianBlur(g8, (0, 0), 2.2), 9, 30, 7)
            e = cv2.Canny(g8, lo, hi, L2gradient=True)
            cnt, cc, st, _ = cv2.connectedComponentsWithStats((e > 0).astype(np.uint8), connectivity=8)
            keep = np.zeros(cnt, bool)
            keep[1:] = st[1:, cv2.CC_STAT_AREA] >= min_len
            e = (keep[cc]).astype(np.float32)
            e = cv2.GaussianBlur(cv2.dilate(e, np.ones((2, 2), np.uint8)), (0, 0), 0.9)
            a = np.maximum(a, np.clip(e * 1.4, 0, 1) * alpha)
        # 3) the features, on landmarks
        if lms and lk.get("strokes", 0.8) > 0:
            a = np.maximum(a, self.strokes(lms) * lk.get("strokes", 0.8))
        a = np.clip(a, 0, 1)[..., None]
        return out * (1 - a) + inkc * a

    def strokes(self, lms):
        canvas = np.zeros((H * 2, W * 2), np.uint8)  # drawn at 2x and reduced: smooth stroke ends
        for lm in lms:
            pts = lm[:, :2] * np.array([W, H], np.float32)
            fw = np.linalg.norm(pts[454] - pts[234])
            if fw < 40:
                continue
            # which side of the face turns away (the side the nose points to): skip its foreshortened strokes
            yaw = (pts[1, 0] - (pts[234, 0] + pts[454, 0]) / 2) / fw
            for idx, wt, alpha in FEATURES:
                p = pts[idx].copy()
                side = np.sign(p[:, 0].mean() - pts[1, 0])
                if side * yaw > 0.18 and len(idx) > 5 and idx[0] not in (78,):
                    continue
                p += self.rng.normal(0, 0.9, p.shape)  # the hand is never exact
                n = len(p)
                for i in range(n - 1):
                    u = (i + 0.5) / (n - 1)
                    w = max(1.0, wt * fw * (0.45 + 0.55 * np.sin(np.pi * u)))
                    a, b = (p[i] * 2).astype(int), (p[i + 1] * 2).astype(int)
                    cv2.line(canvas, tuple(a), tuple(b), int(255 * alpha), int(round(w * 2)), cv2.LINE_AA)
        for lm in lms:
            pts = lm[:, :2] * np.array([W * 2, H * 2], np.float32)
            fw = np.linalg.norm(pts[454] - pts[234]) / 2
            if fw < 40 or len(lm) < 478:
                continue
            yaw = (pts[1, 0] - (pts[234, 0] + pts[454, 0]) / 2) / (2 * fw)
            for ring, iris in EYES:
                # the far eye of a turned head has no lid stroke, so no iris either: a lone dot reads
                # as a hole
                if np.sign(pts[ring, 0].mean() - pts[1, 0]) * yaw > 0.18:
                    continue
                eye = np.zeros_like(canvas)
                cv2.fillPoly(eye, [np.round(pts[ring]).astype(np.int32)], 255)
                if eye.sum() < 255 * 40:
                    continue
                r = max(2.0, np.linalg.norm(pts[iris + 1] - pts[iris + 3]) / 2 * 0.95)
                disk = np.zeros_like(canvas)
                cv2.circle(disk, tuple(np.round(pts[iris]).astype(int)), int(r), 230, -1, cv2.LINE_AA)
                canvas = np.maximum(canvas, np.minimum(disk, eye))
        s = cv2.resize(canvas, (W, H), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
        return cv2.GaussianBlur(s, (0, 0), 0.7)


def write_png(path, rgb01):
    cv2.imwrite(path, cv2.cvtColor((np.clip(rgb01, 0, 1) * 255 + 0.5).astype(np.uint8), cv2.COLOR_RGB2BGR))
