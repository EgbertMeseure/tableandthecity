#!/usr/bin/env python3
"""Build the veggie/vegan layer data/cities/<city>-veggie.json (idempotent). Applied on top of every record in the browser.

veggieLevel: 'vegan' (fully vegan) | 'vegetarian' (fully vegetarian, no meat/fish) | 'vegan-friendly' (clear vegan options:
labelled dishes / vegan menu) | 'veggie-friendly' (clear vegetarian options). Never guessed.

Precedence (highest first):
  1. data/osm/veggie-verified.json  – hand-checked: own website/menu/Instagram/press, with quoted example dishes + source URLs
  2. data/osm/happycow-gent.json    – HappyCow city listing (vegan / vegetarian / veg-options sections), matched by name + street
  3. OpenStreetMap diet:vegan / diet:vegetarian tags (only|yes|limited) on the OSM record
A verified entry may also set veggieLevel null (= checked, no clear options) to suppress weaker sources.
See scripts/VEGGIE_CHECK.md for the checking procedure."""
import json, re, sys, unicodedata
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_osm import same_name, norm_name
ROOT = Path(__file__).resolve().parent.parent
CITY = sys.argv[1] if len(sys.argv) > 1 else 'gent'
D = ROOT / 'data'
HC = D / 'osm' / f'happycow-{CITY}.json'
VER = D / 'osm' / 'veggie-verified.json'
OUT = D / 'cities' / f'{CITY}-veggie.json'
RANK = {'vegan': 4, 'vegetarian': 3, 'vegan-friendly': 2, 'veggie-friendly': 1}

def fold(s): return unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
def street(a):
    a = fold(a); a = re.sub(r'^\d+\s*', '', a)               # HappyCow sometimes writes "57 Steendam"
    m = re.match(r'([a-z .\'-]+?)\s*\d', a + ' 0'); return (m.group(1) if m else a).strip(' ,.')

def main():
    cur = json.loads((D / 'cities' / f'{CITY}.json').read_text())['restaurants']
    osm = json.loads((D / 'cities' / f'{CITY}-osm.json').read_text())['places']
    recs = [r for r in cur if r.get('status') != 'unverified'] + osm
    out, why = {}, {}
    # 3. OSM diet tags
    for r in osm:
        if r.get('veggieLevel'): out[r['id']] = {'veggieLevel': r['veggieLevel'], 'sources': r.get('veggieSource', []), 'basis': 'OpenStreetMap diet tags'}
    # 2. HappyCow
    hc = json.loads(HC.read_text()) if HC.exists() else {'places': []}
    unmatched = []
    FULL = re.compile(r'fully vegan|completely vegan|100% (plant|vegan)|all vegan|entirely vegan|vegan (bakery|coffee house|cafe|café|patisserie|restaurant|specialty coffee shop|shop, cafe)|plant-based (bakery|cafe|café)|fully vegan/plant-based', re.I)
    for h in hc['places']:
        if h['hcSection'] == 'other' and h['level'] == 'vegan' and not FULL.search(h['info']): h = {**h, 'level': 'vegan-friendly'}   # "offers vegan options" ≠ fully vegan
        st = street(h['address'])
        cands = [r for r in recs if same_name(h['name'], r['name'])]
        strict = [r for r in cands if st and st[:8] in fold(r.get('address') or '')]
        has_street = bool(re.search(r'\d', h['address']))           # "Ghent area" / "Gent" = no fixed address
        pick = strict if strict else ([] if has_street else cands[:1] if len(cands) == 1 else [])
        if not pick: unmatched.append(h); continue
        for r in pick[:1]:
            prev = out.get(r['id'])
            out[r['id']] = {'veggieLevel': h['level'], 'sources': [hc['source']] + ([s for s in prev['sources'] if 'openstreetmap' in s] if prev else []),
                            'basis': 'HappyCow listing' + (' + OpenStreetMap' if prev else ''), 'hcName': h['name'], 'hcInfo': h['info'][:240]}
    # 1. verified
    ver = json.loads(VER.read_text()) if VER.exists() else {'places': {}}
    for rid, v in ver['places'].items():
        if v.get('veggieLevel') is None: out.pop(rid, None); continue
        out[rid] = {k: v[k] for k in ('veggieLevel', 'dishes', 'sources', 'note') if v.get(k)} | {'basis': 'verified', 'checked': v.get('checked')}
    res = {'about': __doc__.split('\n\n')[1].strip(), 'city': CITY, 'count': len(out), 'places': dict(sorted(out.items()))}
    OUT.write_text(json.dumps(res, ensure_ascii=False, indent=1) + '\n')
    (D / 'osm' / f'happycow-{CITY}-unmatched.json').write_text(json.dumps(unmatched, ensure_ascii=False, indent=1))
    from collections import Counter
    print(len(out), 'places with a veggieLevel →', OUT.relative_to(ROOT)); print(Counter(v['veggieLevel'] for v in out.values()))
    print(Counter(v['basis'] for v in out.values())); print(len(unmatched), 'HappyCow listings not matched to a place (shops, caterers, closed or not in OSM)')

if __name__ == '__main__':
    main()
