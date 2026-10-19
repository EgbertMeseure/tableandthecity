import re,json,html,subprocess,time,sys
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
slugs=sys.argv[1].split()
import os
out=json.load(open('gm_details.json')) if os.path.exists('gm_details.json') else []
for sl in slugs:
    u="https://www.gaultmillau.be/nl/restaurants/"+sl
    r=subprocess.run(["curl","-sL","-A",UA,"-w","\n%{http_code}",u],capture_output=True,text=True).stdout
    s,code=r.rsplit('\n',1)
    if code!='200': print(sl,code); continue
    t=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S)
    t=html.unescape(re.sub('<[^>]+>','\n',t))
    L=[l.strip() for l in t.split('\n') if l.strip()]
    try: i=L.index('Openingstijden')
    except: print(sl,'noparse'); continue
    # find score: the pattern name, score, '20', desc ... before 'Route'
    r_i=L.index('Route')
    # search back from r_i for '20'
    js=[k for k in range(r_i) if L[k]=='20' and re.match(r'^\d+(,5)?$',L[k-1])]
    if js:
        j=js[-1]; name=L[j-2]; score=L[j-1]
    else:
        tt=re.search(r'<title>(.*?)</title>',s,re.S); name=html.unescape(tt.group(1)).split('—')[0].replace('Restaurant ','',1).strip(); score=None
        cand=[k for k in range(r_i) if len(L[k])>150]; j=(cand[-1]-1) if cand else r_i-4
    block=L[j+1:r_i]
    desc=block[0] if block and len(block[0])>80 else ''
    web=next((b for b in block if re.match(r'^[\w.-]+\.[a-z]{2,}(/.*)?$',b) and '@' not in b),None)
    tel=next((b for b in block if b.startswith('+')),None)
    addr=L[i-2:i]
    def section(a,b):
        try:
            x=L.index(a); y=next(k for k in range(x+1,len(L)) if L[k] in b); return L[x+1:y]
        except: return []
    stops=['Awards','Menu\'s','Reserveer','Kenmerken','Keuken','Onze partners','Team','Ook aan te raden Restaurants']
    team=section('Team',stops); menus=section("Menu's",stops); feats=section('Kenmerken',stops); cuis=section('Keuken',stops)
    hours=L[i+1:i+15]
    web_href=re.search(r'href="(https?://[^"]+)"[^>]*>\s*'+re.escape(web) if web else 'x^',s)
    insta=re.search(r'href="(https?://(?:www\.)?instagram\.com/[^"]+)"',s)
    d=dict(gmUrl=u,name=name,score=score,desc=desc,website=web_href.group(1) if web_href else (web and 'https://'+web),tel=tel,address=addr,team=team,menus=menus,features=feats,cuisine=cuis,hours=hours,instagram=insta and insta.group(1))
    out.append(d); json.dump(out,open('gm_details.json','w'),ensure_ascii=False,indent=1); print(name,score,d['website'],cuis,team[:2])
    time.sleep(1)
json.dump(out,open('gm_details.json','w'),ensure_ascii=False,indent=1)
