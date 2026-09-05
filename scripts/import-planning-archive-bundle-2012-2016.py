import json, os, subprocess, time, urllib.request
from datetime import datetime, timezone

SUPABASE_URL = os.environ['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
SERVICE_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
BATCH_SIZE = int(os.environ.get('BATCH_SIZE', '250'))
MIN_BATCH_SIZE = int(os.environ.get('MIN_BATCH_SIZE', '25'))
RAW_PATH = '.tmp/planning-archive-candidates-2012-2016.ndjson'
TARGET_CODES = {
    'DONEGAL','MEATH','CARLOW','CAVAN','CORKCITY','LAOIS','LOUTH',
    'MONAGHAN','OFFALY','WESTMEATH','WICKLOW'
}
AUTHORITY_NAMES = {
    'DONEGAL':'Donegal County Council','MEATH':'Meath County Council','CARLOW':'Carlow County Council',
    'CAVAN':'Cavan County Council','CORKCITY':'Cork City Council','LAOIS':'Laois County Council',
    'LOUTH':'Louth County Council','MONAGHAN':'Monaghan County Council','OFFALY':'Offaly County Council',
    'WESTMEATH':'Westmeath County Council','WICKLOW':'Wicklow County Council'
}


def clean(v):
    if v is None:
        return None
    s = str(v).strip()
    if not s or s.lower() in {'n/a','n\\a','na','null','none','undefined','-'}:
        return None
    return s


def date_value(v):
    if v in (None, ''):
        return None
    if isinstance(v, (int, float)):
        try:
            d = datetime.fromtimestamp(v / 1000.0, tz=timezone.utc).date()
            if d.year <= 1900:
                return None
            return d.isoformat()
        except Exception:
            return None
    s = clean(v)
    if not s:
        return None
    for fmt in ('%d/%m/%Y','%d-%m-%Y','%Y-%m-%d','%d-%b-%Y','%d %b %Y'):
        try:
            d = datetime.strptime(s, fmt).date()
            return None if d.year <= 1900 else d.isoformat()
        except ValueError:
            pass
    return None


def join_parts(*vals):
    return ', '.join([clean(v) for v in vals if clean(v)]) or None


def geom_xy(g):
    if not g:
        return (None, None)
    if isinstance(g.get('x'), (int,float)) and isinstance(g.get('y'), (int,float)):
        return (g['x'], g['y'])
    pts = g.get('points')
    if pts:
        xs = [p[0] for p in pts if len(p) >= 2]
        ys = [p[1] for p in pts if len(p) >= 2]
    else:
        rings = g.get('rings') or []
        flat = [p for ring in rings for p in ring if len(p) >= 2]
        xs = [p[0] for p in flat]
        ys = [p[1] for p in flat]
    if not xs or not ys:
        return (None, None)
    return ((min(xs)+max(xs))/2.0, (min(ys)+max(ys))/2.0)


def pick(a, *names):
    for n in names:
        if n in a and clean(a.get(n)) is not None:
            return a.get(n)
    return None


def map_row(o):
    code = o['source']['code']
    if code not in TARGET_CODES:
        return None
    a = o['feature']['attributes']
    g = o['feature'].get('geometry') or {}
    gx, gy = geom_xy(g)

    if code == 'DONEGAL':
        ref=pick(a,'FILE_NUMBE'); reg=date_value(a.get('received_d')); decision_date=date_value(a.get('decision_d'))
        proposal=pick(a,'developmen','decision00'); location=pick(a,'location_k'); applicant=pick(a,'ApplicName')
        status=pick(a,'Applicatio','DEC_CODE'); decision=pick(a,'decision_c','DEC_CODE'); app_type=None
        source_id=a.get('FID'); source_url=pick(a,'ePlanLink')
        fi_req=fi_rec=due=grant=expiry=withdrawn=appeal_lodged=appeal_decision=None
    elif code == 'MEATH':
        ref=pick(a,'PlanningReference'); reg=date_value(a.get('RecievedDate')); decision_date=date_value(a.get('DecisionDate'))
        proposal=pick(a,'DevelopmentDescription'); location=join_parts(a.get('Address_Line1'),a.get('Address_Line2'),a.get('Address_Line3'))
        applicant=pick(a,'Applicant'); status=pick(a,'ApplicationStatus'); decision=pick(a,'Decision'); app_type=None
        source_id=a.get('OBJECTID'); source_url=pick(a,'LinktoePlan','LinktoScannedDocuments')
        fi_req=fi_rec=due=grant=expiry=withdrawn=appeal_lodged=appeal_decision=None
    elif code in {'CARLOW','LAOIS'}:
        ref=pick(a,'FileNumber'); reg=date_value(a.get('ReceivedDate')); decision_date=None
        proposal=location=applicant=status=decision=None; app_type=pick(a,'ApplicationType')
        source_id=a.get('OBJECTID'); source_url=None
        fi_req=fi_rec=due=grant=expiry=withdrawn=appeal_lodged=appeal_decision=None
    elif code in {'CAVAN','MONAGHAN'}:
        ref=pick(a,'ApplicationNumber'); reg=date_value(a.get('ReceivedDate')); decision_date=date_value(a.get('DecisionDate'))
        proposal=pick(a,'DevelopmentDescription'); location=pick(a,'DevelopmentAddress'); applicant=pick(a,'ApplicantName')
        status=pick(a,'ApplicationStatus'); decision=pick(a,'Decision'); app_type=pick(a,'ApplicationType')
        source_id=a.get('OBJECTID'); source_url=pick(a,'LinkAppDetails','LinkAppScanDetails')
        fi_req=date_value(a.get('FIRequestDate')); fi_rec=date_value(a.get('FIRecDate')); due=date_value(a.get('DecisionDueDate'))
        grant=date_value(a.get('GrantDate')); expiry=date_value(a.get('ExpiryDate')); withdrawn=date_value(a.get('WithdrawnDate'))
        appeal_lodged=date_value(a.get('AppealSubmittedDate')); appeal_decision=date_value(a.get('AppealDecisionDate'))
        gx = a.get('ITMEasting') if isinstance(a.get('ITMEasting'),(int,float)) else gx
        gy = a.get('ITMNorthing') if isinstance(a.get('ITMNorthing'),(int,float)) else gy
    elif code == 'CORKCITY':
        ref=pick(a,'PlanningApReference'); reg=date_value(a.get('DateReceiptAp')); decision_date=date_value(a.get('DecisonDate'))
        proposal=pick(a,'DevDescription'); location=pick(a,'DevelopmentAddress'); applicant=pick(a,'ApplicantName')
        status=pick(a,'ApplicationStatus'); decision=pick(a,'Decision'); app_type=pick(a,'ApplicationType')
        source_id=a.get('OBJECTID'); source_url=pick(a,'LinkAppDetails','LinkDocs')
        fi_req=date_value(a.get('FIRequestDate')); fi_rec=date_value(a.get('FIReceivedDate')); due=date_value(a.get('DecisionDueDate'))
        grant=date_value(a.get('GrantDate')); expiry=date_value(a.get('ExpiryDate')); withdrawn=date_value(a.get('WithdrawnDate'))
        appeal_lodged=date_value(a.get('DateAppealSubmitted')); appeal_decision=date_value(a.get('DateAppealDecision'))
    elif code == 'LOUTH':
        ref=pick(a,'FileRef'); reg=date_value(a.get('RedDate')); decision_date=date_value(a.get('Dec_date'))
        proposal=pick(a,'DevDesc'); location=pick(a,'AllDevAdd','Loc'); applicant=pick(a,'AppName')
        status=pick(a,'AppStatus'); decision=pick(a,'Decision'); app_type=None
        source_id=a.get('OBJECTID'); source_url=None
        fi_req=fi_rec=due=grant=expiry=withdrawn=appeal_lodged=appeal_decision=None
    elif code == 'OFFALY':
        ref=pick(a,'ApplicationNumber'); reg=date_value(a.get('ReceivedDate')); decision_date=date_value(a.get('DecisionDate'))
        proposal=pick(a,'Description'); location=pick(a,'Location'); applicant=pick(a,'ApplicantName')
        status=pick(a,'ApplicationStatus'); decision=pick(a,'Decision'); app_type=pick(a,'ApplicationType')
        source_id=a.get('OBJECTID'); source_url=pick(a,'LinkAppDetails','LinkDocs')
        fi_req=fi_rec=None; due=date_value(a.get('DecisionDueDate')); grant=date_value(a.get('GrantDate')); expiry=date_value(a.get('ExpiryDate'))
        withdrawn=date_value(a.get('WithdrawnDate')); appeal_lodged=date_value(a.get('AppealSubmittedDate')); appeal_decision=date_value(a.get('AppealDecisionDate'))
        gx = a.get('ITMEasting') if isinstance(a.get('ITMEasting'),(int,float)) else gx
        gy = a.get('ITMNorthing') if isinstance(a.get('ITMNorthing'),(int,float)) else gy
    elif code == 'WESTMEATH':
        ref=pick(a,'RefNo'); reg=date_value(a.get('RecievedDate')); decision_date=date_value(a.get('DecisionDate'))
        proposal=pick(a,'DevDescription'); location=join_parts(a.get('Address1'),a.get('Address2')); applicant=None
        status=pick(a,'Status'); decision=pick(a,'Decision'); app_type=pick(a,'ApplicationType')
        source_id=a.get('OBJECTID'); source_url=pick(a,'MoreInfo')
        fi_req=fi_rec=None; due=date_value(a.get('DecisionDue')); grant=date_value(a.get('GrantDate')); expiry=withdrawn=appeal_lodged=appeal_decision=None
    elif code == 'WICKLOW':
        ref=pick(a,'file_number'); reg=date_value(a.get('received_date')); decision_date=date_value(a.get('decision_date'))
        proposal=pick(a,'development_descri'); location=join_parts(a.get('dev_address_line1'),a.get('dev_address_line2'),a.get('dev_address_line3'))
        applicant=join_parts(a.get('forename'),a.get('surname')); status=pick(a,'status_desc','STATUS'); decision=pick(a,'decision','STATUS')
        app_type=pick(a,'ApplicationType'); source_id=a.get('OBJECTID'); source_url=pick(a,'Link2ePlan')
        fi_req=fi_rec=due=grant=expiry=None; withdrawn=date_value(a.get('withdrawn_date')); appeal_lodged=date_value(a.get('abp_notification_date')); appeal_decision=None
    else:
        return None

    if not ref or not reg:
        return None
    return {
        'local_authority': AUTHORITY_NAMES[code], 'local_authority_code': code,
        'source_application_id': source_id if isinstance(source_id, int) else None,
        'reference': str(ref).strip(), 'web_reference': str(ref).strip(), 'application_type': clean(app_type),
        'proposal': clean(proposal), 'location': clean(location), 'eircode': None, 'eircode_prefix': None,
        'applicant_name': clean(applicant), 'status': clean(status), 'decision_text': clean(decision),
        'registration_date': reg, 'decision_date': decision_date, 'decision_due_date': due,
        'final_grant_date': grant, 'expiry_date': expiry, 'further_information_requested_date': fi_req,
        'further_information_received_date': fi_rec, 'withdrawal_date': withdrawn,
        'appeal_lodged_date': appeal_lodged, 'appeal_decision_date': appeal_decision,
        'grid_easting': gx, 'grid_northing': gy, 'source_url': source_url,
        'source_api_url': o['source']['base']
    }


def rpc_once(rows):
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/rpc/openlist_import_historical_planning_payload',
        data=json.dumps({'p_rows': rows}).encode(),
        headers={'apikey':SERVICE_KEY,'Authorization':f'Bearer {SERVICE_KEY}','Content-Type':'application/json','Accept':'application/json'},
        method='POST')
    with urllib.request.urlopen(req, timeout=120) as resp:
        body=json.loads(resp.read().decode())
    return int(body[0]['attempted']), int(body[0]['inserted'])


def send(rows, depth=0):
    for attempt in range(1,4):
        try:
            return rpc_once(rows)
        except Exception as exc:
            print(json.dumps({'phase':'retry','rows':len(rows),'attempt':attempt,'error':str(exc)[:240]}), flush=True)
            time.sleep(attempt*2)
    if len(rows) <= MIN_BATCH_SIZE:
        raise RuntimeError(f'RPC failed at minimum batch size {len(rows)}')
    mid=len(rows)//2
    print(json.dumps({'phase':'split','rows':len(rows),'left':mid,'right':len(rows)-mid}), flush=True)
    a1,i1=send(rows[:mid],depth+1); a2,i2=send(rows[mid:],depth+1)
    return a1+a2,i1+i2


os.makedirs('.tmp', exist_ok=True)
subprocess.run(['node','scripts/acquire-planning-archive-candidates-2012-2016.mjs',RAW_PATH], check=True)
rows=[]; by_code={}
with open(RAW_PATH, encoding='utf-8') as f:
    for line in f:
        o=json.loads(line); r=map_row(o)
        if r:
            rows.append(r); by_code[r['local_authority_code']]=by_code.get(r['local_authority_code'],0)+1

seen=set(); dedup=[]
for r in rows:
    k=(r['local_authority_code'],r['reference'])
    if k in seen: continue
    seen.add(k); dedup.append(r)
rows=dedup
print(json.dumps({'phase':'prepared','rows':len(rows),'by_code':by_code,'batch_size':BATCH_SIZE}), flush=True)

attempted=inserted=0
for i in range(0,len(rows),BATCH_SIZE):
    batch=rows[i:i+BATCH_SIZE]
    a,n=send(batch); attempted+=a; inserted+=n
    print(json.dumps({'phase':'batch','offset':i,'rows':len(batch),'attempted':a,'inserted':n,'cum_inserted':inserted}), flush=True)
    time.sleep(0.2)
print(json.dumps({'phase':'complete','prepared':len(rows),'attempted':attempted,'inserted':inserted,'deduped':attempted-inserted}), flush=True)
