#!/usr/bin/env python3
"""Import a curated research handoff for a city (per-category files in the Gent record schema) into the site data.

  python3 scripts/import_city_handoff.py antwerpen /workspace/handoff/antwerp

Writes (idempotent; the handoff is the source of truth for the curated records):
  data/cities/<city>.json            restaurants[] = every curated record (fine dining, restaurants, new, cafés & bars,
                                     coffee, bakeries, breakfast/brunch); city meta, extraEvents and changelog are kept
  data/cities/<city>-upcoming.json   upcoming[] = the announced openings
  data/cities/<city>-veggie.json     Gent veggie layer (only places with a sourced level; 'unknown' is left out)
  data/cities/<city>-breakfast.json  Gent breakfast layer (only sourced true/false values)
Then run:  python3 scripts/import_osm.py <city> --fill-curated   (dedupes the OSM base list against these records:
similar name and < 60 m, or the same distinctive name < 150 m; the same exclusion rules apply) and the ratings script.
Hand overrides (reviewed 2026-10-25) are in OVERRIDES below; every one says why.
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CITY, SRC = sys.argv[1], Path(sys.argv[2])
sys.argv = [sys.argv[0], CITY]
sys.path.insert(0, str(ROOT / 'scripts'))
import import_osm as IO                                          # district polygons + exclusion helpers

FILES = ['fine-dining', 'restaurants', 'new', 'cafes-bars', 'coffee', 'bakeries', 'breakfast-brunch']
DROP = {'googleMapsUrl', 'openingHoursValid', 'fullyVegetarian', 'fullyVegan', 'neighbourhoodRaw', 'confidence', 'hoursSource',
        'openingMonth', 'openingMonthNote', 'veggieLevel'}
GPLACES = 'Google Maps (Places API, regularOpeningHours, checked 2026-10-25)'
OVERRIDES = {
    # hours conflicts in the handoff (dataConflict) → Google Maps hours via the Places API; none for Sanctus → empty, not guessed
    'tazu':    {'openingHours': 'Th 17:00-23:00; Fr,Sa 17:00-24:00; Mo-We,Su off', 'openingHoursSource': GPLACES, 'dataConflict': None},
    'dogma':   {'openingHours': 'Mo-Th 17:00-24:00; Fr 17:00-01:00; Sa 15:00-01:00; Su 15:00-24:00', 'openingHoursSource': GPLACES, 'dataConflict': None},
    'fuel':    {'openingHours': 'Mo-Fr 07:30-16:00; Sa,Su 09:00-16:00', 'openingHoursSource': GPLACES, 'dataConflict': None},
    'sanctus': {'openingHours': None, 'openingHoursSource': None,
                'dataConflict': 'Opening days differ: own site We–Sa, Gault&Millau Tu–Fr; Google Maps lists no hours. Hours left empty — check before you go.'},
    # Briquet: the move is confirmed (HLN restotip + Gault&Millau page list Oever 8; the new address opened in March 2026).
    # An existing restaurant (4 years, ex-Vinçotteplein Borgerhout) that moved, not a new business → not 'New' (cf. Gent's de-maecht-van-ghent)
    'briquet': {'openingHours': 'Tu-Th 17:30-23:00; Fr,Sa 12:00-15:00,17:30-23:30; Su,Mo off', 'openingHoursSource': GPLACES,
                'opened': None, 'openingDate': 'unknown', 'openingYear': 'unknown',
                'statusNote': 'Moved from Vinçotteplein (Borgerhout) to Oever 8 in March 2026 (HLN; Gault&Millau).',
                'sourcesAdd': ['https://www.hln.be/antwerpen/restaurant-briquet-verhuist-van-borgerhout-naar-het-centrum-dit-weekend-vieren-we-met-aperolslushies-en-kroketten~a07ad97c/',
                               'https://www.gaultmillau.be/nl/restaurants/briquet-antwerpen']},
    # Le Pristine: kept, no star (Michelin selection only), status stays open; the closing date stays in statusNote (not shown while open)
    'le-pristine': {'statusNote': 'Closing at the end of December 2026 (VRT NWS, 2 May 2026).'},
}
VEG = {'vegan': 'vegan', 'vegetarian': 'vegetarian', 'vegan options': 'vegan-friendly', 'vegetarian options': 'veggie-friendly'}
STYLES = ('sourdough', 'patisserie', 'viennoiserie')

district = IO.load_districts()
HEROSRC = {k: v['source'] for k, v in {**json.loads((SRC / f'{CITY}-heroes.json').read_text())['places'], **json.loads((SRC / f'{CITY}-heroes.json').read_text())['rejected']}.items() if v.get('source')}
FALLBACK = {'2610': 'Wilrijk', '2600': 'Berchem', '2140': 'Borgerhout'}


def record(p):
    r = {k: v for k, v in p.items() if k not in DROP}
    if p.get('openingMonth') and re.match(r'^\d{4}-\d{2}$', p['openingMonth']): r['opened'] = p['openingMonth']
    if not r.get('openingHours'): r['openingHours'] = None; r['openingHoursSource'] = None
    elif not r.get('openingHoursSource'): r['openingHoursSource'] = p.get('hoursSource')
    d = district(p['lat'], p['lng']) if p.get('lat') else ''
    r['district'] = d or FALLBACK.get(str(p.get('postalCode')), 'Antwerpen')
    if r.get('group') == 'bakeries':
        st = p.get('bakeryStyle') or ''
        st = [s for s in STYLES if s in (st if isinstance(st, str) else ' '.join(st)).lower()] or ([r['category']] if r['category'] in STYLES else [])
        r['bakeryStyle'] = st
        if st: r['bakeryStyleSource'] = p.get('website') or (p.get('sources') or [None])[0]
        else: r.pop('bakeryStyle')
    if not r.get('website') and (h := HEROSRC.get(r['id'])): r['website'] = h        # own site found by the hero research (heroes file)
    o = OVERRIDES.get(r['id'], {})
    for k, v in o.items():
        if k == 'sourcesAdd': r['sources'] = list(dict.fromkeys((r.get('sources') or []) + v))
        else: r[k] = v
    r.setdefault('origin', 'research-2026-10-25')
    r['city'] = CITY
    return r


def main():
    recs, seen = [], {}
    for f in FILES:
        for p in json.loads((SRC / f'{CITY}-{f}.json').read_text())['places']:
            if p['id'] in seen: continue
            seen[p['id']] = f; recs.append(record(p))
    for r in recs:                                                # same exclusion rules as the OSM import: warn, never drop silently
        if (ch := IO.is_chain({'name': r['name']})): print('WARNING chain?', r['id'], ch)
        if (nk := IO.never_kind({'cuisine': ';'.join(r.get('cuisineTags') or [])}, r['name'])): print('WARNING', nk, r['id'])
    P = ROOT / 'data' / 'cities' / f'{CITY}.json'
    cur = json.loads(P.read_text())
    keep_osm = {r['id']: r.get('osm') for r in cur.get('restaurants', []) if r.get('osm')}
    for r in recs:
        if keep_osm.get(r['id']) and not r.get('osm'): r['osm'] = keep_osm[r['id']]
    cur['restaurants'] = recs
    P.write_text(json.dumps(cur, ensure_ascii=False, indent=1) + '\n')

    U = ROOT / 'data' / 'cities' / f'{CITY}-upcoming.json'
    up = json.loads(U.read_text())
    ups = []
    for u in json.loads((SRC / f'{CITY}-upcoming.json').read_text())['upcoming']:
        x = {k: v for k, v in u.items() if k not in DROP | {'fullyVegan'}}
        x['postalCode'] = (re.search(r'\b(2\d{3})\b', u.get('address') or '') or [None, None])[1]
        x['district'] = district(u['lat'], u['lng']) or FALLBACK.get(x['postalCode'], 'Antwerpen')
        x.setdefault('geoPrecision', 'poi'); x.setdefault('dietNote', ''); x.setdefault('openingHoursSource', None)
        x.setdefault('features_evidence', {})
        ups.append(x)
    up['upcoming'] = ups
    up['excludedChecked'] = {
        'closedForGood': ['Kulminator (closed April 2026)'],
        'unclearStatus': ['Instroom / Samenloop ("temporarily" closed since Aug 2026)'],
        'oneWeakSource': ['The Bakery', 'Le Souffleur', 'Speakeasy 1833'],
        'closingSoon': ['Materia, Dageraadplaats 3: closes 14 Nov 2026 (HLN 25 Oct 2026) — remove from antwerpen.json then; its successors are listed here'],
    }
    up['dateChecked'] = '2026-10-25'
    U.write_text(json.dumps(up, ensure_ascii=False, indent=1) + '\n')

    ids = {r['id'] for r in recs} | {u['id'] for u in ups}
    vsrc = json.loads((SRC / f'{CITY}-veggie.json').read_text())['places']
    vplaces = {}
    for i, v in vsrc.items():
        lv = VEG.get(v.get('veggieLevel'))
        if lv and i in ids and v.get('sources'):
            vplaces[i] = {'veggieLevel': lv, 'sources': v['sources'], 'basis': v.get('basis') or '', **({'note': v['note']} if v.get('note') else {})}
    for u in ups:                                                  # fully vegan upcoming bakery (FUNK Noord): same source as its other shops
        if u.get('vegan') == 'yes' and u['id'] not in vplaces and u.get('sources'):
            vplaces[u['id']] = {'veggieLevel': 'vegan', 'sources': u['sources'], 'basis': u.get('description') or 'plant-based'}
    (ROOT / 'data' / 'cities' / f'{CITY}-veggie.json').write_text(json.dumps({
        'about': json.loads((ROOT / 'data/cities/gent-veggie.json').read_text())['about'], 'city': CITY, 'count': len(vplaces),
        'places': dict(sorted(vplaces.items()))}, ensure_ascii=False, indent=1) + '\n')

    bl = json.loads((SRC / f'{CITY}-breakfast-brunch.json').read_text())['breakfastLayer']['places']
    bk = {}
    for i, b in bl.items():
        if i not in ids: continue
        e = {k: x for k, x in b.items() if isinstance(x, dict) and x.get('value') is not None and x.get('source')}
        if e: bk[i] = e
    (ROOT / 'data' / 'cities' / f'{CITY}-breakfast.json').write_text(json.dumps({
        'about': 'Breakfast / brunch per place from the research handoff (own site, menu, press). Only sourced values; never guessed.',
        'handoff': str(SRC / f'{CITY}-breakfast-brunch.json'), 'places': dict(sorted(bk.items()))}, ensure_ascii=False, indent=1) + '\n')
    print(f'{len(recs)} curated records, {len(ups)} upcoming, veggie layer {len(vplaces)}, breakfast layer {len(bk)}')
    from collections import Counter
    print(Counter((r['group'], r['category']) for r in recs))
    print(Counter(r['district'] for r in recs))


if __name__ == '__main__':
    main()
