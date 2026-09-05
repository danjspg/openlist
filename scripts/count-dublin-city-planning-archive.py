import csv, io, json, urllib.request
from collections import Counter

URL='https://opendata.dublincity.ie/PandDOpenData/DCC_DUBLINK_BASE.csv'
with urllib.request.urlopen(URL, timeout=60) as r:
    data=r.read()
text=data.decode('utf-8-sig', errors='replace')
rows=list(csv.DictReader(io.StringIO(text)))
print(json.dumps({'phase':'metadata','rows':len(rows),'fields':list(rows[0].keys()) if rows else []}))

def year_from(v):
    if not v: return None
    s=str(v).strip()
    # Common DCC formats include dd/mm/yyyy and timestamps.
    for sep in ('/','-'):
        parts=s.split(sep)
        if len(parts)>=3:
            for p in (parts[-1], parts[0]):
                q=''.join(ch for ch in p if ch.isdigit())
                if len(q)>=4:
                    y=int(q[:4])
                    if 1900<=y<=2100: return y
    digits=''.join(ch for ch in s if ch.isdigit())
    for i in range(max(0,len(digits)-3)):
        try:
            y=int(digits[i:i+4])
            if 1900<=y<=2100: return y
        except: pass
    return None

# Prefer registration date, then application date.
keys=list(rows[0].keys()) if rows else []
reg_key=next((k for k in keys if k.upper()=='RGNDAT'),None)
app_key=next((k for k in keys if k.upper()=='APNDAT'),None)
ref_key=next((k for k in keys if k.upper()=='REG_REF'),None)
counts=Counter()
unique_by_year={}
missing_date=0
for row in rows:
    y=year_from(row.get(reg_key,'')) if reg_key else None
    if y is None and app_key: y=year_from(row.get(app_key,''))
    if y is None:
        missing_date+=1
        continue
    counts[y]+=1
    if ref_key and row.get(ref_key):
        unique_by_year.setdefault(y,set()).add(row[ref_key].strip())

out={}
for y in range(2003,2017):
    out[y]={'rows':counts.get(y,0),'unique_refs':len(unique_by_year.get(y,set()))}
print(json.dumps({'phase':'years','years':out}))
print(json.dumps({'phase':'totals','2003_2011':sum(counts.get(y,0) for y in range(2003,2012)),'2012_2016':sum(counts.get(y,0) for y in range(2012,2017)),'2003_2016':sum(counts.get(y,0) for y in range(2003,2017)),'missing_date':missing_date}))
