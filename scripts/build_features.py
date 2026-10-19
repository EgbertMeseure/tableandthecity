"""Derive the detail-page feature tiles from *sourced* fields only.
Each feature is True / False / None (None = not confirmed). Nothing is guessed:
a tile turns green only when a sourced field or sourced text (Michelin / G&M description,
menu type from the restaurant's own site, dietary note) states it. Manual overrides in
data/cities/<city>-features-overrides.json win (use them for verified facts, with a source)."""
import json, re, sys, os
city = sys.argv[1] if len(sys.argv) > 1 else 'gent'
P = f'data/cities/{city}.json'
D = json.load(open(P))
OV = f'data/cities/{city}-features-overrides.json'
ov = json.load(open(OV)) if os.path.exists(OV) else {}
KEYS = ['veggie', 'vegan', 'glutenFree', 'kidsWelcome', 'terrace', 'lunch', 'dinner', 'setMenu', 'aLaCarte',
        'winePairing', 'naPairing', 'michelin', 'gaultMillau', 'events', 'chefCollabs', 'reservations',
        'walkIn', 'wheelchair', 'openSunday', 'new']
def txt(r, *f): return ' '.join(str(r.get(x) or '') for x in f) + ' ' + ' '.join(str(v) for v in (r.get('original_nl') or {}).values())
for r in D['restaurants']:
    if r.get('origin') == 'venues': continue          # venue features come from the venues research file
    F = {k: None for k in KEYS}; E = {}
    def yes(k, why): F[k] = True; E[k] = why
    menu = str(r.get('menuType') or ''); ml = menu.lower()
    desc = txt(r, 'summary', 'dietNote', 'currentMenuNote').lower()
    if r.get('vegetarian') == 'yes': yes('veggie', 'vegetarian field (sourced)')
    elif r.get('vegetarian') == 'no': F['veggie'] = False
    if r.get('vegan') == 'yes': yes('vegan', 'vegan field (sourced)')
    elif r.get('vegan') == 'no': F['vegan'] = False
    if re.search(r'gluten', str(r.get('dietNote') or ''), re.I) and not re.search(r'no gluten-free|geen glutenvrij', str(r.get('dietNote')), re.I): yes('glutenFree', 'dietary note: ' + r['dietNote'])
    if 'lunch' in ml or 'pranzo' in ml: yes('lunch', 'menu type: ' + menu)
    if 'dinner' in ml or 'diner' in ml: yes('dinner', 'menu type: ' + menu)
    if re.search(r'set menu|tasting|menu \d|\d[ -]course|courses|omakase|degustazione|experience menu|signature menu|chef.?s (menu|choice)|choice menu|discovery', ml): yes('setMenu', 'menu type: ' + menu)
    if re.search(r'à la carte|a la carte|carte', ml): yes('aLaCarte', 'menu type: ' + menu)
    if re.search(r'sunday lunch|zondag', ml): yes('openSunday', 'menu type: ' + menu)
    if re.search(r'wine pairing|drinks pairing|wijnarrangement|wijnpairing|accord(s)? mets', desc): yes('winePairing', 'description mentions wine pairing')
    if re.search(r'non-alcoholic pairing|alcoholvrij|alcohol-free pairing|zero-alcohol', desc): yes('naPairing', 'description mentions a non-alcoholic pairing')
    if re.search(r'terrace|terras(je)?\b|stoepterras', desc): yes('terrace', 'description mentions a terrace')
    d = r.get('distinctions') or {}
    if d.get('michelin'): yes('michelin', f"{d['michelin']} ({d.get('michelinYear')})")
    if d.get('gaultMillau'): yes('gaultMillau', f"{d['gaultMillau']}/20 ({d.get('gaultMillauEdition')})")
    if r.get('isNew'): yes('new', 'opened ' + str(r.get('openingDate') or r.get('openingYear')))
    if r.get('reservation_url'): yes('reservations', 'booking link on own website: ' + r['reservation_url'])
    # events / chefCollabs are computed client-side from *upcoming* events only (TG.liveEvent)
    for k, v in (ov.get(r['id']) or {}).items():
        if k in KEYS and isinstance(v, dict): F[k] = v.get('value'); E[k] = v.get('source')
    r['features'] = F; r['features_evidence'] = E
    r.setdefault('openingHours', None)
json.dump(D, open(P, 'w'), ensure_ascii=False, indent=1)
from collections import Counter
c = Counter(k for r in D['restaurants'] for k, v in r['features'].items() if v)
print(dict(c))
