#!/usr/bin/env python3
"""Import a researched events handoff into data/cities/<city>.json, the way Gent's events are stored.

  python3 scripts/import_city_events.py antwerpen /workspace/handoff/antwerp-events/antwerpen-events.json

- extraEvents[]                 → <city>.json extraEvents (replaced)
- restaurantEvents{placeId: []} → restaurants[placeId].events (replaced for every place in the file;
                                   a collaboration is listed under each partner place, as in Gent)
- eventDetails{id: {...}}       → <city>.json eventDetails (kept for later; the UI shows only Gent's fields).
                                   A ticket/info link that is not among the sources is appended to sources.
- unconfirmedEvents (undated)   → not imported (the site hides undated events; prune_events.py would archive them).
Events whose end date (or single date) is before today (Europe/Brussels) are skipped."""
import json, sys, datetime
from zoneinfo import ZoneInfo
city, src = sys.argv[1], sys.argv[2]
today = datetime.datetime.now(ZoneInfo('Europe/Brussels')).date().isoformat()
H = json.load(open(src)); path = f'data/cities/{city}.json'; D = json.load(open(path))
DET = H.get('eventDetails', {})
FIELDS = ['title', 'dateStart', 'dateEnd', 'type', 'location', 'partners', 'sources', 'note', 'id', 'image']
def live(e): return bool(e.get('dateStart')) and (e.get('dateEnd') or e['dateStart']) >= today
def clean(e):
    x = {k: e[k] for k in FIELDS if k in e and e[k] is not None or k == 'dateEnd'}
    t = (DET.get(e['id']) or {}).get('ticketUrl')
    if t and t not in x.get('sources', []): x['sources'] = list(x.get('sources', [])) + [t]
    return x
ids = {r['id']: r for r in D['restaurants']}
import os
UP = f'data/cities/{city}-upcoming.json'
UPC = {u['id']: u['name'] for u in (json.load(open(UP)).get('upcoming', []) if os.path.exists(UP) else [])}
skipped = []
extra = [clean(e) for e in H.get('extraEvents', []) if live(e) or skipped.append(e['id'])]
D['extraEvents'] = extra
n_rest = 0
for pid, evs in H.get('restaurantEvents', {}).items():
    if pid not in ids:   # a place that is not open yet (upcoming file): its events go to extraEvents, located at the place
        if pid not in UPC: sys.exit(f'unknown place id {pid}')
        for e in evs:
            if live(e): x = clean(e); x.setdefault('location', UPC[pid]); extra.append(x)
            else: skipped.append(e['id'])
        continue
    keep = [clean(e) for e in evs if live(e) or skipped.append(e['id'])]
    ids[pid]['events'] = keep; n_rest += len(keep)
used = {e['id'] for e in extra} | {e['id'] for r in D['restaurants'] for e in r.get('events', [])}
D['eventDetails'] = {k: v for k, v in DET.items() if k in used}
json.dump(D, open(path, 'w'), ensure_ascii=False, indent=1); open(path, 'a').write('\n')
print(f'{city}: {len(extra)} extra events, {n_rest} place-linked entries on {sum(1 for p in H.get("restaurantEvents", {}))} places; '
      f'skipped (past) {skipped}; not imported (undated) {[e["id"] for e in H.get("unconfirmedEvents", [])]}')
