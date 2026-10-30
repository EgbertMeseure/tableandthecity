#!/usr/bin/env python3
"""Self-host the reworked place photos (photo layout C: 1 hero, landscape preferred, + up to --max-1 more (default 3 in all)) for one city.
  python3 scripts/apply_photos_all.py <city> --sel=/workspace/photos-all/sel_<city>.json --review=/workspace/photos-all/review_<city>.txt [--budget-mb=90] [--dry]
sel_<city>.json: per place the eye-checked candidates in order (n=1 is the hero pick), each {path, source_type instagram|website|commons,
page_url, source_url, cat, w, h, ...}; review_<city>.txt: "<id>: <n> <n>" = numbers rejected by eye (people / text / not this place), "<id>: all".
Writes img/places/<city>/<id>/p<k>-{1600,800}.webp (hero) and p<k>-{1000,500}.webp (others), and data/cities/<city>-photos.json
places[id] = {photos, pick, only: true, posts (kept)}: 'only' = this set replaces the place's older photos and the hotlinked website og:image.
Over the --budget-mb, website photos other than the hero stay hotlinked from the place's own site instead of being stored."""
import json, sys, os, re, glob
from pathlib import Path
from PIL import Image, ImageOps
ROOT = Path(__file__).resolve().parent.parent
CITY = next(a for a in sys.argv[1:] if not a.startswith('-'))
OPT = {a.split('=', 1)[0]: (a.split('=', 1)[1] if '=' in a else True) for a in sys.argv[1:] if a.startswith('--')}
SEL = json.load(open(OPT['--sel'])); DRY = '--dry' in OPT
BUDGET = float(OPT.get('--budget-mb', 1e9)) * 1e6
MAXN = int(OPT.get('--max', 3))  # photos per place (hero included)
MIX = '--mix' in OPT   # food / interior / exterior set
ONLY = set(OPT['--ids'].split(',')) if '--ids' in OPT else None   # only rebuild these places, keep the rest as is
REJ = {}
for line in open(OPT['--review']) if os.path.exists(OPT.get('--review', '')) else []:
    if ':' in line and not line.lstrip().startswith('#'):
        i, v = line.split(':', 1); REJ.setdefault(i.strip(), set()).update(v.split())
cfg_p = ROOT / 'data/cities.json'; cfg = json.loads(cfg_p.read_text())
city = next(c for k in cfg['countries'] for c in k['cities'] if c['id'] == CITY)
if not city.get('photos'):
    city['photos'] = f'data/cities/{CITY}-photos.json'
    if not DRY: cfg_p.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + '\n')
PP = ROOT / city['photos']
PH = json.loads(PP.read_text()) if PP.exists() else {'about': '', 'places': {}}
PH['about'] = ("Checked photos per place for the place page (photo layout C): food, drinks, the interior or a people-free exterior only, from the "
               "place's own website, its own public Instagram profile embed (no login) or a free licence; every photo checked by eye for people, "
               "text graphics, posters, logos and menus. Self-hosted under img/places/<city>/<id>/ (scripts/apply_photos_all.py). "
               "only = this set replaces older photos and the hotlinked og:image; hold = only photos with people exist (neutral placeholder).")
CREDIT_IG = lambda u: (re.search(r'instagram\.com/([A-Za-z0-9_.]+)', u or '') or [None, None])[1]
used = 0; stats = {'places': 0, 'photos': 0, 'hotlinked': 0, 'placeholder_rejected': 0}
def enc(im, base, W):
    w, h = im.size; x = im.resize((W, round(h * W / w)), Image.LANCZOS) if w > W else im
    f = ROOT / f'{base}-{W}.webp'
    if not DRY: x.save(f, 'WEBP', quality=68 if W >= 1000 else 65, method=6)
    return x.size, (f.stat().st_size if not DRY else 0)
keep_files = set()
for pid, s in SEL.items():
    if ONLY is not None and pid not in ONLY: continue
    rej = REJ.get(pid, set())
    if 'all' in rej or not s['show']:
        if 'all' in rej and s['show']: stats['placeholder_rejected'] += 1
        continue
    ok = [x for x in s['show'] if str(x['n']) not in rej]
    if not ok: continue
    # hero: the first remaining landscape photo (not the exterior if there is a choice), else the first remaining one
    if MIX:   # hero = the place itself (room or outside; a landscape dish when there is no landscape venue photo);
        # the row under the facts = food, the inside, the outside; then a drink / vibe photo as an optional extra; a 2nd of a type only when nothing else is left
        slot = lambda x: 'food' if x['cat'] in ('food', 'drink') else x['cat']
        L = lambda x: x['w'] >= x['h'] * 1.2
        V = lambda x: x['cat'] in ('interior', 'exterior')
        hero = next((x for x in ok if L(x) and x['cat'] == 'interior'), None) or next((x for x in ok if L(x) and V(x)), None) \
            or next((x for x in ok if L(x) and x['cat'] == 'food'), None) or next((x for x in ok if V(x)), None) or ok[0]
        rest = []
        for want in ('food', 'interior', 'exterior'):
            c = [x for x in ok if x['cat'] == want and x is not hero and x not in rest]
            x = next((x for x in c if want == 'exterior' and L(x)), None) or (c or [None])[0]   # a landscape outside shot shows more of the street
            if not x and want == 'food': x = next((x for x in ok if x['cat'] == 'drink' and x is not hero), None)
            if x: rest.append(x)
        rest += [x for x in ok if x is not hero and x not in rest and x['cat'] == 'drink'][:1]
        rest += [x for x in ok if x is not hero and x not in rest and slot(x) not in {slot(y) for y in rest + [hero]}]
        rest += [x for x in ok if x is not hero and x not in rest]
        rest = rest[:MAXN - 1]
    else:
        land = [x for x in ok if x['w'] >= x['h'] * 1.2 and x['cat'] != 'exterior'] or [x for x in ok if x['w'] >= x['h'] * 1.2]
        hero = (land or ok)[0]; rest = [x for x in ok if x is not hero][:MAXN - 1]
    if ONLY is not None: print(pid, [(x['n'], x['cat'], f"{x['w']}x{x['h']}") for x in [hero] + rest])
    out = []; d = f'img/places/{CITY}/{pid}'
    if not DRY: os.makedirs(ROOT / d, exist_ok=True)
    for k, x in enumerate([hero] + rest, 1):
        ig = x.get('source_type') == 'instagram'; page = x.get('page_url') or x.get('source_url') or ''
        host = re.sub(r'^https?://(www\.)?', '', page).split('/')[0]
        handle = CREDIT_IG(page) if ig else None
        cred = {'credit': f'@{handle} on Instagram' if handle else (host or s['name']), 'credit_url': page,
                'license': "the place's own photo", 'source': 'own_instagram' if ig else 'own_website'}
        if x.get('source_type') == 'commons':
            cred = {'credit': x['author'], 'credit_url': x.get('author_url') or x['page_url'], 'license': x['license'], 'license_url': x.get('license_url'),
                    'source_url': x['page_url'], 'source': 'commons'}
        alt = f"{s['name']}: {dict(food='food', drink='drinks', interior='the interior', exterior='the outside')[x['cat']]}"
        if k > 1 and not ig and x.get('source_type') != 'commons' and used > BUDGET and x.get('source_url', '').startswith('http'):
            out.append({'src': x['source_url'], 'thumb': x['source_url'], 'w': x['w'], 'h': x['h'], 'hotlink': True, 'category': x['cat'], 'alt': alt, **cred, 'noPeopleChecked': True})
            stats['hotlinked'] += 1; continue
        im = ImageOps.exif_transpose(Image.open(x['path'])).convert('RGB')
        big, small = (1600, 800) if k == 1 else (1000, 500)
        base = f'{d}/p{k}'
        (bw, bh), b1 = enc(im, base, big); _, b2 = enc(im, base, small); used += b1 + b2
        keep_files |= {f'{base}-{big}.webp', f'{base}-{small}.webp'}
        out.append({'src': f'{base}-{big}.webp', 'thumb': f'{base}-{small}.webp', 'srcset': f'{base}-{small}.webp {small}w, {base}-{big}.webp {big}w',
                    'w': bw, 'h': bh, 'category': x['cat'], 'alt': alt, **cred, 'noPeopleChecked': True})
        stats['photos'] += 1
    e = PH['places'].get(pid, {})
    e = {**({'posts': e['posts']} if e.get('posts') else {}), 'photos': out, 'pick': {'type': 'photo', 'src': out[0]['src']}, 'only': True}
    PH['places'][pid] = e; stats['places'] += 1
    # older self-hosted files of this place that the new set no longer uses
    for f in glob.glob(str(ROOT / d / '*')):
        rel = os.path.relpath(f, ROOT)
        if rel not in keep_files and not DRY: os.remove(f)
# the place's older photos in <city>.json are replaced by the new set ('only'): drop them there too (their files were removed above)
CP = ROOT / city['data']; CD = json.loads(CP.read_text()); stripped = 0
for r in CD.get('restaurants', []):
    if (PH['places'].get(r['id']) or {}).get('only') and r.get('photos'): r.pop('photos'); stripped += 1
stats['older_photos_dropped'] = stripped
if not DRY:
    PP.write_text(json.dumps(PH, ensure_ascii=False, indent=1) + '\n')
    if stripped: CP.write_text(json.dumps(CD, ensure_ascii=False, indent=1) + '\n')
print(CITY, stats, f'stored {used / 1e6:.1f} MB')
