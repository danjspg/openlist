import io, json, os, urllib.request, zipfile
from collections import Counter
import shapefile

URL = 'https://data.smartdublin.ie/dataset/9187ffff-6a0d-473d-8cfb-7f83651edb7f/resource/0b7706fd-c687-4712-8036-28dada1c0cb7/download/dcc_planapps.shp.zip'
OUT = os.environ.get('OUT', '.tmp/dublin-city-planning-archive-2003-2016.ndjson')
START_YEAR = 2003
END_YEAR = 2016
EXPECTED_TOTAL = 47144

req = urllib.request.Request(URL, headers={'User-Agent': 'OpenList historical archive acquisition'})
with urllib.request.urlopen(req, timeout=120) as r:
    data = r.read()
print(json.dumps({'phase':'download','bytes':len(data),'source':URL}))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
counts = Counter()
refs = set()
written = 0

with zipfile.ZipFile(io.BytesIO(data)) as z:
    names = z.namelist()
    shp = next(n for n in names if n.lower().endswith('.shp'))
    dbf = next(n for n in names if n.lower().endswith('.dbf'))
    shx = next(n for n in names if n.lower().endswith('.shx'))
    reader = shapefile.Reader(
        shp=io.BytesIO(z.read(shp)),
        shx=io.BytesIO(z.read(shx)),
        dbf=io.BytesIO(z.read(dbf)),
        encodingErrors='replace'
    )
    fields = [f[0] for f in reader.fields[1:]]
    print(json.dumps({'phase':'metadata','records':len(reader),'fields':fields}))
    if 'PLAN_REF' not in fields or 'REGDATE' not in fields:
        raise RuntimeError('Expected PLAN_REF and REGDATE fields are missing')

    with open(OUT, 'w', encoding='utf-8') as out:
        for sr in reader.iterShapeRecords():
            row = sr.record.as_dict()
            reg = row.get('REGDATE')
            if not reg or not hasattr(reg, 'year'):
                continue
            year = int(reg.year)
            if year < START_YEAR or year > END_YEAR:
                continue
            ref = str(row.get('PLAN_REF') or '').strip()
            if not ref:
                raise RuntimeError(f'Missing PLAN_REF for {year} record')
            if ref in refs:
                raise RuntimeError(f'Duplicate PLAN_REF in Dublin archive: {ref}')
            refs.add(ref)
            counts[year] += 1
            geometry = None
            try:
                geometry = sr.shape.__geo_interface__ if sr.shape else None
            except Exception:
                geometry = None
            out.write(json.dumps({
                'source': 'DUBLIN_CITY_SMARTDUBLIN_PLANAPPS',
                'authority': 'DUBLINCC',
                'registration_year': year,
                'reference': ref,
                'attributes': row,
                'geometry': geometry
            }, default=str, ensure_ascii=False) + '\n')
            written += 1

summary = {str(y): counts[y] for y in range(START_YEAR, END_YEAR + 1)}
print(json.dumps({'phase':'years','counts':summary}))
print(json.dumps({'phase':'complete','output':OUT,'written':written,'unique_refs':len(refs)}))
if written != EXPECTED_TOTAL or len(refs) != EXPECTED_TOTAL:
    raise RuntimeError(f'Expected {EXPECTED_TOTAL} records, got written={written}, unique_refs={len(refs)}')
