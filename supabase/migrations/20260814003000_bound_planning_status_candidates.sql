-- Split conservative historical rechecks into two static partial-index shapes.
-- Each stream is capped before authority-month grouping, so routine polling
-- never needs to scan or materialize the complete historical population.
create index if not exists planning_applications_unresolved_recheck_idx
  on public.planning_applications (
    last_source_checked_at asc nulls first,
    registration_date,
    local_authority_code
  )
  where final_grant_date is null
    and appeal_decision_date is null
    and (appeal_lodged_date is not null or decision_date is null);

create index if not exists planning_applications_recent_decision_recheck_idx
  on public.planning_applications (
    last_source_checked_at asc nulls first,
    decision_date desc,
    registration_date,
    local_authority_code
  )
  where final_grant_date is null
    and appeal_decision_date is null
    and appeal_lodged_date is null
    and decision_date is not null;

drop index if exists public.planning_applications_status_recheck_idx;

create or replace function public.openlist_planning_status_refresh_buckets(
  p_bucket_limit int default 12
)
returns table (
  local_authority_code text,
  period_start date,
  period_end date,
  candidate_count bigint,
  least_recently_checked_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_catalog
set statement_timeout = '15s'
as $$
  with unresolved_candidates as materialized (
    select
      p.local_authority_code,
      date_trunc('month', p.registration_date)::date as period_start,
      p.last_source_checked_at,
      case when p.appeal_lodged_date is not null then 1 else 2 end as stage_priority
    from public.planning_applications p
    where p.registration_date < current_date - 90
      and p.final_grant_date is null
      and p.appeal_decision_date is null
      and (p.appeal_lodged_date is not null or p.decision_date is null)
    order by
      p.last_source_checked_at asc nulls first,
      p.registration_date,
      p.local_authority_code
    limit 6000
  ),
  recent_decision_candidates as materialized (
    select
      p.local_authority_code,
      date_trunc('month', p.registration_date)::date as period_start,
      p.last_source_checked_at,
      3 as stage_priority
    from public.planning_applications p
    where p.registration_date < current_date - 90
      and p.final_grant_date is null
      and p.appeal_decision_date is null
      and p.appeal_lodged_date is null
      and p.decision_date >= current_date - 180
    order by
      p.last_source_checked_at asc nulls first,
      p.decision_date desc,
      p.registration_date,
      p.local_authority_code
    limit 6000
  ),
  eligible as materialized (
    select * from unresolved_candidates
    union all
    select * from recent_decision_candidates
  ),
  buckets as (
    select
      e.local_authority_code,
      e.period_start,
      (e.period_start + interval '1 month')::date as period_end,
      count(*)::bigint as candidate_count,
      case
        when count(*) filter (where e.last_source_checked_at is null) > 0 then null
        else min(e.last_source_checked_at)
      end as least_recently_checked_at,
      min(e.stage_priority) as stage_priority
    from eligible e
    group by e.local_authority_code, e.period_start
  )
  select
    b.local_authority_code,
    b.period_start,
    b.period_end,
    b.candidate_count,
    b.least_recently_checked_at
  from buckets b
  order by
    b.least_recently_checked_at asc nulls first,
    b.stage_priority,
    b.period_start,
    b.local_authority_code
  limit greatest(1, least(coalesce(p_bucket_limit, 12), 50));
$$;

revoke all on function public.openlist_planning_status_refresh_buckets(int) from public;
grant execute on function public.openlist_planning_status_refresh_buckets(int) to service_role;
