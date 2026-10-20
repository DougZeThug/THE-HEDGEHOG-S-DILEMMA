"""A small z-buffered triangle rasterizer (numpy, orthographic, CPU, deterministic): for each output
pixel, the nearest triangle covering its centre, and its vertices' attributes interpolated there.

A drawing carried on a mesh (scripts/drawn-rig/README.md): each vertex at a pixel of the drawing,
its attribute that pixel's position, so the result says, for each output pixel, where in the
drawing to look. Triangles are expected to be small (a pixel or two across)."""
import numpy as np


def rasterize(V, T, attrs, W, H, near_is_small=True):
    """`V`: (n, 3) vertices in output pixels (x right, y down, depth; pixel centres at +0.5).
    `T`: (m, 3) triangles. `attrs`: (n, k) per vertex. Returns the attributes (H, W, k), the depth
    (H, W; inf where nothing) and the triangle seen at each pixel (H, W; -1 where none)."""
    P = V[T]
    x0 = np.floor(P[..., 0].min(1)).astype(np.int64)
    y0 = np.floor(P[..., 1].min(1)).astype(np.int64)
    x1 = np.ceil(P[..., 0].max(1)).astype(np.int64)
    y1 = np.ceil(P[..., 1].max(1)).astype(np.int64)
    span = int(max((x1 - x0).max(), (y1 - y0).max())) + 1
    oy, ox = np.mgrid[0:span, 0:span]
    ox, oy = ox.ravel(), oy.ravel()
    best_z = np.full(H * W, np.inf)
    best_f = np.full(H * W, -1, np.int64)
    best_b = np.zeros((H * W, 3))
    m = len(T)
    chunk = max(1, 400000 // (span * span))
    a, b, c = P[:, 0, :2], P[:, 1, :2], P[:, 2, :2]
    den = (b[:, 1] - c[:, 1]) * (a[:, 0] - c[:, 0]) + (c[:, 0] - b[:, 0]) * (a[:, 1] - c[:, 1])
    for s in range(0, m, chunk):
        e = min(m, s + chunk)
        px = (x0[s:e, None] + ox[None, :]).astype(np.float64) + 0.5
        py = (y0[s:e, None] + oy[None, :]).astype(np.float64) + 0.5
        in_box = (px <= x1[s:e, None] + 0.5) & (py <= y1[s:e, None] + 0.5)
        d = den[s:e, None]
        ok = np.abs(d) > 1e-12
        dd = np.where(ok, d, 1.0)
        l0 = ((b[s:e, 1:2] - c[s:e, 1:2]) * (px - c[s:e, 0:1]) + (c[s:e, 0:1] - b[s:e, 0:1]) * (py - c[s:e, 1:2])) / dd
        l1 = ((c[s:e, 1:2] - a[s:e, 1:2]) * (px - c[s:e, 0:1]) + (a[s:e, 0:1] - c[s:e, 0:1]) * (py - c[s:e, 1:2])) / dd
        l2 = 1 - l0 - l1
        inside = in_box & ok & (l0 >= -1e-9) & (l1 >= -1e-9) & (l2 >= -1e-9)
        ix = (px - 0.5).astype(np.int64)
        iy = (py - 0.5).astype(np.int64)
        inside &= (ix >= 0) & (ix < W) & (iy >= 0) & (iy < H)
        ti, ci = np.nonzero(inside)
        if not len(ti):
            continue
        L = np.stack([l0[ti, ci], l1[ti, ci], l2[ti, ci]], 1)
        z = (L * P[s + ti, :, 2]).sum(1)
        if not near_is_small:
            z = -z
        pix = iy[ti, ci] * W + ix[ti, ci]
        # (the nearest in this chunk, then against what is already there)
        order = np.lexsort((z, pix))
        pix_s = pix[order]
        first = np.r_[True, pix_s[1:] != pix_s[:-1]]
        pix_u, z_u, sel = pix_s[first], z[order][first], order[first]
        better = z_u < best_z[pix_u]
        pu = pix_u[better]
        best_z[pu] = z_u[better]
        best_f[pu] = s + ti[sel[better]]
        best_b[pu] = L[sel[better]]
    F = best_f.reshape(H, W)
    Z = best_z.reshape(H, W)
    if not near_is_small:
        Z = -Z
    A = np.zeros((H * W, attrs.shape[1]))
    hit = best_f >= 0
    A[hit] = (best_b[hit][:, :, None] * attrs[T[best_f[hit]]]).sum(1)
    return A.reshape(H, W, -1), Z, F


def pixel_mesh(mask):
    """A mesh over the pixels of `mask`: a vertex at each (x, y) where it is set, two triangles in
    each 2x2 block of them. Returns the vertices' pixel positions (n, 2) and the triangles."""
    ys, xs = np.nonzero(mask)
    idx = -np.ones(mask.shape, np.int64)
    idx[ys, xs] = np.arange(len(ys))
    a, b, c, d = idx[:-1, :-1], idx[:-1, 1:], idx[1:, :-1], idx[1:, 1:]
    ok1 = (a >= 0) & (b >= 0) & (c >= 0)
    ok2 = (b >= 0) & (d >= 0) & (c >= 0)
    T = np.concatenate([np.stack([a[ok1], b[ok1], c[ok1]], 1), np.stack([b[ok2], d[ok2], c[ok2]], 1)])
    return np.stack([xs, ys], 1).astype(np.float64), T
