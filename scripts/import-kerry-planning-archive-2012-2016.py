import json, os, time, urllib.parse, urllib.request
from datetime import datetime, timezone

SOURCE='https://services2.arcgis.com/FQ08czOaoVds3IE4/arcgis/rest/services/planningeweb/FeatureServer/0'
SUPABASE_URL=os.environ['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
SERVICE_KEY=os.environ['SUPABASE_SERVICE_ROLE_KEY']
BATCH_SIZE=int(os.environ.get('BATCH_SIZE','250'))
MIN_BATCH_SIZE=int(os.environ.get('MIN_BATCH_SIZE','25'))
EXPECTED_RAW_TOTAL=6232
EXPECTED_UNIQUE_TOTAL=6224


def clean(v):
    if v is None: return None
    s=str(v).strip()
    return s or None


def d(v):
    if not isinstance(v,(int,float)): return None
    try:
        x=datetime.fromtimestamp(v/1000,tz=timezone.utc).date()
        return x.isoformat() if x.year>1900 else None
    except Exception: return None


def get_json(url):
    for attempt in range(1,5):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'OpenList Kerry historical importer'})
            with urllib.request.urlopen(req,timeout=120) as resp:
                body=json.loads(resp.read().decode())
            if body.get('error'): raise RuntimeError(str(body['error']))
            return body
        except Exception:
            if attempt==4: raise
            time.sleep(attempt*2)


def rpc_once(rows):
    req=urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/rpc/openlist_import_historical_planning_payload',
        data=json.dumps({'p_rows':rows}).encode(),
        headers={'apikey':SERVICE_KEY,'Authorization':f'Bearer {SERVICE_KEY}','Content-Type':'application/json','Accept':'application/json'},
        method='POST')
    with urllib.request.urlopen(req,timeout=120) as resp:
        body=json.loads(resp.read().decode())
    return int(body[0]['attempted']),int(body[0]['inserted'])


def send(rows):
    for attempt in range(1,4):
        try: return rpc_once(rows)
        except Exception as exc:
            print(json.dumps({'phase':'retry','rows':len(rows),'attempt':attempt,'error':str(exc)[:240]}),flush=True)
            time.sleep(attempt*2)
    if len(rows)<=MIN_BATCH_SIZE:
        raise RuntimeError(f'RPC failed at minimum batch size {len(rows)}')
    mid=len(rows)//2
    print(json.dumps({'phase':'split','rows':len(rows),'left':mid,'right':len(rows)-mid}),flush=True)
    a1,i1=send(rows[:mid]); a2,i2=send(rows[mid:])
    return a1+a2,i1+i2

where="Date_Received >= DATE '2012-01-01' AND Date_Received < DATE '2017-01-01'"
rows=[]; offset=0
while True:
    params={
        'where':where,'outFields':'*','returnGeometry':'true','orderByFields':'OBJECTID ASC',
        'resultOffset':str(offset),'resultRecordCount':'1000','f':'json','outSR':'2157'
    }
    body=get_json(f"{SOURCE}/query?{urllib.parse.urlencode(params)}")
    features=body.get('features') or []
    if not features: break
    for f in features:
        a=f.get('attributes') or {}; g=f.get('geometry') or {}
        ref=clean(a.get('Planning_Number')); reg=d(a.get('Date_Received'))
        if not ref or not reg: continue
        rows.append({
            'local_authority':'Kerry County Council','local_authority_code':'KERRY',
            'source_application_id':a.get('OBJECTID') if isinstance(a.get('OBJECTID'),int) else None,
            'reference':ref,'web_reference':ref,'application_type':None,
            'proposal':clean(a.get('Development_Description')) or clean(a.get('decision_description')),
            'location':clean(a.get('Development_Address')),'eircode':None,'eircode_prefix':None,
            'applicant_name':clean(a.get('Applicant_Name')),'status':clean(a.get('Application_Status')),
            'decision_text':clean(a.get('Decision')),'registration_date':reg,
            'decision_date':d(a.get('Decision_Date_MO')),'decision_due_date':d(a.get('Decision_Due_Date')),
            'final_grant_date':None,'expiry_date':None,
            'further_information_requested_date':d(a.get('Further_Info_Requested')),
            'further_information_received_date':d(a.get('Further_Info_Received')),
            'withdrawal_date':None,'appeal_lodged_date':None,'appeal_decision_date':None,
            'grid_easting':g.get('x') if isinstance(g.get('x'),(int,float)) else None,
            'grid_northing':g.get('y') if isinstance(g.get('y'),(int,float)) else None,
            'source_url':f'https://www.eplanning.ie/KerryCC/AppFileRefDetails/{urllib.parse.quote(ref)}/0',
            'source_api_url':SOURCE
        })
    offset+=len(features)
    print(json.dumps({'phase':'fetch','offset':offset}),flush=True)

if len(rows)!=EXPECTED_RAW_TOTAL:
    raise RuntimeError(f'Expected {EXPECTED_RAW_TOTAL} usable Kerry source rows, got {len(rows)}')
unique={}
for r in rows: unique[r['reference']]=r
rows=list(unique.values())
if len(rows)!=EXPECTED_UNIQUE_TOTAL:
    raise RuntimeError(f'Expected {EXPECTED_UNIQUE_TOTAL} unique Kerry rows, got {len(rows)}')
print(json.dumps({'phase':'prepared','raw_rows':EXPECTED_RAW_TOTAL,'rows':len(rows),'source_duplicates':EXPECTED_RAW_TOTAL-len(rows),'batch_size':BATCH_SIZE}),flush=True)

attempted=inserted=0
for i in range(0,len(rows),BATCH_SIZE):
    batch=rows[i:i+BATCH_SIZE]
    a,n=send(batch); attempted+=a; inserted+=n
    print(json.dumps({'phase':'batch','offset':i,'rows':len(batch),'attempted':a,'inserted':n,'cum_inserted':inserted}),flush=True)
    time.sleep(0.2)
print(json.dumps({'phase':'complete','prepared':len(rows),'attempted':attempted,'inserted':inserted,'deduped':attempted-inserted}),flush=True)
