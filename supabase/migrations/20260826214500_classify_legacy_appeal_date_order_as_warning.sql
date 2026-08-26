create or replace function public.openlist_planning_lifecycle_inconsistencies()
returns table (
  severity text,
  anomaly_type text,
  application_id uuid,
  local_authority_code text,
  reference text,
  normalized_status text,
  event_date date,
  detail text
)
language sql
stable
as $$
  with authoritative_acp as (
    select distinct on (l.planning_application_id)
      l.planning_application_id,
      c.id as appeal_case_id,
      c.acp_case_number,
      c.received_date,
      c.decision_date,
      nullif(btrim(c.decision), '') as decision
    from public.planning_appeal_links l
    join public.planning_appeal_cases c on c.id = l.appeal_case_id
    where l.match_method = 'exact_authority_reference'
      and l.confidence = 'high'
      and lower(coalesce(c.case_type, c.category, '')) like '%appeal%'
    order by l.planning_application_id,
      c.received_date desc nulls last,
      c.source_updated_at desc nulls last,
      c.acp_case_number desc
  )
  select 'high'::text,'APPEAL_DECIDED_STILL_APPEALED'::text,p.id,p.local_authority_code,p.reference,p.normalized_status,p.appeal_decision_date,'Appeal decision date is present but current status is still appealed.'::text
  from public.planning_applications p
  where p.normalized_status='appealed' and p.appeal_decision_date is not null

  union all
  select 'warning'::text,'APPEAL_DATE_ORDER_ERROR'::text,p.id,p.local_authority_code,p.reference,p.normalized_status,p.appeal_decision_date,format('Appeal decision date %s precedes lodged date %s.',p.appeal_decision_date,p.appeal_lodged_date)::text
  from public.planning_applications p
  where p.appeal_lodged_date is not null and p.appeal_decision_date is not null and p.appeal_decision_date < p.appeal_lodged_date

  union all
  select 'high'::text,'ACP_DECISION_STATE_MISMATCH'::text,p.id,p.local_authority_code,p.reference,p.normalized_status,a.decision_date,format('Authoritative ACP appeal %s says decision=%s on %s; OpenList status/date/outcome disagree.',a.acp_case_number,coalesce(a.decision,'(blank)'),a.decision_date)::text
  from authoritative_acp a join public.planning_applications p on p.id=a.planning_application_id
  where a.decision_date is not null and (p.normalized_status<>'appeal_decided' or p.appeal_lodged_date is distinct from a.received_date or p.appeal_decision_date is distinct from a.decision_date or coalesce(btrim(p.appeal_decision_text),'') is distinct from coalesce(a.decision,'') or p.appeal_decision_source is distinct from 'an_coimisiun_pleanala_open_data')

  union all
  select 'high'::text,'ACP_OPEN_STATE_MISMATCH'::text,p.id,p.local_authority_code,p.reference,p.normalized_status,a.received_date,format('Authoritative ACP appeal %s is open but OpenList current state/date disagree.',a.acp_case_number)::text
  from authoritative_acp a join public.planning_applications p on p.id=a.planning_application_id
  where a.decision_date is null and a.received_date is not null and (p.normalized_status<>'appealed' or p.appeal_lodged_date is distinct from a.received_date or p.appeal_lodged_source is distinct from 'an_coimisiun_pleanala_open_data' or p.appeal_decision_date is not null or p.appeal_decision_text is not null);
$$;

grant execute on function public.openlist_planning_lifecycle_inconsistencies() to service_role;
