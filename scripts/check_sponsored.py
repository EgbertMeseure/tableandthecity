#!/usr/bin/env python3
"""Check data/sponsored.json (paid placements, shown by js/sponsored.js): every entry names a place of its own city that is on the site
(curated <city>.json or <city>-osm.json, not announced / closed), has a valid type (featured | tile | event) and start <= end dates,
and the place meets the guide's rules: no chains (data/chains-exclude.json), fast food / junk, pizza, kebab, friteries or student
places (the importers' own rules, scripts/import_osm.py). Prints which entries are live today (Brussels date); demo entries are listed
as preview-only (shown only with ?sponsored=demo).   python3 scripts/check_sponsored.py   (exit 1 on any problem)"""
import json, re, sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
ROOT = Path(__file__).resolve().parent.parent
sys.argv = [sys.argv[0]]; sys.path.insert(0, str(ROOT / 'scripts'))
import import_osm as IO
TODAY = datetime.now(ZoneInfo('Europe/Brussels')).strftime('%Y-%m-%d')
sp = json.loads((ROOT / 'data' / 'sponsored.json').read_text(encoding='utf-8'))
cfg = json.loads((ROOT / 'data' / 'cities.json').read_text(encoding='utf-8'))
CITIES = {c['id']: c for co in cfg['countries'] for c in co['cities']}
DATE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
BAN = re.compile(r'\b(pizz\w*|kebab|d[öo]ner|d[üu]r[üu]m|shoarma|shawarma|gyros|pitta?|burgers?|fast[ -]?food|fried chicken|chicken wings|hot ?dogs?)\b', re.I)
bad = 0
def fail(msg):
    global bad; bad += 1; print('FAIL', msg)
for cid, entries in (sp.get('cities') or {}).items():
    c = CITIES.get(cid)
    if not c: fail(f'{cid}: unknown city'); continue
    places = {}
    for k in ('data', 'osm'):
        if c.get(k) and (ROOT / c[k]).exists():
            d = json.loads((ROOT / c[k]).read_text(encoding='utf-8'))
            for r in d.get('restaurants', []) + d.get('places', []): places.setdefault(r['id'], r)
    for e in entries:
        tag = f"{cid}/{e.get('id')}/{e.get('type')}"
        r = places.get(e.get('id'))
        if e.get('type') not in ('featured', 'tile', 'event'): fail(f'{tag}: type must be featured, tile or event'); continue
        if not (DATE.match(e.get('start', '')) and DATE.match(e.get('end', '')) and e['start'] <= e['end']): fail(f'{tag}: start/end must be YYYY-MM-DD, start <= end'); continue
        if not r: fail(f'{tag}: no such place in {cid}'); continue
        if r.get('status') in ('closed', 'unverified'): fail(f"{tag}: place is {r.get('status')}"); continue
        tags = r.get('tags') or {}
        text = ' '.join(str(x) for x in (r.get('cuisine'), r.get('type'), r.get('category'), ' '.join(r.get('cuisineTags') or [])) if x)
        why = (IO.is_chain({**tags, 'name': r.get('name', '')}) and 'chain') or IO.never_kind(tags, r.get('name', '')) \
            or IO.pizza_kebab_kind(tags, r.get('name', ''), r.get('cuisine') or '') or (BAN.search(f"{r.get('name', '')} {text}") and 'pizza/kebab/burger/fast food')
        if why: fail(f'{tag}: {r.get("name")} breaks the guide rules ({why})'); continue
        live = e['start'] <= TODAY <= e['end']
        print(f"ok   {tag:32} {r.get('name')!r:28} {e['start']}…{e['end']} " + ('LIVE' if live else 'not live today') + (' · demo (preview only)' if e.get('demo') else ''))
print('PASS' if not bad else f'{bad} problem(s)'); sys.exit(1 if bad else 0)
