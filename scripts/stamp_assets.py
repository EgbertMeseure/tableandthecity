#!/usr/bin/env python3
"""Cache-busting: stamp every local css/js include in the html pages with ?v=<build>, and set <meta name="build" content="<build>">
(js/common.js appends the same ?v= to its data fetches). <build> = first 10 hex chars of a sha256 over css/*.css, js/*.js,
data/cities.json and data/cities/*.json, so any change to code or data gives browsers fresh files; no change → no diff (idempotent).

  python3 scripts/stamp_assets.py          # run before every commit / zip (see update.md)
  python3 scripts/stamp_assets.py --check  # exit 1 if the pages are not stamped with the current build
"""
import hashlib, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = sorted([*ROOT.glob('css/*.css'), *ROOT.glob('js/*.js'), *ROOT.glob('js/i18n/*.js'), ROOT / 'data' / 'cities.json', *ROOT.glob('data/cities/*.json')])
h = hashlib.sha256()
for f in FILES: h.update(f.relative_to(ROOT).as_posix().encode()); h.update(f.read_bytes())
BUILD = h.hexdigest()[:10]
bad = []
for page in sorted(ROOT.glob('*.html')):
    s = page.read_text(encoding='utf-8')
    t = re.sub(r'((?:href|src)="(?:css|js)/[^"?#]+)(?:\?v=[^"]*)?"', rf'\1?v={BUILD}"', s)
    if '<meta name="build"' in t: t = re.sub(r'<meta name="build" content="[^"]*">', f'<meta name="build" content="{BUILD}">', t)
    else: t = t.replace('<meta charset="utf-8">', f'<meta charset="utf-8">\n<meta name="build" content="{BUILD}">', 1)
    if t != s:
        bad.append(page.name)
        if '--check' not in sys.argv: page.write_text(t, encoding='utf-8')
if '--check' in sys.argv:
    print(f'build {BUILD}: ' + (f'NOT stamped: {bad}' if bad else 'all pages stamped')); sys.exit(1 if bad else 0)
print(f'build {BUILD}: stamped {bad or "nothing (already current)"}')
