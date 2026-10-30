#!/usr/bin/env python3
"""Self-host an eye-checked photo set per place, picked by hand (sample of the photo layout 'mix': hero + food row + inside / outside pair).
  python3 scripts/apply_photo_picks.py <city> <picks.json>
picks.json = {id: [{path, cat food|drink|interior|exterior, staff?, source_type website|instagram|commons, page_url, source_url}, ...]}; the first is the hero.
Writes img/places/<city>/<id>/p<k>-{1600,800}.webp (hero) / p<k>-{1000,500}.webp and data/cities/<city>-photos.json places[id] =
{photos, pick, only: true, layout: 'mix', posts (kept)}. Up to 5 photos per place."""
import json, sys, os, re, glob
from pathlib import Path
from PIL import Image, ImageOps
ROOT = Path(__file__).resolve().parent.parent
CITY, PICKS = sys.argv[1], json.load(open(sys.argv[2]))
cfg = json.loads((ROOT / 'data/cities.json').read_text())
city = next(c for k in cfg['countries'] for c in k['cities'] if c['id'] == CITY)
PP = ROOT / city['photos']; PH = json.loads(PP.read_text())
NAMES = {}
for f in [city['data']] + ([city['osm']] if city.get('osm') else []):
    D = json.loads((ROOT / f).read_text())
    for r in D.get('restaurants', []) + D.get('places', []): NAMES[r['id']] = NAMES[f"osm-{r['id']}"] = r['name']
used = 0
def enc(im, base, W):
    global used
    w, h = im.size; x = im.resize((W, round(h * W / w)), Image.LANCZOS) if w > W else im
    f = ROOT / f'{base}-{W}.webp'; x.save(f, 'WEBP', quality=68 if W >= 1000 else 64, method=6); used += f.stat().st_size
    return x.size
for pid, picks in PICKS.items():
    r_name = NAMES.get(pid) or next((v for k, v in NAMES.items() if pid.endswith('-' + k.split('-')[-1]) and k.split('-')[-1][:1] in 'nwr'), pid)
    d = f'img/places/{CITY}/{pid}'; os.makedirs(ROOT / d, exist_ok=True)
    for f in glob.glob(str(ROOT / d / '*')): os.remove(f)
    out = []
    for k, x in enumerate(picks[:5], 1):
        ig = x.get('source_type') == 'instagram'; page = x.get('page_url') or ''
        handle = (re.search(r'instagram\.com/([A-Za-z0-9_.]+)', page) or [None, None])[1] if ig else None
        host = re.sub(r'^https?://(www\.)?', '', page).split('/')[0]
        im = ImageOps.exif_transpose(Image.open(x['path'])).convert('RGB')
        big, small = (1600, 800) if k == 1 else (1000, 500); base = f'{d}/p{k}'
        bw, bh = enc(im, base, big); enc(im, base, small)
        what = 'staff at work' if x.get('staff') else dict(food='food', drink='drinks', interior='the interior', exterior='the outside')[x['cat']]
        out.append({'src': f'{base}-{big}.webp', 'thumb': f'{base}-{small}.webp', 'srcset': f'{base}-{small}.webp {small}w, {base}-{big}.webp {big}w',
                    'w': bw, 'h': bh, 'category': x['cat'], **({'staff': True} if x.get('staff') else {}), 'alt': f'{r_name}: {what}',
                    'credit': f'@{handle} on Instagram' if handle else host, 'credit_url': page, 'license': "the place's own photo",
                    'source': 'own_instagram' if ig else 'own_website', 'noPeopleChecked': True})
    e = PH['places'].get(pid, {})
    PH['places'][pid] = {**({'posts': e['posts']} if e.get('posts') else {}), 'photos': out, 'pick': {'type': 'photo', 'src': out[0]['src']}, 'only': True, 'layout': 'mix'}
PP.write_text(json.dumps(PH, ensure_ascii=False, indent=1) + '\n')
print(CITY, len(PICKS), 'places', sum(min(len(v), 5) for v in PICKS.values()), 'photos', f'{used / 1e6:.2f} MB')
