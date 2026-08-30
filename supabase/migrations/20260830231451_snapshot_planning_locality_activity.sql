-- Keep all user-facing locality reads on the compact membership snapshot.
-- Recomputing locality expressions across planning_applications belongs in a
-- bounded background refresh, never in a directory or sitemap request.

alter table public.locality_seo_memberships
  add column if not exists active_count bigint not null default 0,
  add column if not exists activity_refreshed_at timestamptz;

alter table public.locality_seo_memberships
  alter column active_count set default 0;
update public.locality_seo_memberships set active_count = 0 where active_count is null;
alter table public.locality_seo_memberships
  alter column active_count set not null;

create or replace function public.openlist_refresh_planning_locality_activity_counts(
  p_authority_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '20s'
as $$
declare
  v_updated integer := 0;
begin
  if nullif(trim(p_authority_code), '') is null then
    raise exception 'p_authority_code is required';
  end if;

  with active_counts as materialized (
    select
      lower(public.openlist_planning_locality(p.location, p.ward, p.local_authority_code)) as locality_key,
      count(*)::bigint as active_count
    from public.planning_applications p
    where p.local_authority_code = p_authority_code
      and p.normalized_status in (
        'pre_validation',
        'registered',
        'under_assessment',
        'further_information_requested',
        'further_information_received',
        'appealed'
      )
    group by lower(public.openlist_planning_locality(p.location, p.ward, p.local_authority_code))
  ), refreshed as (
    select m.id, coalesce(a.active_count, 0)::bigint as active_count
    from public.locality_seo_memberships m
    left join active_counts a on a.locality_key = lower(m.locality_label)
    where m.surface = 'planning'
      and m.left_at is null
      and m.authority_code = p_authority_code
  )
  update public.locality_seo_memberships m
  set active_count = r.active_count,
      activity_refreshed_at = now()
  from refreshed r
  where m.id = r.id
    and m.active_count is distinct from r.active_count;

  get diagnostics v_updated = row_count;
  return jsonb_build_object(
    'authorityCode', p_authority_code,
    'changed', v_updated,
    'refreshedAt', now()
  );
end;
$$;

revoke all on function public.openlist_refresh_planning_locality_activity_counts(text)
  from public, anon, authenticated;
grant execute on function public.openlist_refresh_planning_locality_activity_counts(text)
  to service_role;

create or replace function public.openlist_planning_locality_directory(p_limit integer default 3000)
returns table(
  canonical_path text,
  county text,
  authority_code text,
  locality_label text,
  locality_slug text,
  evidence jsonb,
  active_count bigint
)
language sql
stable
security definer
set search_path = public
set statement_timeout = '5s'
as $$
  select
    m.canonical_path,
    m.county,
    m.authority_code,
    m.locality_label,
    m.locality_slug,
    m.evidence,
    m.active_count
  from public.locality_seo_memberships m
  where m.surface = 'planning'
    and m.left_at is null
  order by m.score desc, m.canonical_path
  limit greatest(1, least(coalesce(p_limit, 3000), 3000));
$$;

revoke all on function public.openlist_planning_locality_directory(integer)
  from public, anon, authenticated;
grant execute on function public.openlist_planning_locality_directory(integer)
  to service_role;

create or replace function public.openlist_planning_locality_sitemap(
  p_tier text default 'priority',
  p_limit integer default 3000
)
returns table(canonical_path text, last_modified timestamptz)
language sql
stable
security definer
set search_path = public
set statement_timeout = '5s'
as $$
  select
    m.canonical_path,
    coalesce(
      (m.evidence->>'latestRegistrationDate')::date::timestamptz,
      m.entered_at
    ) as last_modified
  from public.locality_seo_memberships m
  where m.surface = 'planning'
    and m.left_at is null
    and m.seo_tier = case when p_tier = 'expanded' then 'expanded' else 'priority' end
  order by m.seo_priority_score desc, m.canonical_path
  limit greatest(1, least(coalesce(p_limit, 3000), 5000));
$$;

grant execute on function public.openlist_planning_locality_sitemap(text, integer)
  to anon, authenticated, service_role;

create or replace function public.openlist_refresh_planning_locality_seo_tiers(
  p_priority_target integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '20s'
as $$
declare
  v_target integer := greatest(100, least(coalesce(p_priority_target, 500), 1500));
  v_updated integer := 0;
begin
  with search_perf as (
    select canonical_path, sum(clicks)::numeric as clicks, sum(impressions)::numeric as impressions
    from public.locality_seo_search_performance
    where data_date >= current_date - 90
    group by canonical_path
  ), notable as (
    select
      p.local_authority_code as authority_code,
      public.openlist_locality_slug(public.openlist_planning_locality(p.location, p.ward, p.local_authority_code)) as locality_slug,
      count(*)::integer as notable_count
    from public.planning_seo_notable n
    join public.planning_applications p on p.id = n.application_id
    where n.active = true
    group by
      p.local_authority_code,
      public.openlist_locality_slug(public.openlist_planning_locality(p.location, p.ward, p.local_authority_code))
  ), scored as (
    select
      m.id,
      m.score
        + case when coalesce(n.notable_count, 0) > 0 then 45 else 0 end
        + least(35::numeric, ln(1 + coalesce(sp.impressions, 0)) * 6)
        + case when coalesce(sp.clicks, 0) > 0 then 20 else 0 end
        + least(25::numeric, ln(1 + greatest(m.active_count, 0)) * 6)
        + case when coalesce((m.evidence->>'applicationCount')::integer, 0) >= 50 then 12 else 0 end
        as priority_score,
      coalesce(n.notable_count, 0) as notable_count,
      coalesce(sp.clicks, 0) as clicks
    from public.locality_seo_memberships m
    left join search_perf sp on sp.canonical_path = m.canonical_path
    left join notable n on n.authority_code = m.authority_code and n.locality_slug = m.locality_slug
    where m.surface = 'planning' and m.left_at is null
  ), ranked as (
    select s.*, row_number() over (order by priority_score desc, id) as rn
    from scored s
  ), desired as (
    select
      r.id,
      r.priority_score,
      case
        when r.rn <= v_target or r.notable_count > 0 or r.clicks > 0 then 'priority'
        else 'expanded'
      end as seo_tier
    from ranked r
  )
  update public.locality_seo_memberships m
  set seo_priority_score = d.priority_score,
      seo_tier = d.seo_tier
  from desired d
  where m.id = d.id
    and (m.seo_priority_score, m.seo_tier)
      is distinct from (d.priority_score, d.seo_tier);

  get diagnostics v_updated = row_count;
  return jsonb_build_object(
    'priority', (select count(*) from public.locality_seo_memberships where surface = 'planning' and left_at is null and seo_tier = 'priority'),
    'expanded', (select count(*) from public.locality_seo_memberships where surface = 'planning' and left_at is null and seo_tier = 'expanded'),
    'changed', v_updated
  );
end;
$$;

revoke all on function public.openlist_refresh_planning_locality_seo_tiers(integer)
  from public, anon, authenticated;
grant execute on function public.openlist_refresh_planning_locality_seo_tiers(integer)
  to service_role;
