#!/usr/bin/env python3
"""Make the site's responsive sizes for a city photo (see data/cities.json → images).

  python3 scripts/make_city_images.py hero SRC.jpg img/cities/antwerpen/hero [--fx 0.5] [--fy 0.5]
      → <out>-{1000,1600,2400}.webp + <out>-1600.jpg   (3:2, like img/hero-*)
  python3 scripts/make_city_images.py card SRC.jpg img/cities/antwerpen/new [--fx 0.5] [--fy 0.5]
      → <out>-{800,1600,2400}.webp + <out>.jpg (1400)   (square, like img/coffee*; the pill shows its centre)

--fx/--fy: focus point (0..1) the crop is centred on. Credit every photo in img/CREDITS.json.
"""
import argparse, os
from PIL import Image

def crop(im, ratio, fx, fy):
    W, H = im.size
    if W / H > ratio: w, h = round(H * ratio), H
    else: w, h = W, round(W / ratio)
    x = min(max(round(fx * W - w / 2), 0), W - w); y = min(max(round(fy * H - h / 2), 0), H - h)
    return im.crop((x, y, x + w, y + h))

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('kind', choices=['hero', 'card']); ap.add_argument('src'); ap.add_argument('out')
    ap.add_argument('--fx', type=float, default=.5); ap.add_argument('--fy', type=float, default=.5); a = ap.parse_args()
    im = Image.open(a.src).convert('RGB'); os.makedirs(os.path.dirname(a.out) or '.', exist_ok=True)
    c = crop(im, 1.5 if a.kind == 'hero' else 1.0, a.fx, a.fy)
    sizes = [1000, 1600, 2400] if a.kind == 'hero' else [800, 1600, 2400]
    for w in sizes:
        r = c.resize((w, round(w * c.height / c.width)), Image.LANCZOS) if c.width > w else c
        r.save(f'{a.out}-{w}.webp', 'WEBP', quality=80 if w < 2400 else 76, method=6)
    jw = 1600 if a.kind == 'hero' else 1400
    c.resize((jw, round(jw * c.height / c.width)), Image.LANCZOS).save(f'{a.out}-1600.jpg' if a.kind == 'hero' else f'{a.out}.jpg', 'JPEG', quality=82, optimize=True, progressive=True)
    print('wrote', a.out, c.size)

if __name__ == '__main__': main()
