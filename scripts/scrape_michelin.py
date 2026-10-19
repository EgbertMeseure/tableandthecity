import re,json,html,subprocess,time,sys
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
urls=[l.strip() for l in open(sys.argv[1]) if l.strip()]
out=[]
for u in urls:
    s=subprocess.run(["curl","-sL","-A",UA,u],capture_output=True,text=True).stdout
    d={}
    for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>',s,re.S):
        try:
            j=json.loads(m.group(1))
            if j.get('@type')=='Restaurant': d=j
        except: pass
    web=re.search(r'data-event="CTA_website"[^>]*href="([^"]+)"',s) or re.search(r'href="([^"]+)"[^>]*data-event="CTA_website"',s)
    desc=re.search(r'id="js-restaurant__main-desc"[^>]*>(.*?)</div>',s,re.S)
    meta=re.search(r'<meta name="description" content="([^"]+)"',s)
    dd=re.search(r'data-dtm-distinction="([^"]*)"',s)
    green='Groene Ster' in s or 'green-star' in s
    a=d.get('address',{})
    out.append(dict(michelinUrl=u,name=d.get('name'),street=a.get('streetAddress'),postal=a.get('postalCode'),locality=a.get('addressLocality'),lat=d.get('latitude'),lng=d.get('longitude'),cuisine=d.get('servesCuisine'),tel=d.get('telephone'),star=d.get('starRating'),dtm=dd and dd.group(1),meta=meta and html.unescape(meta.group(1)).split(' restaurant uit')[0],website=web and html.unescape(web.group(1)),desc=desc and ' '.join(re.sub('<[^>]+>','',html.unescape(desc.group(1))).split()),reviewDate=d.get('review',{}).get('datePublished'),green=green))
    print(out[-1]['name'],'|',out[-1]['dtm'],'|',out[-1]['meta'][:90] if out[-1]['meta'] else '')
    time.sleep(1)
json.dump(out,open(sys.argv[2],'w'),ensure_ascii=False,indent=1)
