#!/usr/bin/env python3
"""Import every food & drink business in a city from OpenStreetMap (Overpass) into data/cities/<city>-osm.json.

Idempotent: same input → same output (stable ids, sorted). Curated records in <city>.json are never overwritten;
an OSM element that is clearly the same place as a curated one (similar name and < 60 m) is not added again, and its
OSM tags are only used to FILL fields that are null/unknown in the curated record (see --fill-curated).

  python3 scripts/import_osm.py gent                 # use cached data/osm/raw.json + bounds.json
  python3 scripts/import_osm.py gent --refresh       # re-download from Overpass first
  python3 scripts/import_osm.py gent --fill-curated  # also fill null fields of matched curated records in gent.json

Mapping (features only when explicitly tagged; source 'OpenStreetMap', © OpenStreetMap contributors, ODbL):
  amenity=restaurant → Restaurants (brasserie/bistro by name, else generic 'restaurant'); amenity=fast_food → DROPPED (no frituren, snack bars,
    kebab, night shops) unless it has a confirmed vegan/vegetarian/vegan-friendly level or breakfast/brunch → Restaurants › Casual (fastfood_keep)
  amenity=pub|bar|biergarten → Cafés & bars (irish pub / cocktail bar / beer bar / dance café by tags or name); generic cafés/pubs are DROPPED
    unless kept by fastfood_keep() (confirmed veggie level → stays, breakfast/brunch → Coffee)
  amenity=cafe → Coffee › specialty coffee (by name/cuisine); other cafés (generic coffee houses) are DROPPED unless kept by fastfood_keep(); shop=coffee → Coffee › coffee shop / roaster
  shop=bakery → Bakeries › bakery; shop=pastry → Bakeries › patisserie — ARTISAN ONLY: every OSM bakery/pastry shop is DROPPED unless it is in
    data/bakeries-artisan.json 'keep' (sourced artisan check) or 'branchOf' (another shop of a curated bakery → merged into it). Veggie / breakfast
    bakeries are NOT kept on that basis alone; they are listed in data/osm/<city>-bakeries-pending.json for an artisan check.
Never shown, no exceptions (user decision 20 Oct 2026): friteries / frietkoten (name friet/frituur/fritkot/frites/chips or cuisine friture/fries/chips,
  fried_food fast food) and student / university cafeterias & restaurants (name student/cafetaria, or operator UGent / HoGent / hogeschool …); see never_kind().
Excluded: no name, lifecycle-prefixed / disused / closed tags, opening_hours="closed", permanently closed places in data/osm/closed.json, elements outside the city boundary,
  and large franchise / multinational chains listed in data/chains-exclude.json (brand:wikidata, brand or name; see is_chain).
  Curated / upcoming records are never dropped automatically: a chain match there is only printed as a WARNING.
"""
import difflib, json, math, re, sys, time, unicodedata, urllib.parse, urllib.request
from collections import Counter
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


CHAINS = json.loads((ROOT / 'data' / 'chains-exclude.json').read_text())['chains']


def _fold(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'\s+', ' ', s.replace('’', "'").replace('`', "'")).strip()


def is_chain(t):
    """Name of the excluded chain this OSM tag set belongs to, or None."""
    wd = {x.strip() for k in ('brand:wikidata', 'operator:wikidata') for x in (t.get(k) or '').split(';') if x.strip()}
    names = [_fold(t.get(k)) for k in ('brand', 'name', 'name:nl', 'name:en') if t.get(k)]
    web = (t.get('website') or t.get('contact:website') or '').lower()
    for c in CHAINS:
        if wd & set(c.get('wikidata', [])): return c['name']
        if any(re.match(p, n) for p in c.get('patterns', []) for n in names): return c['name']
        if c.get('brandWebsite') and c['brandWebsite'] in web: return c['name']
    return None


FF_KEEP = ROOT / 'data' / 'osm' / 'keep-exceptions.json'
NEVER_LIST = ROOT / 'data' / 'never-exclude.json'           # never shown, by OSM ref (student cafés etc. that never_kind() cannot see)
CLOSED = ROOT / 'data' / 'osm' / 'closed.json'                 # permanently closed (sourced): skipped even while OSM still lists them
ARTISAN = ROOT / 'data' / 'bakeries-artisan.json'            # artisan bakeries allowlist (keep / branchOf)


FRIT_NAME = re.compile(r"(friet|frituur|fritkot|frietkot|frites|friterie|\bfrit\b|\bchips\b)")
STU_NAME = re.compile(r"(student|cafetaria|cafeteria)")
EDU_OPERATOR = re.compile(r"(universiteit|ugent|hogent|hogeschool|odisee|artevelde ?hogeschool|kask|luca school)")


def never_kind(t, name):
    """Types that are never shown, whatever their veggie / breakfast level (user decision 20 Oct 2026):
    friteries / frietkoten and student / university cafeterias & restaurants. Returns 'friterie' | 'student' | None."""
    n, c, op = _fold(name), _fold(t.get('cuisine', '')), _fold(t.get('operator', ''))
    first = c.split(';')[0].strip()
    ff = t.get('amenity') == 'fast_food'
    if FRIT_NAME.search(n) or 'friture' in c or first in ('fries', 'chips') or (ff and re.search(r"\b(fries|chips|fried_food)\b", c)): return 'friterie'
    if STU_NAME.search(n) or EDU_OPERATOR.search(op): return 'student'
    return None


def fastfood_keep():
    """amenity=fast_food places and generic cafés/pubs (pub/bar/biergarten that are not dance / brown / Irish / cocktail / beer bars)
    and generic coffee houses (amenity=cafe that is not specialty coffee) are dropped, EXCEPT those with a confirmed vegan / vegetarian / vegan-friendly level or a confirmed
    breakfast / brunch. The keep list is persisted in data/osm/keep-exceptions.json (only grows; delete an entry by hand to drop it),
    so a re-import gives the same result even before the veggie / breakfast layers are rebuilt."""
    keep = dict(json.loads(FF_KEEP.read_text())['keep']) if FF_KEEP.exists() else {}
    cd = ROOT / 'data' / 'cities'
    vg = json.loads((cd / f'{CITY}-veggie.json').read_text())['places'] if (cd / f'{CITY}-veggie.json').exists() else {}
    bk = json.loads((cd / f'{CITY}-breakfast.json').read_text())['places'] if (cd / f'{CITY}-breakfast.json').exists() else {}
    for k, v in vg.items():
        if k.startswith('osm-') and v.get('veggieLevel') in ('vegan', 'vegetarian', 'vegan-friendly'): keep.setdefault(k, f"veggie level: {v['veggieLevel']}")
    for k, v in bk.items():
        yes = [m for m in ('breakfast', 'brunch') if (v.get(m) or {}).get('value') is True]
        if k.startswith('osm-') and yes: keep.setdefault(k, 'confirmed ' + ' & '.join(yes))
    return keep


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
        if t.get('bar') == 'wine' or 'wine' in cu.split(';') or re.search(r'wijnbar|wine ?bar|\bwine\b|\bvino\b|\bwijn', n): return 'cafes_bars', 'wine_bar'
        if t.get('cocktails') == 'yes' or 'cocktail' in n or 'cocktail' in t.get('description', '').lower(): return 'cafes_bars', 'cocktail_bar'
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
    places, matched, skipped, seen = [], [], {'noname': 0, 'lifecycle': 0, 'closed': 0, 'other': 0, 'dup_osm': 0, 'chain': 0, 'fast_food': 0, 'generic_cafe': 0, 'coffee_house': 0, 'generic_bakery': 0, 'friterie': 0, 'student': 0, 'duplicate': 0}, set()
    ff_keep, ff_kept = fastfood_keep(), set()
    art = json.loads(ARTISAN.read_text()) if ARTISAN.exists() else {'keep': {}, 'branchOf': {}}
    by_cid = {c['id']: c for c in curated}
    closed = json.loads(CLOSED.read_text())['places'] if CLOSED.exists() else {}
    never_refs = json.loads(NEVER_LIST.read_text())['places'] if NEVER_LIST.exists() else {}
    closed_names = {norm_name(v['name']) for k, v in closed.items() if k.startswith('name:')}
    bk_pending = {}
    chains = Counter()
    never = {'friterie': [], 'student': [], 'duplicate': []}; never_ids = set()
    elems = sorted(raw['elements'], key=lambda e: (e['type'], e['id']))
    for e in elems:
        t = e.get('tags', {})
        name = (t.get('name') or '').strip()
        if not name: skipped['noname'] += 1; continue
        if any(LIFECYCLE.match(k) for k in t) or t.get('disused') == 'yes' or t.get('abandoned') == 'yes': skipped['lifecycle'] += 1; continue
        if t.get('opening_hours', '').strip().lower() in ('closed', 'off') or t.get('opening_hours:covid19') == 'off' and False: skipped['closed'] += 1; continue
        if t.get('amenity') not in ('restaurant', 'cafe', 'bar', 'pub', 'biergarten', 'fast_food') and t.get('shop') not in ('bakery', 'pastry', 'coffee'): skipped['other'] += 1; continue
        if (ch := is_chain(t)): skipped['chain'] += 1; chains[ch] += 1; continue    # big chains stay off the site
        if (nx := never_refs.get(f"{e['type']}/{e['id']}")): nk = nx.get('kind', 'student'); skipped[nk] += 1; never[nk].append(name); never_ids.add(f"osm-{slug(name)}-{e['type'][0]}{e['id']}"); continue
        if (nk := never_kind(t, name)): skipped[nk] += 1; never[nk].append(name); never_ids.add(f"osm-{slug(name)}-{e['type'][0]}{e['id']}"); continue   # no friteries / student restaurants, no exceptions
        if f"{e['type']}/{e['id']}" in closed or norm_name(name) in closed_names: skipped['closed'] += 1; continue
        lat, lng = (e['lat'], e['lon']) if e['type'] == 'node' else (e['center']['lat'], e['center']['lon'])
        group, cat = categorize(t, name)
        if (ak0 := art.get('keep', {}).get(f"{e['type']}/{e['id']}")): group, cat = 'bakeries', ak0.get('category', 'bakery')   # allowlisted artisan bakery / patisserie (also when OSM tags it as a café)
        if not group: skipped['other'] += 1; continue
        osm_ref = f"{e['type']}/{e['id']}"
        # dedupe vs curated: similar name and < 60 m
        # (exactly the same distinctive name: up to 150 m, curated geocodes are sometimes a building off)
        hit = next((c for c in curated if c.get('osm') == osm_ref), None) or next((c for c in curated if (d := dist_m((lat, lng), (c['lat'], c['lng']))) < 60 and same_name(name, c['name'])
                    or d < 150 and len(norm_name(name)) >= 5 and norm_name(name) == norm_name(c['name'])), None)
        if not hit and group == 'bakeries' and (b := art.get('branchOf', {}).get(osm_ref)) and b['curated'] in by_cid: hit = by_cid[b['curated']]
        if hit: matched.append({'osm': osm_ref, 'osmName': name, 'id': hit['id'], 'name': hit['name'], 'm': round(dist_m((lat, lng), (hit['lat'], hit['lng']))), 'tags': t}); continue
        if cat == 'quick_bites':                                  # no frituren / snack bars / kebab / night shops (user request 20 Oct 2026)
            rid0 = f"osm-{slug(name)}-{e['type'][0]}{e['id']}"
            if rid0 not in ff_keep: skipped['fast_food'] += 1; continue
            ff_kept.add(rid0); cat = 'casual'                     # kept: confirmed veggie level or breakfast/brunch → Restaurants › Casual
        if group == 'cafes_bars' and cat == 'cafe':               # no generic cafés / pubs (user request 20 Oct 2026); dance / brown / Irish / cocktail / beer bars stay
            rid0 = f"osm-{slug(name)}-{e['type'][0]}{e['id']}"
            if rid0 not in ff_keep: skipped['generic_cafe'] += 1; continue
            ff_kept.add(rid0)
            if 'breakfast' in ff_keep[rid0] or 'brunch' in ff_keep[rid0]: group, cat = 'coffee', 'coffee_house'   # a morning place → Coffee
        elif group == 'coffee' and cat == 'coffee_house':        # no generic coffee houses (user request 20 Oct 2026); specialty coffee + shops/roasters stay
            rid0 = f"osm-{slug(name)}-{e['type'][0]}{e['id']}"
            if rid0 not in ff_keep: skipped['coffee_house'] += 1; continue
            ff_kept.add(rid0)
        if group == 'bakeries':                                   # artisan bakeries / patisseries only (user request 20 Oct 2026)
            ak = art.get('keep', {}).get(osm_ref)
            if not ak:
                rid0 = f"osm-{slug(name)}-{e['type'][0]}{e['id']}"
                if rid0 in ff_keep: bk_pending[rid0] = {'osm': osm_ref, 'name': name, 'why': ff_keep[rid0], 'website': t.get('website') or t.get('contact:website')}
                skipped['generic_bakery'] += 1; continue
            if ak.get('category') in ('bakery', 'patisserie'): cat = ak['category']
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
        if group == 'bakeries' and (ak := art.get('keep', {}).get(osm_ref)):        # sourced artisan facts from the allowlist
            if ak.get('style'): rec['bakeryStyle'] = ak['style']; rec['bakeryStyleSource'] = ak.get('source')
            for k in ('website', 'instagram_handle'):
                if ak.get(k) and not rec.get(k): rec[k] = ak[k]
            if ak.get('description'): rec['summary'] = ak['description']; rec['summarySource'] = ak.get('source')
            for k, v in (ak.get('features') or {}).items():                        # research values win over OSM tags here (they carry a source)
                rec.setdefault('features', {})[k] = v; rec.setdefault('features_evidence', {})[k] = (ak.get('features_evidence') or {}).get(k, ak.get('source'))
            if ak.get('sources'): rec['sources'] = ak['sources']
            if ak.get('address') and (rec.get('addressApprox') or not rec.get('address')): rec['address'] = ak['address']; rec.pop('addressApprox', None)
            if 'openingHours' in ak: rec['openingHours'] = ak['openingHours']; rec['openingHoursNote'] = ak.get('openingHoursNote')   # e.g. null: sources conflict
        places.append({k: v for k, v in rec.items() if v not in (None, '', [], {})})
    corr = json.loads((OSM_DIR / 'corrections.json').read_text())['places'] if (OSM_DIR / 'corrections.json').exists() else {}
    for r in places:                                             # hand corrections (sourced) on top of OSM tags
        c = corr.get(r['osm'])
        if c:
            r.update({k: v for k, v in c.items() if k != 'source'}); r['correctionSource'] = c.get('source')
            if 'address' in c: r.pop('addressApprox', None)
    hrs = json.loads((OSM_DIR / 'hours-research.json').read_text())['places'] if (OSM_DIR / 'hours-research.json').exists() else {}
    for r in places:                                             # researched hours (scripts/merge_hours.py), only where OSM has none
        h = hrs.get(r['osm'])
        if h and not r.get('openingHours'):
            r.update({'openingHours': h['openingHours'], 'openingHoursSource': h['source'], 'openingHoursConfidence': h.get('confidence')})
    rsv = json.loads((OSM_DIR / 'reservations-research.json').read_text())['places'] if (OSM_DIR / 'reservations-research.json').exists() else {}
    for r in places:                                             # researched booking info (scripts/merge_reservations.py); never overwrites OSM phone/link
        e = rsv.get(r['osm'])
        if e and e.get('method') in ('online', 'phone', 'walk-in'):
            r.update({k: v for k, v in {'reservationMethod': e['method'], 'reservationSource': e.get('source'), 'reservationNote': e.get('note')}.items() if v})
            if e['method'] == 'online' and e.get('bookingUrl') and not r.get('reservation_url'):
                r['reservation_url'] = e['bookingUrl']
                if e.get('provider'): r['reservation_provider'] = e['provider']
            if e.get('phone') and not r.get('phone'): r['phone'] = e['phone']
    places.sort(key=lambda r: r['id']); save_locate()
    out = {'source': 'OpenStreetMap via Overpass API', 'license': '© OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)',
           'osmBase': stamp, 'city': CITY, 'count': len(places), 'places': places}
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n')
    (OSM_DIR / f'{CITY}-osm-matches.json').write_text(json.dumps([{k: v for k, v in m.items() if k != 'tags'} for m in matched], ensure_ascii=False, indent=1))
    filled = fill_curated(cur, matched) if '--fill-curated' in ARGS else []
    if filled: CUR.write_text(json.dumps(cur, ensure_ascii=False, indent=1) + '\n')
    kept_ff = {k: ff_keep[k] for k in ff_kept}
    FF_KEEP.write_text(json.dumps({'about': 'OSM places that the import would drop (fast food; generic cafés/pubs) but keeps because of a confirmed vegan/vegetarian/vegan-friendly level or breakfast/brunch. Fast food → Restaurants › Casual; generic café/pub with breakfast/brunch → Coffee; other generic cafés/pubs and coffee houses stay in their group (under All). See fastfood_keep() in scripts/import_osm.py.',
                                   'keep': dict(sorted((k, v) for k, v in ({**json.loads(FF_KEEP.read_text())['keep'], **kept_ff}.items() if FF_KEEP.exists() else kept_ff.items()) if k not in never_ids))}, ensure_ascii=False, indent=1) + '\n')
    (OSM_DIR / f'{CITY}-bakeries-pending.json').write_text(json.dumps({'about': 'OSM bakeries with a confirmed vegan/veggie level or breakfast that the import dropped because no source confirms they are artisan. Add a sourced entry to data/bakeries-artisan.json (keep) or via scripts/merge_bakeries.py to show them.', 'places': dict(sorted(bk_pending.items()))}, ensure_ascii=False, indent=1) + '\n')
    for c in curated:                                             # never drop curated/upcoming silently: warn only
        if (ch := is_chain({'name': c.get('name', '')})): print(f"WARNING: curated/upcoming record {c['id']} looks like chain {ch} — review by hand")
        if (nk := never_kind({'cuisine': ';'.join(c.get('cuisineTags') or [])}, c.get('name', ''))): print(f"WARNING: curated/upcoming record {c['id']} looks like a {nk} place — remove it by hand")
    (OSM_DIR / f'{CITY}-never-excluded.json').write_text(json.dumps({k: sorted(set(v)) for k, v in never.items()}, ensure_ascii=False, indent=1) + '\n')
    (OSM_DIR / f'{CITY}-chains-excluded.json').write_text(json.dumps(dict(sorted(chains.items())), ensure_ascii=False, indent=1) + '\n')
    print(f'{len(places)} OSM places written → {OUT.relative_to(ROOT)} (OSM base {stamp})')
    print('by group/category:', dict(Counter((p['group'], p['category']) for p in places)))
    print(f'{len(matched)} matched to curated records (not re-added); skipped: {skipped}')
    print(f'chains excluded ({sum(chains.values())}): {dict(chains.most_common())}')
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
