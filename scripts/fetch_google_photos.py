#!/usr/bin/env python3
"""Prepare (NOT active by default) Google Places Photos for the gallery.

Usage:  GOOGLE_MAPS_API_KEY=... python3 scripts/fetch_google_photos.py [city] [--max 6] [--dry-run]

For every restaurant it runs a Places API (New) Text Search ("<name>, <address>"), keeps the
match whose location is within 150 m of our coordinates, and stores in data/cities/<city>.json:
  google_place_id : the place ID (Google allows storing place IDs indefinitely)
  google_photos   : [{name, widthPx, heightPx, authorAttributions:[{displayName, uri, photoUri}]}]
  google_photos_fetched : ISO date
Photo *names* can expire and Google's terms do not allow caching the images themselves, so
re-run this regularly (daily job, see update.md) and never download the image bytes to the repo.
The front-end only renders these when a browser key is configured in js/config.js
(window.TG_CONFIG = {googleMapsKey: '...'}) and always shows the required attributions.
"""
import json, os, sys, math, datetime, urllib.request

KEY = os.environ.get('GOOGLE_MAPS_API_KEY')
args = [a for a in sys.argv[1:] if not a.startswith('--')]
city = args[0] if args else 'gent'
MAX = int(sys.argv[sys.argv.index('--max') + 1]) if '--max' in sys.argv else 6
DRY = '--dry-run' in sys.argv
URL = 'https://places.googleapis.com/v1/places:searchText'
FIELDS = 'places.id,places.displayName,places.formattedAddress,places.location,places.photos'

def km(a, b, c, d):
    R = 6371; p1, p2 = math.radians(a), math.radians(c); dp = p2 - p1; dl = math.radians(d - b)
    return 2 * R * math.asin(math.sqrt(math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2))

def search(q, lat, lng):
    body = json.dumps({'textQuery': q, 'maxResultCount': 5, 'languageCode': 'en',
                       'locationBias': {'circle': {'center': {'latitude': lat, 'longitude': lng}, 'radius': 500.0}}}).encode()
    req = urllib.request.Request(URL, data=body, method='POST', headers={
        'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': FIELDS})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r).get('places', [])

def main():
    if not KEY:
        sys.exit('Set GOOGLE_MAPS_API_KEY (a server key restricted to the Places API (New)). Nothing changed.')
    path = f'data/cities/{city}.json'
    data = json.load(open(path))
    today = datetime.date.today().isoformat(); n = 0
    for r in data['restaurants']:
        try:
            places = search(f"{r['name']}, {r['address']}", r['lat'], r['lng'])
        except Exception as e:
            print('!', r['id'], e); continue
        best = None
        for p in places:
            loc = p.get('location') or {}
            if 'latitude' in loc and km(r['lat'], r['lng'], loc['latitude'], loc['longitude']) < 0.15:
                best = p; break
        if not best:
            print('-', r['id'], 'no match within 150 m'); continue
        photos = [{'name': ph['name'], 'widthPx': ph.get('widthPx'), 'heightPx': ph.get('heightPx'),
                   'authorAttributions': ph.get('authorAttributions', [])} for ph in (best.get('photos') or [])[:MAX]]
        r['google_place_id'] = best['id']; r['google_photos'] = photos; r['google_photos_fetched'] = today
        n += len(photos); print('+', r['id'], best['displayName'].get('text'), len(photos), 'photos')
    if DRY:
        print('dry run: not writing', n, 'photo references'); return
    json.dump(data, open(path, 'w'), ensure_ascii=False, indent=1)
    print('stored', n, 'photo references in', path)

if __name__ == '__main__':
    main()
