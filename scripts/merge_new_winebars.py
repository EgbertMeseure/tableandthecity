#!/usr/bin/env python3
"""Merge the new-openings + wine-bar research (handoff 2026-10-25) into the data.

Inputs (outside the repo): /workspace/handoff/gent-new-upcoming.json, /workspace/handoff/gent-winebars.json
- places already in gent.json   -> `opened` (drives 'New since <Month YYYY>') where the research gives a month
- places already in the OSM list -> data/osm/corrections.json (survives a re-import) + the same fields in gent-osm.json
- new places                     -> appended to gent.json (curated), with the research's text, hours, website, diet info
Skipped on purpose (see SKIP): low confidence / borderline for the guide. Conflicts (CONFLICTS) keep the existing data.
Run once; re-running is a no-op for places already merged.
"""
import json, math, re, unicodedata, datetime
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]; H = Path('/workspace/handoff')
TODAY = '2026-10-25'
CUR, OSM = ROOT / 'data/cities/gent.json', ROOT / 'data/cities/gent-osm.json'
CORR, VEG, UP = ROOT / 'data/osm/corrections.json', ROOT / 'data/cities/gent-veggie.json', ROOT / 'data/cities/gent-upcoming.json'

SKIP = {
    'STILL.': 'borderline generic coffee/brunch house (research flag); stays in the OSM list unchanged',
    'Nono': 'low confidence, borderline generic brunch/coffee house; stays in the OSM list unchanged',
    'Bar Edward': 'low confidence; social project open on Wednesdays only (borderline for a guide)',
    'Café Rosa': 'borderline generic café, house number unverified and not found on Google Places',
    'Fari': 'flagged borderline; already in gent.json with opened 2026-05, left as is',
    'Lunchbar ROMM': 'upcoming without an opening month (low confidence): not shown as Opening soon',
    'Dirt.': 'no opening month in the research (already in the OSM list, fully vegan): not marked New',
}
CONFLICTS = {
    'Le ChouChou': 'days: HLN We–Su vs Nieuwsblad dinner We–Sa — existing data kept',
    'Fine N Fast': 'hours: own site Mo–Sa 11:30–22:00 vs HLN 12–14 + 18:30–22 — existing (own site) kept',
    'Speenghar Restaurant': 'address: HLN Phoenixstraat 59 vs OSM/directories 22 — existing kept',
}
# exact opening days where a source gives one (gent-upcoming.json excludedChecked / research notes)
DAY = {'The Gentle': '2026-10-03', 'Flordi': '2026-10-02', 'SOAN': '2025-11-20'}
# existing OSM places: group/category fixes (wine bars to Cafés & bars; the all-day café-bar Edmond too)
OSM_CAT = {'osm-albertini-n13296111878': ('cafes_bars', 'wine_bar'), 'osm-win-n12574625746': ('cafes_bars', 'wine_bar'),
           'osm-bar-terroir-n9248442976': ('cafes_bars', 'wine_bar'), 'osm-edel-rot-n11157734893': ('cafes_bars', 'wine_bar'),
           'osm-edmond-n11897518892': ('cafes_bars', 'cafe')}
OSM_HOURS = {'osm-albertini-n13296111878', 'osm-win-n12574625746', 'osm-bar-terroir-n9248442976'}   # own site, read 2026-10-25
# new places: group / category / cuisine tags / id
NEW = {
    'The Gentle': ('cafes_bars', 'cafe', []), 'Tshiela': ('cafes_bars', 'cafe', []), 'Café Guido': ('cafes_bars', 'cafe', []),
    'Vicino': ('cafes_bars', 'wine_bar', []), 'The Generous': ('cafes_bars', 'wine_bar', []), 'La Matta': ('cafes_bars', 'cafe', []),
    'Pica Beans': ('coffee', 'coffee_house', []), 'Bar Martine': ('cafes_bars', 'cafe', []), 'Café Copain': ('cafes_bars', 'cafe', []),
    'Rendez-Vous': ('cafes_bars', 'cocktail_bar', []), 'ONA Nederkouter': ('cafes_bars', 'wine_bar', []), 'ONA Belfort': ('cafes_bars', 'wine_bar', []),
    'Hey Frankie': ('cafes_bars', 'wine_bar', []), 'Vinogradoff': ('cafes_bars', 'wine_bar', []), 'Parole Winebar & Co': ('cafes_bars', 'wine_bar', []),
}
GEO = {'Parole Winebar & Co': (51.0526653, 3.7241181, 'Google Places (Text Search, 2026-10-25)')}
NAME = {'Parole Winebar & Co': 'Parole'}

def slug(s): return re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()).strip('-')
def meters(a, b, c, d):
    R = 6371000; p1, p2 = math.radians(a), math.radians(c)
    return 2 * R * math.asin(math.sqrt(math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(d - b) / 2) ** 2))
def dump(p, d): p.write_text(json.dumps(d, ensure_ascii=False, indent=1) + '\n')
def osm_ref(eid): m = re.search(r'-([nwr])(\d+)$', eid); return {'n': 'node', 'w': 'way', 'r': 'relation'}[m[1]] + '/' + m[2]
DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
def has_day(h, dd):
    """True if the OSM hours string opens on day dd (simple day lists/ranges; 'off' rules excluded)."""
    if not h: return None
    for rule in h.split(';'):
        rule = rule.strip()
        if not rule or rule.endswith('off'): continue
        days = rule.split(' ')[0]
        for part in days.split(','):
            if '-' in part:
                a, b = part.split('-'); i, j = DAYS.index(a), DAYS.index(b)
                rng = [DAYS[(i + k) % 7] for k in range((j - i) % 7 + 1)]
            else: rng = [part]
            if dd in rng: return True
    return False

def main():
    E = json.loads((H / 'gent-new-upcoming.json').read_text())['entries']
    W = json.loads((H / 'gent-winebars.json').read_text())['entries']
    by = {}
    for e in E + W: by.setdefault(e['name'], {}).update({k: v for k, v in e.items() if v not in (None, '', [])})
    cur, osm = json.loads(CUR.read_text()), json.loads(OSM.read_text())
    corr, veg, up = json.loads(CORR.read_text()), json.loads(VEG.read_text()), json.loads(UP.read_text())
    C = {r['id']: r for r in cur['restaurants']}; O = {r['id']: r for r in osm['places']}
    log = {'updated': [], 'added': [], 'skipped': dict(SKIP), 'conflicts': dict(CONFLICTS), 'confirmed': []}
    chg = cur.setdefault('changelog', [])
    allpts = [r for r in cur['restaurants'] + osm['places'] if r.get('lat')]
    for name, e in by.items():
        if name in SKIP: continue
        om = DAY.get(name) or e.get('openingMonth')
        eid = e.get('existingId')
        if eid and eid in C:                                             # curated: confirm / add the opening month
            r = C[eid]
            if om and r.get('opened') and r['opened'][:7] == om[:7]: log['confirmed'].append(f"{r['name']} ({r['opened']})"); continue
            if om and not r.get('opened'):
                r['opened'] = om
                if not re.match(r'^\d{4}-\d\d', str(r.get('openingDate'))): r['openingDate'] = om
                r['openingYear'] = int(om[:4]); r['lastChanged'] = TODAY
                src = next((s for s in e.get('sources', []) if s not in r.get('sources', [])), None)
                if src: r.setdefault('sources', []).append(src)
                chg.append({'date': TODAY, 'restaurant': r['name'], 'field': 'opened', 'change': f'Opened {om} (new-openings research, 2026-10-25).', 'source': (e.get('sources') or [''])[0]})
                log['updated'].append(f"{r['name']}: opened {om}")
            elif om: log['confirmed'].append(f"{r['name']} (kept {r.get('opened')}; research {om})")
            continue
        if eid and eid in O:                                             # OSM base list: sourced correction (survives a re-import)
            r, ref = O[eid], osm_ref(eid); c = dict(corr['places'].get(ref, {})); did = []
            if om and not r.get('opened'): c['opened'] = om; did.append(f'opened {om}')
            if eid in OSM_CAT and (r.get('group'), r.get('category')) != OSM_CAT[eid]:
                c['group'], c['category'] = OSM_CAT[eid]; c['cuisineTags'] = []; did.append(f'{OSM_CAT[eid][0]}/{OSM_CAT[eid][1]}')
            if eid in OSM_HOURS and e.get('openingHours') and e['openingHours'] != r.get('openingHours'):
                c['openingHours'] = e['openingHours']; c['openingHoursSource'] = e['sources'][0]; c['openingHoursConfidence'] = 'high'; did.append('hours (own site)')
            if e.get('description') and not r.get('summary'): c['summary'] = e['description']; c['summarySource'] = e['sources'][0]; did.append('summary')
            if e.get('website') and not r.get('website'): c['website'] = e['website']; did.append('website')
            if not did: log['confirmed'].append(f"{r['name']} (OSM, nothing to change)"); continue
            c['source'] = ' | '.join(dict.fromkeys(([c['source']] if c.get('source') else []) + e['sources'][:2]))
            corr['places'][ref] = c; r.update({k: v for k, v in c.items() if k != 'source'}); r['correctionSource'] = c['source']
            log['updated'].append(f"{r['name']} (OSM): " + ', '.join(did)); continue
        if name not in NEW: log['skipped'][name] = 'not in the add list'; continue
        g, cat, tags = NEW[name]
        lat, lng, gsrc = GEO.get(name) or (e['lat'], e['lon'], e.get('geoSource') or 'research')
        core = lambda n: re.sub(r'\b(cafe|bar|the|de|le|la)\b|-', '', slug(n))
        dup = [r['id'] for r in allpts if meters(lat, lng, r['lat'], r['lng']) < 60 and core(NAME.get(name, name))[:5] in core(r['name'])]
        if dup or slug(NAME.get(name, name)) in C: log['skipped'][name] = f'already present: {dup}'; continue
        near = min((r for r in allpts if r.get('neighbourhood')), key=lambda r: meters(lat, lng, r['lat'], r['lng']))
        h = e.get('openingHours'); vv = (e.get('veggieVegan') or '').lower()
        rid = slug(NAME.get(name, name)); pc = (re.search(r'\b(9\d{3})\b', e['address']) or [None, '9000'])[1]
        ig = e.get('instagram'); igh = ig and ig.rstrip('/').split('/')[-1]
        rec = {
            'id': rid, 'name': NAME.get(name, name), 'group': g, 'category': cat, 'type': None, 'cuisine': e.get('cuisine') or '', 'cuisineTags': tags,
            'chef': 'unknown', 'address': e['address'], 'postalCode': pc, 'district': f'Gent ({pc})', 'neighbourhood': near['neighbourhood'],
            'lat': lat, 'lng': lng, 'geoSource': gsrc, 'geoPrecision': 'address', 'priceLevel': e.get('priceLevel') or 'unknown', 'priceFrom': None,
            'distinctions': {'michelin': None, 'michelinYear': None, 'gaultMillau': None, 'gaultMillauEdition': None},
            'openingYear': int(om[:4]) if om else 'unknown', 'openingDate': om or 'unknown', **({'opened': om} if om else {}), 'isNew': bool(om),
            'vegetarian': 'yes' if 'veget' in vv or 'vegan' in vv else 'unknown', 'vegan': 'yes' if 'vegan' in vv else 'unknown',
            'dietNote': e.get('veggieVegan') or '', 'menuType': 'unknown', 'menuChanges': 'unknown', 'currentMenuNote': 'unknown',
            'status': 'open', 'statusNote': '', 'website': e.get('website'), 'instagram_handle': igh, 'instagram': ig, 'instagramSource': ig and 'research 2026-10-25',
            'instagram_posts': [], 'phone': None, 'summary': e['description'], 'summaryLang': 'en', 'events': [], 'sources': e['sources'],
            'dataConflict': None, 'dateChecked': TODAY, 'lastChanged': TODAY, 'city': 'gent', 'country': 'BE', 'photos': [],
            'reservation_url': None, 'reservation_provider': None,
            'features': {'foodServed': True if re.search(r'plates|bites|food|snack|tapas|sandwich|gelato|cheese|charcuterie|lunch', (e.get('cuisine') or '') + ' ' + e['description'], re.I) else None,
                         'openSunday': has_day(h, 'Su'), 'openMonday': has_day(h, 'Mo')},
            'features_evidence': {}, 'openingHours': h, 'openingHoursSource': (e.get('hoursSource') or '').split(' (')[0] if h else None,
            'notes': e.get('note'), 'otherLocations': None, 'origin': 'research-2026-10-25',
        }
        for k, v in list(rec['features'].items()):
            if v is None: del rec['features'][k]
            else: rec['features_evidence'][k] = (rec['openingHoursSource'] if k.startswith('open') else e['sources'][0])
        cur['restaurants'].append(rec); C[rid] = rec; allpts.append(rec)
        chg.append({'date': TODAY, 'restaurant': rec['name'], 'field': 'added', 'change': f"Added ({'opened ' + om if om else 'wine bar'}; research 2026-10-25).", 'source': e['sources'][0]})
        log['added'].append(f"{rec['name']} [{g}/{cat}{', opened ' + om if om else ''}]")
    # Flordi: fully plant-based per HLN (opening article), HappyCow listed it as vegan options
    fl = veg['places'].get('osm-flordi-n11640842891')
    if fl and fl.get('veggieLevel') != 'vegan':
        veg['places']['osm-flordi-n11640842891'] = {'veggieLevel': 'vegan', 'sources': ['https://flordi.be/'] + fl.get('sources', []),
            'note': 'HLN (1 Oct 2026): fully vegan eetcafé ("volledig plantaardig"); research 2026-10-25.', 'basis': 'press', 'checked': TODAY}
        log['updated'].append('Flordi (veggie layer): vegan-friendly → fully vegan')
    # Lunchbar ROMM: no opening month → out of 'Opening soon'
    keep = [u for u in up['upcoming'] if u['id'] != 'lunchbar-romm']
    if len(keep) < len(up['upcoming']):
        up['upcoming'] = keep
        up['excludedChecked'].setdefault('notEnoughInfo', []).append("Lunchbar ROMM (Mirto, Rommelaere site): 'coming soon', no opening month published (sandwich contest 5 Oct–27 Nov 2026) — re-add with a month")
        up['dateChecked'] = TODAY
    dump(CUR, cur); dump(CORR, corr); dump(VEG, veg); dump(UP, up)
    OSM.write_text(json.dumps(osm, ensure_ascii=False, separators=(',', ':')))
    json.dump(log, open('/tmp/merge_new_log.json', 'w'), ensure_ascii=False, indent=1)
    for k, v in log.items(): print(k, len(v)); [print('  ', x) for x in (v.items() if isinstance(v, dict) else v)]

if __name__ == '__main__':
    main()
