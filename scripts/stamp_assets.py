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
FILES = sorted([*ROOT.glob('css/*.css'), *ROOT.glob('js/*.js'), *ROOT.glob('js/i18n/*.js'), ROOT / 'data' / 'cities.json', *ROOT.glob('data/cities/*.json'),
                ROOT / 'manifest.webmanifest', ROOT / 'offline.html', *ROOT.glob('img/icons/*')])
FILES = [f for f in FILES if f.exists()]
h = hashlib.sha256()
for f in FILES: h.update(f.relative_to(ROOT).as_posix().encode()); h.update(f.read_bytes())
BUILD = h.hexdigest()[:10]
bad = []
for page in sorted(p for p in ROOT.glob('*.html') if p.name != 'offline.html'):   # offline.html is hashed itself, so it is not stamped
    s = page.read_text(encoding='utf-8')
    t = re.sub(r'((?:href|src)="(?:css|js)/[^"?#]+)(?:\?v=[^"]*)?"', rf'\1?v={BUILD}"', s)
    if '<meta name="build"' in t: t = re.sub(r'<meta name="build" content="[^"]*">', f'<meta name="build" content="{BUILD}">', t)
    else: t = t.replace('<meta charset="utf-8">', f'<meta charset="utf-8">\n<meta name="build" content="{BUILD}">', 1)
    if t != s:
        bad.append(page.name)
        if '--check' not in sys.argv: page.write_text(t, encoding='utf-8')
# ---- service worker: VERSION + PRECACHE (app shell + active cities' data, exactly as the pages request them) ----
import json
sw = ROOT / 'sw.js'
if sw.exists():
    pages = ['index.html', 'guide.html', 'restaurant.html', 'about.html', 'changes.html', 'privacy.html']
    shell = ['./', *pages, 'offline.html', 'manifest.webmanifest', 'favicon.ico']
    for page in pages:
        for u in re.findall(r'(?:href|src)="((?:css|js|vendor)/[^"#]+|https://unpkg\.com/[^"#]+)"', (ROOT / page).read_text(encoding='utf-8')):
            u = re.sub(r'\?v=[^"]*$', f'?v={BUILD}', u)
            if u not in shell: shell.append(u)
    shell += sorted(f'img/icons/{f.name}' for f in ROOT.glob('img/icons/*.png'))
    cfg = json.loads((ROOT / 'data' / 'cities.json').read_text(encoding='utf-8'))
    shell.append(f'data/cities.json?v={BUILD}')
    # the cities' JSON (~4.4 MB together) is NOT precached: it is cached network-first when a city is opened, so a first visit stays light
    s = sw.read_text(encoding='utf-8')
    t = re.sub(r"const VERSION = '[^']*'; // stamped", f"const VERSION = '{BUILD}'; // stamped", s)
    t = re.sub(r"const PRECACHE = \[.*?\]; // stamped", lambda m: 'const PRECACHE = ' + json.dumps(shell, indent=1) + '; // stamped', t, flags=re.S)
    if t != s:
        bad.append('sw.js')
        if '--check' not in sys.argv: sw.write_text(t, encoding='utf-8')
if '--check' in sys.argv:
    print(f'build {BUILD}: ' + (f'NOT stamped: {bad}' if bad else 'all pages stamped')); sys.exit(1 if bad else 0)
print(f'build {BUILD}: stamped {bad or "nothing (already current)"}')
