grant select on public.planning_appeal_cases, public.planning_appeal_links to anon, authenticated;
create policy "Public can read planning appeal cases" on public.planning_appeal_cases for select to anon, authenticated using (true);
create policy "Public can read planning appeal links" on public.planning_appeal_links for select to anon, authenticated using (true);

create or replace function public.openlist_rebuild_acp_appeal_links_and_events()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_catalog'
as $function$
declare result jsonb;
begin
  delete from public.planning_appeal_links where match_method = 'exact_authority_reference';

  with candidate_applications as (
    select p.id,p.local_authority_code,
      upper(regexp_replace(coalesce(p.reference,''),'[^A-Za-z0-9]','','g')) normalized_reference,
      count(*) over (partition by p.local_authority_code, upper(regexp_replace(coalesce(p.reference,''),'[^A-Za-z0-9]','','g'))) reference_count
    from public.planning_applications p
  ), unique_apps as (
    select id,local_authority_code,normalized_reference from candidate_applications
    where reference_count=1 and normalized_reference<>''
  )
  insert into public.planning_appeal_links(planning_application_id,appeal_case_id,match_method,confidence,matched_reference,validation_summary)
  select a.id,c.id,'exact_authority_reference','high',c.planning_authority_case_reference,
    jsonb_build_object('planningAuthority',c.planning_authority,'acpCaseNumber',c.acp_case_number,'caseType',c.case_type)
  from public.planning_appeal_cases c
  join unique_apps a on a.local_authority_code=c.planning_authority_code
    and a.normalized_reference=upper(regexp_replace(coalesce(c.planning_authority_case_reference,''),'[^A-Za-z0-9]','','g'))
  where c.planning_authority_case_reference is not null and c.planning_authority_code is not null
    and lower(coalesce(c.case_type,'')) like '%appeal%'
  on conflict (planning_application_id,appeal_case_id) do update set
    match_method=excluded.match_method,confidence=excluded.confidence,matched_reference=excluded.matched_reference,
    validation_summary=excluded.validation_summary,matched_at=now();

  insert into public.planning_application_events(application_id,event_type,event_date,detected_at,event_source,source_field,label,old_value,new_value,raw_source_value,provenance,event_key)
  select l.planning_application_id,'appeal_lodged',c.received_date,now(),'an_coimisiun_pleanala_open_data','LODGEDON',
    'Appeal lodged with An Coimisiún Pleanála',null,c.acp_case_number,c.acp_case_number,'reconstructed',
    'acp:'||c.acp_case_number||':lodged:'||c.received_date::text
  from public.planning_appeal_links l join public.planning_appeal_cases c on c.id=l.appeal_case_id
  where c.received_date is not null
  on conflict(application_id,event_key) do update set label=excluded.label,new_value=excluded.new_value,raw_source_value=excluded.raw_source_value;

  insert into public.planning_application_events(application_id,event_type,event_date,detected_at,event_source,source_field,label,old_value,new_value,raw_source_value,provenance,event_key)
  select l.planning_application_id,'appeal_decided',c.decision_date,now(),'an_coimisiun_pleanala_open_data','DECIDED_ON',
    case when nullif(trim(c.decision),'') is not null then 'Appeal decision: '||trim(c.decision) else 'Appeal decided' end,
    null,nullif(trim(c.decision),''),nullif(trim(c.decision),''),'reconstructed',
    'acp:'||c.acp_case_number||':decided:'||c.decision_date::text
  from public.planning_appeal_links l join public.planning_appeal_cases c on c.id=l.appeal_case_id
  where c.decision_date is not null
  on conflict(application_id,event_key) do update set label=excluded.label,new_value=excluded.new_value,raw_source_value=excluded.raw_source_value;

  insert into public.planning_revalidation_queue(application_id,requested_at,updated_at)
  select distinct planning_application_id,now(),now() from public.planning_appeal_links
  on conflict(application_id) do update set requested_at=excluded.requested_at,updated_at=excluded.updated_at;

  select jsonb_build_object(
    'cases',(select count(*) from public.planning_appeal_cases),
    'enrichedCases',(select count(*) from public.planning_appeal_cases where planning_authority_case_reference is not null),
    'links',(select count(*) from public.planning_appeal_links),
    'matchedApplications',(select count(distinct planning_application_id) from public.planning_appeal_links),
    'lodgedEvents',(select count(*) from public.planning_application_events where event_source='an_coimisiun_pleanala_open_data' and event_type='appeal_lodged'),
    'decisionEvents',(select count(*) from public.planning_application_events where event_source='an_coimisiun_pleanala_open_data' and event_type='appeal_decided')
  ) into result;
  return result;
end;
$function$;
