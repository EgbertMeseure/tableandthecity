#!/usr/bin/env python3
"""App icons for the PWA (and later the Capacitor iOS/Android wrappers).

Source of truth: img/icons/icon.svg (any purpose) and img/icons/icon-maskable.svg (full-bleed, art inside the 80% safe zone).
Both are self-contained: the serif 'T' (Bodoni Moda, the wordmark face) and the italic '&C' (Playfair Display Italic) are
stored as outlines, so no font is needed to render them. Both fonts are SIL Open Font License.

  python3 scripts/make_icons.py            # render the PNGs from the committed SVGs (needs Playwright + Chrome)
  python3 scripts/make_icons.py --svg      # also rebuild the SVGs from the font files (needs fontTools + the TTFs)
"""
import sys, io
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]; OUT = ROOT / 'img' / 'icons'
INK, GOLD, WHITE = '#0b0b0b', '#c8a96a', '#ffffff'
BODONI = '/usr/share/fonts/truetype/sand-box/google/Bodoni Moda/BodoniModa-VariableFont_opsz,wght.ttf'
PLAYFAIR_IT = '/usr/share/fonts/truetype/sand-box/google/Playfair Display/PlayfairDisplay-Italic-VariableFont_wght.ttf'

def glyphs(path, text, axes):
    """SVG path data for `text` (one line, font units, y up) + advance width, from a variable font instance."""
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont
    from fontTools.pens.svgPathPen import SVGPathPen
    f = instantiateVariableFont(TTFont(path), axes)
    gs, cmap, x, parts = f.getGlyphSet(), f.getBestCmap(), 0, []
    for ch in text:
        g = cmap[ord(ch)]; pen = SVGPathPen(gs)
        gs[g].draw(pen); parts.append((x, pen.getCommands())); x += gs[g].width
    bounds = None
    from fontTools.pens.boundsPen import BoundsPen
    bp = BoundsPen(gs); xx = 0
    for ch in text:
        g = cmap[ord(ch)]
        from fontTools.pens.transformPen import TransformPen
        gs[g].draw(TransformPen(bp, (1, 0, 0, 1, xx, 0))); xx += gs[g].width
    return parts, bp.bounds, f['head'].unitsPerEm

def place(parts, bounds, cx, baseline, height, fill):
    """Scale glyph outlines so the ink is `height` px tall, centred on cx, sitting on `baseline`."""
    x0, y0, x1, y1 = bounds; s = height / (y1 - y0)
    tx = cx - (x0 + x1) / 2 * s
    return ''.join(f'<path fill="{fill}" transform="translate({tx + px * s:.2f} {baseline + y0 * s:.2f}) scale({s:.5f} {-s:.5f})" d="{d}"/>' for px, d in parts)

def svg(maskable):
    T = glyphs(BODONI, 'T', {'wght': 600, 'opsz': 96}); AC = glyphs(PLAYFAIR_IT, '&C', {'wght': 500})
    k = 0.80 if maskable else 1.0                      # maskable: keep the art inside the central 80 % (safe zone)
    c = 256; ring = 222 * k; th = 250 * k              # 512 canvas
    bg = f'<rect width="512" height="512" fill="{INK}"/>' if maskable else f'<rect width="512" height="512" rx="112" fill="{INK}"/>'
    tbase = c + th * 0.46
    body = (f'<circle cx="256" cy="256" r="{ring:.1f}" fill="none" stroke="{GOLD}" stroke-width="{5 * k:.2f}"/>'
            + place(*T[:2], c - 26 * k, tbase, th, WHITE)
            + place(*AC[:2], c + 76 * k, tbase, 64 * k, GOLD))
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{bg}{body}</svg>\n'

def render():
    from playwright.sync_api import sync_playwright
    jobs = [('icon.svg', 'icon-192.png', 192), ('icon.svg', 'icon-512.png', 512), ('icon-maskable.svg', 'icon-maskable-512.png', 512),
            ('icon-maskable.svg', 'apple-touch-icon.png', 180), ('icon.svg', 'favicon-32.png', 32), ('icon.svg', 'favicon-16.png', 16)]
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
        pg = b.new_page()
        for src, out, n in jobs:
            s = (OUT / src).read_text()
            pg.set_viewport_size({'width': n, 'height': n})
            pg.set_content(f'<html><body style="margin:0;background:transparent">{s.replace("<svg ", f"<svg width=\"{n}\" height=\"{n}\" ", 1)}</body></html>')
            pg.screenshot(path=str(OUT / out), omit_background=True, clip={'x': 0, 'y': 0, 'width': n, 'height': n})
        b.close()
    from PIL import Image
    Image.open(OUT / 'icon-512.png').save(ROOT / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
    # apple-touch-icon must be opaque (iOS fills transparency with black anyway); the maskable art is full-bleed
    print('rendered', [j[1] for j in jobs] + ['favicon.ico'])

if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    if '--svg' in sys.argv:
        (OUT / 'icon.svg').write_text(svg(False)); (OUT / 'icon-maskable.svg').write_text(svg(True))
        print('wrote icon.svg, icon-maskable.svg')
    render()
