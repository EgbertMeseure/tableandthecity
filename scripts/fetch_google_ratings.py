#!/usr/bin/env python3
"""Fetch Google ratings for every place of a city and store them in data/cities/<city>-ratings.json.

Usage:  python3 scripts/fetch_google_ratings.py [city] [--raw FILE] [--offline] [--limit N] [--dry-run]

Key: read from the file named in env GOOGLE_PLACES_API_KEY_FILE, else /home/box/.secrets/google_places_key.
The key is never printed or written anywhere.

One Places API (New) Text Search per place ("<name> <address>, <city>", location bias 300 m around our
coordinates). A candidate is accepted only when it is close (< 250 m) AND its name is similar enough;
everything else is skipped (no score is better than a wrong score).
Output: {"source": "Google", "fetched": date, "places": {id: {"score": 9.8, "google_place_id": "..."}}}
score = Google rating (1-5) x 2, one decimal. Review counts are only used to drop very thin ratings
(< MIN_REVIEWS); they are not stored.
--raw FILE   keep the raw API answers in FILE (outside the repo!) and reuse them on the next run
--offline    only re-match from --raw, no API calls
"""
import json, os, sys, math, re, datetime, unicodedata, urllib.request
from difflib import SequenceMatcher

args = [a for a in sys.argv[1:] if not a.startswith('--')]
opt = lambda k: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else None
city = (args[0] if args else 'gent')
RAW, OFFLINE, DRY = opt('--raw'), '--offline' in sys.argv, '--dry-run' in sys.argv
LIMIT = int(opt('--limit') or 0)
if RAW in args: args.remove(RAW)
URL = 'https://places.googleapis.com/v1/places:searchText'
FIELDS = 'places.id,places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.location,places.businessStatus'
MAX_M, MIN_REVIEWS = 250, 5
# reviewed by hand: the best candidate passes the checks but is a different place -> never scored
SKIP = {
    'osm-blaarmeersen-w289021664': 'matches the campsite / playground of the Blaarmeersen park',
    'osm-elite-n7090838388': "matches 'Elite Wedding Design' (party hall)",
    'osm-ichi-bao-n10081473802': "matches 'ICHI Bites' (other name, unclear if same place)",
    'the-bakery-joost-arijs': 'matches the Joost Arijs patisserie (36 m away), not the bakery',
}

def key():
    path = os.environ.get('GOOGLE_PLACES_API_KEY_FILE') or '/home/box/.secrets/google_places_key'
    try: return open(path).read().strip()
    except OSError: sys.exit(f'No API key file ({path}). Nothing changed.')

def meters(a, b, c, d):
    R = 6371000; p1, p2 = math.radians(a), math.radians(c); dp = p2 - p1; dl = math.radians(d - b)
    return 2 * R * math.asin(math.sqrt(math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2))

GENERIC = set('restaurant resto brasserie bistro bistrot cafe café bar eetcafe taverne de het den der la le les l the and en & n t s gent ghent gand antwerpen antwerp anvers by van bv'.split())
def norm(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r"[^a-z0-9]+", ' ', s)
    return [w for w in s.split() if w]
def similarity(a, b):
    ta, tb = norm(a), norm(b)
    ka, kb = [w for w in ta if w not in GENERIC] or ta, [w for w in tb if w not in GENERIC] or tb
    ja, jb = ''.join(ka), ''.join(kb)
    if not ja or not jb: return 0.0
    seq = SequenceMatcher(None, ja, jb).ratio()
    sa, sb = set(ka), set(kb)
    tok = len(sa & sb) / min(len(sa), len(sb))                       # share of the shorter name's words
    contain = 1.0 if (len(min(ja, jb, key=len)) >= 4 and (ja in jb or jb in ja)) else 0.0
    return round(max(seq, tok * 0.95, contain * 0.9), 3)

def search(k, q, lat, lng):
    body = {'textQuery': q, 'maxResultCount': 5, 'languageCode': 'en'}
    if lat and lng: body['locationBias'] = {'circle': {'center': {'latitude': lat, 'longitude': lng}, 'radius': 300.0}}
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), method='POST', headers={
        'Content-Type': 'application/json', 'X-Goog-Api-Key': k, 'X-Goog-FieldMask': FIELDS})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r).get('places', [])

def places_of(city):
    cur = json.load(open(f'data/cities/{city}.json'))['restaurants']
    out = [dict(r, _src='curated') for r in cur if r.get('status') != 'unverified']
    ids = {r['id'] for r in out}
    p = f'data/cities/{city}-osm.json'
    if os.path.exists(p):
        out += [dict(o, _src='osm') for o in json.load(open(p))['places'] if o['id'] not in ids and o.get('status') != 'closed']
    return out

# per city: the name added to the query and the pattern that says an address already names the city (postcode or name)
CITY_Q = {'gent': ('Gent', r'\b9\d{3}\b|gent'), 'antwerpen': ('Antwerpen', r'\b2\d{3}\b|antwerp')}
def query(r):
    cn, pat = CITY_Q[city]
    a = (r.get('address') or '').strip()
    if a and not re.search(pat, a, re.I): a += ', ' + cn
    return f"{r['name']} {a or cn}"

def pick(r, cands):
    best = None
    for c in cands:
        loc = c.get('location') or {}
        if 'latitude' not in loc: continue
        d = meters(r['lat'], r['lng'], loc['latitude'], loc['longitude'])
        s = similarity(r['name'], (c.get('displayName') or {}).get('text', ''))
        ok = d < MAX_M and (s >= 0.75 or (s >= 0.6 and d < 80))
        cand = dict(c=c, d=round(d), s=s, ok=ok)
        if ok and (not best or not best['ok'] or s - d / 2000 > best['s'] - best['d'] / 2000): best = cand
        elif not best or (not best['ok'] and s > best['s']): best = cand
    return best

def main():
    raw = json.load(open(RAW)) if RAW and os.path.exists(RAW) else {}
    k = None if OFFLINE else key()
    rows = places_of(city)[:LIMIT or None]
    calls = 0; res = {}; log = []; closed = []
    for r in rows:
        if r['id'] not in raw:
            if OFFLINE: continue
            calls += 1
            try: raw[r['id']] = search(k, query(r), r.get('lat'), r.get('lng'))
            except Exception as e:
                print('!', r['id'], type(e).__name__, getattr(e, 'code', '')); continue
            finally:
                if RAW and calls % 25 == 0: json.dump(raw, open(RAW, 'w'), ensure_ascii=False)   # progress survives an interrupted run
        if r['id'] in SKIP:
            log.append({'id': r['id'], 'src': r['_src'], 'name': r['name'], 'ok': False, 'why': 'manual skip: ' + SKIP[r['id']], 'match': None, 'sim': None, 'm': None}); continue
        b = pick(r, raw[r['id']])
        if b and b['ok'] and b['c'].get('businessStatus') == 'CLOSED_PERMANENTLY':   # an open listing that also matches wins over a closed one
            alt = pick(r, [c for c in raw[r['id']] if c.get('businessStatus') != 'CLOSED_PERMANENTLY'])
            if alt and alt['ok']: b = alt
        c = b and b['c']; name = c and (c.get('displayName') or {}).get('text')
        if not b: why = 'no result'
        elif not b['ok']: why = f"weak: '{name}' sim {b['s']} at {b['d']} m"
        elif c.get('businessStatus') == 'CLOSED_PERMANENTLY':
            why = f"Google says closed: '{name}'"
            closed.append({'id': r['id'], 'osm': r.get('osm'), 'name': r['name'], 'address': r.get('address'), 'google': name, 'm': b['d'], 'sim': b['s']})
        elif not c.get('rating'): why = f"no rating: '{name}'"
        elif (c.get('userRatingCount') or 0) < MIN_REVIEWS: why = f"too few reviews: '{name}'"
        else:
            why = ''
            res[r['id']] = {'score': round(c['rating'] * 2, 1), 'google_place_id': c['id']}
        log.append({'id': r['id'], 'src': r['_src'], 'name': r['name'], 'ok': not why, 'why': why,
                    'match': name, 'sim': b and b['s'], 'm': b and b['d']})
    if RAW and not OFFLINE: json.dump(raw, open(RAW, 'w'), ensure_ascii=False)
    for src in ('curated', 'osm'):
        L = [x for x in log if x['src'] == src]
        print(f"{src}: {sum(x['ok'] for x in L)} scored / {len(L)}")
    print('API calls this run:', calls)
    json.dump(log, open('/tmp/ratings_log.json', 'w'), ensure_ascii=False, indent=1)
    json.dump(closed, open(f'/tmp/ratings_closed_{city}.json', 'w'), ensure_ascii=False, indent=1)   # review, then add to data/osm/closed.json
    print('Google says permanently closed:', len(closed), f'(list: /tmp/ratings_closed_{city}.json)')
    if DRY or (not res): return print('dry run / nothing to write')
    out = {'source': 'Google', 'note': 'score = Google rating x 2 (0-10). Rerun scripts/fetch_google_ratings.py to refresh.',
           'fetched': datetime.date.today().isoformat(), 'places': dict(sorted(res.items()))}
    p = f'data/cities/{city}-ratings.json'
    json.dump(out, open(p, 'w'), ensure_ascii=False, indent=0); print('wrote', p, len(res))

if __name__ == '__main__':
    main()
