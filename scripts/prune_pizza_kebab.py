#!/usr/bin/env python3
"""Remove pizza places and kebab / döner / shoarma / gyros / pita shops from a city's site data (user decision 26 Oct 2026).

  python3 scripts/prune_pizza_kebab.py gent [--dry] [--report=/path/list.md]

Same rules as the importers (import_osm.pizza_kebab_kind + data/never-exclude.json kind pizza/kebab), applied to the data already
on the site: <city>-osm.json (by the cached raw OSM tags), <city>.json and <city>-upcoming.json (name / cuisine text), and the
per-id layers (heroes, instagram, ratings, veggie, breakfast, media-sources, keep-exceptions) so nothing points at a removed place.
Italian restaurants whose OSM cuisine is 'italian;pizza' (italian first, no pizza in the name) are kept and listed as borderline.
"""
import json, re, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
CITY = next((a for a in sys.argv[1:] if not a.startswith('-')), 'gent')
OPT = {a.split('=', 1)[0]: (a.split('=', 1)[1] if '=' in a else True) for a in sys.argv[1:] if a.startswith('--')}
sys.argv = [sys.argv[0], CITY]; sys.path.insert(0, str(ROOT / 'scripts'))
import import_osm as IO
D = ROOT / 'data' / 'cities'


def load(p):
    t = p.read_text(); return json.loads(t), t


def save(p, obj, text):
    if '--dry' in OPT: return
    if text.startswith('{"'): out = json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
    elif text.startswith('{\n"'): out = json.dumps(obj, ensure_ascii=False, indent=0)
    elif text.startswith('{\n  "'): out = json.dumps(obj, ensure_ascii=False, indent=2)
    else: out = json.dumps(obj, ensure_ascii=False, indent=1)
    p.write_text(out + ('\n' if text.endswith('\n') else ''))


raw = {f"{e['type']}/{e['id']}": e.get('tags', {}) for e in json.loads(IO.RAW.read_text())['elements']}
_nx = json.loads((ROOT / 'data' / 'never-exclude.json').read_text()); PK_KEEP = _nx.get('pizzaKebabKeep', {})
never = {k: v for k, v in json.loads((ROOT / 'data' / 'never-exclude.json').read_text())['places'].items() if v.get('kind') in ('pizza', 'kebab')}
removed, border = [], []
osm_p = D / f'{CITY}-osm.json'; osm, osm_t = load(osm_p)
keep = []
for r in osm['places']:
    t = raw.get(r.get('osm'), {})
    k = None if r.get('osm') in PK_KEEP else IO.pizza_kebab_kind(t, r['name']); why = f"OSM cuisine={t.get('cuisine')}" if k else ''
    if not k and r.get('osm') in never: k = never[r['osm']]['kind']; why = never[r['osm']]['reason']
    elif k: why = ('name' if (IO.PIZZA_NAME.search(IO._fold(r['name'])) or IO.KEBAB_NAME.search(IO._fold(r['name']))) else 'cuisine') + f" ({why})"
    if k: removed.append((r['id'], r['name'], k, why, 'OSM base list')); continue
    if r.get('osm') in PK_KEEP: border.append((r['id'], r['name'], f"OSM cuisine={t.get('cuisine')}; " + PK_KEEP[r['osm']]['reason'])); keep.append(r); continue
    if 'pizza' in (t.get('cuisine') or '') or re.search(r'pizza', r.get('summary') or '', re.I): border.append((r['id'], r['name'], f"OSM cuisine={t.get('cuisine')}" + (f"; {r.get('summary')}" if r.get('summary') else '')))
    keep.append(r)
osm['places'] = keep; osm['count'] = len(keep); save(osm_p, osm, osm_t)
for fn, key in ((f'{CITY}.json', 'restaurants'), (f'{CITY}-upcoming.json', 'upcoming')):
    p = D / fn; d, t = load(p); out = []
    for r in d[key]:
        k = IO.pizza_kebab_kind({'cuisine': ';'.join(r.get('cuisineTags') or [])}, r['name'], r.get('cuisine') or '')
        if k: removed.append((r['id'], r['name'], k, f"curated cuisine: {r.get('cuisine')!r}; {r.get('summary') or ''}"[:200], 'curated' if key == 'restaurants' else 'upcoming')); continue
        out.append(r)
    d[key] = out; save(p, d, t)
ids = {x[0] for x in removed}
for fn, key in ((f'{CITY}-heroes.json', 'places'), (f'{CITY}-heroes.json', 'rejected'), (f'{CITY}-instagram.json', 'places'), (f'{CITY}-ratings.json', 'places'),
                (f'{CITY}-veggie.json', 'places'), (f'{CITY}-breakfast.json', 'places'), (f'{CITY}-media-sources.json', 'restaurants')):
    p = D / fn
    if not p.exists(): continue
    d, t = load(p)
    if isinstance(d.get(key), dict) and ids & set(d[key]):
        for i in ids: d[key].pop(i, None)
        save(p, d, t)
kp = ROOT / 'data' / 'osm' / 'keep-exceptions.json'; d, t = load(kp)
if ids & set(d['keep']):
    for i in ids: d['keep'].pop(i, None)
    save(kp, d, t)
for x in removed: print('REMOVED', CITY, *x[:3])
for b in border: print('KEPT (borderline)', CITY, b[0], b[1], '|', b[2][:120])
print(f'{CITY}: removed {len(removed)} (pizza {sum(x[2] == "pizza" for x in removed)}, kebab {sum(x[2] == "kebab" for x in removed)}), borderline kept {len(border)}')
if OPT.get('--report'):
    with open(OPT['--report'], 'a') as f:
        f.write(f"\n## {CITY}: removed {len(removed)}\n\n| city | id | name | kind | reason | list |\n|---|---|---|---|---|---|\n")
        for i, n, k, w, src in removed: f.write(f"| {CITY} | {i} | {n} | {k} | {w.replace('|', '/')} | {src} |\n")
        f.write(f"\n### {CITY}: borderline, kept\n\n")
        for i, n, w in border: f.write(f"- {n} (`{i}`): {w.replace('|', '/')[:220]}\n")
