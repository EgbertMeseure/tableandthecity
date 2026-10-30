#!/usr/bin/env python3
"""Merge sourced research ({places:{id:{field:{value,source,note?}}}}) into data/cities/<city>.json. Idempotent.
  python3 scripts/merge_handoff.py gent /workspace/handoff/gent-features-research.json
- feature keys → features/features_evidence (value + source URL); veggie/vegan only where the veggie layer has no value
- openingHours {mon..sun} → compact string + openingHoursSource; priceLevel only when ours is unknown; website as given
- a changelog entry per place that changed (source = first source URL)."""
import json, sys, re
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
CITY, SRC = sys.argv[1], Path(sys.argv[2])
CUR = ROOT / 'data' / 'cities' / f'{CITY}.json'
BAD_SOURCES = ('barsgent.be',)                                         # AI-built aggregator: never a source
DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
DN = dict(zip(DAYS, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']))
TODAY = '2026-10-20'
# corrections from the research notes (handoff 2026-10-20)
OVERRIDES = {
    'vandekerckhove-bar': {'features.openSunday': None},              # official site (Mon–Sat) conflicts with Mon–Sun data → unknown
}

def hours_str(o):
    """{mon:'18:00-22:00',...} → 'Mon closed · Tue–Sat 18:00–22:00 · Sun closed' (runs of equal days merged)"""
    out, i = [], 0
    while i < 7:
        j = i
        while j + 1 < 7 and (o.get(DAYS[j + 1]) or '?') == (o.get(DAYS[i]) or '?'): j += 1
        v = (o.get(DAYS[i]) or 'unknown').replace('-', '–')
        out.append(f"{DN[DAYS[i]]}{'–' + DN[DAYS[j]] if j > i else ''} {v}")
        i = j + 1
    return ' · '.join(out)

def main():
    d = json.loads(CUR.read_text()); by = {r['id']: r for r in d['restaurants']}
    places = json.loads(SRC.read_text())['places']
    changed = {}
    for pid, fields in sorted(places.items()):
        r = by.get(pid)
        if not r: print('unknown id', pid); continue
        F, EV = r.setdefault('features', {}), r.setdefault('features_evidence', {})
        for k, v in sorted(fields.items()):
            src, val, note = v.get('source', ''), v.get('value'), v.get('note')
            if any(b in src for b in BAD_SOURCES): continue
            ev = src + (f' — {note}' if note else '')
            if k == 'openingHours' and isinstance(val, dict):
                s = hours_str(val)
                if r.get('openingHours') != s: r['openingHours'] = s; r['openingHoursSource'] = src; changed.setdefault(pid, []).append('opening hours')
            elif k == 'priceLevel':
                if not r.get('priceLevel') or str(r['priceLevel']).startswith('unknown'): r['priceLevel'] = val; r['priceLevelSource'] = ev; changed.setdefault(pid, []).append('price level')
            elif k == 'website':
                if r.get('website') != val: r['website'] = val; changed.setdefault(pid, []).append('website')
            else:
                if k in ('veggie', 'vegan') and r.get('veggieLevel'): continue   # the verified veggie layer wins
                if F.get(k) != val or EV.get(k) != ev: F[k] = val; EV[k] = ev; changed.setdefault(pid, []).append(k)
        r.setdefault('sources', [])
        for v in fields.values():
            s = v.get('source')
            if s and s.startswith('http') and s not in r['sources'] and not any(b in s for b in BAD_SOURCES): r['sources'].append(s)
    for pid, ov in OVERRIDES.items():
        r = by[pid]
        for path, val in ov.items():
            k = path.split('.', 1)[1]
            if r['features'].get(k, 'x') is not val: r['features'][k] = val; r['features_evidence'].pop(k, None); changed.setdefault(pid, []).append(f'{k} → unknown (sources conflict)')
    # status corrections
    s = by.get('shamrock-irish-bar')
    if s and s['status'] == 'unverified':
        s.update(status='open', statusNote='', website=None, address='Zuidstationstraat 46, 9000 Gent')
        s['sources'] = [x for x in s['sources'] if 'shamrock.gent' not in x] + ['https://www.tripadvisor.com/Restaurant_Review-g186605-d23751698']
        changed.setdefault('shamrock-irish-bar', []).append('verified as existing (Zuidstationstraat 46; no official website)')
    l = by.get('lubbi')
    if l and l.get('statusNote') != 'Temporarily closed due to illness (lubbi.be).':
        l.update(status='temporarily closed', statusNote='Temporarily closed due to illness (lubbi.be).'); changed.setdefault('lubbi', []).append('temporarily closed (illness)')
    log = d.setdefault('changelog', [])
    for pid, what in changed.items():
        r = by[pid]; r['lastChanged'] = TODAY
        entry = {'date': TODAY, 'restaurant': r['name'], 'change': 'Research update: ' + ', '.join(dict.fromkeys(what)), 'source': next((v.get('source') for v in places.get(pid, {}).values() if v.get('source')), ''), 'public': 'Details updated.'}
        if entry not in log: log.append(entry)
    CUR.write_text(json.dumps(d, ensure_ascii=False, indent=1) + '\n')
    print(f'{len(changed)} places updated, {sum(len(v) for v in changed.values())} field changes')

if __name__ == '__main__':
    main()
