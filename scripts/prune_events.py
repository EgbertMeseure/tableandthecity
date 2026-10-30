"""Archive past events (daily step). Moves every event whose end date (or single date) is before today
(Europe/Brussels), and undated events not marked {ongoing: true, dateEnd >= today}, from
data/cities/<city>.json to data/cities/<city>-events-archive.json. Recurring events (with 'recurrence')
are kept; the site shows their next occurrence. Usage: python3 scripts/prune_events.py gent"""
import json, sys, os, datetime
from zoneinfo import ZoneInfo
city = sys.argv[1] if len(sys.argv) > 1 else 'gent'
today = datetime.datetime.now(ZoneInfo('Europe/Brussels')).date().isoformat()
path, apath = f'data/cities/{city}.json', f'data/cities/{city}-events-archive.json'
D = json.load(open(path)); A = json.load(open(apath)) if os.path.exists(apath) else []
def live(e):
    if e.get('recurrence'): return not e['recurrence'].get('until') or e['recurrence']['until'] >= today
    if not e.get('dateStart'): return bool(e.get('ongoing') and e.get('dateEnd') and e['dateEnd'] >= today)
    return (e.get('dateEnd') or e['dateStart']) >= today
moved = []
for r in D['restaurants']:
    keep = []
    for e in r.get('events', []):
        (keep if live(e) else moved).append(e if live(e) else {**e, 'restaurant': r['id'], 'archived': today})
    r['events'] = keep
ex = D.get('extraEvents', [])
D['extraEvents'] = [e for e in ex if live(e)]
moved += [{**e, 'restaurant': None, 'archived': today} for e in ex if not live(e)]
if moved:
    A += moved
    D.setdefault('changelog', []).append({'date': today, 'restaurant': '(all)', 'field': 'events', 'change': f'Archived {len(moved)} past or undated event(s).', 'source': 'scripts/prune_events.py', 'public': 'Past events removed.'})
json.dump(D, open(path, 'w'), ensure_ascii=False, indent=1); json.dump(A, open(apath, 'w'), ensure_ascii=False, indent=1)
print(f'{today}: archived {len(moved)} event(s) -> {apath}')
