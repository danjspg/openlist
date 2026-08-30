alter table public.locality_seo_memberships
  add column if not exists seo_tier text not null default 'expanded',
  add column if not exists seo_priority_score numeric not null default 0;

do $$ begin
  alter table public.locality_seo_memberships
    add constraint locality_seo_memberships_seo_tier_check
    check (seo_tier in ('priority','expanded'));
exception when duplicate_object then null; end $$;

create index if not exists locality_seo_memberships_active_tier_idx
  on public.locality_seo_memberships (surface, seo_tier, seo_priority_score desc, canonical_path)
  where left_at is null;

create or replace function public.openlist_refresh_planning_locality_seo_tiers(p_priority_target integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '60s'
as $$
declare
  v_target integer := greatest(100, least(coalesce(p_priority_target, 500), 1500));
begin
  with search_perf as (
    select canonical_path,
      sum(clicks)::numeric as clicks,
      sum(impressions)::numeric as impressions
    from public.locality_seo_search_performance
    where data_date >= current_date - 90
    group by canonical_path
  ), notable as (
    select p.local_authority_code as authority_code,
      public.openlist_locality_slug(public.openlist_planning_locality(p.location, p.ward, p.local_authority_code)) as locality_slug,
      count(*)::integer as notable_count
    from public.planning_seo_notable n
    join public.planning_applications p on p.id = n.application_id
    where n.active = true
    group by p.local_authority_code,
      public.openlist_locality_slug(public.openlist_planning_locality(p.location, p.ward, p.local_authority_code))
  ), scored as (
    select m.id,
      m.score
      + case when coalesce(n.notable_count,0) > 0 then 45 else 0 end
      + least(35::numeric, ln(1 + coalesce(sp.impressions,0)) * 6)
      + case when coalesce(sp.clicks,0) > 0 then 20 else 0 end
      + case when coalesce((m.evidence->>'applicationCount')::integer,0) >= 50 then 12 else 0 end
      as priority_score,
      coalesce(n.notable_count,0) as notable_count,
      coalesce(sp.clicks,0) as clicks
    from public.locality_seo_memberships m
    left join search_perf sp on sp.canonical_path = m.canonical_path
    left join notable n on n.authority_code = m.authority_code and n.locality_slug = m.locality_slug
    where m.surface = 'planning' and m.left_at is null
  ), ranked as (
    select s.*, row_number() over (order by priority_score desc, id) as rn from scored s
  )
  update public.locality_seo_memberships m
  set seo_priority_score = r.priority_score,
      seo_tier = case
        when r.rn <= v_target or r.notable_count > 0 or r.clicks > 0 then 'priority'
        else 'expanded'
      end,
      updated_at = now()
  from ranked r
  where m.id = r.id;

  return jsonb_build_object(
    'priority', (select count(*) from public.locality_seo_memberships where surface='planning' and left_at is null and seo_tier='priority'),
    'expanded', (select count(*) from public.locality_seo_memberships where surface='planning' and left_at is null and seo_tier='expanded')
  );
end;
$$;

create or replace function public.openlist_planning_locality_sitemap(p_tier text default 'priority', p_limit integer default 3000)
returns table(canonical_path text, last_modified timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.canonical_path,
    greatest(
      coalesce((m.evidence->>'latestRegistrationDate')::date::timestamptz, m.updated_at),
      coalesce((select max(p.updated_at)
        from public.planning_applications p
        where p.local_authority_code = m.authority_code
          and public.openlist_locality_slug(public.openlist_planning_locality(p.location, p.ward, p.local_authority_code)) = m.locality_slug), m.updated_at)
    ) as last_modified
  from public.locality_seo_memberships m
  where m.surface='planning'
    and m.left_at is null
    and m.seo_tier = case when p_tier='expanded' then 'expanded' else 'priority' end
  order by m.seo_priority_score desc, m.canonical_path
  limit greatest(1, least(coalesce(p_limit,3000),5000));
$$;

grant execute on function public.openlist_refresh_planning_locality_seo_tiers(integer) to service_role;
grant execute on function public.openlist_planning_locality_sitemap(text,integer) to anon, authenticated, service_role;

select public.openlist_refresh_planning_locality_seo_tiers(500);
