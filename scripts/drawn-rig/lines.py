"""A drawing's lines lifted off its paint, and drawn again wherever its surface takes them, at the
weight they were drawn (scripts/drawn-rig/README.md).

The paint under a line may stretch or squeeze as a surface turns toward or away from us. A drawn
line doesn't: an artist drawing the same face a little turned draws its lines as wide as before.
So the paint is carried on the surface (scripts/drawn-rig/raster.py), and each line is carried
by its centre line, its cross-section rigid.

    fills, ink, mask, centre = split(picture, region, keep)   # fills * ink == picture
    lines = Lines(ink, mask, centre)
    out_ink = lines.draw(moved_centre, visible)               # moved: where each centre pixel goes
    out = carried(fills) * out_ink
"""
import cv2
import numpy as np


def thin(mask, iters=60):
    """Zhang-Suen thinning of a boolean mask: one-pixel centre lines, 8-connected."""
    img = np.pad(mask.astype(np.uint8), 1)
    for _ in range(iters):
        changed = False
        for step in (0, 1):
            p = img
            P2, P3, P4 = p[:-2, 1:-1], p[:-2, 2:], p[1:-1, 2:]
            P5, P6, P7 = p[2:, 2:], p[2:, 1:-1], p[2:, :-2]
            P8, P9 = p[1:-1, :-2], p[:-2, :-2]
            nb = [P2, P3, P4, P5, P6, P7, P8, P9]
            B = sum(n.astype(np.int32) for n in nb)
            seq = nb + [P2]
            A = sum(((seq[i] == 0) & (seq[i + 1] == 1)).astype(np.int32) for i in range(8))
            if step == 0:
                cond = (P2 * P4 * P6 == 0) & (P4 * P6 * P8 == 0)
            else:
                cond = (P2 * P4 * P8 == 0) & (P2 * P6 * P8 == 0)
            rm = (p[1:-1, 1:-1] == 1) & (B >= 2) & (B <= 6) & (A == 1) & cond
            if rm.any():
                changed = True
                img = img.copy()
                img[1:-1, 1:-1][rm] = 0
        if not changed:
            break
    return img[1:-1, 1:-1] > 0


def split(img, region, keep=None, contrast=18.0, dark=150.0, k=11):
    """`img` (H, W, 3, floats 0..1): its lines are the pixels darker than the median round them
    (`k` px) by `contrast` levels and darker than `dark` (of 255), inside `region`, outside `keep`
    (parts carried whole, as drawn: eyes). Returns `fills` (the paint with its lines filled in from
    round them), `ink` (img / fills: 1 off the lines), the lines' mask and their centre lines;
    fills * ink is img exactly."""
    L = (0.3 * img[..., 0] + 0.59 * img[..., 1] + 0.11 * img[..., 2]) * 255
    med = cv2.medianBlur(np.clip(L, 0, 255).astype(np.uint8), k).astype(np.float32)
    m = ((L - med) < -contrast) & (L < dark) & region
    if keep is not None:
        m &= ~keep
    # (specks aren't lines)
    _, lab, stats, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), connectivity=8)
    small = stats[:, cv2.CC_STAT_AREA] < 4
    small[0] = False
    m &= ~small[lab]
    hole = cv2.dilate(m.astype(np.uint8), np.ones((3, 3), np.uint8))
    if keep is not None:
        hole[keep] = 0
    img8 = np.clip(img * 255 + 0.5, 0, 255).astype(np.uint8)
    filled = cv2.inpaint(img8, hole, 3, cv2.INPAINT_TELEA).astype(np.float64) / 255
    fills = np.where(hole[..., None] > 0, np.maximum(filled, img), img)
    ink = np.where(hole[..., None] > 0, img / np.maximum(fills, 1e-4), 1.0)
    return fills, ink, hole > 0, thin(m)


def invert(D, iters=80, damp=0.6):
    """The inverse of the forward warp p -> p + D(p) (D: (H, W, 2)): for each output pixel, where
    it comes from (damped fixed point; D should move neighbours alike, as a line's motion does)."""
    H, W = D.shape[:2]
    Y, X = np.mgrid[0:H, 0:W].astype(np.float32)
    px, py = X.copy(), Y.copy()
    Dx, Dy = np.ascontiguousarray(D[..., 0], np.float32), np.ascontiguousarray(D[..., 1], np.float32)
    for _ in range(iters):
        dx = cv2.remap(Dx, px, py, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        dy = cv2.remap(Dy, px, py, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        px += damp * (X - dx - px)
        py += damp * (Y - dy - py)
    return px, py


class Lines:
    """A drawing's lines (`split`'s ink, mask and centre lines), to be drawn wherever their centre
    lines go."""

    def __init__(self, ink, mask, centre):
        self.ink = ink.astype(np.float32)
        self.mask = mask
        ys, xs = np.nonzero(centre)
        self.centre = np.stack([xs, ys], 1).astype(np.float64)
        # each line pixel's nearest centre-line pixel
        grid = np.full(mask.shape, 255, np.uint8)
        grid[ys, xs] = 0
        _, lab = cv2.distanceTransformWithLabels(grid, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
        table = np.zeros(lab.max() + 1, np.int64)
        table[lab[ys, xs]] = np.arange(len(ys))
        self.nearest = table[lab]
        # each pixel's nearest line pixel (to carry the lines' motion on past them)
        _, self.near_lab = cv2.distanceTransformWithLabels((~mask).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
        self.on = np.argwhere(mask)

    def field(self, moved, around=None, sigma=1.2):
        """How each pixel of the lines moves: as its nearest centre-line pixel does (so the whole
        width of a line moves alike: its weight kept), smoothed along the lines; and off them, as
        `around` says (the surface's own motion, (H, W, 2)), or else as the nearest line pixel does.
        The lines of one surface moving with it, the field is one-to-one and inverts cleanly."""
        D = moved - self.centre
        m = self.mask.astype(np.float32)
        L = (D[self.nearest] * m[..., None]).astype(np.float32)
        num = cv2.GaussianBlur(L, (0, 0), sigma)
        den = cv2.GaussianBlur(m, (0, 0), sigma)[..., None]
        F = np.where(den > 1e-3, num / np.maximum(den, 1e-6), 0)
        if around is None:
            table = np.zeros((self.near_lab.max() + 1, 2), np.float32)
            table[self.near_lab[self.on[:, 0], self.on[:, 1]]] = F[self.on[:, 0], self.on[:, 1]]
            around = table[self.near_lab]
        return np.where(self.mask[..., None], F, around)

    def only(self, keep):
        """These lines, only those whose centre line passes where `keep` (H, W) is set: one surface's."""
        cx, cy = self.centre[:, 0].astype(int), self.centre[:, 1].astype(int)
        c = np.zeros(self.mask.shape, bool)
        sel = keep[cy, cx]
        c[cy[sel], cx[sel]] = True
        mask = self.mask & sel[self.nearest]
        return Lines(np.where(mask[..., None], self.ink, 1.0), mask, c)

    def draw(self, moved, visible=None, around=None):
        """The lines' ink (H, W, 3; 1 off them) with their centre lines moved to `moved` ((n, 2),
        each centre-line pixel's new position, sub-pixel), the surface round them moving as `around`
        says. `visible(mx, my)`: given where each output pixel comes from in the drawing, whether
        the line there is the nearest surface."""
        mx, my = invert(self.field(moved, around))
        # (Lanczos, held within the ink's own range round each pixel: bilinear softened a line moved by
        # a fraction of a pixel by up to a fifth of its darkness; Lanczos alone rings beside it)
        ink = cv2.remap(self.ink, mx, my, cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
        k3 = np.ones((3, 3), np.uint8)
        lo = cv2.remap(cv2.erode(self.ink, k3), mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        hi = cv2.remap(cv2.dilate(self.ink, k3), mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        ink = np.clip(ink, lo, hi)
        keep = cv2.remap(self.mask.astype(np.float32), mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT) > 0.01
        if visible is not None:
            keep &= visible(mx, my)
        return np.where(keep[..., None], ink, 1.0).astype(np.float32)
