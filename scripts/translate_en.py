"""Builds the English city file data/cities/gent.json from the frozen Dutch source data
(data/source-nl/*.json). Proper names, dish names and the Michelin/G&M inspector descriptions
('summary', kept in original Dutch, flagged summaryLang='nl') are not translated."""
import json, re, sys
SRC = 'data/source-nl/'
R = json.load(open(SRC + 'restaurants.json')); X = json.load(open(SRC + 'events-extra.json')); LOG = json.load(open(SRC + 'changelog.json'))
U = 'unknown'
YN = {'ja': 'yes', 'nee': 'no', 'onbekend': U}
MICH = {'Michelin-selectie': 'Michelin selection', '1 Michelinster': '1 Michelin star', '2 Michelinsterren': '2 Michelin stars', 'Bib Gourmand': 'Bib Gourmand'}
STATUS = {'open': 'open', 'tijdelijk gesloten': 'temporarily closed', 'definitief gesloten': 'permanently closed'}
TAGS = {'Frans': 'French', 'Modern / creatief': 'Modern / creative', 'Belgisch / Vlaams': 'Belgian / Flemish', 'Aziatisch': 'Asian', 'Overig': 'Other', 'Italiaans': 'Italian',
        'Spaans / mediterraan': 'Spanish / Mediterranean', 'Vuur / vlees': 'Fire / meat', 'Groente / plantaardig': 'Vegetable-led / plant-based', 'Vis / Noordzee': 'Fish / North Sea'}
CUISINE = {
 'Klassiek Frans-Belgisch': 'Classic French-Belgian', 'Modern, seizoensgebonden': 'Modern, seasonal', 'Zuidoost-Aziatisch': 'Southeast Asian',
 'Seizoens-bistro, natuurwijn': 'Seasonal bistro, natural wine', 'Mediterraan geïnspireerd, seizoensgebonden': 'Mediterranean-inspired, seasonal',
 'Italiaans – Toscaans': 'Italian – Tuscan', 'Brasserie': 'Brasserie', 'Open vuur / Spaans-Baskisch (asador)': 'Open fire / Spanish-Basque (asador)',
 'Franse bistro': 'French bistro', 'Franse bistro, klassiek': 'French bistro, classic', 'Franse bistrokeuken, marktkeuken': 'French bistro cooking, market-driven',
 'Creatief, open vuur, wildpluk & fermentatie': 'Creative, open fire, foraging & fermentation', 'Eigentijds, Noordzee & lokale producten': 'Contemporary, North Sea & local produce',
 'Eigentijds Frans, speels': 'Contemporary French, playful', 'Belgisch, seizoensgebonden': 'Belgian, seasonal',
 'Seizoensgebonden vegetarisch (+ vismenu), biologisch': 'Seasonal vegetarian (+ fish menu), organic', '"Fastronomie" – fine dining in fast-casual formaat': '"Fastronomy" – fine dining in a fast-casual format',
 'Brasserie, grill, sharing': 'Brasserie, grill, sharing', 'Steakhouse, rund (sharing)': 'Steakhouse, beef (sharing)', 'Siciliaans': 'Sicilian',
 'Belgisch-Frans, meerkeuzemenu': 'Belgian-French, multiple-choice menu', 'Modern Frans': 'Modern French', 'Thais (sharing)': 'Thai (sharing)',
 'Dagvers, lokale producenten': 'Fresh daily, local producers', 'Nordic-stijl, lichte keuken met lokale kweek': 'Nordic-style, light cooking with locally grown produce', 'Thais': 'Thai',
 'Klassieke bistro (vol-au-vent, steak-friet, côte à l’os)': 'Classic bistro (vol-au-vent, steak-frites, côte à l’os)', 'Seizoensgebonden, losse sfeer': 'Seasonal, relaxed atmosphere',
 'Modern Frans (hotelrestaurant Pillows Reylof)': 'Modern French (hotel restaurant, Pillows Reylof)', 'Bistro, sharing plates': 'Bistro, sharing plates', 'Frans, klassiek': 'French, classic',
 'Klassieke brasserie': 'Classic brasserie', 'Modern Frans met Aziatische toetsen': 'Modern French with Asian touches', 'Vlaamse klassiekers': 'Flemish classics',
 'Bistrokeuken met finesse, seizoensgebonden': 'Refined bistro cooking, seasonal', 'Modern, internationaal (Braziliaans-Italiaans)': 'Modern, international (Brazilian-Italian)',
 'Italiaans': 'Italian', 'Vlaams': 'Flemish', 'Modern, productgericht': 'Modern, produce-driven', 'Mediterraan, tapas': 'Mediterranean, tapas', 'Belgisch, groentegericht': 'Belgian, vegetable-led',
 'Omakase: dry-aged vis & vlees, Japanse technieken': 'Omakase: dry-aged fish & meat, Japanese techniques', 'Japans – omakase': 'Japanese – omakase',
 'Spaans – pintxos & raciones, natuurwijn': 'Spanish – pintxos & raciones, natural wine', 'Italiaans, klassiek': 'Italian, classic',
 'Seizoensgebonden, no-nonsense (Wintercircus)': 'Seasonal, no-nonsense (Wintercircus)', 'Creatief, groentegedreven': 'Creative, vegetable-driven',
 'Internationale sharing (hotelrestaurant + rooftop)': 'International sharing (hotel restaurant + rooftop)', 'Plantaardig Aziatisch (Thaise basis), eetcafé': 'Plant-based Asian (Thai base), eatery',
 'Belgisch-Frans, bistro': 'Belgian-French, bistro'}
MENUTYPE = {
 'onbekend': U, '4-gangen tastingmenu + à la carte': '4-course tasting menu + à la carte', 'Menu (lunch 3+ gangen €46, 5-gangenmenu)': 'Set menu (lunch 3+ courses €46, 5-course menu)',
 'Lunch à la carte; diner 5-gangen degustatiemenu': 'Lunch à la carte; dinner 5-course tasting menu', 'Menu’s, à la carte en business lunch': 'Set menus, à la carte and business lunch',
 'Lunch, zaterdag-sharing en à la carte': 'Lunch, Saturday sharing and à la carte', 'Experience-menu’s (€78/€92/€112) en à la carte': 'Experience menus (€78/€92/€112) and à la carte',
 'Lunch, suggesties en menukaart': 'Lunch, specials and menu', 'À la carte (indicatief, dagvers)': 'À la carte (indicative, fresh daily)', 'Weeklunch + seizoenskaart (à la carte)': 'Weekly lunch + seasonal à la carte',
 'Tasting menu (vast)': 'Tasting menu (set)', 'Signature-menu en à la carte': 'Signature menu and à la carte', 'Menu 3/4 gangen + quick lunch + kaart': 'Menu 3/4 courses + quick lunch + à la carte',
 '"DEBRA’s Choice" 5 gangen (€85) of à la carte': '"DEBRA’s Choice" 5 courses (€85) or à la carte', 'Lunch 3 gangen (€45); diner seizoens-6-gangenmenu (€75)': 'Lunch 3 courses (€45); dinner seasonal 6-course menu (€75)',
 '5-gangenmenu vegetarisch of vis (€72)': '5-course menu, vegetarian or fish (€72)', 'Losse gerechten (à la carte)': 'Individual dishes (à la carte)', 'À la carte + weeklunch': 'À la carte + weekly lunch',
 'Sharing bites + vleesselectie (à la carte)': 'Sharing bites + meat selection (à la carte)', 'Menu Pranzo (€20), Menu Orto (€56), kaart': 'Menu Pranzo (€20), Menu Orto (€56), à la carte',
 'Meerkeuzemenu 2/3 gangen (€33/€39)': 'Multiple-choice menu 2/3 courses (€33/€39)', 'Vast menu (lunch, 5 of 6 gangen)': 'Set menu (lunch, 5 or 6 courses)',
 'Lunch à la carte; diner Choice Menu €55 (sharing)': 'Lunch à la carte; dinner Choice Menu €55 (sharing)', 'À la carte + lunchformule (€37)': 'À la carte + lunch formula (€37)',
 'Klein menu (lunch 3/4 gangen, diner 5 gangen)': 'Short menu (lunch 3/4 courses, dinner 5 courses)', 'À la carte': 'À la carte', 'À la carte (voorbeeldmenu)': 'À la carte (sample menu)',
 'À la carte of Chef’s Menu (6 gangen); zondaglunch': 'À la carte or Chef’s Menu (6 courses); Sunday lunch', 'Sharing à la carte + easy lunch': 'Sharing à la carte + easy lunch',
 'À la carte + suggestiemenu’s': 'À la carte + suggestion menus', 'Weeklunch + à la carte': 'Weekly lunch + à la carte', 'Menu en à la carte (GM-kenmerk "À la carte")': 'Set menu and à la carte (G&M feature "À la carte")',
 '3-gangenmenu (€43) en à la carte': '3-course menu (€43) and à la carte', 'Lunch 2 gangen, menu 4 of 5 gangen': 'Lunch 2 courses, menu 4 or 5 courses',
 'Vaste menu’s (Discovery / Experience / Chef’s menu)': 'Set menus (Discovery / Experience / Chef’s menu)', 'Menu degustazione (carne / pesce / vegetarisch) + lunch': 'Menu degustazione (meat / fish / vegetarian) + lunch',
 'Menukaart + groepsmenu’s': 'À la carte + group menus', 'Vast menu (lunch 3+ gangen, diner 5–7 gangen)': 'Set menu (lunch 3+ courses, dinner 5–7 courses)',
 'À la carte + weeklunch (€30,50)': 'À la carte + weekly lunch (€30.50)', 'Menu 5/6/7 gangen': 'Menu 5/6/7 courses',
 'Omakase-menu (wo/do "fundamentals", vr/za "experience", vr-lunch)': 'Omakase menu (Wed/Thu "fundamentals", Fri/Sat "experience", Friday lunch)',
 'Lunchmenu 4 gangen (€90) en Sensum Experience 5/6 gangen': 'Lunch menu 4 courses (€90) and Sensum Experience 5/6 courses', 'Krijtbord à la carte': 'Chalkboard à la carte', 'Omakase': 'Omakase',
 'Pintxos & raciones (sharing)': 'Pintxos & raciones (sharing)', 'Weeklunch + Chef’s Choice-dinermenu; Chef’s Table': 'Weekly lunch + Chef’s Choice dinner menu; Chef’s Table',
 'À la carte 3 of 4 gangen': 'À la carte 3 or 4 courses', 'Vast menu 4–7 gangen; lunch ook dagelijks wisselend 3-gangenmenu (€99)': 'Set menu 4–7 courses; lunch also a daily-changing 3-course menu (€99)',
 'À la carte sharing': 'À la carte sharing', 'Deelgerechtjes; lunch-sando + maandelijks wisselende tweede optie': 'Small sharing plates; lunch sando + a second option that changes monthly',
 'À la carte (2 of 3 gangen)': 'À la carte (2 or 3 courses)'}
MENUCH = {
 'onbekend': U, 'seizoensgebonden': 'seasonal', 'dagvers / seizoensgebonden': 'fresh daily / seasonal', 'dagelijks ("menu kan dagelijks nog veranderen")': 'daily ("menu may still change daily")',
 'voortdurend, volgens seizoen': 'constantly, with the seasons', 'wisselende kaart (± 20 gerechten, volgens Nieuwsblad)': 'changing menu (± 20 dishes, per Nieuwsblad)',
 'suggesties (frequentie onbekend)': 'specials (frequency unknown)', 'wekelijks (lunch) / per 6 weken (kaart)': 'weekly (lunch) / every 6 weeks (menu)', 'maandelijks (menukaart per maand)': 'monthly (menu per month)',
 'seizoensgebonden + dagsuggesties': 'seasonal + daily specials', 'wekelijks (lunch) + suggesties': 'weekly (lunch) + specials', 'dagelijks (dagverse producten; wijnkaart maandelijks)': 'daily (fresh produce; wine list monthly)',
 'snel wisselend (volgens leveranciers en bioboeren)': 'changes quickly (depending on suppliers and organic farmers)', 'suggesties van het moment; themamenu’s': 'current specials; themed menus',
 'wekelijks (lunch)': 'weekly (lunch)', 'seizoensgebonden (volgens GM)': 'seasonal (per G&M)', 'seizoensgebonden (menu op site wisselt)': 'seasonal (menu on website changes)',
 'wekelijks (suggestie van de week)': 'weekly (special of the week)', 'doorheen het jaar, volgens aanbod': 'throughout the year, depending on availability',
 'seizoensgebonden ("samenstelling kan veranderen")': 'seasonal ("composition may change")', 'maandelijks (suggesties van de maand)': 'monthly (specials of the month)',
 'seizoensgebonden ("menu kan afwijken")': 'seasonal ("menu may differ")', 'wekelijks (lunch) / ca. maandelijks (diner)': 'weekly (lunch) / roughly monthly (dinner)',
 'dagelijks (lunch) / seizoensgebonden': 'daily (lunch) / seasonal', 'seizoensgebonden (o.a. zomer-rooftopmenu)': 'seasonal (incl. summer rooftop menu)', 'maandelijks (lunchoptie)': 'monthly (lunch option)'}
NOTE = {
 'a-food-affair': 'Nieuwsblad (Nov 2025): 4-course menu €65, red curry with farm chicken €28.',
 'alberte': 'Details unknown; G&M: lunch €46, 5 courses €76.',
 'arbane': 'Website shows a "selection of recent creations", incl. butternut caponata.',
 'arno-ristorante': 'unknown (website under maintenance when checked)',
 'bask': 'Website: turbot, lobster, guinea fowl from their own farm and txuleta from the asador.',
 'bistro-cho': 'Oysters, vitello tonnato, shrimp croquette, vol-au-vent, filet pur au poivre, sole meunière.',
 'boris-maurice': 'Menu Oct–Nov 2026 (13/10–20/11): oysters, beef tartare with trompette de la mort, Hokkaido risotto; lunch 21–23/10: boulettes chasseur.',
 'commotie': 'Tasting menu €155; lunch (Fridays only) €115; drinks pairing €75/€50.',
 'dapper': 'unknown (menu not published as text on website)',
 'de-rave': 'Now: sea bass with young leek, squid with mushrooms, wild duck with port sauce, tarte tatin (€55/€70).',
 'debra': 'Oct 2026: redfish crudo, girolle escabeche, farm chicken with spaghetti squash.',
 'elders': 'Now: red kuri pumpkin with girolles, agnolotti alla Norma, BBQ quail or plaice, satsuma sorbet.',
 'ferri': 'Menu on website lists white asparagus (spring) – possibly out of date.',
 'fine-n-fast': 'Vitello (€17), Holstein beef with oyster (€18), beetroot with Pas de Bleu (€16).',
 'fou-d-o': 'Sharing, grill (chateaubriand), specials incl. agnolotti with girolles and butternut.',
 'gillis': 'Carpaccio of Belgian Berugi beef, Japanese A5 wagyu; dishes €19.50–€39.50.',
 'karel-de-stoute': 'Now: clams with hangop, coley with celeriac, Roscoff onion with eel, oxtail agnolotti, venison, apple. Lunch €55, 5 courses €100, 6 courses €115.',
 'kin-khao-thai-eatery': 'Lunch starters from €8, mains from €15; dinner choice menu €55.',
 'klaar': 'Lunch: golden beetroot with burrata, rabbit with radicchio, gnocchi with Pas de Rouge, corn-fed chicken.',
 'kruidtuin': 'unknown (G&M: lunch from €42, 5 courses €72)',
 'le-chouchou': 'Per HLN: shrimp croquettes, steak tartare, steak-frites, côte à l’os, vol-au-vent.',
 'le-jeu-est-jambon': 'unknown (sample menu only)',
 'lof': 'unknown (G&M: 5 courses €95, 6 courses €109)',
 'lubbi': 'Menu May 2026: apéro board, beef tartare, ceviche, Lubbi meatballs, falafel burger.',
 'lys-d-or': 'À la carte incl. Gentse waterzooi (€38), bouillabaisse (€42), veal sweetbreads (€45). G&M: 3-course suggestion menu €52.',
 'midi': 'Lunch 13–17/10: Oud Brugge cheese croquette + zarzuela with chorizo (€29).',
 'moscou-by-danny-horseele': 'unknown (website unreachable when checked)',
 'meme-gusta': 'unknown (website unreachable)',
 'nonam': 'unknown (G&M: lunch €41, 4 courses €78)',
 'oak': 'Lunch Discovery €129, Experience €139, Chef’s menu €159; groups of 5+ Chef’s menu only.',
 'otium-cucina-italiana': 'Antipasti incl. tartare di manzo with ’nduja; 3-course menu €49.',
 'publiek': 'Lunch: Zeeland mussel, celeriac "mince", polder chicken, Doyenné pear (3 courses €59). Dinner 5 courses €109; Fri/Sat evenings 6 or 7 courses only.',
 'pulpo': 'unknown for the Ghent branch (online menu is for Pulpo Latem)',
 'raaf': 'Sample menu on website (5 courses €58).',
 'rizoom': 'Fundamentals €108 (Wed–Thu), Experience €145 (Fri–Sat, 13–15 servings), Friday lunch €90.',
 'sensum': 'Autumn 2026: Royal Belgian caviar, Dieppe scallop, autumn truffle, langoustine, sole with cèpes, grey partridge, blackberries.',
 'steendam-66': 'Incl. grilled king crab (€85); G&M: 2 courses €66.',
 'taberna-bask': 'Pimientos de Padrón, gilda, BBQ aubergine, charcuterie from their own farm, red gurnard, ibérico asado.',
 'talloor-d-or': 'Lunch 20–23/10/2026 (€50): venison fillet tartare, langoustine XO, red gurnard. Dinner Chef’s Choice 16/10–20/11/2026: halibut, scallop…',
 'tribune': 'Zeeland mussel escabèche, North Sea John Dory, vol-au-vent of Coq des Prés; 3 courses €74.',
 'vrijmoed': 'Oct 2026: tomato (Oostkamp), Zeeland mussel, line-caught sea bass, beef entrecôte, apple-pistachio; 4 courses €119 – 7 courses €189.',
 'yusu': 'Mushroom skewers, momos, fried aubergine with red curry, crispy tofu (HLN, Jan 2026).',
 'een-twee-vijf': 'unknown (menu PDF on website dates from 2018)'}
DIET = {
 'alberte': 'Website: vegetarian possible when booking; vegan not possible.',
 'boris-maurice': 'Website: vegetarian version of the lunch.',
 'commotie': 'Website: no vegetarian or vegan menu possible; pescatarian on request.',
 'debra': 'October 2026 menu lists a vegetarian alternative (artichoke, celeriac, autumn truffle).',
 'ferri': 'Website: "seasonal vegetarian cooking"; vegetarian 5-course menu.',
 'fine-n-fast': 'Menu incl. beetroot, sour apple, fennel and Pas de Bleu.',
 'fou-d-o': 'Menu lists "Linguine Veggie".',
 'kin-khao-thai-eatery': 'Website: "vegan options are available" (lunch and dinner).',
 'klaar': 'Lunch menu with vegetarian options (golden beetroot-burrata, gnocchi Pas de Rouge); vegan "not guaranteed".',
 'kruidtuin': 'Website: they cook meat, fish and veggie; vegetarians get an adapted menu; no vegan menus.',
 'lof': 'Website: "LOF Restaurant also serves a vegetarian Chef\'s Menu."',
 'lubbi': 'Menu (May 2026) incl. falafel burger and beetroot with goat\'s cheese.',
 'nonam': 'Website: dishes cannot be adapted, e.g. for a vegan menu.',
 'oak': 'Website: "on request we serve a fully vegetarian menu. We do not cook vegan."',
 'otium-cucina-italiana': 'Website and G&M: vegetarian tasting menu (3 courses €49).',
 'rizoom': 'Website: vegetarian and vegan not possible.',
 'steendam-66': 'Website: "not specialised in … vegetarian dishes"; chalkboard only.',
 'tribune': 'Menu includes vegetarian dishes (incl. grilled courgette with ratatouille).',
 'vrijmoed': 'G&M lists cuisine "Vegetarian"; chef in news item: more and more guests order a plant-based menu.',
 'yusu': 'HLN: "All dishes are completely plant-based."'}
STATUSNOTE = {'lubbi': 'Website: "temporarily closed due to illness" (checked 19-10-2026).'}
CONFLICT = {'debra': 'G&M page reports a move "on 1 July" to Zuidstationstraat 14; own website and Michelin list Lange Steenstraat 10. Address from own website used.'}
EVTYPE = {'culinair evenement / chefcollectief': 'culinary event / chef collective', 'samenwerking / benefietdiner': 'collaboration / charity dinner', 'four-hands dinner': 'four-hands dinner',
 'thema-menu': 'themed menu', 'wijndiner / samenwerking': 'wine dinner / collaboration', 'thema-avond (terugkerend)': 'themed evening (recurring)', 'benefietdiner / gastchef': 'charity dinner / guest chef',
 'stadsfestival': 'city festival', 'pop-up (vegan)': 'pop-up (vegan)', 'thema-avond / samenwerking': 'themed evening / collaboration', 'guest chef / takeover': 'guest chef / takeover',
 'chef-samenwerking / special': 'chef collaboration / special'}
EVTITLE = {
 'Fourchette – herfsteditie (18 chefs, elk één gang)': 'Fourchette – autumn edition (18 chefs, one course each)',
 'Diner Gantoise (KAA Gent Foundation) – menu van vier chefs': 'Diner Gantoise (KAA Gent Foundation) – menu by four chefs',
 'Chef meets Chef – 4-handendiner met Jannis Brevet (ex-Inter Scaldes)': 'Chef meets Chef – four-hands dinner with Jannis Brevet (ex-Inter Scaldes)',
 'Kreeftenmenu (3 gangen, €59) op vrijdag en zaterdag in september': 'Lobster menu (3 courses, €59) on Fridays and Saturdays in September',
 'Winemaker’s diner met Arnaud Desfontaine (Château de Chamilly) i.s.m. Vitis Vin': 'Winemaker’s dinner with Arnaud Desfontaine (Château de Chamilly), with Vitis Vin',
 'Elke 2de zaterdag van de maand open: 7-gangenmenu incl. glas Champagne': 'Open every 2nd Saturday of the month: 7-course menu incl. a glass of Champagne',
 'Galadiner Roaring Twenties (benefiet Kom op tegen Kanker) – 4-gangenmenu door Michaël Vrijmoed': 'Roaring Twenties gala dinner (benefit for Kom op tegen Kanker) – 4-course menu by Michaël Vrijmoed',
 'Gand Gourmand – foodpromenade, workshops en tastings': 'Gand Gourmand – food promenade, workshops and tastings',
 'Yasai – herfst pop-up: plant-based 6-gangenmenu (12 plaatsen)': 'Yasai – autumn pop-up: plant-based 6-course menu (12 seats)',
 'Yasai – herfst pop-up (tweede reeks)': 'Yasai – autumn pop-up (second run)',
 'Chaji omakase – thee- en kaiseki-ervaring met chef Nick Hofman': 'Chaji omakase – tea and kaiseki experience with chef Nick Hofman',
 'BROER @ Red Loft – Røk neemt de keuken over': 'BROER @ Red Loft – Røk takes over the kitchen',
 'Carbonaraburger: samenwerking Tush × Arthe² (Geoffrey Devriendt)': 'Carbonara burger: collaboration Tush × Arthe² (Geoffrey Devriendt)'}
EVNOTE = {'Datum afgeleid: "afgelopen donderdag" in bericht van 9-4-2026.': 'Date inferred: "last Thursday" in a post dated 9-4-2026.',
 'Terugkerend; datum = eerstvolgende 2de zaterdag (berekend).': 'Recurring; date = next 2nd Saturday (calculated).',
 'Tweede reeks 5–7 november 2026.': 'Second run 5–7 November 2026.', 'Kadert in Gand Gourmand; €120 p.p., 2 shifts.': 'Part of Gand Gourmand; €120 p.p., 2 seatings.'}
EVDATETEXT = {'september (jaar niet vermeld)': 'September (year not stated)', '15 oktober (jaar niet vermeld op bron)': '15 October (year not stated in source)'}
EVLOC = {'Meerdere locaties in Gent': 'Various locations in Ghent'}
EVPARTNER = {'Stad Gent / PuurGent': 'City of Ghent / PuurGent', 'Diana Goderich (theespecialist)': 'Diana Goderich (tea specialist)'}
LOGTX = {
 'Eerste opname: 52 adressen uit Michelin Gids 2026, Gault&Millau 2026 en recente persberichten; per adres eigen website gecontroleerd.': 'Initial import: 52 addresses from the Michelin Guide 2026, Gault&Millau 2026 and recent press; each restaurant’s own website checked.',
 'Niet opgenomen: definitief gesloten (laatste service eind juli 2026); team verhuisde naar Le Chouchou.': 'Not included: permanently closed (last service end of July 2026); team moved to Le Chouchou.',
 'Niet opgenomen: definitief gesloten na zomer 2025 (team runt nu Lubbi).': 'Not included: permanently closed after summer 2025 (team now runs Lubbi).',
 'Nieuw (geopend begin augustus 2026) – Burgstraat 20.': 'New (opened early August 2026) – Burgstraat 20.',
 'Tijdelijk gesloten wegens ziekte (melding op eigen site).': 'Temporarily closed due to illness (notice on own website).',
 'Adresconflict: GM meldt verhuis naar Zuidstationstraat 14; eigen site en Michelin vermelden Lange Steenstraat 10 (gebruikt).': 'Address conflict: G&M reports a move to Zuidstationstraat 14; own website and Michelin list Lange Steenstraat 10 (used).',
 'Nieuwe kaart oktober–november 2026 (13/10–20/11).': 'New menu October–November 2026 (13/10–20/11).',
 "Weeklunch 20–23/10/2026 en diner Chef's Choice 16/10–20/11/2026 gepubliceerd.": "Weekly lunch 20–23/10/2026 and Chef's Choice dinner 16/10–20/11/2026 published."}
missing = []
def tr(d, v, ctx):
    if v in (None, ''): return v
    if v in d: return d[v]
    missing.append((ctx, v)); return v
def chef(v):
    v = v.replace('onbekend', U).replace('eigenaars', 'owners').replace('eigenaar', 'owner').replace('keukenchef', 'head chef').replace('gastvrouw', 'host').replace('chefsduo', 'chef duo')
    return v
def ev(e):
    e = dict(e)
    e['title'] = tr(EVTITLE, e['title'], 'evtitle'); e['type'] = tr(EVTYPE, e['type'], 'evtype')
    if e.get('note'): e['note'] = tr(EVNOTE, e['note'], 'evnote')
    if e.get('dateText'): e['dateText'] = tr(EVDATETEXT, e['dateText'], 'evdt')
    if e.get('location') in EVLOC: e['location'] = EVLOC[e['location']]
    e['partners'] = [EVPARTNER.get(p, p) for p in e.get('partners', [])]
    return e
out = []
for r in R:
    r = dict(r); orig = {}
    for k in ('cuisine', 'menuType', 'menuChanges', 'currentMenuNote', 'dietNote', 'statusNote', 'dataConflict'): orig[k] = r.get(k)
    r['city'] = 'gent'; r['country'] = 'BE'
    r['cuisine'] = tr(CUISINE, r['cuisine'], 'cuisine'); r['cuisineTags'] = [TAGS[t] for t in r['cuisineTags']]
    r['chef'] = chef(r['chef'])
    r['priceLevel'] = U if r['priceLevel'] == 'onbekend' else r['priceLevel']
    for k in ('openingYear', 'openingDate'): r[k] = U if r[k] == 'onbekend' else r[k]
    r['vegetarian'] = YN[r['vegetarian']]; r['vegan'] = YN[r['vegan']]
    r['menuType'] = tr(MENUTYPE, r['menuType'], 'menuType'); r['menuChanges'] = tr(MENUCH, r['menuChanges'], 'menuChanges')
    cm = r['currentMenuNote']; r['currentMenuNote'] = U if cm == 'onbekend' else (NOTE[r['id']] if r['id'] in NOTE else (missing.append(('note', r['id'], cm)) or cm))
    if r['dietNote']: r['dietNote'] = DIET.get(r['id']) or (missing.append(('diet', r['id'])) or r['dietNote'])
    if r.get('statusNote'): r['statusNote'] = STATUSNOTE.get(r['id']) or (missing.append(('status', r['id'])) or r['statusNote'])
    if r.get('dataConflict'): r['dataConflict'] = CONFLICT.get(r['id']) or (missing.append(('dc', r['id'])) or r['dataConflict'])
    r['status'] = STATUS[r['status']]
    d = dict(r['distinctions']); d['michelin'] = MICH.get(d['michelin'], d['michelin']) if d['michelin'] else None; r['distinctions'] = d
    r['summaryLang'] = 'nl'
    r['events'] = [ev(e) for e in r['events']]
    r['sources'] = [s.replace('(geocodering)', '(geocoding)') for s in r['sources']]
    r['original_nl'] = orig
    out.append(r)
log = [dict(c, change=tr(LOGTX, c['change'], 'log'), restaurant=c['restaurant'].replace('(alle)', '(all)')) for c in LOG]
city = {'id': 'gent', 'name': 'Gent', 'nameEn': 'Ghent', 'country': 'Belgium', 'countryCode': 'BE', 'center': [51.051, 3.725], 'zoom': 13, 'active': True,
        'sourceLanguage': 'nl', 'dateChecked': max(r['dateChecked'] for r in out)}
json.dump({'city': city, 'restaurants': out, 'extraEvents': [ev(e) for e in X], 'changelog': log}, open('data/cities/gent.json', 'w'), ensure_ascii=False, indent=1)
if missing: print('UNTRANSLATED:', *missing, sep='\n'); sys.exit(1)
print('ok', len(out))
