"""Merge data/cities/<city>-venues-new.json (cafés & bars, coffee, bakeries + new businesses) into
data/cities/<city>.json. Idempotent: previously merged records (origin == 'venues') are replaced.
Restaurants keep their data and get group='restaurants', category=<type>.
Venue records are normalised to the same schema (unknown → 'unknown' / null, never guessed).
Status 'unverified' is kept in the data; the front-end hides it."""
import json, re, sys
city = sys.argv[1] if len(sys.argv) > 1 else 'gent'
P = f'data/cities/{city}.json'; S = f'data/cities/{city}-venues-new.json'
D = json.load(open(P)); V = json.load(open(S))
CAT = {'dance_cafe': 'Dance café', 'brown_cafe': 'Brown café', 'irish_pub': 'Irish pub', 'cafe': 'Café',
       'coffee_bar': 'Specialty coffee', 'bakery': 'Bakery', 'restaurant': 'Restaurant'}
DIST = {'9000': 'Gent (9000)', '9050': 'Gentbrugge/Ledeberg', '9040': 'Sint-Amandsberg', '9051': 'Sint-Denijs-Westrem', '9032': 'Wondelgem'}
FMAP = {'veggie': 'veggie', 'vegan': 'vegan', 'terrace': 'terrace', 'live_music': 'liveMusic', 'dj': 'dj', 'food_served': 'foodServed',
        'wifi': 'wifi', 'gluten_free': 'glutenFree', 'open_sunday': 'openSunday', 'kids_welcome': 'kidsWelcome',
        'wheelchair_accessible': 'wheelchair', 'seating': 'seating'}
yn = lambda v: 'yes' if v is True else ('no' if v is False else 'unknown')
rest = [r for r in D['restaurants'] if r.get('origin') != 'venues']
for r in rest:
    r['group'] = 'restaurants'; r['category'] = r.get('type')
names = {re.sub(r'\W', '', r['name'].lower()) for r in rest}; ids = {r['id'] for r in rest}
def norm(v):
    pc = (re.search(r'\b(9\d{3})\b', v['address']) or [None, ''])[1]
    feats = {FMAP[k]: val for k, val in (v.get('features') or {}).items() if k in FMAP}
    feats.setdefault('seating', None)
    ev = []
    for i, e in enumerate(v.get('events') or []):
        title = e['title']
        # event types as listed by the venue: Kinky Star's agenda = concerts; De Maecht / Funke = DJ / club nights
        typ = 'concert' if v['id'] == 'kinky-star' else 'club night'
        ev.append({'id': f"{v['id']}-ev{i}", 'title': title, 'dateStart': e.get('date'), 'dateEnd': e.get('dateEnd'), 'type': typ,
                   'location': f"{v['name']}, {v['address']}", 'partners': [], 'sources': [e['url']] if e.get('url') else []})
    cat = v['category']
    return {
        'id': v['id'], 'name': v['name'], 'group': v['group'], 'category': cat, 'type': None,
        'cuisine': CAT.get(cat, cat), 'cuisineTags': [], 'chef': 'unknown', 'address': v['address'], 'postalCode': pc,
        'district': DIST.get(pc, pc), 'neighbourhood': v.get('neighbourhood') or 'unknown', 'lat': v['lat'], 'lng': v['lng'],
        'geoSource': v.get('geoSource'), 'geoPrecision': v.get('geoPrecision'),
        'priceLevel': v.get('priceLevel') or 'unknown', 'priceFrom': None,
        'distinctions': {'michelin': None, 'michelinYear': None, 'gaultMillau': None, 'gaultMillauEdition': None},
        'openingYear': v.get('openingYear') or 'unknown', 'openingDate': v.get('openingDate') or 'unknown', 'isNew': bool(v.get('isNew')),
        'vegetarian': yn(feats.get('veggie')), 'vegan': yn(feats.get('vegan')), 'dietNote': '',
        'menuType': 'unknown', 'menuChanges': 'unknown', 'currentMenuNote': 'unknown',
        'status': v.get('status') or 'open', 'statusNote': v.get('statusNote') or '',
        'website': v.get('website'), 'instagram_handle': v.get('instagram_handle'),
        'instagram': f"https://www.instagram.com/{v['instagram_handle']}/" if v.get('instagram_handle') else None,
        'instagramSource': v.get('instagramSource'), 'instagram_posts': [], 'phone': None,
        'summary': v.get('description') or '', 'summaryLang': 'en', 'events': ev, 'sources': v.get('sources') or [],
        'dataConflict': None, 'dateChecked': v.get('dateChecked'), 'lastChanged': v.get('dateChecked'),
        'city': city, 'country': 'BE', 'photos': [], 'reservation_url': None, 'reservation_provider': None,
        'features': feats, 'features_evidence': {k: 'stated by a source in the venues research' for k, x in feats.items() if x is True},
        'openingHours': v.get('openingHours'), 'openingHoursSource': v.get('openingHoursSource'),
        'notes': ' '.join(x for x in [v.get('typeNote'), v.get('isNewNote'), v.get('featureNotes') if isinstance(v.get('featureNotes'), str) else None] if x) or None,
        'otherLocations': v.get('otherLocations'), 'origin': 'venues'}
added = []; seen = set(ids)
for v in V['venues'] + [n for n in V['new_businesses'] if not n.get('alsoInVenues')]:
    key = re.sub(r'\W', '', v['name'].lower())
    if v['id'] in seen or key in names: continue
    seen.add(v['id']); names.add(key); added.append(norm(v))
# new restaurants from new_businesses use restaurant feature keys (same names) and stay type=None (no sourced type)
D['restaurants'] = rest + added
json.dump(D, open(P, 'w'), ensure_ascii=False, indent=1)
from collections import Counter
print('restaurants', len(rest), 'added', len(added), Counter((x['group'], x['category']) for x in added), 'unverified', [x['id'] for x in added if x['status'] == 'unverified'])
