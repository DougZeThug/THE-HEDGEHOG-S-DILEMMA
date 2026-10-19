"""Each sample's own pitch against its keycenter (cents), from its first partials; written to tuning.json.

  python3 scripts/woodland-score/tuning.py <the Upright Piano KW folder>
"""
import os, sys, json, numpy as np, soundfile as sf
sys.path.insert(0, os.path.dirname(__file__))
from piano import parse_sfz
U = sys.argv[1]
regions = parse_sfz(os.path.join(U, 'UprightPianoKW-20220221.sfz'))
out = {}
for r in regions:
    if r.path in out or not os.path.exists(r.path):
        continue
    x, sr = sf.read(r.path, dtype='float64', always_2d=True)
    x = x[int(0.12 * sr):int(min(len(x), 1.9 * sr)), 0]
    x = x * np.hanning(len(x))
    n = 1 << 21
    X = np.abs(np.fft.rfft(x, n)); f = np.fft.rfftfreq(n, 1 / sr)
    f0 = 440 * 2 ** ((r.center - 69) / 12)
    est = []
    for h in range(1, 7):
        band = (f > f0 * h * 2 ** (-0.04)) & (f < f0 * h * 2 ** (0.04))
        if not band.any():
            continue
        i = np.argmax(X * band)
        if X[i] > 0.02 * X.max():
            est.append((X[i], 1200 * np.log2(f[i] / (f0 * h))))
    if not est:
        continue
    est.sort(reverse=True)
    w = np.array([e[0] for e in est[:3]]); c = np.array([e[1] for e in est[:3]])
    out[r.path] = round(float((w * c).sum() / w.sum()), 1)
json.dump({os.path.basename(k): v for k, v in out.items()}, open(os.path.join(os.path.dirname(__file__), 'tuning.json'), 'w'), indent=1)
vals = sorted(((os.path.basename(k), v) for k, v in out.items()), key=lambda kv: kv[0])
print(len(vals), 'samples;', ' '.join(f'{k.replace(".flac","")}:{v:+.0f}' for k, v in vals))
