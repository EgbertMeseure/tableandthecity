import json,re,subprocess,html,os,sys,urllib.parse
from concurrent.futures import ThreadPoolExecutor
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
recs=json.load(open('master_raw.json'))
extra={'ARNO ristorante':'https://arno-ristorante.be/','Lubbi':'https://lubbi.be/','Fine N Fast':'https://finenfast.be/'}
sites=[(r['name'],(r['gm'] or {}).get('website') or (r['mich'] or {}).get('website')) for r in recs]+list(extra.items())
KW=re.compile(r'menu|kaart|carte|food|eten|lunch|diner|dinner|event|agenda|nieuws|news|actua|kalender|calendar|veg|wine|aanbod|keuken|over|about',re.I)
def get(u):
    r=subprocess.run(["curl","-sL","--max-time","20","-A",UA,"-w","\n__CODE__%{http_code} %{content_type} %{url_effective}",u],capture_output=True)
    b=r.stdout
    try: body,meta=b.rsplit(b'\n__CODE__',1)
    except: return None,'',u
    meta=meta.decode(errors='ignore').split(' ')
    return body,meta[1] if len(meta)>1 else '',meta[-1]
def text_of(body,ct,u):
    if 'pdf' in ct or u.lower().endswith('.pdf'):
        p=subprocess.run(['pdftotext','-layout','-','-'],input=body,capture_output=True); return p.stdout.decode(errors='ignore')
    s=body.decode('utf-8',errors='ignore')
    s=re.sub(r'<script.*?</script>|<style.*?</style>|<noscript.*?</noscript>','',s,flags=re.S|re.I)
    return ' '.join(html.unescape(re.sub('<[^>]+>',' ',s)).split())
def crawl(item):
    name,site=item
    out={'name':name,'site':site,'pages':[]}
    if not site: return out
    body,ct,eff=get(site)
    if body is None: return out
    out['pages'].append({'url':eff,'text':text_of(body,ct,eff)[:20000]})
    host=urllib.parse.urlparse(eff).netloc.replace('www.','')
    links=re.findall(r'href="([^"#]+)"',body.decode('utf-8',errors='ignore'))
    cand=[]
    for l in links:
        a=urllib.parse.urljoin(eff,html.unescape(l))
        if host not in urllib.parse.urlparse(a).netloc and not a.lower().endswith('.pdf'): continue
        if re.search(r'\.(jpg|png|css|js|svg|webp|ico)(\?|$)',a,re.I): continue
        if KW.search(a) and a not in cand and a.rstrip('/')!=eff.rstrip('/'): cand.append(a)
    for a in cand[:10]:
        b,c,e=get(a)
        if b: out['pages'].append({'url':e,'text':text_of(b,c,e)[:20000]})
    return out
with ThreadPoolExecutor(8) as ex: res=list(ex.map(crawl,sites))
json.dump(res,open('sites/crawl.json','w'),ensure_ascii=False)
for r in res: print(r['name'],len(r['pages']),[p['url'] for p in r['pages']][:6])
