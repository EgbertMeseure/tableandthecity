import json,re
res=json.load(open('sites/crawl.json'))
pats={'VEG':r'vegetari\w*|veggie|vegan\w*|plantaardig\w*|plant-based|plantbased|vleesloos|vegatari\w*',
'CHG':r'seizoen\w*|wekelijks|maandelijks|wisselend\w*|elke week|iedere week|per week|weekmenu|maandmenu|dagelijks|chef.s choice|suggesti\w*|marktkeuken|changes|season\w*',
'EVT':r'four.?hands|4.?hands|vier.?handen|4.?handen|gastchef|guest chef|pop.?up|samenwerking|collab\w*|takeover|wijndiner|wine dinner|masterclass|evenement\w*|event\b|\b20(26|27)\b'}
import sys
only=sys.argv[1:] 
for r in res:
    if only and r['name'] not in only: continue
    print('#####',r['name'])
    for k,p in pats.items():
        seen=set(); n=0
        for pg in r['pages']:
            t=pg['text']
            for m in re.finditer(p,t,re.I):
                sn=t[max(0,m.start()-110):m.end()+110]
                key=sn[100:140]
                if key in seen: continue
                seen.add(key); n+=1
                if n<=4: print(f' {k} [{pg["url"].split("/",3)[-1][:40]}] …{sn}…')
