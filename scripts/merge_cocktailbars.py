#!/usr/bin/env python3
"""Merge a verified list of cocktail bars into data/cities/<city>.json (Cafés & bars › Cocktail bars). Idempotent.

  python3 scripts/merge_cocktailbars.py gent [--handoff=/workspace/handoff/gent-cocktailbars-research.json]

Input: {bars: [{name, address, lat?, lng?, website, instagram_handle, description, features: {key: {value, source}}, hours?, sources: []}], notes}
For each bar:
- Big chains (data/chains-exclude.json) are skipped. Bars with no source at all are skipped.
- Already in <city>.json (same id, or similar name < 150 m, or same name + street): becomes category 'cocktail_bar'.
  Null / unknown fields are filled (website, Instagram, hours, features with their source); curated values are never overwritten.
- Otherwise a new hand-checked record is added. Its coordinates come from the handoff, or from the OSM element of the same bar
  (data/osm/raw.json, which also covers generic bars the import now drops), or from Nominatim (cached). The record gets
  the OSM ref when one matches, so the next import_osm.py run does not add the bar twice. The description is used only as the
  research gave it, with its sources; nothing is invented.
Feature keys for cocktail bars: terrace, signatureCocktails, mocktails, foodServed, lateNight, openSunday, reservations
(other sourced keys are kept too). Notes from the research (temporary closure with an end date, seasonal hours,
'Groups of 6+ only' reservations) are in OVERRIDES. Permanently closed bars (data/osm/closed.json) are never added. Afterwards run: import_osm.py gent, veggie_layer.py gent, merge_breakfast.py gent.
"""
import importlib.util, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CITY = next((a for a in sys.argv[1:] if not a.startswith('-')), 'gent')
HANDOFF = Path(next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--handoff=')), f'/workspace/handoff/{CITY}-cocktailbars-research.json'))
CUR = ROOT / 'data' / 'cities' / f'{CITY}.json'
TODAY = '2026-10-20'
DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
DN = dict(zip(DAYS, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']))
CLOSED = ROOT / 'data' / 'osm' / 'closed.json'                  # permanently closed places: never added (import_osm.py skips them too)
# from the research notes (handoff 20 Oct 2026); applied on every run (deterministic)
OVERRIDES = {
    'Boutique & Boissons': {'status': 'temporarily closed', 'statusNote': 'Closed for renovation after Saturday 17 October 2026, for about two weeks.',
                            'statusUntil': '2026-11-03', 'statusSource': 'https://www.bars10.com/BE/Ghent/105553380849520/Boutique-%26-Boissons'},
    # weekly hours from Google Maps (read 2026-10-23); the seasonal closure from its own site stays visible as a note
    'Mexcalli': {'openingHours': 'Mo-Tu 18:00-23:00; Th 18:00-24:00; Fr-Sa 18:00-23:30; We,Su off',
                 'openingHoursSource': 'Google Maps (read 2026-10-23) https://www.google.com/maps/search/?api=1&query=Mexcalli%2C%20Beverhoutplein%2022%2C%209000%20Gent',
                 'dataConflict': 'Seasonal: according to its own website (mexcalli.be) Mexcalli is a summer garden bar May–September, indoors September–January, and closed January–May. The weekly hours are from Google Maps (read 2026-10-23), which shows no seasonal closure — check before visiting between January and May.'},
    "Jigger's": {'features_note': {'reservations': 'Groups of 6+ only'}},
    'Bar Bassie': {'features_note': {'reservations': 'Groups of 6+ only'}},
}
KEYMAP = {'signature_cocktails': 'signatureCocktails', 'mocktails_alcohol_free': 'mocktails', 'alcoholFree': 'mocktails', 'alcohol_free': 'mocktails',
          'food_served': 'foodServed', 'late_night': 'lateNight', 'open_sunday': 'openSunday', 'outdoor_seating': 'terrace'}


def _load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / f'{name}.py'); m = importlib.util.module_from_spec(spec)
    argv = sys.argv; sys.argv = [argv[0], CITY]
    try: spec.loader.exec_module(m)
    finally: sys.argv = argv
    return m


osm = _load('import_osm')                     # same_name, norm_name, dist_m, slug, is_chain
mb = _load('merge_breakfast')                 # geocode (Nominatim, cached), DEFAULTS (full record shape)


def hours_str(o):
    if isinstance(o, str): return o
    if isinstance(o, dict) and 'value' in o: return hours_str(o['value'])
    out, i = [], 0
    while i < 7:
        j = i
        while j + 1 < 7 and (o.get(DAYS[j + 1]) or '?') == (o.get(DAYS[i]) or '?'): j += 1
        out.append(f"{DN[DAYS[i]]}{'–' + DN[DAYS[j]] if j > i else ''} {(o.get(DAYS[i]) or 'unknown').replace('-', '–')}")
        i = j + 1
    return ' · '.join(out)


def street(a): return re.sub(r'\s*\d.*$', '', (a or '').split(',')[0]).strip().lower()


def unk(v): return v is None or v == '' or (isinstance(v, str) and v.lower().startswith('unknown'))


def main():
    if not HANDOFF.exists(): print(f'no handoff at {HANDOFF} — nothing to merge'); return
    ho = json.loads(HANDOFF.read_text()); cur = json.loads(CUR.read_text()); R = cur['restaurants']
    raw = [e for e in json.loads((ROOT / 'data' / 'osm' / 'raw.json').read_text())['elements'] if e.get('tags', {}).get('name')]
    ids = {r['id'] for r in R}
    closed = json.loads(CLOSED.read_text())['places'] if CLOSED.exists() else {}
    added, updated, skipped = [], [], []
    for b in ho.get('bars', []):
        name = (b.get('name') or '').strip(); srcs = [s for s in (b.get('sources') or []) if s]
        if not name or not srcs: skipped.append((name, 'no name / no source')); continue
        if (ch := osm.is_chain({'name': name})): skipped.append((name, f'chain {ch}')); continue
        if any(osm.same_name(name, c['name']) for c in closed.values()): skipped.append((name, 'closed (data/osm/closed.json)')); continue
        ll = (b['lat'], b['lng']) if b.get('lat') and b.get('lng') else None
        if not ll and b.get('address'):
            g = mb.geocode(b['address']); ll = (g['lat'], g['lng']) if g else None
        geo = 'cocktail bar research' if b.get('lat') else 'OpenStreetMap Nominatim' if ll else None
        hit = next((r for r in R if osm.same_name(name, r['name']) and (
            (ll and r.get('lat') and osm.dist_m(ll, (r['lat'], r['lng'])) < 150) or (b.get('address') and street(b['address']) == street(r.get('address'))))), None)
        m = re.search(r'-([nwr])(\d+)$', b.get('id') or '') if (b.get('id') or '').startswith('osm-') else None
        el = next((e for e in raw if m and e['type'][0] == m.group(1) and str(e['id']) == m.group(2)), None) or next((e for e in raw if osm.same_name(name, e['tags']['name']) and (
            (ll and osm.dist_m(ll, (e.get('lat') or e['center']['lat'], e.get('lon') or e['center']['lon'])) < 150)
            or (b.get('address') and street(b['address']) == (e['tags'].get('addr:street') or '').lower()))), None)
        feats = {KEYMAP.get(k, k): v for k, v in (b.get('features') or {}).items() if isinstance(v, dict) and v.get('value') is not None and v.get('source')}
        if hit:
            ch = []
            if hit.get('category') in ('cafe', None, '') and hit.get('group') in ('cafes_bars', None):   # never re-label a specific curated type (dance / brown / Irish)
                hit['group'], hit['category'] = 'cafes_bars', 'cocktail_bar'; ch.append('category')
            for k, v in (('website', b.get('website')), ('instagram_handle', b.get('instagram_handle'))):
                if v and unk(hit.get(k)): hit[k] = v; ch.append(k)
            if b.get('instagram_handle') and unk(hit.get('instagram')): hit['instagram'] = f"https://www.instagram.com/{b['instagram_handle']}/"
            if b.get('hours') and unk(hit.get('openingHours')): hit['openingHours'] = hours_str(b['hours']); hit['openingHoursSource'] = (b['hours'].get('source') if isinstance(b['hours'], dict) and b['hours'].get('source') else srcs[0]); ch.append('hours')
            hit.setdefault('features', {}); hit.setdefault('features_evidence', {})
            for k, v in feats.items():
                if hit['features'].get(k) is None: hit['features'][k] = v['value']; hit['features_evidence'][k] = v['source']; ch.append(k)
            for s in srcs:
                if s not in hit.setdefault('sources', []): hit['sources'].append(s)
            for k, v in OVERRIDES.get(name, {}).items():
                if hit.get(k) != v: hit[k] = v; ch.append(k)
            if ch: updated.append((hit['id'], ch))
            continue
        if el and not b.get('lat'): ll, geo = (el.get('lat') or el['center']['lat'], el.get('lon') or el['center']['lon']), 'OpenStreetMap'
        if not ll or not b.get('address'): skipped.append((name, 'no address / location')); continue
        base = osm.slug(re.sub(r"['’]", '', name)); rid, n = base, 2
        while rid in ids: rid = f'{base}-{n}'; n += 1
        rec = {**mb.DEFAULTS, 'id': rid, 'name': name, 'type': None, 'group': 'cafes_bars', 'category': 'cocktail_bar', 'address': b['address'],
               'district': 'Gent (9000)', 'lat': round(ll[0], 6), 'lng': round(ll[1], 6), 'geoSource': geo, 'website': b.get('website'),
               'instagram_handle': b.get('instagram_handle'), 'instagram': f"https://www.instagram.com/{b['instagram_handle']}/" if b.get('instagram_handle') else None,
               'summary': b.get('description') or '', 'summaryLang': 'en', 'status': 'open', 'events': [], 'sources': srcs, 'dateChecked': TODAY, 'lastChanged': TODAY,
               'features': {k: v['value'] for k, v in feats.items()}, 'features_evidence': {k: v['source'] for k, v in feats.items()},
               'addedBy': 'cocktail bar research handoff'}
        if b.get('hours'): rec['openingHours'] = hours_str(b['hours']); rec['openingHoursSource'] = srcs[0]
        if el: rec['osm'] = f"{el['type']}/{el['id']}"
        rec.update(OVERRIDES.get(name, {}))
        R.append(rec); ids.add(rid); added.append(rid)
    if added or updated:
        cur.setdefault('changelog', []).append({'date': TODAY, 'change': f'Cocktail bars: {len(added)} added, {len(updated)} updated from research handoff', 'source': str(HANDOFF.name)})
        CUR.write_text(json.dumps(cur, ensure_ascii=False, indent=1) + '\n')
    print(f'added {len(added)}: {added}\nupdated {len(updated)}: {updated}\nskipped {len(skipped)}: {skipped}')


if __name__ == '__main__':
    main()
