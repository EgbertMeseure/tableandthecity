#!/usr/bin/env python3
"""Merge verified artisan bakeries & patisseries into the site (Bakeries card). Idempotent.

  python3 scripts/merge_bakeries.py gent [--handoff=/workspace/handoff/gent-bakeries-research.json]

Input: {bakeries: [{id?, name, address, lat?, lng?, website, instagram_handle, description, style: [sourdough|viennoiserie|patisserie|...],
         features: {seating|vegan|glutenFree|openSunday|breakfast: {value, source}}, sources: []}], notes}
Only bakeries with at least one source are used; big chains (data/chains-exclude.json) are skipped. For each bakery:
- curated record in data/cities/<city>.json (same id, or similar name < 150 m / same street): only null fields are filled
  (website, Instagram, features with source, bakeryStyle); curated values are never overwritten.
- an OpenStreetMap shop (same id 'osm-…-n123', or similar name < 150 m / same street in data/osm/raw.json): added to the
  'keep' allowlist in data/bakeries-artisan.json with its sourced facts; import_osm.py then shows it (artisan bakery).
- otherwise: a new hand-checked record in <city>.json (coordinates from the handoff or Nominatim, cached).
Category: patisserie when the first listed style (or every style) is pastry/patisserie/cake/chocolate, else bakery.
OVERRIDES holds research notes (conflicting hours → openingHours null + note).
Afterwards run: import_osm.py gent, veggie_layer.py gent, merge_breakfast.py gent.
"""
import importlib.util, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CITY = next((a for a in sys.argv[1:] if not a.startswith('-')), 'gent')
HANDOFF = Path(next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--handoff=')), f'/workspace/handoff/{CITY}-bakeries-research.json'))
CUR = ROOT / 'data' / 'cities' / f'{CITY}.json'
ART = ROOT / 'data' / 'bakeries-artisan.json'
TODAY = '2026-10-20'
FEATS = {'seating', 'vegan', 'glutenFree', 'openSunday', 'breakfast', 'brunch', 'terrace', 'takeaway', 'wifi', 'wheelchair'}
# from the research notes (handoff 20 Oct 2026): sources disagree on the hours → show none
OVERRIDES = {
    'De Gentsche Koekedoos': {'openingHours': None, 'openingHoursNote': 'Hours differ between sources (OSM vs bakkerindebuurt.be) — check before visiting.'},
    'Catberry': {'openingHours': None, 'openingHoursNote': 'Opening days differ between its own website, FAQ and OSM — check catberry.be before visiting.'},
}
PASTRY = {'patisserie', 'pastry', 'cake', 'cakes', 'chocolate', 'chocolatier', 'macarons', 'tarts'}


def _load(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts' / f'{name}.py'); m = importlib.util.module_from_spec(spec)
    argv = sys.argv; sys.argv = [argv[0], CITY]
    try: spec.loader.exec_module(m)
    finally: sys.argv = argv
    return m


osm = _load('import_osm'); mb = _load('merge_breakfast')


def street(a): return re.sub(r'\s*\d.*$', '', (a or '').split(',')[0]).strip().lower()
def unk(v): return v is None or v == '' or (isinstance(v, str) and v.lower().startswith('unknown'))
def styles(b):
    s = b.get('style') or []
    return sorted({x.strip().lower() for x in ([s] if isinstance(s, str) else s) if x and x.strip()})
def ell(e): return (e['lat'], e['lon']) if e['type'] == 'node' else (e['center']['lat'], e['center']['lon'])


def main():
    if not HANDOFF.exists(): print(f'no handoff at {HANDOFF} — nothing to merge'); return
    ho = json.loads(HANDOFF.read_text()); cur = json.loads(CUR.read_text()); R = cur['restaurants']
    art = json.loads(ART.read_text()); keep = art.setdefault('keep', {})
    raw = [e for e in json.loads((ROOT / 'data' / 'osm' / 'raw.json').read_text())['elements'] if e.get('tags', {}).get('name')]
    by_ref = {f"{e['type']}/{e['id']}": e for e in raw}
    ids = {r['id'] for r in R}
    added, updated, allowed, skipped = [], [], [], []
    for b in ho.get('bakeries', []):
        name = (b.get('name') or '').strip(); srcs = [s for s in (b.get('sources') or []) if s]
        if not name or not srcs: skipped.append((name, 'no name / no source')); continue
        if (ch := osm.is_chain({'name': name, 'website': b.get('website') or ''})): skipped.append((name, f'chain {ch}')); continue
        bid = (b.get('id') or '').strip()
        ll = (b['lat'], b['lng']) if b.get('lat') and b.get('lng') else None
        if not ll and b.get('address') and not bid:
            g = mb.geocode(b['address']); ll = (g['lat'], g['lng']) if g else None
        near = lambda p, nm, ad: osm.same_name(name, nm) and ((ll and p and osm.dist_m(ll, p) < 150) or (b.get('address') and ad and street(b['address']) == street(ad)))
        hit = next((r for r in R if r['id'] == bid), None) or (None if bid.startswith('osm-') else next((r for r in R if near((r['lat'], r['lng']) if r.get('lat') else None, r['name'], r.get('address'))), None))
        st = styles(b)
        feats = {k: v for k, v in (b.get('features') or {}).items() if k in FEATS and isinstance(v, dict) and v.get('value') is not None and v.get('source')}
        if hit:
            ch = []
            for k in ('website', 'instagram_handle'):
                if b.get(k) and unk(hit.get(k)): hit[k] = b[k]; ch.append(k)
            if b.get('instagram_handle') and unk(hit.get('instagram')): hit['instagram'] = f"https://www.instagram.com/{b['instagram_handle']}/"
            if st and not hit.get('bakeryStyle'): hit['bakeryStyle'] = st; hit['bakeryStyleSource'] = srcs[0]; ch.append('bakeryStyle')
            F, EV = hit.setdefault('features', {}), hit.setdefault('features_evidence', {})
            for k, v in feats.items():
                if F.get(k) is None: F[k] = v['value']; EV[k] = v['source']; ch.append(k)
            for s in srcs:
                if s not in hit.setdefault('sources', []): hit['sources'].append(s)
            if ch: updated.append((hit['id'], ch))
            continue
        m = re.search(r'-([nwr])(\d+)$', bid) if bid.startswith('osm-') else None
        el = by_ref.get(f"{dict(n='node', w='way', r='relation')[m.group(1)]}/{m.group(2)}") if m else None
        el = el or next((e for e in raw if (e['tags'].get('shop') in ('bakery', 'pastry') or e['tags'].get('amenity') == 'cafe')
                         and near(ell(e), e['tags']['name'], ' '.join(filter(None, [e['tags'].get('addr:street'), e['tags'].get('addr:housenumber')])))), None)
        first = ([b['style']] if isinstance(b.get('style'), str) else (b.get('style') or [''])) [0].strip().lower()
        pastry_only = first in PASTRY or (bool(st) and set(st) <= PASTRY)   # the first listed style decides
        if el:
            ref = f"{el['type']}/{el['id']}"
            cat = 'patisserie' if pastry_only or (el['tags'].get('shop') == 'pastry' and not set(st) - PASTRY) else 'bakery'
            entry = {'name': name, 'address': b.get('address'), 'category': cat, 'style': st, 'website': b.get('website'), 'instagram_handle': b.get('instagram_handle'),
                     'description': b.get('description') or None, 'source': srcs[0], 'sources': srcs,
                     'features': {k: v['value'] for k, v in feats.items()}, 'features_evidence': {k: v['source'] for k, v in feats.items()}}
            entry = {k: v for k, v in entry.items() if v not in (None, '', [], {})}
            entry.update(OVERRIDES.get(name, {}))
            if keep.get(ref) != entry: keep[ref] = entry; allowed.append(ref)
            continue
        if not ll or not b.get('address'): skipped.append((name, 'no address / location')); continue
        base = osm.slug(re.sub(r"['’]", '', name)); rid, n = base, 2
        while rid in ids: rid = f'{base}-{n}'; n += 1
        rec = {**mb.DEFAULTS, 'id': rid, 'name': name, 'type': None, 'group': 'bakeries', 'category': 'patisserie' if pastry_only else 'bakery',
               'cuisine': 'Bakery', 'address': b['address'], 'district': 'Gent (9000)', 'lat': round(ll[0], 6), 'lng': round(ll[1], 6),
               'geoSource': 'bakery research' if b.get('lat') else 'OpenStreetMap Nominatim', 'website': b.get('website'),
               'instagram_handle': b.get('instagram_handle'), 'instagram': f"https://www.instagram.com/{b['instagram_handle']}/" if b.get('instagram_handle') else None,
               'summary': b.get('description') or '', 'summaryLang': 'en', 'status': 'open', 'events': [], 'sources': srcs, 'dateChecked': TODAY, 'lastChanged': TODAY,
               'features': {k: v['value'] for k, v in feats.items()}, 'features_evidence': {k: v['source'] for k, v in feats.items()},
               'addedBy': 'bakery research handoff'}
        if st: rec['bakeryStyle'] = st; rec['bakeryStyleSource'] = srcs[0]
        rec.update(OVERRIDES.get(name, {}))
        R.append(rec); ids.add(rid); added.append(rid)
    if added or updated:
        cur.setdefault('changelog', []).append({'date': TODAY, 'change': f'Bakeries: {len(added)} added, {len(updated)} updated from artisan bakery research handoff', 'source': HANDOFF.name})
        CUR.write_text(json.dumps(cur, ensure_ascii=False, indent=1) + '\n')
    if allowed:
        art['keep'] = dict(sorted(keep.items())); ART.write_text(json.dumps(art, ensure_ascii=False, indent=1) + '\n')
    print(f'added {len(added)}: {added}\nupdated {len(updated)}: {updated}\nallowlisted OSM {len(allowed)}: {allowed}\nskipped {len(skipped)}: {skipped}')


if __name__ == '__main__':
    main()
