#!/usr/bin/env python3
"""Add eye-checked photos to places WITHOUT touching their current set (gap fill for the Fou d'O set: food ×2, inside, outside).
  python3 scripts/apply_photo_additions.py <city> <additions.json> [--dry]
additions.json = [{pid, path, cat food|drink|interior|exterior, source_type website|instagram, page_url, source_url}, ...]
Each photo is self-hosted as img/places/<city>/<id>/p<k>-{800,400}.webp (k = next free number) and appended to
data/cities/<city>-photos.json places[id].photos (the existing photos, pick, only and layout stay as they are)."""
import json, sys, os, re, glob
from pathlib import Path
from PIL import Image, ImageOps
ROOT = Path(__file__).resolve().parent.parent
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]; DRY = '--dry' in sys.argv
CITY, ADD = ARGS[0], json.load(open(ARGS[1]))
cfg = json.loads((ROOT / 'data/cities.json').read_text())
city = next(c for k in cfg['countries'] for c in k['cities'] if c['id'] == CITY)
PP = ROOT / city['photos']; PH = json.loads(PP.read_text())
NAMES = {}
for f in [city['data']] + ([city['osm']] if city.get('osm') else []):
    D = json.loads((ROOT / f).read_text())
    for r in D.get('restaurants', []) + D.get('places', []): NAMES[r['id']] = r['name']
WHAT = dict(food='food', drink='drinks', interior='the interior', exterior='the outside')
n = 0
for x in ADD:
    pid = x['pid']; name = NAMES.get(pid, pid); d = ROOT / f'img/places/{CITY}/{pid}'
    e = PH['places'].setdefault(pid, {'photos': []}); e.setdefault('photos', [])
    used = [int(m.group(1)) for f in glob.glob(str(d / 'p*-*.webp')) for m in [re.search(r'/p(\d+)-\d+\.webp$', f)] if m]
    used += [int(m.group(1)) for p in e['photos'] for m in [re.search(r'/p(\d+)-\d+\.webp$', p.get('src', ''))] if m]
    k = max(used, default=0) + 1; base = f'img/places/{CITY}/{pid}/p{k}'
    im = ImageOps.exif_transpose(Image.open(x['path'])).convert('RGB'); sizes = {}
    for W, q in ((800, 60), (400, 58)):
        w, h = im.size; y = im.resize((W, round(h * W / w)), Image.LANCZOS) if w > W else im; sizes[W] = y.size
        if not DRY: os.makedirs(d, exist_ok=True); y.save(ROOT / f'{base}-{W}.webp', 'WEBP', quality=q, method=6)
    page = x.get('page_url') or x.get('source_url') or ''
    ig = x.get('source_type') == 'instagram'
    handle = (re.search(r'instagram\.com/([A-Za-z0-9_.]+)', page) or [None, None])[1] if ig else None
    host = re.sub(r'^https?://(www\.)?', '', page).split('/')[0]
    cat = x['cat']
    e['photos'].append({'src': f'{base}-800.webp', 'thumb': f'{base}-400.webp', 'srcset': f'{base}-400.webp 400w, {base}-800.webp 800w',
                        'w': sizes[800][0], 'h': sizes[800][1], 'category': cat, 'alt': f'{name}: {WHAT[cat]}',
                        'credit': f'@{handle} on Instagram' if handle else (host or name), 'credit_url': page, 'license': "the place's own photo",
                        'source': 'own_instagram' if ig else 'own_website', 'noPeopleChecked': True, 'added': 'gap-fill 2026-10-31'})
    n += 1
if not DRY: PP.write_text(json.dumps(PH, ensure_ascii=False, indent=1) + '\n')
print(f'{CITY}: {n} photos added to {len({x["pid"] for x in ADD})} places' + (' (dry)' if DRY else ''))
