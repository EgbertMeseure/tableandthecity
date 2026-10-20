#!/usr/bin/env python3
"""Build data/cities/<city>-breakfast.json: breakfast / brunch per place, sourced. We never guess.

Inputs, in precedence order (higher wins per field):
 1. /workspace/handoff/<city>-breakfast-research.json, or the path given with --handoff=…, from the research pass (own website, menu,
    Instagram bio, press cross-checked). Format: {places:{id:{breakfast,brunch,brunchDays?,breakfastHours?:{value,source,note?}}}, missing:[…], notes}.
    Only fields with a value AND a source are used.
 2. Explicit OpenStreetMap tags on the place's element: breakfast=yes|no, brunch=yes|no, cuisine=…breakfast…|…brunch… (positive only).
Curated records are matched by their 'osm' ref, OSM records by their own.
Output: {"places": {"<id>": {"breakfast": {value, source, note?}, "brunch": {…}, "brunchDays": {…}, "breakfastHours": {…}}}}.
'missing' places from the handoff are added to <city>.json only if they come with name, address, lat/lng, group and a source,
and are not there yet. Otherwise they are listed in the output under "missingNotAdded" for a human to check.
Idempotent: same inputs → same file. "Open early" is NOT stored here; the site derives it from sourced opening hours, and it is
always shown as a fact ("Opens at 08:00"), never as "serves breakfast".
  python3 scripts/merge_breakfast.py gent [--handoff=path]
"""
import json, re, sys, unicodedata
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CITY = next((a for a in sys.argv[1:] if not a.startswith('-')), 'gent')
HANDOFF = Path(next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--handoff=')), f'/workspace/handoff/{CITY}-breakfast-research.json'))
CUR = ROOT / 'data' / 'cities' / f'{CITY}.json'
OSM = ROOT / 'data' / 'cities' / f'{CITY}-osm.json'
RAW = ROOT / 'data' / 'osm' / 'raw.json'
OUT = ROOT / 'data' / 'cities' / f'{CITY}-breakfast.json'
FIELDS = ('breakfast', 'brunch', 'brunchDays', 'breakfastHours')
CHAINS = json.loads((ROOT / 'data' / 'chains-exclude.json').read_text())['chains']


DEFAULTS = {"cuisine": "", "cuisineTags": [], "chef": "unknown", "postalCode": None, "district": "", "neighbourhood": "", "geoSource": "OpenStreetMap Nominatim", "priceLevel": "unknown", "priceFrom": None, "distinctions": {"michelin": None, "gaultMillau": None}, "openingYear": "unknown", "openingDate": "unknown", "isNew": False, "vegetarian": "unknown", "vegan": "unknown", "dietNote": "", "menuType": "unknown", "menuChanges": "unknown", "currentMenuNote": "unknown", "statusNote": "", "instagram": None, "phone": None, "dataConflict": None, "lastChanged": "2026-10-20", "city": "Gent", "country": "Belgium", "summaryLang": "en", "photos": [], "instagram_posts": [], "reservation_url": None}   # full record shape (unknowns, never invented)


def is_chain(t):
    n = unicodedata.normalize('NFKD', t.get('name') or '').encode('ascii', 'ignore').decode().lower().replace('’', "'")
    return next((c['name'] for c in CHAINS if any(re.match(p, n) for p in c.get('patterns', []))), None)


def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


GEO = ROOT / 'data' / 'osm' / 'geocode-cache.json'


def geocode(addr):
    """Nominatim (OpenStreetMap) lookup for one address, cached; polite (UA, 1 req/s). Only accepted inside Gent."""
    import time, urllib.parse, urllib.request
    cache = json.loads(GEO.read_text()) if GEO.exists() else {}
    if addr not in cache:
        time.sleep(1.1)
        q = urllib.parse.urlencode({'q': addr, 'format': 'json', 'limit': 1, 'countrycodes': 'be', 'addressdetails': 0})
        req = urllib.request.Request(f'https://nominatim.openstreetmap.org/search?{q}', headers={'User-Agent': 'TableAndTheCity-data/1.0 (+https://tableandthecity.com)'})
        res = json.loads(urllib.request.urlopen(req, timeout=20).read())
        cache[addr] = {'lat': round(float(res[0]['lat']), 6), 'lng': round(float(res[0]['lon']), 6), 'geoSource': 'OpenStreetMap Nominatim'} if res and 'Gent' in res[0].get('display_name', '') and (not (pc := re.search(r'\b9\d{3}\b', addr)) or pc.group(0) in res[0]['display_name']) else {}
        GEO.write_text(json.dumps(cache, ensure_ascii=False, indent=1) + '\n')
    return cache[addr]


def osm_values(t, ref):
    src = f'https://www.openstreetmap.org/{ref}'
    cu = [c.strip().lower() for c in (t.get('cuisine') or '').split(';')]
    out = {}
    for k in ('breakfast', 'brunch'):
        v = t.get(k)
        if v in ('yes', 'no'): out[k] = {'value': v == 'yes', 'source': src, 'note': f'OpenStreetMap: {k}={v}'}
        elif k in cu: out[k] = {'value': True, 'source': src, 'note': f"OpenStreetMap: cuisine={t['cuisine']}"}
    return out


def main():
    cur = json.loads(CUR.read_text()); osm = json.loads(OSM.read_text())['places']
    raw = {f"{e['type']}/{e['id']}": e.get('tags', {}) for e in json.loads(RAW.read_text())['elements']}
    by_ref = {r['osm']: r['id'] for r in cur['restaurants'] if r.get('osm')}
    by_ref.update({o['osm']: o['id'] for o in osm if o.get('osm')})
    ids = {r['id'] for r in cur['restaurants']} | {o['id'] for o in osm}
    places, n_osm, n_ho = {}, 0, 0
    for ref, rid in by_ref.items():
        v = osm_values(raw.get(ref, {}), ref)
        if v: places.setdefault(rid, {}).update(v); n_osm += 1
    missing_left, added = [], []
    OWN = ROOT / 'data' / 'osm' / 'breakfast-own-checks.json'                 # our own sourced checks (same rank as the handoff)
    if HANDOFF.exists():
        ho = json.loads(HANDOFF.read_text())
        for rid, rec in (ho.get('places') or {}).items():
            if rid not in ids: missing_left.append({'id': rid, 'why': 'unknown id'}); continue
            got = {k: {kk: vv for kk, vv in rec[k].items() if kk in ('value', 'source', 'note')}
                   for k in FIELDS if isinstance(rec.get(k), dict) and rec[k].get('value') is not None and rec[k].get('source')}
            if got: places.setdefault(rid, {}).update(got); n_ho += 1      # research beats OSM tags
        for m in ho.get('missing') or []:
            if (ch := is_chain({'name': m.get('name', '')})): missing_left.append({'name': m.get('name'), 'why': f'big chain ({ch}), excluded'}); continue
            if all('happycow.net' in u for u in (m.get('sources') or [m.get('source') or ''])):
                missing_left.append({'name': m.get('name'), 'why': 'only a HappyCow listing — not verifiable beyond it'}); continue
            if m.get('address') and not m.get('lat'): m.update(geocode(m['address']))          # address → coordinates (Nominatim, cached)
            m.setdefault('group', 'restaurants')                                             # unsure → generic restaurant
            ok = all(m.get(k) for k in ('name', 'address', 'lat', 'lng', 'group')) and (m.get('source') or m.get('sources'))
            rid = m.get('id') or slug(m.get('name', ''))
            if not ok or rid in ids: missing_left.append({'name': m.get('name'), 'why': 'already listed' if rid in ids else 'not verified with address / location / source'}); continue
            srcs = m.get('sources') or [m['source']]
            cur['restaurants'].append({**DEFAULTS, 'district': 'Gent (9000)', 'id': rid, 'name': m['name'], 'group': m['group'], 'category': m.get('category') or {'restaurants': 'restaurant', 'coffee': 'coffee_house', 'bakeries': 'bakery', 'cafes_bars': 'cafe'}[m['group']],
                                       'type': None, 'address': m['address'], 'lat': m['lat'], 'lng': m['lng'], 'geoSource': m.get('geoSource', 'research handoff'), 'website': m.get('website'), 'status': 'open',
                                       'sources': srcs, 'summary': '', 'events': [], 'features': {}, 'features_evidence': {}, 'dateChecked': date.today().isoformat(),
                                       'addedBy': 'breakfast research handoff'})
            ids.add(rid); added.append(rid)
            vals = {k: m[k] for k in FIELDS if isinstance(m.get(k), dict) and m[k].get('value') is not None and m[k].get('source')}
            if vals: places[rid] = vals
        if added: CUR.write_text(json.dumps(cur, ensure_ascii=False, indent=1) + '\n')
    if OWN.exists():
        for rid, rec in json.loads(OWN.read_text())['places'].items():
            if rid in ids: places.setdefault(rid, {}).update({k: v for k, v in rec.items() if k in FIELDS and v.get('source') and v.get('value') is not None})
    out = {'about': 'Breakfast / brunch per place: research handoff (own site, menu, press cross-checked) over explicit OpenStreetMap tags. Built by scripts/merge_breakfast.py. Never guessed.',
           'handoff': str(HANDOFF) if HANDOFF.exists() else None, 'places': dict(sorted(places.items())), 'missingNotAdded': missing_left}
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n')
    yes = lambda k: sum(1 for p in places.values() if (p.get(k) or {}).get('value') is True)
    print(f'{len(places)} places → {OUT.relative_to(ROOT)}: breakfast {yes("breakfast")}, brunch {yes("brunch")} '
          f'(OSM tags {n_osm}, handoff {n_ho}{", handoff file not found" if not HANDOFF.exists() else ""}); added {len(added)} missing places; {len(missing_left)} not added')


if __name__ == '__main__':
    main()
