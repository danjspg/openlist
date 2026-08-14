-- These two predicates are part of OpenList's live planning search OR query.
-- Reference and location already have trigram indexes; without matching
-- proposal and applicant indexes, PostgreSQL can fall back to a full-table
-- scan once historical planning data is loaded.
create index if not exists planning_applications_proposal_trgm_idx
  on public.planning_applications using gin (proposal gin_trgm_ops)
  where proposal is not null;

create index if not exists planning_applications_applicant_name_trgm_idx
  on public.planning_applications using gin (applicant_name gin_trgm_ops)
  where applicant_name is not null;

alter table public.planning_applications
  add column if not exists last_source_checked_at timestamptz null;

-- Historical status refresh deliberately ignores status labels and decision
-- text as finality signals: a later appeal can follow either. Definitive grant
-- or appeal dates stop routine polling; undecided, appealed, and decisions
-- inside a conservative 180-day grace period remain eligible.
create index if not exists planning_applications_status_recheck_idx
  on public.planning_applications (
    last_source_checked_at asc nulls first,
    local_authority_code,
    registration_date
  )
  where registration_date is not null
    and final_grant_date is null
    and appeal_decision_date is null;

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
  with eligible as materialized (
    select
      p.local_authority_code,
      date_trunc('month', p.registration_date)::date as period_start,
      p.last_source_checked_at,
      case
        when p.appeal_lodged_date is not null then 1
        when p.decision_date is null then 2
        else 3
      end as stage_priority
    from public.planning_applications p
    where p.registration_date < current_date - 90
      and p.final_grant_date is null
      and p.appeal_decision_date is null
      and (
        p.appeal_lodged_date is not null
        or p.decision_date is null
        or p.decision_date >= current_date - 180
      )
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

create or replace function public.openlist_mark_planning_status_bucket_checked(
  p_authority_code text,
  p_period_start date,
  p_period_end date
)
returns int
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  affected int;
begin
  update public.planning_applications p
  set last_source_checked_at = now()
  where p.local_authority_code = p_authority_code
    and p.registration_date >= p_period_start
    and p.registration_date < p_period_end
    and p.final_grant_date is null
    and p.appeal_decision_date is null
    and (
      p.appeal_lodged_date is not null
      or p.decision_date is null
      or p.decision_date >= current_date - 180
    );
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.openlist_planning_status_refresh_buckets(int) from public;
revoke all on function public.openlist_mark_planning_status_bucket_checked(text, date, date) from public;
grant execute on function public.openlist_planning_status_refresh_buckets(int) to service_role;
grant execute on function public.openlist_mark_planning_status_bucket_checked(text, date, date) to service_role;

-- Service-role-only operational report for before/after backfill validation.
-- It keeps database-wide counting and grouping inside PostgreSQL and returns
-- one compact JSON document instead of transferring primary rows.
create or replace function public.openlist_data_storage_report()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
set statement_timeout = '120s'
as $$
with
ppr_years as (
  select extract(year from date_of_sale)::int as year, count(*)::bigint as count
  from public.ppr_sales
  group by 1
),
planning_authorities as (
  select
    local_authority_code,
    count(*)::bigint as count,
    min(registration_date) as earliest_date,
    max(registration_date) as latest_date
  from public.planning_applications
  group by local_authority_code
),
largest_indexes as (
  select
    indexrelid::regclass::text as name,
    pg_relation_size(indexrelid) as bytes
  from pg_stat_user_indexes
  where schemaname = 'public'
    and relname in ('ppr_sales', 'planning_applications')
  order by pg_relation_size(indexrelid) desc
  limit 20
)
select jsonb_build_object(
  'capturedAt', now(),
  'databaseBytes', pg_database_size(current_database()),
  'ppr', jsonb_build_object(
    'rows', (select count(*) from public.ppr_sales),
    'earliestDate', (select min(date_of_sale) from public.ppr_sales),
    'latestDate', (select max(date_of_sale) from public.ppr_sales),
    'tableBytes', pg_relation_size('public.ppr_sales'::regclass),
    'indexBytes', pg_indexes_size('public.ppr_sales'::regclass),
    'totalBytes', pg_total_relation_size('public.ppr_sales'::regclass),
    'byYear', coalesce((
      select jsonb_object_agg(year::text, count order by year) from ppr_years
    ), '{}'::jsonb),
    'duplicateSourceHashes', (
      select count(*) from (
        select source_row_hash
        from public.ppr_sales
        where source_row_hash is not null
        group by source_row_hash
        having count(*) > 1
      ) duplicates
    )
  ),
  'planning', jsonb_build_object(
    'rows', (select count(*) from public.planning_applications),
    'earliestDate', (select min(registration_date) from public.planning_applications),
    'latestDate', (select max(registration_date) from public.planning_applications),
    'tableBytes', pg_relation_size('public.planning_applications'::regclass),
    'indexBytes', pg_indexes_size('public.planning_applications'::regclass),
    'totalBytes', pg_total_relation_size('public.planning_applications'::regclass),
    'rawPayloadRows', (
      select count(*) from public.planning_applications where source_payload is not null
    ),
    'byAuthority', coalesce((
      select jsonb_object_agg(
        local_authority_code,
        jsonb_build_object(
          'count', count,
          'earliestDate', earliest_date,
          'latestDate', latest_date
        ) order by local_authority_code
      )
      from planning_authorities
    ), '{}'::jsonb)
  ),
  'largestPrimaryIndexes', coalesce((
    select jsonb_agg(jsonb_build_object('name', name, 'bytes', bytes) order by bytes desc)
    from largest_indexes
  ), '[]'::jsonb)
);
$$;

revoke all on function public.openlist_data_storage_report() from public;
grant execute on function public.openlist_data_storage_report() to service_role;
