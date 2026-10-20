#!/usr/bin/env python3
"""Photo coverage of the shown places (same rules as js/common.js cardPhoto / detail gallery), and the list of places without any
photo that do have a website or Instagram handle (for researchers).  python3 scripts/photo_coverage.py gent [--missing=<path.json>]"""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
CITY = next((a for a in sys.argv[1:] if not a.startswith('-')), 'gent')
MISSING = next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--missing=')), None)
D = ROOT / 'data' / 'cities'
load = lambda n, d: json.loads((D / n).read_text()) if (D / n).exists() else d
cur = [r for r in load(f'{CITY}.json', {})['restaurants'] if r.get('status') != 'unverified']
ids = {r['id'] for r in cur}
rs = cur + [o for o in load(f'{CITY}-osm.json', {})['places'] if o['id'] not in ids and o.get('status') != 'closed']
up = [u for u in load(f'{CITY}-upcoming.json', {'upcoming': []}).get('upcoming', []) if u.get('id') and u['id'] not in ids]
heroes = load(f'{CITY}-heroes.json', {'places': {}})['places']
ig = load(f'{CITY}-instagram.json', {'places': {}, 'embed': {}})
c = {'places': len(rs), 'own_photo': 0, 'og_image': 0, 'ig_post': 0, 'ig_profile': 0, 'card': 0, 'hero': 0, 'gallery': 0}
missing = []
for r in rs:
    x = ig['places'].get(r['id'], {})
    h = r.get('instagram_handle') or ((r.get('instagram') or '').rstrip('/').split('/')[-1] if r.get('instagram') else '')
    unconf = False
    if x.get('instagram_handle'): h = x['instagram_handle']
    elif 'instagram_handle' in x: unconf = True
    photos = [p for p in r.get('photos') or [] if p.get('source') not in ('stock', 'instagram_embed')]
    hero = heroes.get(r['id']) or r.get('heroImage')
    if hero and x.get('heroReject') == hero.get('url'): hero = None
    hero = hero or x.get('heroImage')
    posts = r.get('instagram_posts') or x.get('posts') or []
    emb = bool(h and not unconf and ig['embed'].get(h, {}).get('ok'))
    kind = 'own_photo' if photos else 'og_image' if hero else 'ig_post' if posts else 'ig_profile' if emb else None
    if kind: c[kind] += 1; c['card'] += 1; c['hero'] += 1; c['gallery'] += 1
    elif r.get('website') or h:
        missing.append({'id': r['id'], 'name': r['name'], 'website': r.get('website'), 'instagram_handle': h or None,
                        'note': 'handle not confirmed by research' if unconf and h else ('Instagram profile embed does not render (renamed/removed?)' if h and not emb else None)})
c['upcoming_not_counted'] = len(up)
print(json.dumps(c))
print('no photo, but website or handle:', len(missing), '| no photo and nothing to go on:', len(rs) - c['card'] - len(missing))
if MISSING:
    Path(MISSING).write_text(json.dumps({'about': 'Shown places without any photo that have a website and/or Instagram handle. Wanted: Instagram post permalinks from the official account, or an own-site og:image photo (not a logo / text / render).',
                                         'count': len(missing), 'places': missing}, ensure_ascii=False, indent=1) + '\n')
