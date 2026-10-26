#!/usr/bin/env python3
"""Remove chain restaurants (data/chains-exclude.json, via import_osm.is_chain) from a city's site data already on the site.

  python3 scripts/prune_chains.py gent [--dry] [--report=/path/list.md]

<city>-osm.json is matched on the cached raw OSM tags + name; curated <city>.json / -upcoming.json only by name and only
WARNED about (a human decides), like the importer. Per-id layers are cleaned so nothing points at a removed place.
"""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
CITY = next((a for a in sys.argv[1:] if not a.startswith('-')), 'gent')
OPT = {a.split('=', 1)[0]: (a.split('=', 1)[1] if '=' in a else True) for a in sys.argv[1:] if a.startswith('--')}
sys.argv = [sys.argv[0], CITY]; sys.path.insert(0, str(ROOT / 'scripts'))
import import_osm as IO


def load(p):
    t = p.read_text(); return json.loads(t), t


def save(p, obj, text):  # keep each file's JSON style (same as prune_pizza_kebab.py)
    if '--dry' in OPT: return
    if text.startswith('{"'): out = json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
    elif text.startswith('{\n"'): out = json.dumps(obj, ensure_ascii=False, indent=0)
    elif text.startswith('{\n  "'): out = json.dumps(obj, ensure_ascii=False, indent=2)
    else: out = json.dumps(obj, ensure_ascii=False, indent=1)
    p.write_text(out + ('\n' if text.endswith('\n') else ''))


D = ROOT / 'data' / 'cities'
raw = {f"{e['type']}/{e['id']}": e.get('tags', {}) for e in json.loads(IO.RAW.read_text())['elements']}
removed = []
p = D / f'{CITY}-osm.json'; osm, t = load(p); keep = []
for r in osm['places']:
    ch = IO.is_chain({**raw.get(r.get('osm'), {}), 'name': r['name']}) or IO.is_chain({'name': r['name']})
    if ch: removed.append((r['id'], r['name'], ch, r.get('address') or '')); continue
    keep.append(r)
osm['places'] = keep; osm['count'] = len(keep); save(p, osm, t)
for fn, key in ((f'{CITY}.json', 'restaurants'), (f'{CITY}-upcoming.json', 'upcoming')):
    d, _ = load(D / fn)
    for r in d.get(key, []):
        if (ch := IO.is_chain({'name': r['name']})): print(f'WARNING curated/upcoming {r["id"]} looks like chain {ch}: review by hand')
ids = {x[0] for x in removed}
for f in sorted(D.glob(f'{CITY}-*.json')):
    if f.name == f'{CITY}-osm.json': continue
    d, t = load(f); hit = False
    for key in ('places', 'rejected', 'restaurants'):
        if isinstance(d, dict) and isinstance(d.get(key), dict) and ids & set(d[key]):
            for i in ids: d[key].pop(i, None)
            hit = True
    if hit: save(f, d, t)
kp = ROOT / 'data' / 'osm' / 'keep-exceptions.json'; d, t = load(kp)
if ids & set(d['keep']):
    for i in ids: d['keep'].pop(i, None)
    save(kp, d, t)
for x in removed: print('REMOVED', CITY, *x)
print(f'{CITY}: removed {len(removed)} chain places')
if OPT.get('--report'):
    with open(OPT['--report'], 'a') as f:
        f.write(f"\n### {CITY}: {len(removed)} removed\n\n| id | name | chain | address |\n|---|---|---|---|\n")
        for i, n, ch, a in removed: f.write(f"| {i} | {n} | {ch} | {a} |\n")
