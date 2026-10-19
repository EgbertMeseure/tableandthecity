import json,re,math,csv,sys,unicodedata
sys.path.insert(0,'gent-restaurants/scripts')
from curated import C,EXTRA_EVENTS,HLN_GM
recs=json.load(open('master_raw.json'))
geo=json.load(open('geo_cache.json')); addrs=json.load(open('addrs.json'))
TODAY='2026-10-19'
# GM scores from HLN list for those without GM page score
HLN_SCORES={'Taberna Bask':13,'Lubbi':13}
extra={'ARNO ristorante':{'mich':{'name':'ARNO ristorante','cuisine':'Italiaans, Toscaans','dtm':'plate','michelinUrl':'https://guide.michelin.com/en/oost-vlaanderen/gent/restaurant/arno-ristorante','price':'€€€€','website':'https://arno-ristorante.be/'}},
 'Lubbi':{'website':'https://lubbi.be/'},'Fine N Fast':{'website':'https://finenfast.be/'},'Yusu':{'website':'https://www.yusu.be/'}}
MPRICE={}  # from Michelin listing
for line in open('mich_list_prices.txt'):
    n,p=line.rstrip('\n').split('|'); MPRICE[n]=p
items=[]
for r in recs: items.append((r['name'],r['gm'],r['mich']))
for n,e in extra.items(): items.append((n,None,e.get('mich')))
TAGS=[('Frans',r'frans|bistro'),('Belgisch / Vlaams',r'belgisch|vlaams|waterzooi'),('Italiaans',r'italia|toscaans|siciliaans'),('Aziatisch',r'aziat|thais|japans|omakase'),('Spaans / mediterraan',r'spaans|baskisch|mediterr|tapas|pintxos'),('Modern / creatief',r'modern|creatief|eigentijds|fastronomie|nordic|internationaal'),('Groente / plantaardig',r'groente|vegetar|plantaardig'),('Vuur / vlees',r'vuur|steak|rund|asador'),('Vis / Noordzee',r'noordzee|vis\b')]
def ctags(c):
    out=[t for t,p in TAGS if re.search(p,c,re.I)]
    return out or ['Overig']
def slug(s):
    s=unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+','-',s).strip('-')
def hav(a,b,c,d):
    R=6371000;p1,p2=math.radians(a),math.radians(c);dl=math.radians(d-b);dp=p2-p1
    return 2*R*math.asin(math.sqrt(math.sin(dp/2)**2+math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2))
DEELG={'9040':'Sint-Amandsberg','9050':'Gentbrugge/Ledeberg','9051':'Sint-Denijs-Westrem','9032':'Wondelgem'}
out=[];warn=[]
for name,gm,m in items:
    c=C.get(name)
    if not c: warn.append('no curated '+name); continue
    a=addrs.get(name) or ''
    g=geo.get(a)
    pm=list(re.finditer(r'\b(9\d{3})\b',a)); postal=pm[-1].group(1) if pm else ''
    street=a[:pm[-1].start()].strip() if pm else a
    if g:
        lat,lng=float(g['lat']),float(g['lon']); ad=g['address']
        nb=ad.get('neighbourhood') or ad.get('village') or ad.get('town') or ad.get('suburb') or ad.get('quarter') or ad.get('industrial')
        geosrc='Nominatim/OpenStreetMap'
    else:
        lat,lng=(m or {}).get('lat'),(m or {}).get('lng'); nb=None; geosrc='Michelin'
    if m and m.get('lat') and g:
        dd=hav(lat,lng,m['lat'],m['lng'])
        if dd>250: warn.append(f'{name}: Nominatim vs Michelin {int(dd)} m')
    deel=DEELG.get(postal,'Gent (9000)' if postal=='9000' else 'Gent')
    if name=='Taberna Bask': deel='Gentbrugge/Ledeberg'
    # distinctions
    mich=None
    if m:
        mich={'2 star':'2 Michelinsterren','1 star':'1 Michelinster','bib':'Bib Gourmand','plate':'Michelin-selectie'}.get(m.get('dtm'))
    gms=None
    if gm and gm.get('score'): gms=float(gm['score'].replace(',','.'))
    elif name in HLN_SCORES: gms=HLN_SCORES[name]
    price=(m or {}).get('price') or MPRICE.get((m or {}).get('name'))
    sources=[]
    if m and m.get('michelinUrl'): sources.append(m['michelinUrl'])
    if gm: sources.append(gm['gmUrl'])
    if gms and (not gm or not gm.get('score')): sources.append(HLN_GM)
    sources+=c.get('extraSources',[])
    if g: sources.append('https://nominatim.openstreetmap.org/ (geocodering)')
    website=(c.get('website') or (extra.get(name,{}).get('website')) or (gm or {}).get('website') or (m or {}).get('website'))
    od=c.get('openingDate'); oy=c.get('openingYear')
    isnew=bool(od and od>='2025-04-19')
    descr=(m or {}).get('desc') or (gm or {}).get('desc') or ''
    rec={'id':slug(name),'name':name,'type':c['type'],'cuisine':c['cuisine'],'cuisineTags':ctags(c['cuisine']),'chef':c.get('chef','onbekend'),
      'address':f"{street}, {postal} Gent".replace(' ,',','),'postalCode':postal,'district':deel,'neighbourhood':nb or deel,
      'lat':round(lat,6) if lat else None,'lng':round(lng,6) if lng else None,'geoSource':geosrc,
      'priceLevel':price or 'onbekend','priceFrom':c.get('priceFrom'),
      'distinctions':{'michelin':mich,'michelinYear':2026 if mich else None,'gaultMillau':gms,'gaultMillauEdition':'2026' if gms else None},
      'openingYear':oy or 'onbekend','openingDate':od or 'onbekend','isNew':isnew,
      'vegetarian':c['vegetarian'],'vegan':c['vegan'],'dietNote':c.get('dietNote',''),
      'menuType':c.get('menuType','onbekend'),'menuChanges':c.get('menuChanges','onbekend'),'currentMenuNote':c.get('currentMenuNote','onbekend'),
      'status':c.get('status','open'),'statusNote':c.get('statusNote',''),
      'website':website,'instagram':(gm or {}).get('instagram') if (gm or {}).get('instagram') and 'gaultmillaubelgium' not in (gm or {}).get('instagram','') else None,
      'phone':(gm or {}).get('tel') or (m or {}).get('tel'),
      'summary':(descr[:260].rsplit(' ',1)[0]+'…') if len(descr)>260 else descr,
      'events':[dict(e,id=slug(name)+'-'+str(i)) for i,e in enumerate(c.get('events',[]))],
      'sources':list(dict.fromkeys(sources)),'dataConflict':c.get('dataConflict'),
      'dateChecked':TODAY,'lastChanged':TODAY}
    out.append(rec)
out.sort(key=lambda r:r['name'].lower())
print('\n'.join(warn)); print(len(out))
json.dump(out,open('gent-restaurants/data/restaurants.json','w'),ensure_ascii=False,indent=1)
json.dump([dict(e,id='extra-'+str(i)) for i,e in enumerate(EXTRA_EVENTS)],open('gent-restaurants/data/events-extra.json','w'),ensure_ascii=False,indent=1)
cols=['id','name','type','cuisine','chef','address','district','neighbourhood','lat','lng','priceLevel','priceFrom','michelin','gaultMillau','openingYear','openingDate','isNew','vegetarian','vegan','dietNote','menuType','menuChanges','currentMenuNote','status','website','eventsCount','sources','dateChecked','lastChanged']
with open('gent-restaurants/data/restaurants.csv','w',newline='',encoding='utf-8') as f:
    w=csv.writer(f); w.writerow(cols)
    for r in out:
        w.writerow([r['id'],r['name'],r['type'],r['cuisine'],r['chef'],r['address'],r['district'],r['neighbourhood'],r['lat'],r['lng'],r['priceLevel'],r['priceFrom'] or '',r['distinctions']['michelin'] or '',r['distinctions']['gaultMillau'] or '',r['openingYear'],r['openingDate'],r['isNew'],r['vegetarian'],r['vegan'],r['dietNote'],r['menuType'],r['menuChanges'],r['currentMenuNote'],r['status'],r['website'],len(r['events']),' | '.join(r['sources']),r['dateChecked'],r['lastChanged']])
