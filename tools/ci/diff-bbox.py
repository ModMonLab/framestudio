"""Prints where Playwright screenshot diffs are (bounding box of highlighted pixels) so CI logs locate regressions."""
import glob
import sys

from PIL import Image

for f in sorted(glob.glob(sys.argv[1] + "/**/*-diff.png", recursive=True)):
    im = Image.open(f).convert("RGB")
    w, h = im.size
    px = im.load()
    xs, ys = [], []
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if r > 200 and g < 80 and b < 80:  # Playwright marks differing pixels in red
                xs.append(x)
                ys.append(y)
    if xs:
        print(f"{f}: {len(xs)} px, bbox x={min(xs)}..{max(xs)} y={min(ys)}..{max(ys)} of {w}x{h}")
