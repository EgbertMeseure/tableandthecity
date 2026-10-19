"""Apply data/cities/<city>-media-sources.json (Instagram handle + posts, reservation link,
freely licensed photos) to data/cities/<city>.json. Stock 'mood' gallery images are removed."""
import json, sys
city = sys.argv[1] if len(sys.argv) > 1 else 'gent'
P = f'data/cities/{city}.json'
D = json.load(open(P)); M = json.load(open(f'data/cities/{city}-media-sources.json'))['restaurants']
for r in D['restaurants']:
    m = M.get(r['id'], {})
    h = m.get('instagram_handle')
    r['instagram_handle'] = h
    r['instagram'] = f'https://www.instagram.com/{h}/' if h else None
    r['instagram_posts'] = [{'url': p['url'], 'category': p.get('category') or ''} for p in m.get('instagram_posts', [])]
    r['reservation_url'] = m.get('reservation_url'); r['reservation_provider'] = m.get('reservation_provider')
    r['photos'] = [p for p in m.get('photos', []) if p.get('source') != 'stock']
json.dump(D, open(P, 'w'), ensure_ascii=False, indent=1)
print('applied media to', len(D['restaurants']), 'restaurants')
