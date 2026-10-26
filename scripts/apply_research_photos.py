#!/usr/bin/env python3
"""Self-host the photo research for a city (new cities, until preview-place-photos' apply_photo_review.py takes over).

  python3 scripts/apply_research_photos.py <city> [--research=/workspace/handoff/place-photos-research] [--max=2] [--dry]

Reads <research>/<city>/<id>/sources.json ({file, source_url, page_url, source_type instagram|website, subject,
no_people_verified, ...}; every image checked by eye for people by the researcher). Uses only no_people_verified food / drink /
interior files (exterior only when nothing else), the researcher's order, at most --max per place. Instagram CDN links expire,
so the researcher's local copy is self-hosted: img/places/<city>/<id>/<stem>-{800,1600}.webp, credited to the place's own
Instagram / website (page_url). Sets <city>.json restaurants[].photos (replaced for every id in the research folder).
Places without usable files keep no photo (neutral placeholder). Run after import_city_handoff.py (which strips photos)."""
import json, sys, os, re
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parent.parent
CITY = next(a for a in sys.argv[1:] if not a.startswith('-'))
OPT = {a.split('=', 1)[0]: (a.split('=', 1)[1] if '=' in a else True) for a in sys.argv[1:] if a.startswith('--')}
RES = Path(OPT.get('--research', '/workspace/handoff/place-photos-research')) / CITY
MAX, DRY = int(OPT.get('--max', 2)), '--dry' in OPT
P = ROOT / 'data/cities' / f'{CITY}.json'; D = json.loads(P.read_text())
CAT = {'food': 'food', 'drink': 'food', 'drinks': 'food', 'interior': 'interior', 'exterior': 'exterior'}
done = placeholder = files = 0
for r in D['restaurants']:
    sp = RES / r['id'] / 'sources.json'
    if not sp.exists(): continue
    src = [s for s in json.loads(sp.read_text()) if s.get('no_people_verified') is True and CAT.get(s.get('subject')) and (RES / r['id'] / s['file']).exists()]
    good = [s for s in src if s['subject'] != 'exterior'] or src
    out = []
    for s in good[:MAX]:
        stem = re.sub(r'[^a-z0-9-]+', '-', Path(s['file']).stem.lower()); base = f"img/places/{CITY}/{r['id']}/{stem}"
        im = Image.open(RES / r['id'] / s['file']).convert('RGB'); w, h = im.size
        if not DRY:
            os.makedirs(ROOT / os.path.dirname(base), exist_ok=True)
            for W in (800, 1600):
                x = im.resize((W, round(h * W / w)), Image.LANCZOS) if w > W else im
                x.save(ROOT / f'{base}-{W}.webp', 'WEBP', quality=74, method=6)
        ig = s.get('source_type') == 'instagram'
        page = s.get('page_url') or s.get('source_url')
        host = re.sub(r'^https?://(www\.)?', '', page or '').split('/')[0]
        handle = re.search(r'instagram\.com/([A-Za-z0-9_.]+)', page or '')
        out.append({'src': f'{base}-1600.webp', 'thumb': f'{base}-800.webp', 'srcset': f'{base}-800.webp 800w, {base}-1600.webp 1600w',
                    'w': min(w, 1600), 'h': round(h * min(w, 1600) / w), 'category': CAT[s['subject']],
                    'alt': f"{r['name']}: {s['subject']}", 'credit': (f'@{handle.group(1)} on Instagram' if ig and handle else host or r['name']),
                    'credit_url': page, 'license': "the place's own photo", 'source': 'own_instagram' if ig else 'own_website',
                    'noPeopleChecked': True})   # no source_url: detail.js labels that link 'Wikimedia Commons'
        files += 1
    if out: r['photos'] = out; done += 1
    else: r.pop('photos', None); placeholder += 1
if not DRY: P.write_text(json.dumps(D, ensure_ascii=False, indent=1) + '\n')
print(f'{CITY}: photos on {done} places ({files} files), research without usable photo {placeholder}, '
      f"no research {sum(1 for r in D['restaurants'] if not (RES / r['id'] / 'sources.json').exists())}")
