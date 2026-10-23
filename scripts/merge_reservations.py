#!/usr/bin/env python3
"""Merge researched reservation info (how to book) into the place data.

  python3 scripts/merge_reservations.py gent [--handoff=/workspace/handoff/gent-reservations-research.json] [--dry-run]

Handoff shape: [{id, name, method: online|phone|walk-in|unknown, provider, bookingUrl, phone, source, note}]
(a missing handoff file is fine: the script then only re-applies the stored layer).
Check entries for places that already have a link: {id, existing_reservation_url, status: ok|redirected, bookingUrl, source, note}
→ status ok: method online, the existing link stays; status redirected + bookingUrl: the existing link is REPLACED by bookingUrl
(stored as 'replaces' in the layer; only that exact old link is ever replaced). OVERRIDES below hold decisions made on review.

What it does (idempotent — re-running gives the same files):
1. Valid entries are stored in data/osm/reservations-research.json (the persistent layer), keyed by OSM ref for OSM places
   ("node/123") and by "id:<id>" for curated records in <city>.json. import_osm.py re-applies the OSM part after every
   OSM re-import (like hours-research.json), so researched booking info survives --refresh.
2. The layer is applied to data/cities/<city>-osm.json and data/cities/<city>.json (by id):
   reservationMethod (online|phone|walk-in), reservationSource (URL), reservationNote,
   reservation_url + reservation_provider (only when the record has NO reservation_url yet — an existing link is never
   overwritten), phone (only when the record has none).
   method "unknown" entries are kept in the layer but write nothing. An "online" entry without bookingUrl is stored as unknown.
3. scripts/apply_media.py rewrites reservation_url of curated records from <city>-media-sources.json: re-run this script after it.
Front-end: js/app.js shows "Check availability" / "Reservation by phone" / "Walk-in only" on list cards of the categories in
TG_CONFIG.BOOKING_BUTTON_TYPES (js/config.js).
"""
import json, re, sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CITY = next((a for a in sys.argv[1:] if not a.startswith('-')), 'gent')
HANDOFF = Path(next((a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--handoff=')), f'/workspace/handoff/{CITY}-reservations-research.json'))
DRY = '--dry-run' in sys.argv
OSMF = ROOT / 'data' / 'cities' / f'{CITY}-osm.json'
CURF = ROOT / 'data' / 'cities' / f'{CITY}.json'
LAYER = ROOT / 'data' / 'osm' / 'reservations-research.json'
TODAY = date.today().isoformat()
METHODS = {'online', 'phone', 'walk-in', 'unknown'}
PROVIDER_HOSTS = {'tablefever.com': 'TableFever', 'zenchef.com': 'Zenchef', 'guestplan.com': 'Guestplan', 'thefork.com': 'TheFork',
                  'formitable.com': 'Formitable', 'sevenrooms.com': 'SevenRooms', 'exploretock.com': 'Tock'}   # provider named only from the link's own host
# decisions on review (23 Oct 2026), applied on top of the handoff entry
OVERRIDES = {
    'lof': {'bookingUrl': 'https://www.lofrestaurant.com/', 'provider': 'Guestplan',
            'note': 'Homepage "RESERVE NOW" opens the Guestplan widget; the homepage is used as the link (the direct widget URL could not be confirmed).'},
    'moscou-by-danny-horseele': {'provider': 'own page', 'source': 'https://www.restaurantmoscou.be/appointment/3'},
}


def fields(e):
    """Layer entry → record fields to write (reservation_url/phone handled with no-overwrite rules in apply())."""
    m = e.get('method')
    if m not in ('online', 'phone', 'walk-in'): return {}
    f = {'reservationMethod': m, 'reservationSource': e.get('source'), 'reservationNote': e.get('note') or None}
    return {k: v for k, v in f.items() if v}


def apply(r, e):
    """Apply one layer entry to one record; returns True when something changed."""
    before = json.dumps(r, sort_keys=True)
    r.update(fields(e))
    if e.get('method') == 'online' and e.get('bookingUrl') and e.get('replaces') and r.get('reservation_url') == e['replaces']:
        r['reservation_url'] = e['bookingUrl']; r['reservation_provider'] = e.get('provider')     # deliberate correction (old link redirects)
    elif e.get('method') == 'online' and e.get('bookingUrl') and not r.get('reservation_url'):
        r['reservation_url'] = e['bookingUrl']
        if e.get('provider'): r['reservation_provider'] = e['provider']
    if e.get('phone') and not r.get('phone'): r['phone'] = e['phone']
    return json.dumps(r, sort_keys=True) != before


def main():
    osm = json.loads(OSMF.read_text()); cur = json.loads(CURF.read_text())
    layer = json.loads(LAYER.read_text()) if LAYER.exists() else {'places': {}}
    by_osm = {r['id']: r for r in osm['places']}; by_cur = {r['id']: r for r in cur['restaurants']}
    stats = {'handoff': 0, 'stored': 0, 'unknown_id': 0, 'invalid': 0}
    bad = []
    if HANDOFF.exists():
        h = json.loads(HANDOFF.read_text())
        h = h.get('places', h.get('reservations', [])) if isinstance(h, dict) else h
        stats['handoff'] = len(h)
        for e in h:
            rid = e.get('id'); e = {**e, **OVERRIDES.get(rid, {})}
            m = (e.get('method') or 'unknown').strip().lower(); replaces = None
            if not e.get('method') and e.get('existing_reservation_url'):            # check entry for an existing link
                if e.get('status') == 'ok': m = 'online'; e['bookingUrl'] = e['existing_reservation_url'] if not e.get('bookingUrl') else e['bookingUrl']
                elif e.get('status') == 'redirected' and e.get('bookingUrl'): m = 'online'; replaces = e['existing_reservation_url']
            if m not in METHODS: stats['invalid'] += 1; bad.append((rid, f'method {m!r}')); continue
            url = (e.get('bookingUrl') or '').strip() or None
            if url and not e.get('provider'):
                host = re.sub(r'^https?://(www\.)?', '', url).split('/')[0]
                e['provider'] = next((v for k, v in PROVIDER_HOSTS.items() if host == k or host.endswith('.' + k)), None)
            if url and not re.match(r'^https?://', url): stats['invalid'] += 1; bad.append((rid, f'bookingUrl {url!r}')); continue
            if m == 'online' and not url: m = 'unknown'
            if rid in by_cur: key = f'id:{rid}'
            elif rid in by_osm: key = by_osm[rid]['osm']
            else: stats['unknown_id'] += 1; bad.append((rid, 'unknown id')); continue
            old = layer['places'].get(key, {})
            new = {'id': rid, 'name': e.get('name'), 'method': m, 'provider': e.get('provider') or None, 'bookingUrl': url, 'replaces': replaces,
                   'phone': (e.get('phone') or '').strip() or None, 'source': e.get('source') or None, 'note': e.get('note') or None}
            new = {k: v for k, v in new.items() if v is not None}
            new['checked'] = old.get('checked', TODAY) if {k: v for k, v in old.items() if k != 'checked'} == new else TODAY
            layer['places'][key] = new; stats['stored'] += 1
    else:
        print(f'no handoff at {HANDOFF} — re-applying the stored layer only')
    # apply the whole layer (curated by id, OSM by ref)
    osm_by_ref = {r.get('osm'): r for r in osm['places']}
    changed = {'curated': 0, 'osm': 0}; missing = []
    for key, e in layer['places'].items():
        r = by_cur.get(key[3:]) if key.startswith('id:') else osm_by_ref.get(key)
        if not r: missing.append((key, e.get('name'))); continue
        if apply(r, e): changed['curated' if key.startswith('id:') else 'osm'] += 1
    layer = {'about': 'Researched reservation info (key = OSM ref, or id:<id> for curated records in <city>.json). Written by '
                      'scripts/merge_reservations.py; import_osm.py re-applies the OSM entries after each import. An existing '
                      'reservation_url / phone is never overwritten.', 'places': dict(sorted(layer['places'].items()))}
    if not DRY:
        if layer['places'] or LAYER.exists(): LAYER.write_text(json.dumps(layer, ensure_ascii=False, indent=1) + '\n')
        if changed['osm']: OSMF.write_text(json.dumps(osm, ensure_ascii=False, separators=(',', ':')) + '\n')
        if changed['curated']: CURF.write_text(json.dumps(cur, ensure_ascii=False, indent=1) + '\n')
    print('reservations:', stats, 'records changed:', changed, '(dry run)' if DRY else '')
    for b in bad: print('  SKIPPED:', b)
    for m in missing: print('  layer entry without record:', m)


if __name__ == '__main__':
    main()
