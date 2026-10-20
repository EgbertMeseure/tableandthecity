#!/usr/bin/env python3
"""Parse the HappyCow printable city list into data/osm/happycow-<city>.json (idempotent).
  curl -sL -A 'Mozilla/5.0' 'https://www.happycow.net/europe/belgium/ghent/print?' -o /tmp/hcp.html
  python3 scripts/parse_happycow.py gent /tmp/hcp.html
The print page lists sections in a fixed order, each alphabetical: vegan / vegetarian / veg-options restaurants, then vegan / veg-options
"other" listings (stores, coffee, bakeries, caterers). Sections are detected where the alphabetical order restarts."""
import html, json, re, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
CITY, SRC = sys.argv[1], Path(sys.argv[2])
URL = {'gent': 'https://www.happycow.net/europe/belgium/ghent/print?'}[CITY]
s = SRC.read_text(errors='ignore')
t = re.sub(r'<script.*?</script>|<style.*?</style>', '', s, flags=re.S)
t = re.sub(r'<br\s*/?>', '\n', t); t = re.sub(r'</(div|p|li|h\d|tr)>', '\n', t); t = html.unescape(re.sub(r'<[^>]+>', '', t))
lines = [l.strip() for l in t.split('\n') if l.strip()]
rows = []
for i, l in enumerate(lines):
    if '-- Additional Info:' not in l: continue
    head, info = l.split('-- Additional Info:', 1)
    info = re.sub(r'--\s*Rating:.*$', '', info).strip()
    parts = head.split('--'); tags = [x.strip() for x in '--'.join(parts[1:]).split(',') if x.strip()]
    j = i - 1
    while j > 0 and not lines[j].endswith('~'): j -= 1
    rows.append({'name': lines[j - 1], 'address': lines[j].rstrip('~ ').strip(), 'price': parts[0].strip(), 'tags': tags, 'info': info})
# section boundaries = alphabetical restarts
SECTIONS = [('restaurant', 'vegan'), ('restaurant', 'vegetarian'), ('restaurant', 'options'), ('other', 'vegan'), ('other', 'options')]
key = lambda n: re.sub(r'[^a-z0-9]', '', n.lower())
K = [key(r['name']) for r in rows]
# a restart counts when the name sorts before the previous one AND the following names run on alphabetically
# (a featured listing at the very top, or a one-off out-of-order name, is not a new section)
starts, last = [], 0
for k in range(2, len(K)):
    if K[k] < K[k - 1] and K[k][:1] < K[k - 1][:1] and K[k:k + 3] == sorted(K[k:k + 3]) and k - last >= 3:
        starts.append(k); last = k
sec, out = 0, []
for k, r in enumerate(rows):
    if sec < len(starts) and k >= starts[sec]: sec += 1
    kind, lvl = SECTIONS[min(sec, len(SECTIONS) - 1)]
    if lvl == 'options': lvl = 'vegan-friendly' if 'vegan' in r['info'].lower() or 'Vegan-friendly' in r['tags'] else 'veggie-friendly'
    out.append({**r, 'level': lvl, 'hcSection': kind})
print('section starts:', starts)
(ROOT / 'data' / 'osm' / f'happycow-{CITY}.json').write_text(json.dumps({'source': URL, 'note': 'Parsed from the HappyCow printable city list. Used as a source/lead for veggieLevel; fully vegan/vegetarian entries are cross-checked (veggie-verified.json).', 'places': out}, ensure_ascii=False, indent=1))
from collections import Counter
print(len(out), Counter((x['hcSection'], x['level']) for x in out))
