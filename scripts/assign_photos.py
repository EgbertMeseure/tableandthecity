"""Fill restaurants[].photos in data/cities/<city>.json from the stock pool (data/photo-pool.json).
Idempotent: removes previous source=='stock' photos, keeps real ones (own / google_places / instagram_embed).
Usage: python3 scripts/assign_photos.py gent"""
import json, sys, hashlib
city = sys.argv[1] if len(sys.argv) > 1 else 'gent'
path = f'data/cities/{city}.json'
D = json.load(open(path)); POOL = json.load(open('data/photo-pool.json'))
by = {c: [p for p in POOL if p['category'] == c] for c in ('food', 'interior', 'chef', 'exterior')}
WANT = {'food': 3, 'interior': 2, 'chef': 1, 'exterior': 1}
def pick(lst, n, seed):
    h = int(hashlib.md5(seed.encode()).hexdigest(), 16); out = []
    for i in range(len(lst)):
        p = lst[(h + i * 7) % len(lst)]
        if p not in out: out.append(p)
        if len(out) == n: break
    return out
for r in D['restaurants']:
    real = [p for p in r.get('photos', []) if p.get('source') != 'stock']
    food = by['food']
    if r['vegan'] == 'yes' or r['vegetarian'] == 'yes':   # lean on vegetable dishes for veggie-friendly places
        food = [p for p in food if 'veg' in p['tags']] + [p for p in food if 'veg' not in p['tags']]
        chosen = pick(food[:3], 2, r['id'] + 'v') + pick(food[3:], 1, r['id'])
    else:
        chosen = pick([p for p in food if 'veg' not in p['tags']], 3, r['id'])
    for c in ('interior', 'chef', 'exterior'): chosen += pick(by[c], WANT[c], r['id'] + c)
    r['photos'] = real + [{'src': p['src'], 'thumb': p['thumb'], 'w': p['w'], 'h': p['h'], 'category': p['category'], 'alt': p['alt'],
                           'credit': p['credit'], 'credit_url': p['credit_url'], 'source': 'stock', 'source_url': p['page'], 'license': p['license']} for p in chosen]
    r.setdefault('instagram_posts', [])
json.dump(D, open(path, 'w'), ensure_ascii=False, indent=1)
print('photos assigned:', sum(len(r['photos']) for r in D['restaurants']), 'for', len(D['restaurants']), 'restaurants')
