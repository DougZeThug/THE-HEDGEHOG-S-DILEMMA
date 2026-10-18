"""
The character sheet's top panel, and her look redrawn, at twice their size (the artist chose this
over plain resampling, 2026-10-18: crisper lines and faces in the two-shot on large screens).
Offline, once: its output is committed, so scripts/two-shot.py never needs this to run.

    python -m venv /tmp/sr && /tmp/sr/bin/pip install --index-url https://download.pytorch.org/whl/cpu torch
    /tmp/sr/bin/pip install numpy pillow
    curl -L -o /tmp/RealESRGAN_x4plus_anime_6B.pth \
      https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth
    /tmp/sr/bin/python scripts/upscale.py /tmp/RealESRGAN_x4plus_anime_6B.pth

Real-ESRGAN (Xintao Wang et al., BSD-3), its anime model (6 blocks), run on the CPU in tiles at
4×, then resampled to 2×. Writes references/woodland/upscaled/<name>-top@2x.webp (lossless).
"""
import os
import sys

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
REF = os.path.join(ROOT, 'references', 'woodland')
OUT = os.path.join(REF, 'upscaled')
# The sheet's top panel (sheet px), a little more than the two-shot uses.
TOP = (0, 0, 1448, 520)
SOURCES = {
    '02-characters': os.path.join(REF, '02-characters.webp'),
    'b-look-full-a': os.path.join(REF, 'drawings', 'b-look-full-a.webp'),
    'b-look-full-b': os.path.join(REF, 'drawings', 'b-look-full-b.webp'),
    'b-look-full-c': os.path.join(REF, 'drawings', 'b-look-full-c.webp'),
}


class RDB(nn.Module):
    def __init__(self, nf=64, gc=32):
        super().__init__()
        self.conv1 = nn.Conv2d(nf, gc, 3, 1, 1)
        self.conv2 = nn.Conv2d(nf + gc, gc, 3, 1, 1)
        self.conv3 = nn.Conv2d(nf + 2 * gc, gc, 3, 1, 1)
        self.conv4 = nn.Conv2d(nf + 3 * gc, gc, 3, 1, 1)
        self.conv5 = nn.Conv2d(nf + 4 * gc, nf, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, True)

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        return self.conv5(torch.cat((x, x1, x2, x3, x4), 1)) * 0.2 + x


class RRDB(nn.Module):
    def __init__(self, nf, gc=32):
        super().__init__()
        self.rdb1, self.rdb2, self.rdb3 = RDB(nf, gc), RDB(nf, gc), RDB(nf, gc)

    def forward(self, x):
        return self.rdb3(self.rdb2(self.rdb1(x))) * 0.2 + x


class RRDBNet(nn.Module):
    """The generator, as the anime model's weights name its layers."""

    def __init__(self, nb=6, nf=64, gc=32):
        super().__init__()
        self.conv_first = nn.Conv2d(3, nf, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(nf, gc) for _ in range(nb)])
        self.conv_body = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_hr = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_last = nn.Conv2d(nf, 3, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, True)

    def forward(self, x):
        feat = self.conv_first(x)
        feat = feat + self.conv_body(self.body(feat))
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode='nearest')))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode='nearest')))
        return self.conv_last(self.lrelu(self.conv_hr(feat)))


@torch.no_grad()
def upscale4(net, rgb, tile=192, pad=16):
    """rgb: H×W×3 floats 0..1 → 4H×4W×3, in overlapping tiles (their seams cut away)."""
    h, w = rgb.shape[:2]
    out = np.zeros((h * 4, w * 4, 3), np.float32)
    x = torch.from_numpy(np.ascontiguousarray(rgb.transpose(2, 0, 1))).unsqueeze(0)
    for y0 in range(0, h, tile):
        for x0 in range(0, w, tile):
            ya, xa = max(0, y0 - pad), max(0, x0 - pad)
            yb, xb = min(h, y0 + tile + pad), min(w, x0 + tile + pad)
            o = net(x[:, :, ya:yb, xa:xb]).clamp(0, 1)[0].numpy().transpose(1, 2, 0)
            sy, sx = (y0 - ya) * 4, (x0 - xa) * 4
            th, tw = min(tile, h - y0) * 4, min(tile, w - x0) * 4
            out[y0 * 4:y0 * 4 + th, x0 * 4:x0 * 4 + tw] = o[sy:sy + th, sx:sx + tw]
    return out


def main():
    weights = sys.argv[1]
    torch.set_num_threads(max(1, os.cpu_count() or 1))
    net = RRDBNet()
    sd = torch.load(weights, map_location='cpu', weights_only=True)
    net.load_state_dict(sd.get('params_ema', sd.get('params', sd)), strict=True)
    net.eval()
    os.makedirs(OUT, exist_ok=True)
    for name, path in SOURCES.items():
        im = Image.open(path).convert('RGB')
        # (The takes were drawn at a slightly different size: on the sheet's own grid first.)
        if im.size != (1448, 1086):
            im = im.resize((1448, 1086), Image.LANCZOS)
        src = np.asarray(im.crop(TOP), np.float32) / 255
        up = upscale4(net, src)
        big = Image.fromarray((up * 255 + 0.5).astype(np.uint8))
        two = big.resize((src.shape[1] * 2, src.shape[0] * 2), Image.LANCZOS)
        dst = os.path.join(OUT, f'{name}-top@2x.webp')
        two.save(dst, 'WEBP', lossless=True, method=6)
        print(dst, two.size)


if __name__ == '__main__':
    main()
