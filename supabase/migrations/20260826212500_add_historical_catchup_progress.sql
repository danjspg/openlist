create or replace function public.openlist_historical_catchup_progress()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
set statement_timeout = '20s'
as $$
with
acp as (
  select
    count(*)::bigint as total,
    count(*) filter (where planning_authority_case_reference is not null or planning_reference_lookup_status = 'not_found')::bigint as completed,
    count(*) filter (where planning_authority_case_reference is null and planning_reference_lookup_status is null)::bigint as remaining,
    count(*) filter (where planning_reference_lookup_status = 'failed')::bigint as failed
  from public.planning_appeal_cases
  where category ilike 'Appeals%'
    and decision_date is not null
    and source_url is not null
),
eplan_current as (
  select p.id
  from public.planning_applications p
  where p.local_authority_code in (
    'KERRY','MEATH','OFFALY','WATERFORD','CARLOW','CAVAN','CLARE','DONEGAL',
    'GALWAYCOCO','GALWAYCITY','KILDARE','KILKENNY','LAOIS','LEITRIM','LIMERICK',
    'LONGFORD','LOUTH','MAYO','MONAGHAN','ROSCOMMON','SLIGO','TIPPERARY','WESTMEATH','WICKLOW'
  )
    and p.normalized_status in (
      'pre_validation','registered','under_assessment','further_information_requested',
      'further_information_received','appealed'
    )
    and (
      p.further_information_requested_date is null
      or (p.normalized_status = 'further_information_received' and p.further_information_received_date is null)
      or (p.normalized_status = 'appealed' and p.appeal_lodged_date is null)
    )
),
eplan as (
  select
    ((select count(*) from eplan_current c where not exists (
      select 1 from public.eplan_lifecycle_catchup_attempts a
      where a.application_id=c.id and a.outcome <> 'error'
    )) + (select count(*) from public.eplan_lifecycle_catchup_attempts where outcome <> 'error'))::bigint as total,
    (select count(*) from public.eplan_lifecycle_catchup_attempts where outcome <> 'error')::bigint as completed,
    (select count(*) from eplan_current c where not exists (
      select 1 from public.eplan_lifecycle_catchup_attempts a
      where a.application_id=c.id and a.outcome <> 'error'
    ))::bigint as remaining,
    (select count(*) from public.eplan_lifecycle_catchup_attempts where outcome = 'error')::bigint as failed
),
hist_rows as (
  select p.local_authority_code,date_trunc('month',p.registration_date)::date as period_start,p.last_source_checked_at
  from public.planning_applications p
  where p.registration_date < current_date - 90
    and p.final_grant_date is null
    and p.appeal_decision_date is null
    and not public.openlist_planning_status_is_terminal(p.normalized_status)
    and (
      p.appeal_lodged_date is not null
      or p.normalized_status = 'appealed'
      or p.decision_date is null
      or p.decision_date >= current_date - 180
    )
),
hist_buckets as (
  select local_authority_code,period_start,bool_and(last_source_checked_at is not null) as fully_checked
  from hist_rows group by 1,2
),
hist as (
  select count(*)::bigint as total,
    count(*) filter(where fully_checked)::bigint as completed,
    count(*) filter(where not fully_checked)::bigint as remaining,
    0::bigint as failed
  from hist_buckets
)
select jsonb_build_object(
  'generatedAt', now(),
  'acpHistoricalAppeals', (select to_jsonb(acp) from acp),
  'eplanLifecycle', (select to_jsonb(eplan) from eplan),
  'historicalPlanningStatusBuckets', (select to_jsonb(hist) from hist)
);
$$;
revoke all on function public.openlist_historical_catchup_progress() from public, anon, authenticated;
grant execute on function public.openlist_historical_catchup_progress() to service_role;
