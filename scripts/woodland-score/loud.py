"""Loudness by ITU-R BS.1770 (K-weighting at 48 kHz): momentary (400 ms), short-term (3 s) and
integrated (gated), for setting the score against the clearing."""
import numpy as np
from scipy import signal

SR = 48000
# The standard's two stages at 48 kHz: a high shelf (+4 dB above ~1.5 kHz), then the RLB high-pass.
_SHELF = ([1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585])
_RLB = ([1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621])


def kweight(x):
    y = signal.lfilter(*_SHELF, x, axis=0)
    return signal.lfilter(*_RLB, y, axis=0)


def _ms(y):
    return (y ** 2).mean(axis=0).sum() if y.ndim == 2 else (y ** 2).mean()


def lufs(x, a=None, b=None):
    """Ungated loudness of [a, b) seconds (the whole if None)."""
    y = kweight(x)
    i0 = 0 if a is None else int(a * SR)
    i1 = len(y) if b is None else int(b * SR)
    return -0.691 + 10 * np.log10(_ms(y[i0:i1]) + 1e-20)


def short_term(x, t0=0.0, window=3.0, hop=0.5):
    """[(t_end, LUFS)]: the loudness of each `window` seconds ending at t_end (memory time with
    the signal starting at t0)."""
    y = kweight(x)
    w, h = int(window * SR), int(hop * SR)
    out = []
    for i in range(w, len(y) + 1, h):
        out.append((t0 + i / SR, -0.691 + 10 * np.log10(_ms(y[i - w:i]) + 1e-20)))
    return out


def integrated(x):
    """Gated (−70 LUFS absolute, −10 LU relative) over 400 ms blocks, 75% overlap."""
    y = kweight(x)
    w, h = int(0.4 * SR), int(0.1 * SR)
    blocks = np.array([_ms(y[i:i + w]) for i in range(0, len(y) - w + 1, h)])
    l = -0.691 + 10 * np.log10(blocks + 1e-20)
    g = blocks[l > -70]
    if not len(g):
        return -np.inf
    rel = -0.691 + 10 * np.log10(g.mean()) - 10
    g2 = blocks[(l > -70) & (l > rel)]
    return -0.691 + 10 * np.log10(g2.mean() + 1e-20)
