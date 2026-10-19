import json,urllib.request,urllib.parse,time,os,re
recs=json.load(open('master_raw.json'))
addrs={}
for r in recs:
    if r['gm'] and r['gm']['address']:
        a=' '.join(r['gm']['address']).replace(',','').strip()
        a=re.sub(r'\s*\(.*?\)','',a)
    else:
        m=r['mich']; a=f"{m['street']} {m['postal']} {m['locality']}"
    addrs[r['name']]=a
addrs['DEBRA']='Lange Steenstraat 10 9000 Gent'
addrs.update({'ARNO ristorante':'Akkerhage 2B 9000 Gent','Lubbi':'Kliniekstraat 27B 9050 Gentbrugge','Fine N Fast':'Schepenhuisstraat 17 9000 Gent','Yusu':'Drongensesteenweg 2 9000 Gent','Taberna Bask':'Doorgang der Hallegasten 14 9050 Ledeberg'})
cache=json.load(open('geo_cache.json')) if os.path.exists('geo_cache.json') else {}
for n,a in addrs.items():
    if a in cache: continue
    q=a+', België'
    u='https://nominatim.openstreetmap.org/search?'+urllib.parse.urlencode({'q':q,'format':'jsonv2','addressdetails':1,'limit':1,'countrycodes':'be'})
    req=urllib.request.Request(u,headers={'User-Agent':'TafelGent-prototype/0.1 (restaurant list prototype; contact: local test)'})
    try: res=json.load(urllib.request.urlopen(req,timeout=20))
    except Exception as e: res=[]; print('ERR',n,e)
    if not res:
        # retry without house number letter
        q2=re.sub(r'(\d+)[A-Za-z]\b',r'\1',a)+', België'
        time.sleep(1.1)
        u='https://nominatim.openstreetmap.org/search?'+urllib.parse.urlencode({'q':q2,'format':'jsonv2','addressdetails':1,'limit':1,'countrycodes':'be'})
        req=urllib.request.Request(u,headers={'User-Agent':'TafelGent-prototype/0.1 (restaurant list prototype; contact: local test)'})
        try: res=json.load(urllib.request.urlopen(req,timeout=20))
        except: res=[]
    cache[a]=res[0] if res else None
    print(n,'|',a,'|',(res[0]['lat'],res[0]['lon'],res[0]['address'].get('suburb'),res[0]['address'].get('quarter'),res[0]['address'].get('neighbourhood')) if res else 'NONE')
    json.dump(cache,open('geo_cache.json','w'),ensure_ascii=False)
    time.sleep(1.1)
json.dump(addrs,open('addrs.json','w'),ensure_ascii=False,indent=1)
