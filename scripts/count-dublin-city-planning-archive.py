import io, json, urllib.request, zipfile
from collections import Counter
import shapefile

URL='https://data.smartdublin.ie/dataset/9187ffff-6a0d-473d-8cfb-7f83651edb7f/resource/0b7706fd-c687-4712-8036-28dada1c0cb7/download/dcc_planapps.shp.zip'
req=urllib.request.Request(URL, headers={'User-Agent':'OpenList historical archive count'})
with urllib.request.urlopen(req, timeout=120) as r:
    data=r.read()
print(json.dumps({'phase':'download','bytes':len(data)}))
with zipfile.ZipFile(io.BytesIO(data)) as z:
    names=z.namelist()
    shp=next(n for n in names if n.lower().endswith('.shp'))
    dbf=next(n for n in names if n.lower().endswith('.dbf'))
    shx=next(n for n in names if n.lower().endswith('.shx'))
    reader=shapefile.Reader(shp=io.BytesIO(z.read(shp)), shx=io.BytesIO(z.read(shx)), dbf=io.BytesIO(z.read(dbf)), encodingErrors='replace')
    fields=[f[0] for f in reader.fields[1:]]
    print(json.dumps({'phase':'metadata','records':len(reader),'fields':fields}))
    upper={k.upper():k for k in fields}
    date_key=upper.get('REGDATE') or upper.get('RGNDAT') or upper.get('APPDATE') or upper.get('APNDAT')
    ref_key=upper.get('PLAN_REF') or upper.get('REG_REF') or next((k for k in fields if 'REF' in k.upper()),None)
    counts=Counter(); refs={}; missing=0
    def year_from(v):
        if v in (None,''): return None
        if hasattr(v,'year'): return int(v.year)
        s=str(v).strip()
        digits=''.join(ch if ch.isdigit() else ' ' for ch in s).split()
        for p in digits:
            if len(p)==4 and 1900<=int(p)<=2100: return int(p)
            if len(p)>=8:
                for i in range(len(p)-3):
                    y=int(p[i:i+4])
                    if 1900<=y<=2100: return y
        return None
    for rec in reader.iterRecords():
        row=rec.as_dict()
        y=year_from(row.get(date_key)) if date_key else None
        if y is None:
            missing+=1; continue
        counts[y]+=1
        if ref_key and row.get(ref_key): refs.setdefault(y,set()).add(str(row[ref_key]).strip())
    years={y:{'rows':counts.get(y,0),'unique_refs':len(refs.get(y,set()))} for y in range(2003,2017)}
    print(json.dumps({'phase':'years','date_key':date_key,'ref_key':ref_key,'years':years}))
    print(json.dumps({'phase':'totals','2003_2011':sum(counts.get(y,0) for y in range(2003,2012)),'2012_2016':sum(counts.get(y,0) for y in range(2012,2017)),'2003_2016':sum(counts.get(y,0) for y in range(2003,2017)),'missing_date':missing}))
