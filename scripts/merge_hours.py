#!/usr/bin/env python3
"""Merge researched opening hours (+ closures, a temporary closure and address corrections) into the OSM base list.

  python3 scripts/merge_hours.py gent [--handoff=/workspace/handoff/gent-hours-research.json] [--dry-run]

Handoff shape: {hours:[{id,name,openingHours,source,confidence,note}], closed:[{id,name,source,note}], notes:[...]}

What it does (idempotent — re-running gives the same files):
1. Every openingHours string is parsed with js/hours.js (node). Strings it cannot read are skipped and printed.
2. Valid entries are stored by OSM ref in data/osm/hours-research.json (the persistent layer; import_osm.py re-applies it
   after every OSM re-import, so researched hours survive --refresh) and applied to data/cities/<city>-osm.json:
   openingHours, openingHoursSource (the source URL) and openingHoursConfidence (high | medium).
   Hours that come from OSM itself (opening_hours tag) are NEVER overwritten: such entries are reported and left out.
3. The handoff's permanently closed places go to data/osm/closed.json (key = OSM ref, with source/note); they are removed from
   <city>-osm.json now (the import skips them from then on).
4. CORRECTIONS below (sourced address moves and temporary closures) are written into data/osm/corrections.json, which
   import_osm.py applies on top of OSM tags (sets correctionSource), and applied to <city>-osm.json right away.
"""
import json, subprocess, sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CITY = next((a for a in sys.argv[1:] if not a.startswith('-')), 'gent')
HANDOFF = Path(next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--handoff=')), '/workspace/handoff/gent-hours-research.json'))
DRY = '--dry-run' in sys.argv
OSMF = ROOT / 'data' / 'cities' / f'{CITY}-osm.json'
LAYER = ROOT / 'data' / 'osm' / 'hours-research.json'
CLOSED = ROOT / 'data' / 'osm' / 'closed.json'
CORR = ROOT / 'data' / 'osm' / 'corrections.json'
TODAY = date.today().isoformat()

# Sourced corrections (OSM ref → fields). Addresses confirmed with Nominatim (building match at that number, 20 Oct 2026).
CORRECTIONS = {
    'way/493483121': {'_name': 'Ikura', 'address': 'Jan Breydelstraat 8, 9000 Gent', 'postalCode': '9000', 'lat': 51.0558696, 'lng': 3.7204115,
                      'neighbourhood': 'Patershol', 'source': 'https://ikurasushi.be/ (new location Jan Breydelstraat 8; geocoded with Nominatim)'},
    'node/10277884384': {'_name': 'Bistro Jeanne', 'address': 'Leo Tertzweillaan 3, 9050 Gentbrugge', 'postalCode': '9050', 'lat': 51.0408766, 'lng': 3.754368,
                         'source': 'https://www.bistrojeanne.be/ (address on own site; geocoded with Nominatim)'},
    'node/5825400253': {'_name': 'Aywa', 'address': 'Lammerstraat 12, 9000 Gent', 'postalCode': '9000', 'lat': 51.0478939, 'lng': 3.7281707,
                        'source': 'https://nonoresto.be/restaurant/aywa/ + Visit Gent register (Lammerstraat 12; geocoded with Nominatim)'},
    'node/7085959385': {'_name': 'Open Wok', 'address': 'Schoolstraat 6, 9040 Sint-Amandsberg', 'postalCode': '9040', 'lat': 51.0602466, 'lng': 3.7479681,
                        'source': 'https://openwok.be/ (Schoolstraat 6, 9040 Sint-Amandsberg; geocoded with Nominatim)'},
    # Holiday closure Mon 19 – Wed 21 Oct 2026; statusUntil = last closed day (the site shows it as open again from Thu 22 Oct).
    'node/11352130038': {'_name': 'Tokyo Sushi', 'status': 'temporarily closed', 'statusUntil': '2026-10-21',
                         'statusNote': 'Closed for holidays from Monday 19 to Wednesday 21 October 2026; open again from Thursday 22 October.',
                         'source': 'https://gent.tokyosushi.be/nl/Contact'},
}


def node_check(strings):
    """Parse each string with js/hours.js → {string: None | reason}."""
    js = ("const H=require(process.argv[1]);const a=JSON.parse(require('fs').readFileSync(0,'utf8'));"
          "const o={};for(const s of a){const p=H.parse(s);o[s]=p.ok?null:(p.reason||'not parsed');}process.stdout.write(JSON.stringify(o));")
    out = subprocess.run(['node', '-e', js, str(ROOT / 'js' / 'hours.js')], input=json.dumps(strings), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def dump(path, obj, compact=False):
    if DRY: return
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + '\n' if compact else json.dumps(obj, ensure_ascii=False, indent=1) + '\n')


def main():
    h = json.loads(HANDOFF.read_text())
    osm = json.loads(OSMF.read_text()); places = osm['places']; by = {r['id']: r for r in places}
    layer = json.loads(LAYER.read_text()) if LAYER.exists() else {'places': {}}
    bad = node_check(sorted({e['openingHours'] for e in h.get('hours', []) if e.get('openingHours')}))
    stats = {'handoff': len(h.get('hours', [])), 'set': 0, 'unchanged': 0, 'kept_osm': 0, 'parse_fail': 0, 'unknown_id': 0}
    fails, kept, unknown = [], [], []
    for e in h.get('hours', []):
        r = by.get(e['id'])
        if not r: stats['unknown_id'] += 1; unknown.append(e['id']); continue
        if not e.get('openingHours') or bad.get(e['openingHours']):
            stats['parse_fail'] += 1; fails.append((e['id'], e['name'], e.get('openingHours'), bad.get(e.get('openingHours'), 'empty'))); continue
        layer['places'][r['osm']] = {'id': r['id'], 'name': e['name'], 'openingHours': e['openingHours'], 'source': e['source'],
                                     'confidence': e.get('confidence'), 'note': e.get('note'), 'checked': layer['places'].get(r['osm'], {}).get('checked', TODAY)}
        if r.get('openingHours') and r.get('openingHoursSource') in (None, 'OpenStreetMap'):   # hours from the OSM tag itself: never overwritten
            stats['kept_osm'] += 1; kept.append((e['id'], r['openingHours'], e['openingHours'])); continue
        new = {'openingHours': e['openingHours'], 'openingHoursSource': e['source'], 'openingHoursConfidence': e.get('confidence')}
        if all(r.get(k) == v for k, v in new.items()): stats['unchanged'] += 1
        else: r.update(new); stats['set'] += 1
    # closures
    closed = json.loads(CLOSED.read_text())
    removed = []
    for c in h.get('closed', []):
        r = by.get(c['id'])
        ref = r['osm'] if r else next((k for k, v in closed['places'].items() if v.get('id') == c['id']), f"name:{c['name']}")
        entry = {'name': c['name'], 'id': c['id'], 'address': (r or {}).get('address') or closed['places'].get(ref, {}).get('address'),
                 'closed': 'yes', 'source': c['source'], 'note': c.get('note')}
        if c['id'] == 'osm-silver-city-w626907760':
            entry['certainty'] = 'less certain: the owners called it a closure "for an indefinite period" (Sep 2023) and might restart; no reopening found (Oct 2026)'
        closed['places'][ref] = {k: v for k, v in entry.items() if v}
        if r: places.remove(r); removed.append(c['id'])
    # corrections
    corr = json.loads(CORR.read_text())
    applied = []
    for ref, c in CORRECTIONS.items():
        corr['places'][ref] = {k: v for k, v in c.items() if not k.startswith('_')}
        r = next((x for x in places if x.get('osm') == ref), None)
        if not r: print(f'correction: {c["_name"]} ({ref}) not in {OSMF.name}'); continue
        r.update({k: v for k, v in c.items() if k != 'source' and not k.startswith('_')}); r['correctionSource'] = c['source']
        if 'address' in c: r.pop('addressApprox', None)
        applied.append(c['_name'])
    layer = {'about': 'Researched opening hours for OSM places without an opening_hours tag (key = OSM ref). Written by scripts/merge_hours.py; '
                      'import_osm.py re-applies them after each OSM import, only where OSM has no hours. Every string parses with js/hours.js.',
             'places': dict(sorted(layer['places'].items()))}
    osm['count'] = len(places)
    dump(LAYER, layer); dump(CLOSED, closed); dump(CORR, corr); dump(OSMF, osm, compact=True)
    print('hours:', stats)
    for f in fails: print('  PARSE FAIL (skipped):', f)
    for k in kept: print('  OSM hours kept:', k)
    for u in unknown: print('  unknown id:', u)
    print(f'closed: {len(h.get("closed", []))} in closed.json, removed from {OSMF.name}: {removed}')
    print('corrections applied:', applied)


if __name__ == '__main__':
    main()
