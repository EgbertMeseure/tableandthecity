#!/usr/bin/env python3
"""Refresh Eventbrite food & drink events for every city on the site (weekly routine).

  python3 scripts/fetch_eventbrite.py              # fetch, filter, update the city files; every listing + decision -> /tmp/eventbrite-candidates.json
  python3 scripts/fetch_eventbrite.py --dry-run    # fetch + filter + report only, no writes
  python3 scripts/fetch_eventbrite.py --cached     # reuse /tmp/eventbrite-cache (no network) - handy while reviewing
Weekly routine: run it, read the PENDING lines, add accept/reject entries to data/eventbrite-review.json (English title + type),
rerun with --cached, run scripts/stamp_assets.py, check the phone view, commit.

Source: https://www.eventbrite.com/d/belgium--<slug>/food-and-drink--events/?page=N (public listing pages; the event data is
the window.__SERVER_DATA__ JSON in the HTML, 20 events a page). The /b/<slug>/food-and-drink/ browse page shows the same pool.

How events get on the site
- Only events physically in that city (venue postal code in the city's list; Brussel = the 19 communes) - every city is kept separate.
- Only upcoming (end date >= today, Europe/Brussels), not online, not cancelled.
- Keyword filters drop junk (pizza, kebab, burgers, fast food, MLM / webinars, parties, speed dating ...) and data/chains-exclude.json.
- Duplicates of events already on the site (same Eventbrite id anywhere in a city file, or same date + venue/title) are skipped.
- data/eventbrite-review.json is the human gate: {"<eventbrite id>": {"status": "accept"|"reject", "reason", "title", "type",
  "note", "desc", "image": false, "city"}}. Only "accept" events are written; new candidates that pass the filters are listed as
  PENDING in the report and in /tmp/eventbrite-candidates.json - review them, add a line to the review file, rerun.
- Written events live in <city>.json extraEvents with id "eb-<eventbrite id>" (+ eventDetails[id]); every rerun replaces all eb-*
  entries, so past / cancelled / rejected ones disappear. Photos: img/events/eb-<id>.webp (960x540 crop of the Eventbrite image,
  focal point respected), credited to the organiser with a link to the event page; "image": false in the review keeps it off.
Afterwards run python3 scripts/stamp_assets.py before committing."""
import json, re, sys, time, datetime, os, unicodedata, io, urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo
ROOT = Path(__file__).resolve().parent.parent
TODAY = datetime.datetime.now(ZoneInfo('Europe/Brussels')).date().isoformat()
DRY, CACHED = '--dry-run' in sys.argv, '--cached' in sys.argv
HORIZON_DAYS = 120   # accepted events further out than this wait in the review file and appear on a later run (keeps long series calm)
HORIZON = (datetime.date.fromisoformat(TODAY) + datetime.timedelta(days=HORIZON_DAYS)).isoformat()
CACHE = Path('/tmp/eventbrite-cache'); CACHE.mkdir(exist_ok=True)
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
CITIES = {   # site city id -> Eventbrite place slug, postal codes that count as "in the city", display name for addresses
    'gent': ('belgium--gent', {'9000', '9030', '9031', '9032', '9040', '9041', '9042', '9050', '9051', '9052'}, 'Gent'),
    'antwerpen': ('belgium--antwerpen', {'2000', '2018', '2020', '2030', '2040', '2050', '2060', '2100', '2140', '2170', '2180', '2600', '2610', '2660'}, 'Antwerpen'),
    'brussel': ('belgium--brussels-capital-region', {str(p) for p in (1000, 1020, 1030, 1040, 1050, 1060, 1070, 1080, 1081, 1082, 1083, 1090,
                1120, 1130, 1140, 1150, 1160, 1170, 1180, 1190, 1200, 1210)}, 'Brussel'),
    'brugge': ('belgium--brugge', {'8000', '8200', '8310', '8380'}, 'Brugge'),
    'oostende': ('belgium--oostende', {'8400'}, 'Oostende'),
}
JUNK = re.compile(r'pizz|kebab|burger|fast ?food|frituur|friet|mcdonald|kfc|domino|webinar|online|zoom|mlm|network marketing|business opportunit|'
                  r'crypto|forex|speed ?dat|singles|dating|party|fuif|clubbing|\bdj\b|rave|bottomless|beer pong|pub crawl|kroegentocht|'
                  r'student|career|job fair|recruit|masterclass in sales|investor|real estate|immo', re.I)
def norm(s): return re.sub(r'[^a-z0-9]+', ' ', unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()).strip()

def get(url, key):
    f = CACHE / key
    if CACHED and f.exists(): return f.read_text()
    for i in range(3):
        try:
            h = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'en'}), timeout=40).read().decode('utf-8', 'replace')
            f.write_text(h); time.sleep(1.5); return h
        except Exception as e: err = e; time.sleep(5)
    raise SystemExit(f'fetch failed {url}: {err}')

def server_data(h):
    i = h.index('__SERVER_DATA__ = ') + len('__SERVER_DATA__ = ')
    return json.JSONDecoder().raw_decode(h[i:])[0]

FOODY = re.compile(r'wine|wijn|\bvins?\b|beer|bier|bi[eè]re|tast|proef|d[ée]gust|food|cook|kook|cuisine|chef|dinner|diner|d[îi]ner|'
                   r'brunch|coffee|koffie|caf[eé]\b|chocola|cheese|kaas|fromage|whisk|gin\b|cocktail|sake|market|markt|march[ée]', re.I)
def fetch_city(slug):
    """The food-and-drink category, plus the 'wine' and 'beer' keyword searches (they catch tastings filed under another category;
    those count only with the Food & Drink tag or a food/drink word in the title / summary)."""
    out = {}
    for path, key, strict in [('food-and-drink--events/', 'fd', False), ('wine/', 'wine', True), ('beer/', 'beer', True)]:
        page, pages = 1, 1
        while page <= pages and page <= 20:
            d = server_data(get(f'https://www.eventbrite.com/d/{slug}/{path}?page={page}', f'{slug}-{key}-{page}.html'))
            ev = d['search_data']['events']; pages = ev['pagination'].get('page_count') or 1
            for r in ev['results']:
                fd = any(t.get('tag') == 'EventbriteCategory/110' for t in r.get('tags') or [])
                if not strict or fd or FOODY.search(r['name'] + ' ' + (r.get('summary') or '')): out.setdefault(r['id'], r)
            page += 1
    return list(out.values())

def event_page(url, eid):
    """Price, organiser and status from the event page's JSON-LD (the listing JSON has no prices)."""
    try: h = get(url, f'event-{eid}.html')
    except SystemExit: return {}
    for m in re.findall(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', h, re.S):
        try: j = json.loads(m)
        except Exception: continue
        if isinstance(j, dict) and 'Event' in str(j.get('@type', '')):
            offs = [o for o in (j.get('offers') or []) if isinstance(o, dict)]
            lo = [float(o['lowPrice']) for o in offs if o.get('lowPrice') not in (None, '')]
            hi = [float(o.get('highPrice') or o['lowPrice']) for o in offs if o.get('lowPrice') not in (None, '')]
            f = lambda v: ('€%d' % v) if v == int(v) else ('€%.2f' % v).replace('.', ',')
            price = None
            if lo: price = 'free' if max(hi) == 0 else (f(min(lo)) if min(lo) == max(hi) else f'{"free" if min(lo) == 0 else f(min(lo))}–{f(max(hi))}')
            return {'price': price, 'organizer': (j.get('organizer') or {}).get('name'), 'status': j.get('eventStatus', ''),
                    'description': j.get('description', '')}
    return {}

def chain_patterns():
    try: C = json.load(open(ROOT / 'data' / 'chains-exclude.json'))
    except Exception: return []
    pats = []
    for k in ('patterns', 'names', 'brands', 'exclude'):
        for x in C.get(k, []) if isinstance(C.get(k), list) else []:
            pats.append(norm(x if isinstance(x, str) else x.get('name') or x.get('pattern') or ''))
    return [p for p in pats if len(p) > 2]

def price_of(r):
    t = r.get('ticket_availability') or {}
    if t.get('is_free'): return 'free'
    lo, hi = (t.get('minimum_ticket_price') or {}), (t.get('maximum_ticket_price') or {})
    if not lo.get('major_value'): return None
    a, b = float(lo['major_value']), float(hi.get('major_value') or lo['major_value'])
    f = lambda v: ('€%d' % v) if v == int(v) else ('€%.2f' % v).replace('.', ',')
    return f(a) if a == b else f'{f(a)}–{f(b)}'

def address_of(v, city_name):
    a = v.get('address') or {}
    street = (a.get('address_1') or '').strip()
    m = re.match(r'^(\d+[a-zA-Z]?)\s+(.+)$', street)   # Eventbrite often writes "126 Jan Yoensstraat" -> "Jan Yoensstraat 126"
    if m: street = f'{m.group(2)} {m.group(1)}'
    pc, city = (a.get('postal_code') or '').strip(), (a.get('city') or city_name).strip()
    return ', '.join(x for x in [street, f'{pc} {city}'.strip()] if x)

def save_image(r, eid, crop=None):
    im = r.get('image') or {}; o = im.get('original') or {}
    if not o.get('url'): return None
    from PIL import Image
    req = urllib.request.Request(o['url'], headers={'User-Agent': UA})
    img = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=40).read())).convert('RGB')
    if crop:   # review "crop": [x0, y0, x1, y1] as fractions of the original, e.g. to keep only the food photo of a poster
        W, H = img.size; img = img.crop((int(crop[0] * W), int(crop[1] * H), int(crop[2] * W), int(crop[3] * H))); im = {**im, 'focal_point': None}
    W, H = img.size; tw = 16 / 9
    fp = im.get('focal_point') or {'x': .5, 'y': .5}
    fp = {'x': fp.get('x', .5) if fp.get('x') is not None else .5, 'y': fp.get('y', .5) if fp.get('y') is not None else .5}
    if W / H > tw: nw, nh = int(H * tw), H
    else: nw, nh = W, int(W / tw)
    x0 = min(max(int(fp['x'] * W - nw / 2), 0), W - nw); y0 = min(max(int(fp['y'] * H - nh / 2), 0), H - nh)
    img = img.crop((x0, y0, x0 + nw, y0 + nh)).resize((960, 540), Image.LANCZOS)
    rel = f'img/events/eb-{eid}.webp'; img.save(ROOT / rel, 'WEBP', quality=80)
    return rel

def main():
    review = json.load(open(ROOT / 'data' / 'eventbrite-review.json')) if (ROOT / 'data' / 'eventbrite-review.json').exists() else {}
    R = review.get('events', review)
    chains = chain_patterns()
    report, cand_out = [], {}
    for city, (slug, pcs, cname) in CITIES.items():
        path = ROOT / 'data' / 'cities' / f'{city}.json'; D = json.load(open(path))
        old_imgs = {e['id']: e.get('image') for e in D.get('extraEvents', []) if str(e.get('id', '')).startswith('eb-')}
        others = [e for e in D.get('extraEvents', []) if not str(e.get('id', '')).startswith('eb-')] + [e for p in D['restaurants'] for e in p.get('events', [])]
        known_txt = json.dumps(others, ensure_ascii=False)
        def dup(r):
            if r['id'] in known_txt: return 'already listed (same Eventbrite event)'
            v = norm((r.get('primary_venue') or {}).get('name'))
            for e in others:
                if e.get('dateStart') and e['dateStart'] <= r['start_date'] <= (e.get('dateEnd') or e['dateStart']) and v and len(v) > 3 and v in norm(e.get('location', '') + ' ' + ' '.join(e.get('partners', []))):
                    return f'already listed ({e["title"][:60]})'
            return None
        new_eb, details, rows = [], {}, []
        for r in sorted(fetch_city(slug), key=lambda r: (r.get('start_date') or '', r['name'])):
            v = r.get('primary_venue') or {}; a = v.get('address') or {}
            eid, name = r['id'], r['name'].strip()
            rv = R.get(eid, {})
            why = None
            if r.get('is_online_event'): why = 'online'
            elif r.get('is_cancelled'): why = 'cancelled'
            elif (r.get('end_date') or r.get('start_date') or '') < TODAY: why = 'past'
            elif (a.get('postal_code') or '').strip() not in pcs: why = f'not in {cname} ({(a.get("postal_code") or "")} {a.get("city") or "?"})'
            elif rv.get('city') and rv['city'] != city: why = f'belongs to {rv["city"]}'
            elif rv.get('status') == 'reject': why = 'rejected: ' + rv.get('reason', '')
            elif rv.get('status') != 'accept' and JUNK.search(name + ' ' + (r.get('summary') or '')): why = 'keyword filter: ' + JUNK.search(name + ' ' + (r.get('summary') or '')).group(0)
            elif rv.get('status') != 'accept' and any(norm(name).startswith(p) or norm(v.get('name')).startswith(p) for p in chains): why = 'chain'
            else: why = dup(r)
            status = 'skip' if why else ('accept' if rv.get('status') == 'accept' else 'pending')
            ep = event_page(r['url'].split('?')[0], eid) if status != 'skip' else {}
            if 'Cancelled' in ep.get('status', '') or 'Postponed' in ep.get('status', ''): status, why = 'skip', 'cancelled / postponed'
            if status == 'accept' and r['start_date'] > HORIZON: status, why = 'later', f'accepted, shown from {(datetime.date.fromisoformat(r["start_date"]) - datetime.timedelta(days=HORIZON_DAYS)).isoformat()}'
            row = {'id': eid, 'city': city, 'status': status, 'why': why, 'name': name, 'date': r.get('start_date'), 'end': r.get('end_date'),
                   'time': f"{r.get('start_time') or ''}–{r.get('end_time') or ''}".strip('–'), 'venue': v.get('name'), 'address': rv.get('address') or address_of(v, cname),
                   'price': ep.get('price') or price_of(r), 'organizer': ep.get('organizer'), 'url': r['url'].split('?')[0], 'summary': r.get('summary'), 'image': ((r.get('image') or {}).get('original') or {}).get('url')}
            rows.append(row)
            if status != 'accept': continue
            url = row['url']; xid = f'eb-{eid}'
            multi = r.get('end_date') and r['end_date'] != r['start_date']
            vname = rv.get('venue') or v.get('name') or ''
            if re.search(r'\d', vname) or norm(vname) in norm(row['address']): vname = ''   # Eventbrite "venue" that is just the street
            partners = rv.get('partners') or [x for x in [row.get('organizer') or vname] if x]   # the organiser (the venue is already in location)
            e = {'title': rv.get('title') or name, 'dateStart': r['start_date'], 'dateEnd': r['end_date'] if multi else None,
                 'type': rv.get('type') or 'food & drink event', 'location': f"{vname}, {row['address']}" if vname else row['address'],
                 'partners': partners, 'sources': [url], 'id': xid, 'tickets': url}
            note = ' '.join(x for x in [(row['time'] + '.') if row['time'] else '', ('Free (registration via Eventbrite).' if row['price'] == 'free' else f'Tickets {row["price"]} (Eventbrite).'.replace('Tickets free–', 'Tickets free to ')) if row['price'] else '', rv.get('note') or ''] if x)
            if note: e['note'] = note
            if rv.get('desc'): e['desc'] = rv['desc']
            if rv.get('image') is not False and not DRY:
                rel = (old_imgs.get(xid) or {}).get('src') if (old_imgs.get(xid) and (ROOT / old_imgs[xid]['src']).exists()) else None
                try: rel = rel or save_image(r, eid, rv.get('crop'))
                except Exception as ex: print('  image failed', eid, ex); rel = None
                if rel: e['image'] = {'src': rel, 'w': 960, 'h': 540, 'alt': rv.get('alt') or f'{e["title"]} (event image)',
                                      'credit': f"{rv.get('credit') or row.get('organizer') or v.get('name') or 'Organiser'} (Eventbrite)", 'credit_url': url}
            new_eb.append(e)
            details[xid] = {k: x for k, x in {'venue': vname or None, 'originalTitle': name, 'address': row['address'], 'lat': float(a['latitude']) if a.get('latitude') else None,
                            'lng': float(a['longitude']) if a.get('longitude') else None, 'geoSource': 'Eventbrite venue', 'blurb': rv.get('blurb') or r.get('summary'),
                            'ticketUrl': url, 'time': row['time'] or None, 'price': row['price'], 'source': 'eventbrite'}.items() if x is not None}
        cand_out[city] = rows
        report.append((city, rows, new_eb))
        if DRY: continue
        D['extraEvents'] = [e for e in D.get('extraEvents', []) if not str(e.get('id', '')).startswith('eb-')] + new_eb
        D['eventDetails'] = {**{k: x for k, x in D.get('eventDetails', {}).items() if not k.startswith('eb-')}, **details}
        json.dump(D, open(path, 'w'), ensure_ascii=False, indent=1); open(path, 'a').write('\n')
        for xid, im in old_imgs.items():   # photos of events that left the list
            if im and xid not in {e['id'] for e in new_eb} and (ROOT / im['src']).exists(): (ROOT / im['src']).unlink()
    if not DRY:   # photos no event points at any more (left the list, or image:false in the review)
        used = {e['image']['src'] for c in CITIES for e in json.load(open(ROOT / 'data' / 'cities' / f'{c}.json')).get('extraEvents', []) if e.get('image')}
        for f in (ROOT / 'img' / 'events').glob('eb-*.webp'):
            if f'img/events/{f.name}' not in used: f.unlink()
    if True:
        json.dump({'fetched': TODAY, 'about': 'Output of scripts/fetch_eventbrite.py: every Eventbrite food & drink listing per city with the decision. '
                   'status pending = passes the filters but is not in data/eventbrite-review.json yet.', 'cities': cand_out},
                  open('/tmp/eventbrite-candidates.json', 'w'), ensure_ascii=False, indent=1)
    for city, rows, new in report:
        print(f'== {city}: {len(new)} on the site, {sum(r["status"] == "pending" for r in rows)} pending review, {sum(r["status"] == "skip" for r in rows)} skipped')
        for r in rows:
            if r['status'] != 'skip' or not r['why'].startswith(('not in', 'past')):
                print(f"  {r['status']:7} {r['date']} {r['id']} {r['name'][:70]!r} @ {r['venue']} {('- ' + r['why']) if r['why'] else ''}")
if __name__ == '__main__': main()
