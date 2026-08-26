create or replace function public.openlist_rebuild_acp_appeal_links_and_events()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_catalog'
as $function$
declare result jsonb;
begin
  create temporary table if not exists openlist_acp_desired_links (
    planning_application_id uuid not null,
    appeal_case_id uuid not null,
    matched_reference text,
    planning_authority text,
    acp_case_number text,
    case_type text,
    primary key (planning_application_id, appeal_case_id)
  ) on commit drop;
  truncate openlist_acp_desired_links;

  create temporary table if not exists openlist_acp_affected_apps (
    application_id uuid primary key
  ) on commit drop;
  truncate openlist_acp_affected_apps;

  with candidate_applications as (
    select p.id,p.local_authority_code,
      upper(regexp_replace(coalesce(p.reference,''),'[^A-Za-z0-9]','','g')) normalized_reference,
      count(*) over (
        partition by p.local_authority_code,
        upper(regexp_replace(coalesce(p.reference,''),'[^A-Za-z0-9]','','g'))
      ) reference_count
    from public.planning_applications p
  ), unique_apps as (
    select id,local_authority_code,normalized_reference
    from candidate_applications
    where reference_count=1 and normalized_reference<>''
  )
  insert into openlist_acp_desired_links(
    planning_application_id,appeal_case_id,matched_reference,planning_authority,acp_case_number,case_type
  )
  select a.id,c.id,c.planning_authority_case_reference,c.planning_authority,c.acp_case_number,c.case_type
  from public.planning_appeal_cases c
  join unique_apps a
    on a.local_authority_code=c.planning_authority_code
   and a.normalized_reference=upper(regexp_replace(coalesce(c.planning_authority_case_reference,''),'[^A-Za-z0-9]','','g'))
  where c.planning_authority_case_reference is not null
    and c.planning_authority_code is not null
    and lower(coalesce(c.case_type,'')) like '%appeal%';

  with removed as (
    delete from public.planning_appeal_links link
    where link.match_method='exact_authority_reference'
      and not exists (
        select 1 from openlist_acp_desired_links desired
        where desired.planning_application_id=link.planning_application_id
          and desired.appeal_case_id=link.appeal_case_id
      )
    returning link.planning_application_id
  )
  insert into openlist_acp_affected_apps(application_id)
  select distinct planning_application_id from removed
  on conflict do nothing;

  with changed as (
    insert into public.planning_appeal_links(
      planning_application_id,appeal_case_id,match_method,confidence,matched_reference,validation_summary
    )
    select desired.planning_application_id,desired.appeal_case_id,
      'exact_authority_reference','high',desired.matched_reference,
      jsonb_build_object(
        'planningAuthority',desired.planning_authority,
        'acpCaseNumber',desired.acp_case_number,
        'caseType',desired.case_type
      )
    from openlist_acp_desired_links desired
    on conflict (planning_application_id,appeal_case_id) do update set
      match_method=excluded.match_method,
      confidence=excluded.confidence,
      matched_reference=excluded.matched_reference,
      validation_summary=excluded.validation_summary,
      matched_at=case
        when row(
          public.planning_appeal_links.match_method,
          public.planning_appeal_links.confidence,
          public.planning_appeal_links.matched_reference,
          public.planning_appeal_links.validation_summary
        ) is distinct from row(
          excluded.match_method,excluded.confidence,excluded.matched_reference,excluded.validation_summary
        ) then now()
        else public.planning_appeal_links.matched_at
      end
    returning planning_application_id
  )
  insert into openlist_acp_affected_apps(application_id)
  select distinct planning_application_id from changed
  on conflict do nothing;

  with changed as (
    insert into public.planning_application_events(
      application_id,event_type,event_date,detected_at,event_source,source_field,
      label,old_value,new_value,raw_source_value,provenance,event_key
    )
    select link.planning_application_id,'appeal_lodged',case_record.received_date,now(),
      'an_coimisiun_pleanala_open_data','LODGEDON','Appeal lodged with An Coimisiún Pleanála',
      null,case_record.acp_case_number,case_record.acp_case_number,'reconstructed',
      'acp:'||case_record.acp_case_number||':lodged'
    from public.planning_appeal_links link
    join public.planning_appeal_cases case_record on case_record.id=link.appeal_case_id
    where link.match_method='exact_authority_reference'
      and case_record.received_date is not null
    on conflict(application_id,event_key) do update set
      event_date=excluded.event_date,
      event_source=excluded.event_source,
      source_field=excluded.source_field,
      label=excluded.label,
      new_value=excluded.new_value,
      raw_source_value=excluded.raw_source_value,
      provenance=excluded.provenance
    where row(
      public.planning_application_events.event_date,
      public.planning_application_events.label,
      public.planning_application_events.new_value,
      public.planning_application_events.raw_source_value
    ) is distinct from row(
      excluded.event_date,excluded.label,excluded.new_value,excluded.raw_source_value
    )
    returning application_id
  )
  insert into openlist_acp_affected_apps(application_id)
  select distinct application_id from changed
  on conflict do nothing;

  with changed as (
    insert into public.planning_application_events(
      application_id,event_type,event_date,detected_at,event_source,source_field,
      label,old_value,new_value,raw_source_value,provenance,event_key
    )
    select link.planning_application_id,'appeal_decided',case_record.decision_date,now(),
      'an_coimisiun_pleanala_open_data','DECIDED_ON',
      case when nullif(trim(case_record.decision),'') is not null
        then 'Appeal decision: '||trim(case_record.decision)
        else 'Appeal decided' end,
      null,nullif(trim(case_record.decision),''),nullif(trim(case_record.decision),''),'reconstructed',
      'acp:'||case_record.acp_case_number||':decided'
    from public.planning_appeal_links link
    join public.planning_appeal_cases case_record on case_record.id=link.appeal_case_id
    where link.match_method='exact_authority_reference'
      and case_record.decision_date is not null
    on conflict(application_id,event_key) do update set
      event_date=excluded.event_date,
      event_source=excluded.event_source,
      source_field=excluded.source_field,
      label=excluded.label,
      new_value=excluded.new_value,
      raw_source_value=excluded.raw_source_value,
      provenance=excluded.provenance
    where row(
      public.planning_application_events.event_date,
      public.planning_application_events.label,
      public.planning_application_events.new_value,
      public.planning_application_events.raw_source_value
    ) is distinct from row(
      excluded.event_date,excluded.label,excluded.new_value,excluded.raw_source_value
    )
    returning application_id
  )
  insert into openlist_acp_affected_apps(application_id)
  select distinct application_id from changed
  on conflict do nothing;

  with removed as (
    delete from public.planning_application_events event
    where event.event_source='an_coimisiun_pleanala_open_data'
      and event.event_type in ('appeal_lodged','appeal_decided')
      and not exists (
        select 1
        from public.planning_appeal_links link
        join public.planning_appeal_cases case_record on case_record.id=link.appeal_case_id
        where link.planning_application_id=event.application_id
          and link.match_method='exact_authority_reference'
          and event.event_key = 'acp:'||case_record.acp_case_number||':'||
            case when event.event_type='appeal_lodged' then 'lodged' else 'decided' end
          and case when event.event_type='appeal_lodged'
            then case_record.received_date is not null
            else case_record.decision_date is not null end
      )
    returning event.application_id
  )
  insert into openlist_acp_affected_apps(application_id)
  select distinct application_id from removed
  on conflict do nothing;

  insert into public.planning_revalidation_queue(application_id,requested_at,updated_at)
  select application_id,now(),now() from openlist_acp_affected_apps
  on conflict(application_id) do update set requested_at=excluded.requested_at,updated_at=excluded.updated_at;

  select jsonb_build_object(
    'cases',(select count(*) from public.planning_appeal_cases),
    'enrichedCases',(select count(*) from public.planning_appeal_cases where planning_authority_case_reference is not null),
    'links',(select count(*) from public.planning_appeal_links),
    'matchedApplications',(select count(distinct planning_application_id) from public.planning_appeal_links),
    'affectedApplications',(select count(*) from openlist_acp_affected_apps),
    'lodgedEvents',(select count(*) from public.planning_application_events where event_source='an_coimisiun_pleanala_open_data' and event_type='appeal_lodged'),
    'decisionEvents',(select count(*) from public.planning_application_events where event_source='an_coimisiun_pleanala_open_data' and event_type='appeal_decided')
  ) into result;
  return result;
end;
$function$;

revoke all on function public.openlist_rebuild_acp_appeal_links_and_events() from public,anon,authenticated;
grant execute on function public.openlist_rebuild_acp_appeal_links_and_events() to service_role;
