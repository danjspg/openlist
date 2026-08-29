create or replace function public.openlist_requeue_matchable_unlinked_acp_cases(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path to 'public','pg_catalog'
set statement_timeout to '60s'
as $$
declare
  bounded_limit integer := greatest(1, least(coalesce(p_limit, 500), 2000));
  requeued integer := 0;
begin
  with exact_candidates as (
    select
      c.id as appeal_case_id,
      (array_agg(p.id order by p.id))[1] as application_id,
      count(*) as application_count
    from public.planning_appeal_cases c
    join public.planning_applications p
      on p.local_authority_code = c.planning_authority_code
     and upper(regexp_replace(coalesce(p.reference, ''), '[^A-Za-z0-9]', '', 'g')) =
         upper(regexp_replace(coalesce(c.planning_authority_case_reference, ''), '[^A-Za-z0-9]', '', 'g'))
    where c.planning_authority_case_reference is not null
      and c.planning_authority_code is not null
      and lower(coalesce(c.case_type, c.category, '')) like '%appeal%'
      and not exists (
        select 1
        from public.planning_appeal_links l
        where l.appeal_case_id = c.id
          and l.match_method = 'exact_authority_reference'
      )
    group by c.id
    having count(*) = 1
    order by max(c.decision_date) desc nulls last, c.id
    limit bounded_limit
  ),
  requeued_rows as (
    insert into public.planning_appeal_processing_queue(
      appeal_case_id, status, attempt_count, requested_at, next_attempt_at,
      started_at, completed_at, last_error, updated_at
    )
    select appeal_case_id, 'pending', 0, now(), now(), null, null, null, now()
    from exact_candidates
    on conflict(appeal_case_id) do update
    set status = 'pending',
        attempt_count = 0,
        requested_at = excluded.requested_at,
        next_attempt_at = excluded.next_attempt_at,
        started_at = null,
        completed_at = null,
        last_error = null,
        updated_at = excluded.updated_at
    returning 1
  )
  select count(*) into requeued from requeued_rows;

  return requeued;
end;
$$;

grant execute on function public.openlist_requeue_matchable_unlinked_acp_cases(integer) to service_role;

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
  ),
  unlinked_exact_decisions as (
    select
      (array_agg(p.id order by p.id))[1] as application_id,
      c.acp_case_number,
      c.decision_date,
      nullif(btrim(c.decision), '') as decision,
      count(*) as application_count
    from public.planning_appeal_cases c
    join public.planning_applications p
      on p.local_authority_code = c.planning_authority_code
     and upper(regexp_replace(coalesce(p.reference, ''), '[^A-Za-z0-9]', '', 'g')) =
         upper(regexp_replace(coalesce(c.planning_authority_case_reference, ''), '[^A-Za-z0-9]', '', 'g'))
    where c.decision_date is not null
      and nullif(btrim(c.decision), '') is not null
      and lower(coalesce(c.case_type, c.category, '')) like '%appeal%'
      and not exists (
        select 1 from public.planning_appeal_links l
        where l.appeal_case_id = c.id
          and l.match_method = 'exact_authority_reference'
      )
    group by c.id, c.acp_case_number, c.decision_date, c.decision
    having count(*) = 1
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
  where a.decision_date is null and a.received_date is not null and (p.normalized_status<>'appealed' or p.appeal_lodged_date is distinct from a.received_date or p.appeal_lodged_source is distinct from 'an_coimisiun_pleanala_open_data' or p.appeal_decision_date is not null or p.appeal_decision_text is not null)

  union all
  select 'high'::text,'UNLINKED_ACP_DECISION_AVAILABLE'::text,p.id,p.local_authority_code,p.reference,p.normalized_status,u.decision_date,format('Exact authoritative ACP appeal %s has decision=%s on %s but is not linked to this application.',u.acp_case_number,u.decision,u.decision_date)::text
  from unlinked_exact_decisions u
  join public.planning_applications p on p.id=u.application_id
  where nullif(btrim(p.appeal_decision_text), '') is null;
$$;

grant execute on function public.openlist_planning_lifecycle_inconsistencies() to service_role;
