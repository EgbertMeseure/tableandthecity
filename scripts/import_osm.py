#!/usr/bin/env python3
"""Import every food & drink business in a city from OpenStreetMap (Overpass) into data/cities/<city>-osm.json.

Idempotent: same input → same output (stable ids, sorted). Curated records in <city>.json are never overwritten;
an OSM element that is clearly the same place as a curated one (similar name and < 60 m) is not added again, and its
OSM tags are only used to FILL fields that are null/unknown in the curated record (see --fill-curated).

  python3 scripts/import_osm.py gent                 # use cached data/osm/raw.json + bounds.json
  python3 scripts/import_osm.py gent --refresh       # re-download from Overpass first
  python3 scripts/import_osm.py gent --fill-curated  # also fill null fields of matched curated records in gent.json

Mapping (features only when explicitly tagged; source 'OpenStreetMap', © OpenStreetMap contributors, ODbL):
  amenity=restaurant → Restaurants (brasserie/bistro by name, else generic 'restaurant'); amenity=fast_food → Restaurants › Quick bites
  amenity=pub|bar|biergarten → Cafés & bars (irish pub / cocktail bar / beer bar / dance café by tags or name, else 'café')
  amenity=cafe → Coffee (specialty coffee by name/cuisine, else 'coffee & lunch'); shop=coffee → Coffee › coffee shop / roaster
  shop=bakery → Bakeries › bakery; shop=pastry → Bakeries › patisserie
Excluded: no name, lifecycle-prefixed / disused / closed tags, opening_hours="closed", elements outside the city boundary.
"""
import difflib, json, math, re, sys, time, unicodedata, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CITY = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('-') else 'gent'
ARGS = set(sys.argv[1:])
OSM_DIR = ROOT / 'data' / 'osm'
RAW, BOUNDS = OSM_DIR / 'raw.json', OSM_DIR / 'bounds.json'
CUR = ROOT / 'data' / 'cities' / f'{CITY}.json'
UPC = ROOT / 'data' / 'cities' / f'{CITY}-upcoming.json'
OUT = ROOT / 'data' / 'cities' / f'{CITY}-osm.json'
AREA = {'gent': 'Gent'}[CITY]
ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
Q_POI = f'''[out:json][timeout:180];
area["boundary"="administrative"]["admin_level"="8"]["name"="{AREA}"]->.g;
( nwr["amenity"~"^(restaurant|cafe|bar|pub|biergarten|fast_food)$"](area.g);
  nwr["shop"~"^(bakery|pastry|coffee)$"](area.g); );
out center tags;'''
Q_BOUNDS = f'''[out:json][timeout:180];
area["boundary"="administrative"]["admin_level"="8"]["name"="{AREA}"]->.g;
rel["boundary"="administrative"]["admin_level"="9"](area.g);
out geom;'''


def overpass(q, dest):
    last = None
    for ep in ENDPOINTS:
        for attempt in range(2):
            try:
                req = urllib.request.Request(ep, data=urllib.parse.urlencode({'data': q}).encode(), headers={'User-Agent': 'tableandthecity-import/1.0'})
                body = urllib.request.urlopen(req, timeout=240).read()
                json.loads(body)                                  # Overpass returns HTML on overload
                dest.write_bytes(body); return
            except Exception as e:
                last = e; time.sleep(15)
    raise SystemExit(f'Overpass failed: {last}')


def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-') or 'x'


def norm_name(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    s = re.sub(r"\b(restaurant|resto|brasserie|bistro|cafe|bar|eetcafe|taverne|de|het|le|la|les|l|the|t|gent|ghent|bakkerij|bakery|patisserie|coffee|koffie)\b", ' ', s)
    return re.sub(r'[^a-z0-9]+', '', s)


def dist_m(a, b):
    R = 6371000; t = math.radians
    dl, dg = t(b[0] - a[0]), t(b[1] - a[1])
    h = math.sin(dl / 2) ** 2 + math.cos(t(a[0])) * math.cos(t(b[0])) * math.sin(dg / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def same_name(a, b):
    x, y = norm_name(a), norm_name(b)
    if not x or not y:                                   # name made only of generic words ("The Bakery")
        raw = lambda s: re.sub(r'[^a-z0-9]+', '', unicodedata.normalize('NFKD', s.lower()).encode('ascii', 'ignore').decode())
        return raw(a) in raw(b) or raw(b) in raw(a)
    if difflib.SequenceMatcher(None, x, y).ratio() >= 0.85: return True
    if x == y: return True
    short, long_ = sorted((x, y), key=len)
    if len(short) >= 5 and long_.startswith(short) or len(short) >= 7 and short in long_: return True
    # token overlap for multi-word names
    ta = set(re.findall(r'[a-z0-9]{3,}', unicodedata.normalize('NFKD', a.lower()).encode('ascii', 'ignore').decode()))
    tb = set(re.findall(r'[a-z0-9]{3,}', unicodedata.normalize('NFKD', b.lower()).encode('ascii', 'ignore').decode()))
    stop = {'restaurant', 'cafe', 'bar', 'gent', 'ghent', 'the', 'bistro', 'brasserie', 'bakkerij', 'coffee', 'and'}
    ta, tb = ta - stop, tb - stop
    return bool(ta and tb and len(ta & tb) / min(len(ta), len(tb)) >= 0.67)


LIFECYCLE = re.compile(r'^(disused|abandoned|closed|was|demolished|removed|razed|destroyed|construction|proposed|planned|not):')
YES, NO = {'yes', 'only', 'limited'}, {'no'}


def tri(v, yes=YES):
    if v is None: return None
    v = v.strip().lower()
    return True if v in yes else False if v in NO else None


def categorize(t, name):
    a, sh, n = t.get('amenity'), t.get('shop'), name.lower()
    cu = t.get('cuisine', '').lower()
    if a == 'fast_food': return 'restaurants', 'quick_bites'
    if a == 'restaurant':
        if re.search(r'\bbrasserie\b', n): return 'restaurants', 'brasserie'
        if re.search(r'\bbistro|bistrot\b', n): return 'restaurants', 'bistro'
        return 'restaurants', 'restaurant'
    if a in ('pub', 'bar', 'biergarten'):
        if re.search(r'\birish\b', n) or 'irish' in t.get('pub', '') : return 'cafes_bars', 'irish_pub'
        if re.search(r'dans(cafe|café)|dancing\b', n): return 'cafes_bars', 'dance_cafe'
        if t.get('cocktails') == 'yes' or 'cocktail' in n: return 'cafes_bars', 'cocktail_bar'
        if a == 'biergarten' or re.search(r'\b(bier|beer|brew|tap|hop)\w*', n) or t.get('microbrewery') == 'yes': return 'cafes_bars', 'beer_bar'
        return 'cafes_bars', 'cafe'
    if sh == 'coffee': return 'coffee', 'coffee_shop'
    if a == 'cafe':
        if re.search(r'coffee|koffie|espresso|roast|brew', n) or cu in ('coffee_shop',) or t.get('drink:coffee') == 'yes' and 'coffee' in cu: return 'coffee', 'coffee_bar'
        return 'coffee', 'coffee_house'
    if sh == 'pastry': return 'bakeries', 'patisserie'
    if sh == 'bakery': return 'bakeries', 'bakery'
    return None, None


CUISINE_EN = {'italian': 'Italian', 'pizza': 'Pizza', 'chinese': 'Chinese', 'japanese': 'Japanese', 'sushi': 'Sushi', 'thai': 'Thai', 'vietnamese': 'Vietnamese',
    'indian': 'Indian', 'turkish': 'Turkish', 'kebab': 'Kebab', 'greek': 'Greek', 'french': 'French', 'belgian': 'Belgian', 'burger': 'Burgers', 'friture': 'Frituur (fries)',
    'mexican': 'Mexican', 'spanish': 'Spanish', 'tapas': 'Tapas', 'lebanese': 'Lebanese', 'syrian': 'Syrian', 'moroccan': 'Moroccan', 'asian': 'Asian', 'korean': 'Korean',
    'nepalese': 'Nepalese', 'ethiopian': 'Ethiopian', 'portuguese': 'Portuguese', 'peruvian': 'Peruvian', 'african': 'African', 'middle_eastern': 'Middle Eastern', 'mediterranean': 'Mediterranean',
    'sandwich': 'Sandwiches', 'chicken': 'Chicken', 'steak_house': 'Steakhouse', 'seafood': 'Seafood', 'fish': 'Fish', 'regional': 'Regional', 'international': 'International',
    'breakfast': 'Breakfast', 'brunch': 'Brunch', 'ice_cream': 'Ice cream', 'coffee_shop': 'Coffee', 'cake': 'Cake', 'pancake': 'Pancakes', 'waffle': 'Waffles', 'crepe': 'Crêpes',
    'vegan': 'Vegan', 'vegetarian': 'Vegetarian', 'bagel': 'Bagels', 'noodle': 'Noodles', 'ramen': 'Ramen', 'poke': 'Poke', 'falafel': 'Falafel', 'pita': 'Pita', 'shawarma': 'Shawarma',
    'american': 'American', 'european': 'European', 'georgian': 'Georgian', 'persian': 'Persian', 'afghan': 'Afghan', 'pakistani': 'Pakistani', 'indonesian': 'Indonesian',
    'filipino': 'Filipino', 'tex-mex': 'Tex-Mex', 'argentinian': 'Argentinian', 'brazilian': 'Brazilian', 'caribbean': 'Caribbean', 'tibetan': 'Tibetan', 'taiwanese': 'Taiwanese',
    'bubble_tea': 'Bubble tea', 'juice': 'Juice', 'salad': 'Salads', 'soup': 'Soup', 'barbecue': 'Barbecue', 'grill': 'Grill', 'dessert': 'Desserts', 'donut': 'Doughnuts'}


def cuisine_tags(t):
    raw = [c.strip().lower() for c in re.split(r'[;,]', t.get('cuisine', '')) if c.strip()]
    return [CUISINE_EN.get(c, c.replace('_', ' ').capitalize()) for c in raw]


def address(t):
    st, hn, pc = t.get('addr:street'), t.get('addr:housenumber'), t.get('addr:postcode')
    city = t.get('addr:city') or ''
    if not st: return None, pc
    a = f'{st} {hn}' if hn else st
    tail = ' '.join(x for x in [pc, city or ('Gent' if pc else '')] if x)
    return (f'{a}, {tail}' if tail else a), pc


def load_districts():
    from shapely.geometry import Polygon, Point
    from shapely.ops import unary_union, polygonize
    from shapely.geometry import LineString
    polys = []
    for rel in json.loads(BOUNDS.read_text())['elements']:
        lines = [LineString([(p['lon'], p['lat']) for p in m['geometry']]) for m in rel.get('members', []) if m['type'] == 'way' and m.get('role') in ('outer', '') and m.get('geometry')]
        shape = unary_union(list(polygonize(unary_union(lines))))
        if not shape.is_empty: polys.append((rel['tags']['name'], shape))
    def district(lat, lng):
        pt = Point(lng, lat)
        for n, s in polys:
            if s.contains(pt): return {'Gent': 'Gent (9000)', 'Gentbrugge': 'Gentbrugge/Ledeberg', 'Ledeberg': 'Gentbrugge/Ledeberg'}.get(n, n)
        return ''
    return district


STREETS, LOCATE = OSM_DIR / 'streets.json', OSM_DIR / 'locate-cache.json'
Q_STREETS = f'''[out:json][timeout:240];
area["boundary"="administrative"]["admin_level"="8"]["name"="{AREA}"]->.g;
( way["highway"]["name"](area.g); node["place"~"^(suburb|quarter|neighbourhood)$"](area.g); );
out geom;'''


def load_locator():
    """Nearest named street (≤ 40 m, for places without addr:*) and nearest OSM neighbourhood node (≤ 900 m).
    streets.json (≈9 MB, not in git) is only needed when new places appear; results are cached in locate-cache.json."""
    cache = json.loads(LOCATE.read_text()) if LOCATE.exists() else {}
    state = {}
    def build():
        if 'tree' in state: return
        if not STREETS.exists(): overpass(Q_STREETS, STREETS)
        from shapely.geometry import LineString, Point
        from shapely.strtree import STRtree
        els = json.loads(STREETS.read_text())['elements']
        lines, names = [], []
        for e in els:
            if e['type'] == 'way' and len(e.get('geometry', [])) > 1:
                lines.append(LineString([(p['lon'], p['lat']) for p in e['geometry']])); names.append(e['tags']['name'])
        state.update(tree=STRtree(lines), lines=lines, names=names, Point=Point,
                     hoods=[(e['tags']['name'], e['lat'], e['lon']) for e in els if e['type'] == 'node'])
    def locate(ref, lat, lng):
        if ref in cache: return cache[ref]
        build(); P = state['Point'](lng, lat)
        i = state['tree'].nearest(P); ln = state['lines'][i]
        npt = ln.interpolate(ln.project(P)); dm = dist_m((lat, lng), (npt.y, npt.x))
        hood = min(state['hoods'], key=lambda h: dist_m((lat, lng), (h[1], h[2])))
        res = {'street': state['names'][i] if dm <= 40 else None, 'hood': hood[0] if dist_m((lat, lng), (hood[1], hood[2])) <= 900 else None}
        cache[ref] = res; return res
    def save(): LOCATE.write_text(json.dumps(dict(sorted(cache.items())), ensure_ascii=False, separators=(',', ':')))
    return locate, save


def main():
    OSM_DIR.mkdir(parents=True, exist_ok=True)
    if '--refresh' in ARGS or not RAW.exists(): overpass(Q_POI, RAW)
    if '--refresh' in ARGS or not BOUNDS.exists(): overpass(Q_BOUNDS, BOUNDS)
    raw = json.loads(RAW.read_text())
    district = load_districts()
    locate, save_locate = load_locator()
    cur = json.loads(CUR.read_text())
    curated = [r for r in cur['restaurants'] if r.get('lat')]
    if UPC.exists(): curated += [u for u in json.loads(UPC.read_text()).get('upcoming', []) if u.get('lat')]
    stamp = raw.get('osm3s', {}).get('timestamp_osm_base', '')[:10]
    places, matched, skipped, seen = [], [], {'noname': 0, 'lifecycle': 0, 'closed': 0, 'other': 0, 'dup_osm': 0}, set()
    elems = sorted(raw['elements'], key=lambda e: (e['type'], e['id']))
    for e in elems:
        t = e.get('tags', {})
        name = (t.get('name') or '').strip()
        if not name: skipped['noname'] += 1; continue
        if any(LIFECYCLE.match(k) for k in t) or t.get('disused') == 'yes' or t.get('abandoned') == 'yes': skipped['lifecycle'] += 1; continue
        if t.get('opening_hours', '').strip().lower() in ('closed', 'off') or t.get('opening_hours:covid19') == 'off' and False: skipped['closed'] += 1; continue
        if t.get('amenity') not in ('restaurant', 'cafe', 'bar', 'pub', 'biergarten', 'fast_food') and t.get('shop') not in ('bakery', 'pastry', 'coffee'): skipped['other'] += 1; continue
        lat, lng = (e['lat'], e['lon']) if e['type'] == 'node' else (e['center']['lat'], e['center']['lon'])
        group, cat = categorize(t, name)
        if not group: skipped['other'] += 1; continue
        osm_ref = f"{e['type']}/{e['id']}"
        # dedupe vs curated: similar name and < 60 m
        # (exactly the same distinctive name: up to 150 m, curated geocodes are sometimes a building off)
        hit = next((c for c in curated if (d := dist_m((lat, lng), (c['lat'], c['lng']))) < 60 and same_name(name, c['name'])
                    or d < 150 and len(norm_name(name)) >= 5 and norm_name(name) == norm_name(c['name'])), None)
        if hit: matched.append({'osm': osm_ref, 'osmName': name, 'id': hit['id'], 'name': hit['name'], 'm': round(dist_m((lat, lng), (hit['lat'], hit['lng']))), 'tags': t}); continue
        # same business mapped twice in OSM (node + building), keep the first
        key = (norm_name(name), round(lat, 3), round(lng, 3))
        if key in seen: skipped['dup_osm'] += 1; continue
        seen.add(key)
        addr, pc = address(t)
        loc = locate(f"{e['type']}/{e['id']}", lat, lng)
        dist_name = district(lat, lng)
        approx = False
        if not addr and loc['street']: addr, approx = f"{loc['street']}{', ' + pc if pc else ''}, Gent", True
        hood = t.get('addr:suburb') or (loc['hood'] if dist_name in ('Gent (9000)', 'Gentbrugge/Ledeberg') else dist_name) or ''
        feats, ev = {}, {}
        def f(k, v, why):
            if v is not None: feats[k] = v; ev[k] = f'OpenStreetMap: {why}'
        dv, dg = t.get('diet:vegetarian'), t.get('diet:vegan')
        if group == 'restaurants': f('veggie', tri(dv), f'diet:vegetarian={dv}')
        if group != 'cafes_bars': f('vegan', tri(dg), f'diet:vegan={dg}')
        f('glutenFree', tri(t.get('diet:gluten_free')), f"diet:gluten_free={t.get('diet:gluten_free')}")
        f('terrace', tri(t.get('outdoor_seating')), f"outdoor_seating={t.get('outdoor_seating')}")
        f('wheelchair', tri(t.get('wheelchair'), {'yes'}), f"wheelchair={t.get('wheelchair')}")
        ia = t.get('internet_access')
        f('wifi', True if ia in ('wlan', 'yes', 'wifi') else False if ia == 'no' else None, f'internet_access={ia}')
        f('takeaway', tri(t.get('takeaway')), f"takeaway={t.get('takeaway')}")
        if group in ('coffee', 'bakeries'):
            f('seating', tri(t.get('indoor_seating')), f"indoor_seating={t.get('indoor_seating')}")
        oh = t.get('opening_hours')
        if oh and re.search(r'\bSu\b[^;]*\b\d', oh) and not re.search(r'\bSu\b[^;]*\b(off|closed)', oh): f('openSunday', True, f'opening_hours includes Sunday')
        veg = None
        if dg == 'only': veg = 'vegan'
        elif dv == 'only': veg = 'vegetarian'
        elif dg in ('yes', 'limited'): veg = 'vegan-friendly'
        elif dv in ('yes', 'limited'): veg = 'veggie-friendly'
        web = t.get('website') or t.get('contact:website') or t.get('url')
        if web and not re.match(r'^https?://', web): web = 'https://' + web
        ig = t.get('contact:instagram') or ''
        ig = re.sub(r'^(https?://)?(www\.)?instagram\.com/', '', ig).strip('/@ ') or None
        rid = f"osm-{slug(name)}-{e['type'][0]}{e['id']}"
        rec = {'id': rid, 'name': name, 'group': group, 'category': cat, 'cuisineTags': cuisine_tags(t),
               'address': addr, 'addressApprox': approx or None, 'postalCode': pc, 'district': dist_name, 'neighbourhood': hood,
               'lat': round(lat, 6), 'lng': round(lng, 6), 'website': web, 'instagram_handle': ig, 'phone': t.get('phone') or t.get('contact:phone'),
               'openingHours': oh, 'features': feats, 'features_evidence': ev, 'osm': osm_ref}
        if veg: rec['veggieLevel'] = veg; rec['veggieSource'] = [f'https://www.openstreetmap.org/{osm_ref}']
        if t.get('brand'): rec['brand'] = t['brand']
        places.append({k: v for k, v in rec.items() if v not in (None, '', [], {})})
    corr = json.loads((OSM_DIR / 'corrections.json').read_text())['places'] if (OSM_DIR / 'corrections.json').exists() else {}
    for r in places:                                             # hand corrections (sourced) on top of OSM tags
        c = corr.get(r['osm'])
        if c:
            r.update({k: v for k, v in c.items() if k != 'source'}); r['correctionSource'] = c.get('source')
            if 'address' in c: r.pop('addressApprox', None)
    places.sort(key=lambda r: r['id']); save_locate()
    out = {'source': 'OpenStreetMap via Overpass API', 'license': '© OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)',
           'osmBase': stamp, 'city': CITY, 'count': len(places), 'places': places}
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n')
    (OSM_DIR / f'{CITY}-osm-matches.json').write_text(json.dumps([{k: v for k, v in m.items() if k != 'tags'} for m in matched], ensure_ascii=False, indent=1))
    filled = fill_curated(cur, matched) if '--fill-curated' in ARGS else []
    if filled: CUR.write_text(json.dumps(cur, ensure_ascii=False, indent=1) + '\n')
    from collections import Counter
    print(f'{len(places)} OSM places written → {OUT.relative_to(ROOT)} (OSM base {stamp})')
    print('by group/category:', dict(Counter((p['group'], p['category']) for p in places)))
    print(f'{len(matched)} matched to curated records (not re-added); skipped: {skipped}')
    print(f'filled {len(filled)} null fields in curated records' + (': ' + ', '.join(filled[:30]) if filled else ''))


def fill_curated(cur, matched):
    """Only fill fields that are null/'unknown' in the curated record, from explicit OSM tags. Never overwrite."""
    by = {r['id']: r for r in cur['restaurants']}
    unk = lambda v: v is None or v == '' or (isinstance(v, str) and v.lower().startswith('unknown'))
    done = []
    for m in matched:
        r, t = by.get(m['id']), m['tags']
        if not r: continue
        r.setdefault('osm', m['osm'])
        web = t.get('website') or t.get('contact:website')
        if unk(r.get('website')) and web and re.match(r'^https?://', web): r['website'] = web; done.append(f"{r['id']}.website")
        if unk(r.get('phone')) and (t.get('phone') or t.get('contact:phone')): r['phone'] = t.get('phone') or t.get('contact:phone'); done.append(f"{r['id']}.phone")
        if unk(r.get('openingHours')) and t.get('opening_hours'):
            r['openingHours'] = t['opening_hours']; r['openingHoursSource'] = 'OpenStreetMap'; done.append(f"{r['id']}.openingHours")
        F, EV = r.setdefault('features', {}), r.setdefault('features_evidence', {})
        for k, tag, yes in [('terrace', 'outdoor_seating', YES), ('wheelchair', 'wheelchair', {'yes'}), ('glutenFree', 'diet:gluten_free', YES)]:
            v = tri(t.get(tag), yes)
            if F.get(k) is None and v is not None: F[k] = v; EV[k] = f'OpenStreetMap: {tag}={t[tag]}'; done.append(f"{r['id']}.{k}")
    return done


if __name__ == '__main__':
    main()
