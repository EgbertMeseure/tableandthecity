#!/usr/bin/env python3
"""Self-host the eye-checked photo set per place (photo layout 'mix': hero + food row + inside / outside pair), max 5 per place.
  python3 scripts/apply_photo_picks.py <city> <picks.json> [--skip=id,id] [--dry]
picks.json = {id: [{path, cat food|drink|interior|exterior, staff?, source_type website|instagram|facebook|tiktok|commons, page_url, source_url,
author/author_url/license/license_url (commons)}, ...]}; the first is the hero.
Writes img/places/<city>/<id>/p<k>-{1400,700}.webp (hero) / p<k>-{800,400}.webp (the others) and data/cities/<city>-photos.json places[id] =
{photos, pick, only: true, layout: 'mix', posts (kept)}. 'only' = this set replaces the place's older photos (also dropped from <city>.json)."""
import json, sys, os, re, glob
from pathlib import Path
from PIL import Image, ImageOps
ROOT = Path(__file__).resolve().parent.parent
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OPT = {a.split('=', 1)[0]: (a.split('=', 1)[1] if '=' in a else True) for a in sys.argv[1:] if a.startswith('--')}
CITY, PICKS = ARGS[0], json.load(open(ARGS[1]))
SKIP = set(str(OPT.get('--skip', '')).split(',')) - {''}; DRY = '--dry' in OPT
HERO, EXTRA, Q = (1400, 700), (800, 400), {1400: 62, 700: 60, 800: 60, 400: 58}
cfg_p = ROOT / 'data/cities.json'; cfg = json.loads(cfg_p.read_text())
city = next(c for k in cfg['countries'] for c in k['cities'] if c['id'] == CITY)
if not city.get('photos'):
    city['photos'] = f'data/cities/{CITY}-photos.json'
    if not DRY: cfg_p.write_text(json.dumps(cfg, ensure_ascii=False, indent=2) + '\n')
PP = ROOT / city['photos']; PH = json.loads(PP.read_text()) if PP.exists() else {'places': {}}
PH['about'] = ("Checked photos per place for the place page (photo layout 'mix': the hero shows the place itself, then a food row and the inside / "
               "the outside): food, drinks, the interior, staff at work or a guest-free exterior only, from the place's own website, its own public "
               "Instagram profile embed (no login) or a free licence; every photo checked by eye for guests, text graphics, posters, logos, menus and "
               "collages. Self-hosted under img/places/<city>/<id>/ (scripts/apply_photo_picks.py). only = this set replaces older photos and the "
               "hotlinked og:image; hold = only photos with people exist (neutral placeholder).")
NAMES = {}
for f in [city['data']] + ([city['osm']] if city.get('osm') else []):
    D = json.loads((ROOT / f).read_text())
    for r in D.get('restaurants', []) + D.get('places', []): NAMES[r['id']] = NAMES[f"osm-{r['id']}"] = r['name']
used = 0; nph = 0; nplaces = 0
def enc(im, base, W):
    global used
    w, h = im.size; x = im.resize((W, round(h * W / w)), Image.LANCZOS) if w > W else im
    f = ROOT / f'{base}-{W}.webp'
    if not DRY: x.save(f, 'WEBP', quality=Q[W], method=6); used += f.stat().st_size
    return x.size
for pid, picks in PICKS.items():
    if pid in SKIP or not picks: continue
    r_name = NAMES.get(pid) or next((v for k, v in NAMES.items() if pid.endswith('-' + k.split('-')[-1]) and k.split('-')[-1][:1] in 'nwr'), pid)
    d = f'img/places/{CITY}/{pid}'
    if not DRY:
        os.makedirs(ROOT / d, exist_ok=True)
        for f in glob.glob(str(ROOT / d / '*')): os.remove(f)
    out = []
    for k, x in enumerate(picks[:5], 1):
        st = x.get('source_type'); ig = st == 'instagram'; page = x.get('page_url') or x.get('source_url') or ''
        handle = (re.search(r'instagram\.com/([A-Za-z0-9_.]+)', page) or [None, None])[1] if ig else None
        host = re.sub(r'^https?://(www\.)?', '', page).split('/')[0]
        im = ImageOps.exif_transpose(Image.open(x['path'])).convert('RGB')
        big, small = HERO if k == 1 else EXTRA; base = f'{d}/p{k}'
        bw, bh = enc(im, base, big); enc(im, base, small)
        what = 'staff at work' if x.get('staff') else dict(food='food', drink='drinks', interior='the interior', exterior='the outside')[x['cat']]
        cred = {'credit': f'@{handle} on Instagram' if handle else (host or r_name), 'credit_url': page, 'license': "the place's own photo",
                'source': 'own_instagram' if ig else 'own_website'}
        if st in ('facebook', 'tiktok'):   # the place's own public Facebook page / TikTok profile (og:image, no login)
            net = 'Facebook' if st == 'facebook' else 'TikTok'
            who = (re.search(r'tiktok\.com/@([A-Za-z0-9_.]+)', page) or [None, None])[1] if st == 'tiktok' else None
            cred = {'credit': f'@{who} on TikTok' if who else f'{r_name} on {net}', 'credit_url': page, 'license': "the place's own photo",
                    'source': 'own_' + st}
        if st == 'commons':
            cred = {'credit': x.get('author') or 'Wikimedia Commons', 'credit_url': x.get('author_url') or page, 'license': x.get('license') or '',
                    **({'license_url': x['license_url']} if x.get('license_url') else {}), 'source_url': page, 'source': 'commons'}
        if x.get('credit'):  # explicit credit (e.g. Website help's sources.csv: '<who> via Visit Gent' / '<place> (own website)')
            cred = {'credit': x['credit'], 'credit_url': x.get('credit_url') or page, 'license': x.get('license') or '',
                    'source': x.get('source_type') if x.get('source_type') in ('visit_gent',) else cred['source']}
        out.append({'src': f'{base}-{big}.webp', 'thumb': f'{base}-{small}.webp', 'srcset': f'{base}-{small}.webp {small}w, {base}-{big}.webp {big}w',
                    'w': bw, 'h': bh, 'category': x['cat'], **({'staff': True} if x.get('staff') else {}), 'alt': f'{r_name}: {what}',
                    **cred, 'noPeopleChecked': True})
    e = PH['places'].get(pid, {})
    PH['places'][pid] = {**({'posts': e['posts']} if e.get('posts') else {}), 'photos': out, 'pick': {'type': 'photo', 'src': out[0]['src']}, 'only': True, 'layout': 'mix'}
    nph += len(out); nplaces += 1
# the place's older photos in <city>.json are replaced by the new set ('only'): drop them there too
CP = ROOT / city['data']; CD = json.loads(CP.read_text()); stripped = 0
for r in CD.get('restaurants', []):
    if (PH['places'].get(r['id']) or {}).get('only') and r.get('photos'): r.pop('photos'); stripped += 1
if not DRY:
    PP.write_text(json.dumps(PH, ensure_ascii=False, indent=1) + '\n')
    if stripped: CP.write_text(json.dumps(CD, ensure_ascii=False, indent=1) + '\n')
print(CITY, nplaces, 'places', nph, 'photos', f'{used / 1e6:.2f} MB', 'older photo lists dropped', stripped)
