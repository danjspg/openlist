import { createReadStream } from "node:fs"
import { createInterface } from "node:readline"
import { createClient } from "@supabase/supabase-js"

const AUTHORITY_CODES = new Map([
  ["Cork County Council","CORKCOCO"],["Cork City Council","CORKCITY"],["Dublin City Council","DUBLINCITY"],
  ["Fingal County Council","FINGAL"],["South Dublin County Council","SOUTHDUBLIN"],["Dun Laoghaire Rathdown County Council","DLR"],
  ["Kildare County Council","KILDARE"],["Galway County Council","GALWAYCOCO"],["Galway City Council","GALWAYCITY"],
  ["Meath County Council","MEATH"],["Wicklow County Council","WICKLOW"],["Limerick County Council","LIMERICK"],
  ["Waterford City and County Council","WATERFORD"],["Donegal County Council","DONEGAL"],["Wexford County Council","WEXFORD"],
  ["Tipperary County Council","TIPPERARY"],["Kerry County Council","KERRY"],["Mayo County Council","MAYO"],
  ["Clare County Council","CLARE"],["Louth County Council","LOUTH"],["Laois County Council","LAOIS"],
  ["Kilkenny County Council","KILKENNY"],["Offaly County Council","OFFALY"],["Cavan County Council","CAVAN"],
  ["Roscommon County Council","ROSCOMMON"],["Westmeath County Council","WESTMEATH"],["Monaghan County Council","MONAGHAN"],
  ["Sligo County Council","SLIGO"],["Carlow County Council","CARLOW"],["Longford County Council","LONGFORD"],["Leitrim County Council","LEITRIM"]
])

function args(argv) {
  const o={input:"national-planning-coordinates.ndjson",mode:"stage",stageBatch:5000,processBatch:10000,delayMs:250,maxRows:null}
  for(let i=0;i<argv.length;i++){
    const a=argv[i]
    if(a==="--input") o.input=argv[++i]
    else if(a==="--mode") o.mode=argv[++i]
    else if(a==="--stage-batch") o.stageBatch=Number(argv[++i])
    else if(a==="--process-batch") o.processBatch=Number(argv[++i])
    else if(a==="--delay-ms") o.delayMs=Number(argv[++i])
    else if(a==="--max-rows") o.maxRows=Number(argv[++i])
    else throw new Error(`Unknown argument: ${a}`)
  }
  if(!["stage","process","stage-and-test","status"].includes(o.mode)) throw new Error("invalid --mode")
  if(!Number.isInteger(o.stageBatch)||o.stageBatch<1||o.stageBatch>5000) throw new Error("--stage-batch 1..5000")
  if(!Number.isInteger(o.processBatch)||o.processBatch<1||o.processBatch>50000) throw new Error("--process-batch 1..50000")
  return o
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
function normalise(raw){
  const code=AUTHORITY_CODES.get(String(raw.authority||"").trim())
  const reference=String(raw.reference||"").trim(), e=Number(raw.easting), n=Number(raw.northing)
  return code&&reference&&Number.isFinite(e)&&Number.isFinite(n)?{local_authority_code:code,reference,grid_easting:e,grid_northing:n}:null
}
async function rpc(s,name,p){const {data,error}=await s.rpc(name,p);if(error)throw error;return data}
async function stage(s,o){
  const input=createInterface({input:createReadStream(o.input,{encoding:"utf8"}),crlfDelay:Infinity})
  let batch=[],accepted=0,invalid=0,staged=0
  const flush=async()=>{if(!batch.length)return;const r=await rpc(s,"openlist_stage_planning_coordinates",{p_rows:batch});staged+=Number(r?.staged||0);console.log(`stage accepted=${accepted} staged=${staged} invalid=${invalid}`);batch=[]}
  for await(const line of input){if(!line.trim())continue;const row=normalise(JSON.parse(line));if(!row){invalid++;continue}accepted++;batch.push(row);if(batch.length>=o.stageBatch)await flush();if(o.maxRows&&accepted>=o.maxRows)break}
  await flush();return {accepted,invalid,staged}
}
async function status(s){
  const sidecar=await rpc(s,"openlist_planning_location_sidecar_status",{})
  console.log(JSON.stringify(sidecar))
  return sidecar
}
async function processRows(s,o,maxRows=o.maxRows){
  let total=0
  while(!maxRows||total<maxRows){
    const limit=Math.min(o.processBatch,maxRows?maxRows-total:o.processBatch)
    const started=Date.now()
    const r=await rpc(s,"openlist_fill_planning_location_sidecar",{p_limit:limit})
    const inserted=Number(r?.inserted||0)
    total+=inserted
    console.log(`sidecar inserted=${inserted} total=${total} batch_ms=${Date.now()-started}`)
    if(!inserted)break
    if(o.delayMs)await sleep(o.delayMs)
  }
  return total
}
async function main(){
  const o=args(process.argv.slice(2)),url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY
  if(!url||!key)throw new Error("Missing Supabase credentials")
  const s=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
  if(o.mode==="stage"){await stage(s,o);await status(s)}
  else if(o.mode==="status") await status(s)
  else if(o.mode==="process"){await processRows(s,o);await status(s)}
  else {await stage(s,o);await status(s);console.log("Running bounded 10,000-row sidecar test");await processRows(s,{...o,processBatch:10000,maxRows:10000},10000);await status(s)}
}
main().catch(e=>{console.error(e);process.exitCode=1})
