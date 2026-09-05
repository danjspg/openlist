import io, json, os, time, urllib.request, zipfile
from datetime import datetime
import shapefile

SOURCE_URL = 'https://data.smartdublin.ie/dataset/9187ffff-6a0d-473d-8cfb-7f83651edb7f/resource/0b7706fd-c687-4712-8036-28dada1c0cb7/download/dcc_planapps.shp.zip'
SOURCE_PAGE = 'https://data.smartdublin.ie/dataset/dublin-city-council-planning-applications'
SUPABASE_URL = os.environ['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
SERVICE_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
BATCH_SIZE = int(os.environ.get('BATCH_SIZE', '250'))
MAX_ROWS = int(os.environ.get('MAX_ROWS', '0'))
START_AT = int(os.environ.get('START_AT', '0'))
MIN_BATCH_SIZE = int(os.environ.get('MIN_BATCH_SIZE', '25'))
START_YEAR = 2003
END_YEAR = 2016
EXPECTED_TOTAL = 47144


def clean(v):
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def iso_date(v):
    if not v:
        return None
    if hasattr(v, 'isoformat') and not isinstance(v, str):
        return v.isoformat()
    s = str(v).strip()
    for fmt in ('%d-%m-%Y', '%d/%m/%Y', '%Y-%m-%d', '%d-%b-%Y'):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            pass
    return None


def bbox_center(shape):
    try:
        if shape and shape.bbox and len(shape.bbox) >= 4:
            xmin, ymin, xmax, ymax = shape.bbox[:4]
            return ((float(xmin) + float(xmax)) / 2.0, (float(ymin) + float(ymax)) / 2.0)
    except Exception:
        pass
    return (None, None)


def rpc_once(rows, attempt=1):
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/rpc/openlist_import_historical_planning_payload',
        data=json.dumps({'p_rows': rows}).encode('utf-8'),
        headers={
            'apikey': SERVICE_KEY,
            'Authorization': f'Bearer {SERVICE_KEY}',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = json.loads(resp.read().decode('utf-8'))
    except Exception as exc:
        if attempt >= 2:
            raise
        print(json.dumps({'phase':'rpc_retry','attempt':attempt,'rows':len(rows),'error':str(exc)[:300]}), flush=True)
        time.sleep(4)
        return rpc_once(rows, attempt + 1)
    if not isinstance(body, list) or len(body) != 1:
        raise RuntimeError(f'Unexpected RPC response: {body!r}')
    return int(body[0].get('attempted', 0)), int(body[0].get('inserted', 0))


def rpc_resilient(rows, source_offset):
    try:
        return rpc_once(rows)
    except Exception as exc:
        if len(rows) <= MIN_BATCH_SIZE:
            raise
        midpoint = len(rows) // 2
        left = rows[:midpoint]
        right = rows[midpoint:]
        print(json.dumps({
            'phase':'batch_split',
            'source_offset': source_offset,
            'rows': len(rows),
            'left': len(left),
            'right': len(right),
            'error': str(exc)[:300],
        }), flush=True)
        time.sleep(3)
        a1, i1 = rpc_resilient(left, source_offset)
        time.sleep(0.5)
        a2, i2 = rpc_resilient(right, source_offset + midpoint)
        return a1 + a2, i1 + i2


req = urllib.request.Request(SOURCE_URL, headers={'User-Agent': 'OpenList Dublin historical bulk importer'})
with urllib.request.urlopen(req, timeout=120) as resp:
    archive = resp.read()
print(json.dumps({'phase':'download','bytes':len(archive)}), flush=True)

rows = []
refs = set()
with zipfile.ZipFile(io.BytesIO(archive)) as z:
    names = z.namelist()
    shp = next(n for n in names if n.lower().endswith('.shp'))
    shx = next(n for n in names if n.lower().endswith('.shx'))
    dbf = next(n for n in names if n.lower().endswith('.dbf'))
    reader = shapefile.Reader(
        shp=io.BytesIO(z.read(shp)),
        shx=io.BytesIO(z.read(shx)),
        dbf=io.BytesIO(z.read(dbf)),
        encodingErrors='replace',
    )
    for sr in reader.iterShapeRecords():
        a = sr.record.as_dict()
        reg_date = iso_date(a.get('REGDATE'))
        if not reg_date:
            continue
        year = int(reg_date[:4])
        if year < START_YEAR or year > END_YEAR:
            continue
        ref = clean(a.get('PLAN_REF'))
        if not ref:
            raise RuntimeError(f'Missing PLAN_REF for registration date {reg_date}')
        if ref in refs:
            raise RuntimeError(f'Duplicate Dublin reference in source: {ref}')
        refs.add(ref)
        easting, northing = bbox_center(sr.shape)
        proposal = clean(a.get('LONG_PROPO')) or clean(a.get('PROPOSAL'))
        rows.append({
            'local_authority': 'Dublin City Council',
            'local_authority_code': 'DUBLINCC',
            'source_application_id': None,
            'reference': ref,
            'web_reference': ref,
            'application_type': clean(a.get('APPTYPE')),
            'proposal': proposal,
            'location': clean(a.get('LOCATION')),
            'eircode': None,
            'eircode_prefix': None,
            'applicant_name': None,
            'status': clean(a.get('STAGE')),
            'decision_text': clean(a.get('DECISION')),
            'registration_date': reg_date,
            'decision_date': iso_date(a.get('DECDATE')),
            'decision_due_date': None,
            'final_grant_date': iso_date(a.get('FGDATE')),
            'expiry_date': None,
            'further_information_requested_date': None,
            'further_information_received_date': None,
            'withdrawal_date': None,
            'appeal_lodged_date': None,
            'appeal_decision_date': None,
            'grid_easting': easting,
            'grid_northing': northing,
            'source_url': SOURCE_PAGE,
            'source_api_url': SOURCE_URL,
        })
        if MAX_ROWS and len(rows) >= MAX_ROWS:
            break

if not MAX_ROWS and len(rows) != EXPECTED_TOTAL:
    raise RuntimeError(f'Expected {EXPECTED_TOTAL} Dublin rows, got {len(rows)}')
if START_AT < 0 or START_AT > len(rows):
    raise RuntimeError(f'Invalid START_AT {START_AT} for {len(rows)} prepared rows')

rows_to_import = rows[START_AT:]
print(json.dumps({'phase':'prepared','rows':len(rows),'remaining_rows':len(rows_to_import),'unique_refs':len(refs),'batch_size':BATCH_SIZE,'min_batch_size':MIN_BATCH_SIZE,'max_rows':MAX_ROWS,'start_at':START_AT}), flush=True)

total_attempted = 0
total_inserted = 0
for i in range(0, len(rows_to_import), BATCH_SIZE):
    batch = rows_to_import[i:i+BATCH_SIZE]
    source_offset = START_AT + i
    attempted, inserted = rpc_resilient(batch, source_offset)
    total_attempted += attempted
    total_inserted += inserted
    print(json.dumps({
        'phase':'batch',
        'batch': i // BATCH_SIZE + 1,
        'source_offset': source_offset,
        'batch_rows': len(batch),
        'attempted': attempted,
        'inserted': inserted,
        'cumulative_attempted': total_attempted,
        'cumulative_inserted': total_inserted,
    }), flush=True)
    time.sleep(0.5)

if total_attempted != len(rows_to_import):
    raise RuntimeError(f'RPC attempted mismatch: remaining={len(rows_to_import)} attempted={total_attempted}')

print(json.dumps({'phase':'complete','prepared':len(rows),'start_at':START_AT,'attempted':total_attempted,'inserted':total_inserted,'deduped':total_attempted-total_inserted}), flush=True)
