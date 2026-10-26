#!/usr/bin/env python3
"""Apply Google Maps opening hours and place types (from scripts/fetch_google_ratings.py) to a city's data.

  python3 scripts/apply_google_places.py <city> [--dry-run]

Reads data/osm/<city>-google-places.json (one entry per confident Google match: hours as an OSM opening_hours string,
primaryType, types) and updates data/cities/<city>-osm.json and the curated data/cities/<city>.json:
1. Opening hours: Google Maps first. Every Google string is checked with js/hours.js; a valid one replaces the record's
   openingHours (openingHoursSource = Google Maps). No Google hours -> the OSM / researched hours stay.
2. Exclusions the OSM tags missed: Google primaryType pizza_restaurant / kebab_shop (always), fast_food_restaurant /
   hamburger_restaurant / sandwich_shop / chicken_restaurant (OSM base list only). Dropped places are listed in
   data/osm/<city>-google-excluded.json with the reason.
Run order after an OSM re-import or a handoff import:  import_osm.py <city> [--fill-curated]  ->  fetch_google_ratings.py
<city> --raw FILE [--offline]  ->  this script. Idempotent.
"""
import json, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CITY = next(a for a in sys.argv[1:] if not a.startswith('-'))
DRY = '--dry-run' in sys.argv
G = json.loads((ROOT / 'data' / 'osm' / f'{CITY}-google-places.json').read_text())
SRC = f"Google Maps (Places API, regularOpeningHours, checked {G['fetched']})"
ALWAYS = {'pizza_restaurant': 'pizza place (Google type)', 'kebab_shop': 'kebab shop (Google type)'}
OSM_ONLY = {'fast_food_restaurant': 'fast food (Google type)', 'hamburger_restaurant': 'burger fast food (Google type)',
            'sandwich_shop': 'sandwich shop (Google type)', 'chicken_restaurant': 'chicken fast food (Google type)'}

def valid(strings):
    js = ("const H=require(process.argv[1]);const a=JSON.parse(require('fs').readFileSync(0,'utf8'));"
          "console.log(JSON.stringify(a.map(s=>H.parse(s).ok)))")
    out = subprocess.run(['node', '-e', js, str(ROOT / 'js' / 'hours.js')], input=json.dumps(strings), capture_output=True, text=True, check=True)
    return dict(zip(strings, json.loads(out.stdout)))

P = G['places']
ok = valid(sorted({g['openingHours'] for g in P.values() if g.get('openingHours')}))
excluded, stats = [], {'hours_google': 0, 'hours_kept': 0, 'hours_invalid': 0}

def apply(recs, src):
    keep = []
    for r in recs:
        g = P.get(r['id'])
        if g:
            t = g.get('primaryType')
            why = ALWAYS.get(t) or (OSM_ONLY.get(t) if src == 'osm' else None)
            if why:
                excluded.append({'id': r['id'], 'name': r['name'], 'src': src, 'google': g.get('google'), 'primaryType': t, 'why': why}); continue
            h = g.get('openingHours')
            if h and ok.get(h):
                r['openingHours'] = h; r['openingHoursSource'] = SRC; stats['hours_google'] += 1
                for k in ('openingHoursConfidence', 'openingHoursNote'): r.pop(k, None)
            elif h: stats['hours_invalid'] += 1
            else: stats['hours_kept'] += 1
        keep.append(r)
    return keep

op = ROOT / 'data' / 'cities' / f'{CITY}-osm.json'; o = json.loads(op.read_text())
o['places'] = apply(o['places'], 'osm'); o['count'] = len(o['places'])
cp = ROOT / 'data' / 'cities' / f'{CITY}.json'; c = json.loads(cp.read_text())
c['restaurants'] = apply(c['restaurants'], 'curated')
print(CITY, stats, 'excluded:', len(excluded))
for e in excluded: print('  -', e['src'], e['name'], '->', e['google'], e['primaryType'])
if not DRY:
    op.write_text(json.dumps(o, ensure_ascii=False, separators=(',', ':')) + '\n')
    cp.write_text(json.dumps(c, ensure_ascii=False, indent=1) + '\n')
    ex = ROOT / 'data' / 'osm' / f'{CITY}-google-excluded.json'
    prev = {e['id']: e for e in (json.loads(ex.read_text()) if ex.exists() else [])}
    prev.update({e['id']: e for e in excluded})
    ex.write_text(json.dumps(sorted(prev.values(), key=lambda e: e['id']), ensure_ascii=False, indent=1) + '\n')
