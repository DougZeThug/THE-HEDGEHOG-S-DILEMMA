"""Tile captioned images into one sheet (system Python: cv2, numpy).

    python3 -I tile.py OUT.jpg COLUMNS caption1 image1 caption2 image2 ...
"""
import sys

import cv2
import numpy as np


def label(img, text):
    bar = np.full((28, img.shape[1], 3), 24, np.uint8)
    cv2.putText(bar, text, (8, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (225, 222, 214), 1, cv2.LINE_AA)
    return np.concatenate([img, bar], 0)


def main():
    out, cols = sys.argv[1], int(sys.argv[2])
    items = sys.argv[3:]
    cells = [label(cv2.imread(items[i + 1]), items[i]) for i in range(0, len(items), 2)]
    h, w = cells[0].shape[:2]
    blank = np.full((h, w, 3), 24, np.uint8)
    while len(cells) % cols:
        cells.append(blank)
    rows = [np.concatenate(cells[r:r + cols], 1) for r in range(0, len(cells), cols)]
    cv2.imwrite(out, np.concatenate(rows, 0), [cv2.IMWRITE_JPEG_QUALITY, 92])


if __name__ == '__main__':
    main()
