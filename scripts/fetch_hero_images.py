#!/usr/bin/env python3
"""Find a hero photo for each place: the og:image / twitter:image the business itself publishes on its own homepage.

We do NOT download or rehost these images. The script only reads the homepage <meta> tags, then fetches the image once
(in memory) to check it is a real, large, landscape photo. The site then hotlinks the image URL
(<img referrerpolicy="no-referrer">) with a "Photo: <domain>" credit. Results go to data/cities/<city>-heroes.json:
  {"places": {"<id>": {"url", "source", "type": "og:image"|"twitter:image", "w", "h", "checked"}},
   "rejected": {"<id>": {"why", "checked", "url"?}}}

Idempotent and polite: a place that is already in places/rejected is skipped unless you pass --refresh, or
--retry-rejected for rejected places only. Requests have a 12 s timeout and a browser-like UA naming the project,
with at most 1 request per second per domain (several domains are fetched in parallel). Curated places come first.

  python3 scripts/fetch_hero_images.py gent                  # new places only
  python3 scripts/fetch_hero_images.py gent --refresh        # re-check everything (e.g. monthly)
  python3 scripts/fetch_hero_images.py gent --curated-only
  python3 scripts/fetch_hero_images.py gent --browser-check  # also drop images a real Chrome <img> cannot load
                                                             # (CORP / hotlink protection); needs playwright

Rejected:
- SVG, GIF, ICO; anything under 800 px wide; anything not landscape (w/h < 1.2, logo squares are usually 1:1).
- 'logo', 'favicon', 'icon', 'placeholder', 'default' or 'avatar' in the file name.
- Near-flat images (low pixel variance, e.g. a logo on white).
- An image URL also used by an unrelated domain (website-builder / booking-platform defaults).
- Images on known platform hosts (wix default thumbnails, facebook, google).
- Ids listed in data/osm/hero-review.json (manual contact-sheet review: logos, posters, website screenshots, spam).
  Make a sheet with --sheet (writes /tmp/hero-sheet-*.png, review only, nothing is stored in the repo).
"""
import concurrent.futures as cf, hashlib, io, json, re, sys, threading, time
from datetime import date
from pathlib import Path
from urllib.parse import urljoin, urlparse
import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageStat

ROOT = Path(__file__).resolve().parent.parent
CITY = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('-') else 'gent'
ARGS = set(sys.argv[1:])
OUT = ROOT / 'data' / 'cities' / f'{CITY}-heroes.json'
REVIEW = ROOT / 'data' / 'osm' / 'hero-review.json'
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 TableAndTheCity-hero-check/1.0 (+https://tableandthecity.com)'
BAD_NAME = re.compile(r'logo|favicon|icon|placeholder|default|avatar|sprite|blank', re.I)
BAD_HOST = re.compile(r'(^|\.)(facebook\.com|fbcdn\.net|google\.[a-z.]+|gstatic\.com|static\.wixstatic\.com/media/[^/]*_default|gravatar\.com)$', re.I)
TODAY = date.today().isoformat()
_last, _lock = {}, threading.Lock()


def polite(host):
    """At most 1 request per second per domain."""
    while True:
        with _lock:
            wait = _last.get(host, 0) + 1.0 - time.time()
            if wait <= 0: _last[host] = time.time(); return
        time.sleep(wait)


def get(url, **kw):
    polite(urlparse(url).hostname or '')
    return requests.get(url, headers={'User-Agent': UA, 'Accept-Language': 'nl-BE,nl;q=0.9,en;q=0.8'}, timeout=12, **kw)


def find_meta(html, base):
    s = BeautifulSoup(html, 'html.parser')
    for typ, attrs in (('og:image', {'property': 'og:image'}), ('og:image', {'property': 'og:image:url'}), ('og:image', {'name': 'og:image'}),
                       ('twitter:image', {'name': 'twitter:image'}), ('twitter:image', {'property': 'twitter:image'})):
        m = s.find('meta', attrs=attrs)
        if m and (m.get('content') or '').strip():
            return typ, urljoin(base, m['content'].strip())
    return None, None


def check(rid, site):
    try:
        r = get(site, allow_redirects=True)
        if r.status_code != 200 or 'html' not in r.headers.get('content-type', ''): return rid, None, f'homepage HTTP {r.status_code}'
        typ, img = find_meta(r.text[:600000], r.url)
        if not img: return rid, None, 'no og:image / twitter:image'
        if img.startswith('http://'): img = 'https://' + img[7:]       # try the https version; the site must serve it (checked below)
        if not img.startswith('https://'): return rid, None, 'image not https'
        p = urlparse(img)
        if BAD_NAME.search(p.path.rsplit('/', 1)[-1]): return rid, None, f'logo-like file name ({img})'
        if BAD_HOST.search(p.hostname or ''): return rid, None, f'platform image host ({p.hostname})'
        if re.search(r'\.(svg|gif|ico)(\?|$)', p.path, re.I): return rid, None, 'svg/gif/ico'
        ir = get(img, stream=True)
        ct = ir.headers.get('content-type', '')
        if ir.status_code != 200 or not ct.startswith('image/') or 'svg' in ct or 'gif' in ct: return rid, None, f'image HTTP {ir.status_code} {ct}'
        data = ir.raw.read(8_000_000, decode_content=True)
        im = Image.open(io.BytesIO(data)); w, h = im.size
        if w < 800: return rid, None, f'too small ({w}x{h})'
        if w / h < 1.2: return rid, None, f'not landscape ({w}x{h})'
        st = ImageStat.Stat(im.convert('L').resize((64, 64)))
        if st.stddev[0] < 18: return rid, None, f'flat image, likely a logo/graphic (sd {st.stddev[0]:.0f})'
        return rid, {'url': img, 'source': r.url, 'type': typ, 'w': w, 'h': h, 'hash': hashlib.md5(data).hexdigest()[:12], 'checked': TODAY}, None
    except Exception as e:
        return rid, None, f'error: {type(e).__name__}'


def browser_check(found):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        pg = b.new_page(); pg.set_content('<html><body></body></html>')
        ok = pg.evaluate("""async urls => Promise.all(urls.map(u => new Promise(res => { const i = new Image(); i.referrerPolicy = 'no-referrer';
            const t = setTimeout(() => res(0), 15000); i.onload = () => { clearTimeout(t); res(i.naturalWidth); }; i.onerror = () => { clearTimeout(t); res(0); }; i.src = u; })))""",
                         [v['url'] for v in found.values()])
        b.close()
    return {k: w for (k, v), w in zip(found.items(), ok)}


def main():
    cur = json.loads((ROOT / 'data' / 'cities' / f'{CITY}.json').read_text())['restaurants']
    osm = [] if '--curated-only' in ARGS else json.loads((ROOT / 'data' / 'cities' / f'{CITY}-osm.json').read_text())['places']
    db = json.loads(OUT.read_text()) if OUT.exists() else {'places': {}, 'rejected': {}}
    todo = [(r['id'], r['website']) for r in cur + osm if r.get('website') and r.get('status') != 'closed'
            and ('--refresh' in ARGS or r['id'] not in db['places'] and (r['id'] not in db['rejected'] or '--retry-rejected' in ARGS))]
    print(f'{len(todo)} places to check', flush=True)
    with cf.ThreadPoolExecutor(16) as ex:
        for i, (rid, hit, why) in enumerate(ex.map(lambda t: check(*t), todo), 1):
            if hit: db['places'][rid] = hit; db['rejected'].pop(rid, None)
            else: db['rejected'][rid] = {'why': why, 'checked': TODAY}; db['places'].pop(rid, None)
            if i % 100 == 0: print(i, 'done')
    # same image on unrelated domains = platform default, not the business' own photo
    host = lambda u: re.sub(r'^www\.', '', urlparse(u).hostname or '')
    by = {}
    for k, v in db['places'].items(): by.setdefault(v.get('hash') or v['url'], set()).add(host(v['source']))
    for k, v in list(db['places'].items()):
        if len(by[v.get('hash') or v['url']]) > 1:
            db['rejected'][k] = {'why': 'same image on several unrelated sites (platform default)', 'checked': TODAY, 'url': v['url']}; del db['places'][k]
    review = json.loads(REVIEW.read_text())['reject'] if REVIEW.exists() else {}   # manual contact-sheet review (logos, posters, screenshots, spam)
    for k, why in review.items():
        if k in db['places']: db['rejected'][k] = {'why': f'manual review: {why}', 'checked': TODAY, 'url': db['places'].pop(k)['url']}
    if '--browser-check' in ARGS and db['places']:
        for k, w in browser_check(db['places']).items():
            if not w: db['rejected'][k] = {'why': 'does not load as hotlinked <img> in Chrome (CORP / hotlink protection)', 'checked': TODAY, 'url': db['places'][k]['url']}; del db['places'][k]
    db = {'about': 'Hero photos = the og:image / twitter:image each business publishes on its own homepage. Hotlinked, never rehosted. Built by scripts/fetch_hero_images.py.',
          'places': dict(sorted(db['places'].items())), 'rejected': dict(sorted(db['rejected'].items()))}
    OUT.write_text(json.dumps(db, ensure_ascii=False, indent=1) + '\n')
    print(f"heroes: {len(db['places'])}, rejected: {len(db['rejected'])} → {OUT.relative_to(ROOT)}")
    from collections import Counter
    print(Counter(re.sub(r' \(.*|: .*', '', v['why']) for v in db['rejected'].values()).most_common())


def sheet():
    from PIL import ImageDraw
    d = json.loads(OUT.read_text())['places']; items = sorted(d.items())
    def th(kv):
        try:
            im = Image.open(io.BytesIO(get(kv[1]['url']).content)).convert('RGB'); im.thumbnail((240, 135)); return kv[0], im
        except Exception: return kv[0], None
    with cf.ThreadPoolExecutor(12) as ex: res = list(ex.map(th, items))
    for s0 in range(0, len(res), 40):
        sh = Image.new('RGB', (5 * 244, 8 * 155), 'white'); dr = ImageDraw.Draw(sh)
        for i, (k, im) in enumerate(res[s0:s0 + 40]):
            x, y = (i % 5) * 244, (i // 5) * 155
            if im: sh.paste(im, (x, y))
            dr.text((x + 2, y + 138), k[:38], fill='black')
        sh.save(f'/tmp/hero-sheet-{s0 // 40}.png')
    print('contact sheets → /tmp/hero-sheet-*.png')


if __name__ == '__main__':
    sheet() if '--sheet' in ARGS else main()
