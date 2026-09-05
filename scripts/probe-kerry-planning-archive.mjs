const ROOT='https://services2.arcgis.com/FQ08czOaoVds3IE4/arcgis/rest/services/planningeweb/FeatureServer'

async function get(url){
  const r=await fetch(url,{headers:{'User-Agent':'OpenList Kerry archive probe'}})
  const j=await r.json()
  if(!r.ok||j.error) throw new Error(JSON.stringify(j.error||j))
  return j
}

const svc=await get(`${ROOT}?f=json`)
console.log(JSON.stringify({phase:'service',layers:svc.layers,tables:svc.tables,relationships:svc.relationships}))
for(const item of [...(svc.layers||[]),...(svc.tables||[])]){
  const meta=await get(`${ROOT}/${item.id}?f=json`)
  console.log(JSON.stringify({phase:'meta',id:item.id,name:item.name,geometryType:meta.geometryType,objectIdField:meta.objectIdField,fields:(meta.fields||[]).map(f=>`${f.name}:${f.type}`),relationships:meta.relationships}))
  const q=new URL(`${ROOT}/${item.id}/query`)
  q.searchParams.set('where',item.id===0?"Date_Received >= DATE '2012-01-01' AND Date_Received < DATE '2013-01-01'":'1=1')
  q.searchParams.set('outFields','*')
  q.searchParams.set('returnGeometry','true')
  q.searchParams.set('resultRecordCount','3')
  q.searchParams.set('f','json')
  try{
    const sample=await get(q)
    console.log(JSON.stringify({phase:'sample',id:item.id,name:item.name,features:sample.features||[]}))
  }catch(e){console.log(JSON.stringify({phase:'sample_error',id:item.id,name:item.name,error:String(e.message||e)}))}
}
