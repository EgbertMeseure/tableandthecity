"""Dagelijkse wijzigingsdetectie (niet-destructief).
Haalt website + menu-/eventpagina's (uit 'sources' van elk restaurant) op, normaliseert de tekst,
vergelijkt een hash met data/snapshots.json en schrijft kandidaat-wijzigingen naar data/pending-changes.json.
Een mens (of agent) bevestigt daarna en past restaurants.json + changelog.json aan.
Gebruik:  python3 scripts/check_changes.py gent   (run from the site folder)"""
import json,hashlib,re,subprocess,html,datetime,os,time
UA='Mozilla/5.0 (X11; Linux x86_64) TableAndTheCity-updater/0.1'
import sys
CITY=sys.argv[1] if len(sys.argv)>1 else 'gent'
D=json.load(open(f'data/cities/{CITY}.json'))['restaurants']
snap=json.load(open(f'data/snapshots-{CITY}.json')) if os.path.exists(f'data/snapshots-{CITY}.json') else {}
KEY=re.compile(r'menu|kaart|carte|lunch|event|nieuws|news|agenda|\.pdf',re.I)
WATCH=re.compile(r'four.?hands|4.?handen|vier.?handen|gastchef|guest chef|pop.?up|samenwerking|collab|wijndiner|wine dinner|masterclass|vegan|veganist|plantaardig|vegetari|gesloten|closed|verhuis|nieuw adres',re.I)
def text(u):
    r=subprocess.run(['curl','-sL','--max-time','20','-A',UA,u],capture_output=True); b=r.stdout
    if u.lower().endswith('.pdf'):
        return subprocess.run(['pdftotext','-','-'],input=b,capture_output=True).stdout.decode(errors='ignore')
    s=b.decode('utf-8',errors='ignore'); s=re.sub(r'<script.*?</script>|<style.*?</style>','',s,flags=re.S|re.I)
    t=' '.join(html.unescape(re.sub('<[^>]+>',' ',s)).split())
    return re.sub(r'©\s*20\d\d|\b\d{1,2}:\d{2}\b','',t)  # ruis eruit
pending=[];today=datetime.date.today().isoformat()
for r in D:
    urls=[r['website']]+[s for s in r['sources'] if s.startswith('http') and KEY.search(s) and r['website'] and r['website'].split('/')[2].replace('www.','') in s]
    for u in dict.fromkeys(filter(None,urls)):
        t=text(u); h=hashlib.sha256(t.encode()).hexdigest()
        old=snap.get(u)
        if old and old['hash']!=h:
            hits=sorted(set(m.group(0).lower() for m in WATCH.finditer(t)))
            pending.append({'date':today,'restaurant':r['name'],'id':r['id'],'url':u,'watchwords':hits,'excerpt':t[:600]})
        snap[u]={'hash':h,'checked':today}
        time.sleep(1)
json.dump(snap,open(f'data/snapshots-{CITY}.json','w'),indent=1)
json.dump(pending,open(f'data/pending-changes-{CITY}.json','w'),ensure_ascii=False,indent=1)
print(f'{len(pending)} pagina(s) gewijzigd sinds vorige run -> data/pending-changes-'+CITY+'.json')
