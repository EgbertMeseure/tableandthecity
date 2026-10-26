#!/usr/bin/env python3
"""Apply hand checks on top of an imported research handoff: data/osm/<city>-overrides.json {id: {field: value}} → <city>.json.
Re-run after import_city_handoff.py (which rewrites <city>.json).   python3 scripts/apply_overrides.py <city>"""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent; c = sys.argv[1]
O = ROOT / 'data/osm' / f'{c}-overrides.json'
if not O.exists(): sys.exit(0)
ov = {k: v for k, v in json.loads(O.read_text()).items() if not k.startswith('_')}
P = ROOT / 'data/cities' / f'{c}.json'; D = json.loads(P.read_text()); n = 0
for r in D['restaurants']:
    if r['id'] in ov: r.update(ov[r['id']]); n += 1
P.write_text(json.dumps(D, ensure_ascii=False, indent=1) + '\n'); print(f'{c}: overrides on {n}/{len(ov)} places')
