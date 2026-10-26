#!/usr/bin/env python3
"""Photos: apply the manual photo review and the photo research hand-off to a city.
Rule (owner, 26 Oct 2026): every photo a place shows is food, drinks or the interior (exterior only as a weaker fallback),
never people (chef, staff, guests, portraits, hands).

  python3 scripts/apply_photo_review.py <city> [--research=/workspace/handoff/place-photos-research] [--no-verify] [--dry]

1. data/osm/photo-review.json cities.<city>:
   posts      {shortcode: category}  Instagram post category: food | drink | interior | exterior | other | people | graphic.
                                     js/common.js never shows people / chef / graphic posts and prefers food / drink / interior.
                                     Set on <city>.json, <city>-media-sources.json and <city>-instagram.json posts.
   heroReject {id: why}             own-site og:image heroes with people → <city>-heroes.json rejected (and kept out of the
                                     Instagram layer as heroReject). data/osm/hero-review.json lists them too (fetch_hero_images.py).
   hold       {id: why}             only photos with people exist → the place shows nothing (neutral placeholder).
   dropPhotos {id: {src part: why}} own / free-licence photos with people → removed from the place record.
   skipResearch {id | id/file: why} research candidates not to use.
2. Research hand-off (re-runnable; ingests whatever is in the folder): <research>/<city>/<id>/sources.json, a list of
   {file, source_url, page_url, source_type: instagram|website, subject, no_people_verified, width, height, notes}, every image
   checked by eye by the researcher. Written to data/cities/<city>-photos.json places.<id> = {photos, posts, pick} (loaded by
   js/common.js; the first usable candidate — the researcher's order — is the card + hero photo, `pick`):
   - instagram: the post permalink is derived from the CDN url's ig_cache_key (media id → shortcode) and shown with Instagram's
     official embed. Checked once (headless Chrome): the embed must render the very same photo as the researcher's file
     (average-hash, ≤ 8/144 bits) — cached in data/osm/photo-research-checks.json. --no-verify: unchecked ones are left out.
   - website: hotlinked from the place's own site when it loads as an image of ≤ 1.6 MB. Too heavy to hotlink, or a crop is set in
     photo-review.json cropResearch {"id/file-stem": [left, top, right, bottom] as fractions}: the researcher's copy (max 1600 px) is
     self-hosted as webp under img/places/<city>/<id>/<stem>-1600.webp + -800.webp, still credited to the place's website.
Run after apply_media.py, build_instagram_layer.py and fetch_hero_images.py (they rewrite those files). Idempotent.
"""
import base64, io, json, re, sys, urllib.parse
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / 'data' / 'cities'
CITY = next((a for a in sys.argv[1:] if not a.startswith('-')), 'gent')
OPT = {a.split('=', 1)[0]: (a.split('=', 1)[1] if '=' in a else True) for a in sys.argv[1:] if a.startswith('--')}
DRY = '--dry' in OPT
RESEARCH = Path(OPT.get('--research', '/workspace/handoff/place-photos-research'))
TODAY = date.today().isoformat()
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
CODE = re.compile(r'instagram\.com/(?:p|reel)/([A-Za-z0-9_-]+)')
B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
SUBJECTS = {'food', 'drink', 'interior', 'exterior'}
MAX_BYTES = 1_600_000


def load(p):
    t = p.read_text(); return json.loads(t), t


def save(p, obj, text=None):
    if DRY: return
    text = text if text is not None else (p.read_text() if p.exists() else '{\n "')
    if text.startswith('{"'): out = json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
    elif text.startswith('{\n"'): out = json.dumps(obj, ensure_ascii=False, indent=0)
    elif text.startswith('{\n  "'): out = json.dumps(obj, ensure_ascii=False, indent=2)
    else: out = json.dumps(obj, ensure_ascii=False, indent=1)
    p.write_text(out + '\n')


def code(u):
    m = CODE.search(u or ''); return m.group(1) if m else None


def shortcode(media_id):
    s = ''
    while media_id: s = B64[media_id % 64] + s; media_id //= 64
    return s


def media_id(cdn_url):
    m = re.search(r'ig_cache_key=([^&]+)', cdn_url or '')
    if not m: return None
    k = urllib.parse.unquote(m.group(1)).split('.')[0]
    try: return int(base64.b64decode(k + '=' * (-len(k) % 4)).decode())
    except Exception: return None


REV = json.loads((ROOT / 'data' / 'osm' / 'photo-review.json').read_text())['cities'].get(CITY, {})
POSTS, HREJ, HOLD, SKIP = REV.get('posts', {}), REV.get('heroReject', {}), REV.get('hold', {}), REV.get('skipResearch', {})
DROP = REV.get('dropPhotos', {})
CROP = REV.get('cropResearch', {})
def status_tables():
    """the research STATUS.md: 'Needs placeholder' → holds, 'Current photo shows people' → hero rejects / people posts (photo-review.json wins)"""
    f = RESEARCH / 'STATUS.md'
    if not f.exists(): return
    sec = None
    for line in f.read_text().splitlines():
        if line.startswith('## '): sec = line[3:].strip().lower(); continue
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if len(cells) < 3 or cells[0] != CITY: continue
        rid = cells[1].strip('`')
        if sec == 'needs placeholder': HOLD.setdefault(rid, f'no people-free photo found (research): {cells[3] if len(cells) > 3 else ""}')
        elif sec == 'current photo shows people' and len(cells) >= 5:
            what = cells[4]; src = cells[3]
            if src.startswith('hero:'): HREJ.setdefault(rid, f'people visible ({what}), flagged by the photo research')
            elif src.startswith('igpost:'):
                mid = media_id(src[7:].strip())
                if mid: POSTS.setdefault(shortcode(mid), 'people')


status_tables()
n = {'posts recategorised': 0, 'heroes rejected': 0, 'iglayer heroes rejected': 0}


def recat(lst):
    out = []
    for p in lst or []:
        q = {'url': p, 'category': ''} if isinstance(p, str) else dict(p)
        c = POSTS.get(code(q['url']))
        if c is not None and q.get('category') != c: q['category'] = c; n['posts recategorised'] += 1
        out.append(q if (c is not None or not isinstance(p, str)) else p)
    return out


ids = set()
for name, key in ((f'{CITY}.json', 'restaurants'), (f'{CITY}-upcoming.json', 'upcoming')):
    f = D / name
    if not f.exists(): continue
    d, t = load(f)
    for r in d.get(key, []):
        ids.add(r['id'])
        if r['id'] in DROP and r.get('photos'):
            keep = [p for p in r['photos'] if not any(k in p.get('src', '') for k in DROP[r['id']])]
            n['photos dropped'] = n.get('photos dropped', 0) + len(r['photos']) - len(keep); r['photos'] = keep
        if r.get('instagram_posts'): r['instagram_posts'] = recat(r['instagram_posts'])
    save(f, d, t)
ids |= {o['id'] for o in json.loads((D / f'{CITY}-osm.json').read_text())['places']}
f = D / f'{CITY}-media-sources.json'
if f.exists():
    d, t = load(f)
    for r in d['restaurants'].values():
        if r.get('instagram_posts'): r['instagram_posts'] = recat(r['instagram_posts'])
    save(f, d, t)
f = D / f'{CITY}-heroes.json'
if f.exists():
    d, t = load(f)
    for rid, why in HREJ.items():
        if rid in d['places']:
            d['rejected'][rid] = {'why': f'photo review: {why}', 'checked': TODAY, 'url': d['places'].pop(rid)['url']}; n['heroes rejected'] += 1
    d['rejected'] = dict(sorted(d['rejected'].items()))
    save(f, d, t)
f = D / f'{CITY}-instagram.json'
if f.exists():
    d, t = load(f)
    for rid, x in d['places'].items():
        if x.get('posts'): x['posts'] = recat(x['posts'])
        if rid in HREJ and x.get('heroImage'):
            u = x.pop('heroImage')['url']; x['heroReject'] = u
            x['ogImageRejected'] = f'{u} (photo review: {HREJ[rid]})'; n['iglayer heroes rejected'] += 1
    save(f, d, t)

# ---- research hand-off → <city>-photos.json ----
CHK_F = ROOT / 'data' / 'osm' / 'photo-research-checks.json'
CHK = json.loads(CHK_F.read_text()) if CHK_F.exists() else {'about': 'Checks of research photo candidates (scripts/apply_photo_review.py): instagram = the official embed of the derived permalink renders the same photo; website = loads as an image <= 1.6 MB.', 'checks': {}}


def ahash(data, k=12):
    from PIL import Image
    im = Image.open(io.BytesIO(data)).convert('L').resize((k, k)); px = list(im.tobytes()); m = sum(px) / len(px)
    return [x > m for x in px]


_pw = {}
def embed_image(sc):
    """render the official post embed, return the bytes of its photo (or None)"""
    import requests
    if 'pg' not in _pw:
        from playwright.sync_api import sync_playwright
        _pw['p'] = sync_playwright().start(); b = _pw['p'].chromium.launch(executable_path='/usr/bin/google-chrome')
        _pw['pg'] = b.new_context(user_agent=UA, viewport={'width': 540, 'height': 1000}).new_page()
    pg = _pw['pg']
    pg.goto(f'https://www.instagram.com/p/{sc}/embed/', wait_until='load', timeout=30000); pg.wait_for_timeout(1200)
    src = pg.evaluate("""() => { const im = [...document.querySelectorAll('img')].filter(i => /cdninstagram|fbcdn/.test(i.currentSrc || i.src) && i.naturalWidth >= 150)
      .sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight); const v = document.querySelector('video');
      return im.length ? (im[0].currentSrc || im[0].src) : (v ? v.poster : null); }""")
    return requests.get(src, headers={'User-Agent': UA}, timeout=20).content if src else None


def check_instagram(c, local):
    mid = media_id(c['source_url'])
    if not mid: return None, 'no ig_cache_key'
    key = f'ig:{mid}'; sc = shortcode(mid)
    if key not in CHK['checks']:
        if '--no-verify' in OPT: return None, 'not verified yet'
        try:
            img = embed_image(sc)
            if not img: CHK['checks'][key] = {'code': sc, 'ok': False, 'why': 'embed shows no photo (broken link / not a post)', 'checked': TODAY}
            else:
                dist = sum(a != b for a, b in zip(ahash(img), ahash(local.read_bytes())))
                CHK['checks'][key] = {'code': sc, 'ok': dist <= 8, 'diff': dist, 'checked': TODAY, **({} if dist <= 8 else {'why': 'embed shows a different photo'})}
        except Exception as e:
            return None, f'check failed: {type(e).__name__}'
    ck = CHK['checks'][key]
    return (f'https://www.instagram.com/p/{ck["code"]}/' if ck['ok'] else None), ck.get('why', '')


def check_website(c):
    import requests
    key = f'web:{c["source_url"]}'
    if key not in CHK['checks']:
        if '--no-verify' in OPT: return False, 'not verified yet'
        try:
            r = requests.get(c['source_url'], headers={'User-Agent': UA}, timeout=20)
            ok = r.status_code == 200 and r.headers.get('content-type', '').startswith('image/') and len(r.content) <= MAX_BYTES
            CHK['checks'][key] = {'ok': ok, 'bytes': len(r.content), 'checked': TODAY, **({} if ok else {'why': f'HTTP {r.status_code} {r.headers.get("content-type", "")} {len(r.content)} bytes (needs ≤ {MAX_BYTES})'})}
        except Exception as e:
            return False, f'check failed: {type(e).__name__}'
    ck = CHK['checks'][key]; return ck['ok'], ck.get('why', '')


def selfhost(rid, stem, local, crop=None):
    from PIL import Image
    im = Image.open(local); im = im.convert('RGBA' if im.mode in ('RGBA', 'LA', 'P') and 'transparency' in im.info or im.mode == 'RGBA' else 'RGB')
    if im.mode == 'RGBA': bg = Image.new('RGB', im.size, 'white'); bg.paste(im, mask=im.split()[3]); im = bg
    if crop: W, H = im.size; im = im.crop((round(crop[0] * W), round(crop[1] * H), round(crop[2] * W), round(crop[3] * H)))
    d = ROOT / 'img' / 'places' / CITY / rid; out = {}
    for px, key in ((1600, 'src'), (800, 'thumb')):
        c = im.copy(); c.thumbnail((px, px), Image.LANCZOS); f = d / f'{stem}-{px}.webp'
        if not DRY: d.mkdir(parents=True, exist_ok=True); c.save(f, 'WEBP', quality=80, method=6)
        out[key] = str(f.relative_to(ROOT))
        if px == 1600: out['w'], out['h'] = c.size
    return out


host = lambda u: urllib.parse.urlparse(u).hostname.replace('www.', '') if u else ''
out = {'about': 'Photos per place from the photo research (own Instagram via the official post embed, own website hotlinked; every photo checked: '
                 'food / drinks / interior, no people) and holds (no people-free photo: nothing shown). Built by scripts/apply_photo_review.py; '
                 'pick = the card + hero photo. Nothing is downloaded or rehosted.', 'places': {}}
report = {'places': 0, 'instagram': 0, 'website': 0, 'left out': []}
cdir = RESEARCH / CITY
for sf in sorted(cdir.glob('*/sources.json')) if cdir.exists() else []:
    rid = sf.parent.name
    if rid not in ids or rid in HOLD or rid in SKIP: continue
    try: cands = json.loads(sf.read_text())
    except Exception: report['left out'].append(f'{rid}: unreadable sources.json'); continue
    photos, posts, pick = [], [], None
    for c in cands:
        stem = str(c.get('file', '')).rsplit('.', 1)[0]
        if f'{rid}/{stem}' in SKIP: report['left out'].append(f'{rid}/{stem}: {SKIP[f"{rid}/{stem}"]}'); continue
        if not c.get('no_people_verified') or c.get('subject') not in SUBJECTS: report['left out'].append(f'{rid}/{stem}: not verified people-free / subject {c.get("subject")}'); continue
        if c.get('source_type') == 'instagram':
            local = sf.parent / c['file']
            if not local.exists(): report['left out'].append(f'{rid}/{stem}: file missing'); continue
            url, why = check_instagram(c, local)
            if not url: report['left out'].append(f'{rid}/{stem}: {why}'); continue
            if any(p['url'] == url for p in posts): continue
            posts.append({'url': url, 'category': c['subject'], 'origin': 'research'}); pick = pick or {'type': 'post', 'url': url}; report['instagram'] += 1
        elif c.get('source_type') == 'website':
            ok, why = check_website(c)
            crop = CROP.get(f'{rid}/{stem}'); local = sf.parent / c['file']
            heavy = not ok and why.startswith('HTTP 200 image/')
            base = {'category': c['subject'], 'source': 'website', 'credit': host(c.get('page_url') or c['source_url']), 'credit_url': c.get('page_url') or c['source_url'], 'alt': ''}
            if (heavy or crop) and local.exists():
                ph = {**selfhost(rid, stem, local, crop), **base, 'source_url': c['source_url']}; report['self-hosted'] = report.get('self-hosted', 0) + 1
            elif not ok: report['left out'].append(f'{rid}/{stem}: {why}'); continue
            else:
                ph = {'src': c['source_url'], 'thumb': c['source_url'], 'w': c.get('width'), 'h': c.get('height'), 'hotlink': True, **base}
            photos.append(ph); pick = pick or {'type': 'photo', 'src': ph['src']}; report['website'] += 1
    if pick:
        out['places'][rid] = {k: v for k, v in (('photos', photos), ('posts', posts), ('pick', pick)) if v}; report['places'] += 1
for rid, why in HOLD.items():
    if rid in ids: out['places'][rid] = {'hold': why}
out['places'] = dict(sorted(out['places'].items()))
if _pw: _pw['p'].stop()
save(D / f'{CITY}-photos.json', out)
if not DRY: CHK_F.write_text(json.dumps(CHK, ensure_ascii=False, indent=1) + '\n')
print(CITY, 'photo review applied:', n)
print(CITY, f"research: {report['places']} places, {report['instagram']} Instagram posts, {report['website']} website photos ({report.get('self-hosted', 0)} self-hosted); holds: {sum(1 for r in HOLD if r in ids)}")
for x in report['left out']: print('  left out:', x)
