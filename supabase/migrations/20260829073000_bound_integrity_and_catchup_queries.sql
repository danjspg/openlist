-- Keep daily assurance queries bounded and index-friendly. A verifier timeout is
-- an observability failure, not evidence that derived data is corrupt.

create index if not exists planning_applications_eplan_gap_progress_idx
  on public.planning_applications (id)
  include (local_authority_code, normalized_status)
  where local_authority_code in (
    'KERRY','MEATH','OFFALY','WATERFORD','CARLOW','CAVAN','CLARE','DONEGAL',
    'GALWAYCOCO','GALWAYCITY','KILDARE','KILKENNY','LAOIS','LEITRIM','LIMERICK',
    'LONGFORD','LOUTH','MAYO','MONAGHAN','ROSCOMMON','SLIGO','TIPPERARY','WESTMEATH','WICKLOW'
  )
    and normalized_status in (
      'pre_validation','registered','under_assessment','further_information_requested',
      'further_information_received','appealed'
    )
    and (
      further_information_requested_date is null
      or (normalized_status = 'further_information_received' and further_information_received_date is null)
      or (normalized_status = 'appealed' and appeal_lodged_date is null)
    );

create index if not exists planning_applications_historical_progress_idx
  on public.planning_applications (registration_date, local_authority_code, last_source_checked_at)
  include (normalized_status, decision_date, appeal_lodged_date)
  where final_grant_date is null and appeal_decision_date is null;

create index if not exists planning_appeal_cases_historical_progress_idx
  on public.planning_appeal_cases (planning_reference_lookup_status)
  include (planning_authority_case_reference)
  where decision_date is not null and source_url is not null;

create index if not exists planning_lifecycle_decided_still_appealed_idx
  on public.planning_applications (id)
  include (local_authority_code, reference, normalized_status, appeal_decision_date)
  where normalized_status = 'appealed' and appeal_decision_date is not null;

create index if not exists planning_lifecycle_date_order_idx
  on public.planning_applications (id)
  include (local_authority_code, reference, normalized_status, appeal_lodged_date, appeal_decision_date)
  where appeal_lodged_date is not null and appeal_decision_date is not null;

create index if not exists planning_appeal_links_exact_high_idx
  on public.planning_appeal_links (planning_application_id, appeal_case_id)
  where match_method = 'exact_authority_reference' and confidence = 'high';

create or replace function public.openlist_planning_snapshot_integrity_facts()
returns table(authority_code text, row_count bigint, latest_registration_date date)
language sql stable security definer
set search_path = public, pg_catalog
set statement_timeout = '15s'
as $$
  with authority as materialized (
    select p.local_authority_code as authority_code, count(*)::bigint as row_count,
      max(p.registration_date)::date as latest_registration_date
    from public.planning_applications p group by p.local_authority_code
  )
  select a.authority_code, a.row_count, a.latest_registration_date from authority a
  union all
  select 'NATIONAL'::text, coalesce(sum(a.row_count), 0)::bigint, max(a.latest_registration_date)::date from authority a;
$$;
revoke all on function public.openlist_planning_snapshot_integrity_facts() from public, anon, authenticated;
grant execute on function public.openlist_planning_snapshot_integrity_facts() to service_role;

create or replace function public.openlist_ppr_snapshot_integrity_facts()
returns jsonb language sql stable security definer
set search_path = public, pg_catalog
set statement_timeout = '15s'
as $$
  select jsonb_build_object('count', count(*)::bigint, 'latestDate', max(date_of_sale)::date) from public.ppr_sales;
$$;
revoke all on function public.openlist_ppr_snapshot_integrity_facts() from public, anon, authenticated;
grant execute on function public.openlist_ppr_snapshot_integrity_facts() to service_role;

create or replace function public.openlist_historical_catchup_progress_part(p_key text)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_catalog
set statement_timeout = '12s'
as $$
declare result jsonb;
begin
  if p_key = 'acpHistoricalAppeals' then
    select jsonb_build_object(
      'total', count(*)::bigint,
      'completed', count(*) filter (where planning_authority_case_reference is not null or planning_reference_lookup_status = 'not_found')::bigint,
      'remaining', count(*) filter (where planning_authority_case_reference is null and planning_reference_lookup_status is null)::bigint,
      'failed', count(*) filter (where planning_reference_lookup_status = 'failed')::bigint
    ) into result
    from public.planning_appeal_cases
    where lower(coalesce(category, '')) like 'appeals%' and decision_date is not null and source_url is not null;
  elsif p_key = 'eplanLifecycle' then
    with completed as materialized (
      select count(*) filter (where outcome <> 'error')::bigint as completed,
        count(*) filter (where outcome = 'error')::bigint as failed
      from public.eplan_lifecycle_catchup_attempts
    ), remaining as materialized (
      select count(*)::bigint as remaining
      from public.planning_applications p
      where p.local_authority_code in (
        'KERRY','MEATH','OFFALY','WATERFORD','CARLOW','CAVAN','CLARE','DONEGAL',
        'GALWAYCOCO','GALWAYCITY','KILDARE','KILKENNY','LAOIS','LEITRIM','LIMERICK',
        'LONGFORD','LOUTH','MAYO','MONAGHAN','ROSCOMMON','SLIGO','TIPPERARY','WESTMEATH','WICKLOW'
      )
        and p.normalized_status in ('pre_validation','registered','under_assessment','further_information_requested','further_information_received','appealed')
        and (p.further_information_requested_date is null
          or (p.normalized_status = 'further_information_received' and p.further_information_received_date is null)
          or (p.normalized_status = 'appealed' and p.appeal_lodged_date is null))
        and not exists (select 1 from public.eplan_lifecycle_catchup_attempts a where a.application_id = p.id and a.outcome <> 'error')
    )
    select jsonb_build_object('total', c.completed + r.remaining, 'completed', c.completed, 'remaining', r.remaining, 'failed', c.failed)
      into result from completed c cross join remaining r;
  elsif p_key = 'historicalPlanningStatusBuckets' then
    with eligible as materialized (
      select p.local_authority_code, date_trunc('month', p.registration_date)::date as period_start, p.last_source_checked_at
      from public.planning_applications p
      where p.registration_date < current_date - 90 and p.final_grant_date is null and p.appeal_decision_date is null
        and not public.openlist_planning_status_is_terminal(p.normalized_status)
        and (p.appeal_lodged_date is not null or p.normalized_status = 'appealed' or p.decision_date is null or p.decision_date >= current_date - 180)
    ), buckets as (
      select local_authority_code, period_start, bool_and(last_source_checked_at is not null) as fully_checked
      from eligible group by local_authority_code, period_start
    )
    select jsonb_build_object('total', count(*)::bigint, 'completed', count(*) filter (where fully_checked)::bigint,
      'remaining', count(*) filter (where not fully_checked)::bigint, 'failed', 0::bigint) into result from buckets;
  else
    raise exception 'Unknown historical catch-up progress key: %', p_key using errcode = '22023';
  end if;
  return coalesce(result, jsonb_build_object('total',0,'completed',0,'remaining',0,'failed',0));
end;
$$;
revoke all on function public.openlist_historical_catchup_progress_part(text) from public, anon, authenticated;
grant execute on function public.openlist_historical_catchup_progress_part(text) to service_role;

create or replace function public.openlist_planning_lifecycle_inconsistencies_for_check(p_check text, p_limit integer default 500)
returns table (severity text, anomaly_type text, application_id uuid, local_authority_code text, reference text,
  normalized_status text, event_date date, detail text)
language plpgsql stable security definer
set search_path = public, pg_catalog
set statement_timeout = '10s'
as $$
begin
  if p_check = 'APPEAL_DECIDED_STILL_APPEALED' then
    return query select 'high'::text, p_check, p.id, p.local_authority_code, p.reference, p.normalized_status,
      p.appeal_decision_date, 'Appeal decision date is present but current status is still appealed.'::text
    from public.planning_applications p
    where p.normalized_status = 'appealed' and p.appeal_decision_date is not null
    order by p.appeal_decision_date desc nulls last, p.id limit greatest(1, least(coalesce(p_limit, 500), 2000));
  elsif p_check = 'APPEAL_DATE_ORDER_ERROR' then
    return query select 'warning'::text, p_check, p.id, p.local_authority_code, p.reference, p.normalized_status,
      p.appeal_decision_date, format('Appeal decision date %s precedes lodged date %s.', p.appeal_decision_date, p.appeal_lodged_date)::text
    from public.planning_applications p
    where p.appeal_lodged_date is not null and p.appeal_decision_date is not null and p.appeal_decision_date < p.appeal_lodged_date
    order by p.appeal_decision_date desc nulls last, p.id limit greatest(1, least(coalesce(p_limit, 500), 2000));
  elsif p_check in ('ACP_DECISION_STATE_MISMATCH', 'ACP_OPEN_STATE_MISMATCH') then
    return query
    with authoritative_acp as materialized (
      select distinct on (l.planning_application_id) l.planning_application_id, c.acp_case_number, c.received_date, c.decision_date,
        nullif(btrim(c.decision), '') as decision
      from public.planning_appeal_links l join public.planning_appeal_cases c on c.id = l.appeal_case_id
      where l.match_method = 'exact_authority_reference' and l.confidence = 'high'
        and lower(coalesce(c.case_type, c.category, '')) like '%appeal%'
      order by l.planning_application_id, c.received_date desc nulls last, c.source_updated_at desc nulls last, c.acp_case_number desc
    )
    select 'high'::text, p_check, p.id, p.local_authority_code, p.reference, p.normalized_status,
      case when p_check = 'ACP_DECISION_STATE_MISMATCH' then a.decision_date else a.received_date end,
      case when p_check = 'ACP_DECISION_STATE_MISMATCH'
        then format('Authoritative ACP appeal %s says decision=%s on %s; OpenList status/date/outcome disagree.', a.acp_case_number, coalesce(a.decision,'(blank)'), a.decision_date)::text
        else format('Authoritative ACP appeal %s is open but OpenList current state/date disagree.', a.acp_case_number)::text end
    from authoritative_acp a join public.planning_applications p on p.id = a.planning_application_id
    where (p_check = 'ACP_DECISION_STATE_MISMATCH' and a.decision_date is not null and
      (p.normalized_status <> 'appeal_decided' or p.appeal_lodged_date is distinct from a.received_date
       or p.appeal_decision_date is distinct from a.decision_date or coalesce(btrim(p.appeal_decision_text),'') is distinct from coalesce(a.decision,'')
       or p.appeal_decision_source is distinct from 'an_coimisiun_pleanala_open_data'))
      or (p_check = 'ACP_OPEN_STATE_MISMATCH' and a.decision_date is null and a.received_date is not null and
      (p.normalized_status <> 'appealed' or p.appeal_lodged_date is distinct from a.received_date
       or p.appeal_lodged_source is distinct from 'an_coimisiun_pleanala_open_data' or p.appeal_decision_date is not null or p.appeal_decision_text is not null))
    order by 7 desc nulls last, p.id limit greatest(1, least(coalesce(p_limit, 500), 2000));
  else
    raise exception 'Unknown lifecycle consistency check: %', p_check using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.openlist_planning_lifecycle_inconsistencies_for_check(text, integer) from public, anon, authenticated;
grant execute on function public.openlist_planning_lifecycle_inconsistencies_for_check(text, integer) to service_role;
