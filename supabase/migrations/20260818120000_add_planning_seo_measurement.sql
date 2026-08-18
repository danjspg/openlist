create table if not exists public.planning_seo_notable (
  application_id uuid primary key references public.planning_applications(id) on delete cascade,
  source text not null,
  reason text not null,
  evidence jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists planning_seo_notable_active_idx
  on public.planning_seo_notable (created_at, application_id)
  where active;

create index if not exists planning_applications_registration_reference_sitemap_idx
  on public.planning_applications (registration_date desc, reference desc, id desc)
  where registration_date is not null;

create table if not exists public.planning_seo_sitemap_memberships (
  application_id uuid not null references public.planning_applications(id) on delete cascade,
  cohort text not null check (cohort in ('recent', 'notable')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  left_at timestamptz null,
  primary key (application_id, cohort)
);

create index if not exists planning_seo_sitemap_memberships_active_idx
  on public.planning_seo_sitemap_memberships (cohort, first_seen_at, application_id)
  where left_at is null;

create table if not exists public.planning_seo_inspections (
  application_id uuid not null references public.planning_applications(id) on delete cascade,
  inspected_on date not null default current_date,
  inspected_at timestamptz not null default now(),
  verdict text null,
  coverage_state text null,
  robots_txt_state text null,
  indexing_state text null,
  page_fetch_state text null,
  last_crawl_time timestamptz null,
  crawled_as text null,
  google_canonical text null,
  user_canonical text null,
  sitemaps jsonb not null default '[]'::jsonb,
  referring_urls jsonb not null default '[]'::jsonb,
  inspection_result_link text null,
  is_indexed boolean not null default false,
  is_discovered boolean not null default false,
  raw_result jsonb not null default '{}'::jsonb,
  primary key (application_id, inspected_on)
);

create index if not exists planning_seo_inspections_latest_idx
  on public.planning_seo_inspections (application_id, inspected_at desc);

create index if not exists planning_seo_inspections_indexed_idx
  on public.planning_seo_inspections (is_indexed, inspected_at desc);

create table if not exists public.planning_seo_search_performance (
  application_id uuid not null references public.planning_applications(id) on delete cascade,
  data_date date not null,
  clicks numeric not null default 0,
  impressions numeric not null default 0,
  ctr numeric not null default 0,
  position numeric not null default 0,
  collected_at timestamptz not null default now(),
  primary key (application_id, data_date)
);

create index if not exists planning_seo_search_performance_date_idx
  on public.planning_seo_search_performance (data_date desc, impressions desc);

create table if not exists public.planning_seo_sitemap_observations (
  sitemap_path text not null,
  observed_on date not null default current_date,
  observed_at timestamptz not null default now(),
  submitted bigint null,
  last_submitted timestamptz null,
  last_downloaded timestamptz null,
  is_pending boolean null,
  errors bigint null,
  warnings bigint null,
  raw_result jsonb not null default '{}'::jsonb,
  primary key (sitemap_path, observed_on)
);

alter table public.planning_seo_notable enable row level security;
alter table public.planning_seo_sitemap_memberships enable row level security;
alter table public.planning_seo_inspections enable row level security;
alter table public.planning_seo_search_performance enable row level security;
alter table public.planning_seo_sitemap_observations enable row level security;

revoke all on table public.planning_seo_notable from anon, authenticated;
revoke all on table public.planning_seo_sitemap_memberships from anon, authenticated;
revoke all on table public.planning_seo_inspections from anon, authenticated;
revoke all on table public.planning_seo_search_performance from anon, authenticated;
revoke all on table public.planning_seo_sitemap_observations from anon, authenticated;

grant select, insert, update, delete on table public.planning_seo_notable to service_role;
grant select, insert, update, delete on table public.planning_seo_sitemap_memberships to service_role;
grant select, insert, update, delete on table public.planning_seo_inspections to service_role;
grant select, insert, update, delete on table public.planning_seo_search_performance to service_role;
grant select, insert, update, delete on table public.planning_seo_sitemap_observations to service_role;

create or replace function public.openlist_planning_recent_sitemap(
  p_limit int default 1000,
  p_offset int default 0
)
returns table (
  id uuid,
  local_authority_code text,
  reference text,
  registration_date date,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_catalog
set statement_timeout = '15s'
as $$
  select
    p.id,
    p.local_authority_code,
    p.reference,
    p.registration_date,
    p.updated_at
  from public.planning_applications p
  where p.registration_date is not null
    and not exists (
      select 1
      from public.planning_seo_notable n
      where n.application_id = p.id
        and n.active
    )
  order by p.registration_date desc, p.reference desc, p.id desc
  limit greatest(1, least(coalesce(p_limit, 1000), 1000))
  offset greatest(0, least(coalesce(p_offset, 0), 4999));
$$;

create or replace function public.openlist_planning_notable_sitemap(
  p_limit int default 1000,
  p_offset int default 0
)
returns table (
  id uuid,
  local_authority_code text,
  reference text,
  registration_date date,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_catalog
set statement_timeout = '15s'
as $$
  select
    p.id,
    p.local_authority_code,
    p.reference,
    p.registration_date,
    p.updated_at
  from public.planning_seo_notable n
  join public.planning_applications p on p.id = n.application_id
  where n.active
  order by n.created_at, p.local_authority_code, p.reference, p.id
  limit greatest(1, least(coalesce(p_limit, 1000), 1000))
  offset greatest(0, least(coalesce(p_offset, 0), 4999));
$$;

create or replace function public.openlist_sync_planning_sitemap_memberships(
  p_recent_ids uuid[],
  p_notable_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  captured_at timestamptz := now();
  recent_ids uuid[] := coalesce(p_recent_ids, '{}'::uuid[]);
  notable_ids uuid[] := coalesce(p_notable_ids, '{}'::uuid[]);
begin
  insert into public.planning_seo_sitemap_memberships (
    application_id,
    cohort,
    first_seen_at,
    last_seen_at,
    left_at
  )
  select application_id, 'recent', captured_at, captured_at, null
  from unnest(recent_ids) as ids(application_id)
  on conflict (application_id, cohort) do update
  set last_seen_at = excluded.last_seen_at,
      left_at = null;

  update public.planning_seo_sitemap_memberships m
  set left_at = coalesce(m.left_at, captured_at)
  where m.cohort = 'recent'
    and m.left_at is null
    and not (m.application_id = any(recent_ids));

  insert into public.planning_seo_sitemap_memberships (
    application_id,
    cohort,
    first_seen_at,
    last_seen_at,
    left_at
  )
  select application_id, 'notable', captured_at, captured_at, null
  from unnest(notable_ids) as ids(application_id)
  on conflict (application_id, cohort) do update
  set last_seen_at = excluded.last_seen_at,
      left_at = null;

  update public.planning_seo_sitemap_memberships m
  set left_at = coalesce(m.left_at, captured_at)
  where m.cohort = 'notable'
    and m.left_at is null
    and not (m.application_id = any(notable_ids));

  return jsonb_build_object(
    'capturedAt', captured_at,
    'recent', cardinality(recent_ids),
    'notable', cardinality(notable_ids)
  );
end;
$$;

create or replace function public.openlist_planning_seo_inspection_candidates(
  p_limit int default 1000
)
returns table (
  application_id uuid,
  local_authority_code text,
  reference text,
  cohort text,
  first_seen_at timestamptz,
  last_inspected_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_catalog
set statement_timeout = '15s'
as $$
  with membership as (
    select
      m.application_id,
      min(m.first_seen_at) as first_seen_at,
      bool_or(m.cohort = 'notable' and m.left_at is null) as is_notable,
      bool_or(m.cohort = 'recent' and m.left_at is null) as is_recent,
      bool_or(m.cohort = 'recent' and m.left_at is not null) as left_recently,
      max(m.left_at) filter (where m.cohort = 'recent') as recent_left_at
    from public.planning_seo_sitemap_memberships m
    group by m.application_id
  ),
  candidates as (
    select
      p.id as application_id,
      p.local_authority_code,
      p.reference,
      case
        when m.is_notable then 'notable'
        when m.left_recently and not m.is_recent then 'recent-left'
        else 'recent'
      end as cohort,
      m.first_seen_at,
      latest.inspected_at as last_inspected_at,
      latest.is_indexed,
      case
        when latest.inspected_at is null and m.is_notable then 0
        when latest.inspected_at is null and m.left_recently then 1
        when latest.inspected_at is null then 2
        when not latest.is_indexed and m.left_recently then 3
        when not latest.is_indexed then 4
        else 5
      end as priority
    from membership m
    join public.planning_applications p on p.id = m.application_id
    left join lateral (
      select i.inspected_at, i.is_indexed
      from public.planning_seo_inspections i
      where i.application_id = m.application_id
      order by i.inspected_at desc
      limit 1
    ) latest on true
    where m.is_notable
       or m.is_recent
       or m.recent_left_at >= now() - interval '90 days'
  )
  select
    c.application_id,
    c.local_authority_code,
    c.reference,
    c.cohort,
    c.first_seen_at,
    c.last_inspected_at
  from candidates c
  where c.last_inspected_at is null
     or (not coalesce(c.is_indexed, false) and c.last_inspected_at < now() - interval '7 days')
     or (coalesce(c.is_indexed, false) and c.last_inspected_at < now() - interval '30 days')
  order by c.priority, md5(c.application_id::text || current_date::text)
  limit greatest(1, least(coalesce(p_limit, 1000), 5000));
$$;

create or replace function public.openlist_upsert_planning_search_performance(
  p_rows jsonb
)
returns int
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  affected int;
begin
  insert into public.planning_seo_search_performance (
    application_id,
    data_date,
    clicks,
    impressions,
    ctr,
    position,
    collected_at
  )
  select
    p.id,
    (row->>'data_date')::date,
    coalesce((row->>'clicks')::numeric, 0),
    coalesce((row->>'impressions')::numeric, 0),
    coalesce((row->>'ctr')::numeric, 0),
    coalesce((row->>'position')::numeric, 0),
    now()
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) row
  join public.planning_applications p
    on p.local_authority_code = row->>'local_authority_code'
   and p.reference = row->>'reference'
  on conflict (application_id, data_date) do update
  set clicks = excluded.clicks,
      impressions = excluded.impressions,
      ctr = excluded.ctr,
      position = excluded.position,
      collected_at = excluded.collected_at;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.openlist_promote_planning_seo_notable(
  p_window_days int default 90,
  p_min_active_days int default 3,
  p_min_impressions int default 100,
  p_min_clicks int default 2
)
returns int
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  affected int;
begin
  insert into public.planning_seo_notable (
    application_id,
    source,
    reason,
    evidence
  )
  select
    performance.application_id,
    'search_console',
    format(
      'Search Console: %s clicks and %s impressions across %s days in the trailing %s days',
      performance.clicks,
      performance.impressions,
      performance.active_days,
      greatest(1, p_window_days)
    ),
    jsonb_build_object(
      'clicks', performance.clicks,
      'impressions', performance.impressions,
      'activeDays', performance.active_days,
      'windowDays', greatest(1, p_window_days),
      'minimumClicks', greatest(0, p_min_clicks),
      'minimumImpressions', greatest(0, p_min_impressions)
    )
  from (
    select
      s.application_id,
      sum(s.clicks) as clicks,
      sum(s.impressions) as impressions,
      count(distinct s.data_date) as active_days
    from public.planning_seo_search_performance s
    where s.data_date >= current_date - greatest(1, p_window_days)
    group by s.application_id
    having count(distinct s.data_date) >= greatest(1, p_min_active_days)
       and (
         sum(s.clicks) >= greatest(0, p_min_clicks)
         or sum(s.impressions) >= greatest(0, p_min_impressions)
       )
  ) performance
  on conflict (application_id) do nothing;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.openlist_planning_seo_report()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
set statement_timeout = '60s'
as $$
  with latest_inspections as (
    select distinct on (i.application_id)
      i.application_id,
      i.inspected_at,
      i.is_indexed,
      i.is_discovered,
      i.last_crawl_time,
      i.coverage_state
    from public.planning_seo_inspections i
    order by i.application_id, i.inspected_at desc
  ),
  first_indexed as (
    select i.application_id, min(i.inspected_at) as first_indexed_at
    from public.planning_seo_inspections i
    where i.is_indexed
    group by i.application_id
  ),
  first_membership as (
    select m.application_id, min(m.first_seen_at) as first_seen_at
    from public.planning_seo_sitemap_memberships m
    group by m.application_id
  ),
  traffic as (
    select
      s.application_id,
      sum(s.clicks) as clicks,
      sum(s.impressions) as impressions
    from public.planning_seo_search_performance s
    group by s.application_id
  ),
  current_cohorts as (
    select
      m.application_id,
      case
        when bool_or(m.cohort = 'notable' and m.left_at is null) then 'notable'
        else 'recent'
      end as cohort
    from public.planning_seo_sitemap_memberships m
    where m.left_at is null
    group by m.application_id
  ),
  cohort_traffic as (
    select
      c.cohort,
      count(*) as pages,
      coalesce(sum(t.clicks), 0) as clicks,
      coalesce(sum(t.impressions), 0) as impressions
    from current_cohorts c
    left join traffic t on t.application_id = c.application_id
    group by c.cohort
  ),
  latest_sitemaps as (
    select distinct on (s.sitemap_path)
      s.sitemap_path,
      s.observed_at,
      s.submitted,
      s.last_submitted,
      s.last_downloaded,
      s.is_pending,
      s.errors,
      s.warnings
    from public.planning_seo_sitemap_observations s
    order by s.sitemap_path, s.observed_at desc
  ),
  top_pages as (
    select
      p.local_authority_code,
      p.reference,
      t.clicks,
      t.impressions,
      exists (
        select 1 from public.planning_seo_notable n
        where n.application_id = p.id and n.active
      ) as is_notable
    from traffic t
    join public.planning_applications p on p.id = t.application_id
    order by t.clicks desc, t.impressions desc, p.id
    limit 20
  ),
  recent_left as (
    select m.application_id, m.left_at
    from public.planning_seo_sitemap_memberships m
    where m.cohort = 'recent' and m.left_at is not null
  )
  select jsonb_build_object(
    'capturedAt', now(),
    'totalPlanningRecords', (select count(*) from public.planning_applications),
    'recentSitemapUrls', (
      select count(*)
      from public.planning_seo_sitemap_memberships
      where cohort = 'recent' and left_at is null
    ),
    'notableSitemapUrls', (
      select count(*)
      from public.planning_seo_sitemap_memberships
      where cohort = 'notable' and left_at is null
    ),
    'sampledUrlsInspected', (select count(*) from latest_inspections),
    'indexed', (select count(*) from latest_inspections where is_indexed),
    'crawled', (select count(*) from latest_inspections where last_crawl_time is not null),
    'discoveredNotIndexed', (
      select count(*) from latest_inspections where is_discovered and not is_indexed
    ),
    'unknownInspected', (
      select count(*) from latest_inspections where not is_discovered and not is_indexed
    ),
    'notInspected', (
      select count(*)
      from first_membership m
      left join latest_inspections i on i.application_id = m.application_id
      where i.application_id is null
    ),
    'medianObservedDaysToIndexedInspection', (
      select round(percentile_cont(0.5) within group (
        order by extract(epoch from (i.first_indexed_at - m.first_seen_at)) / 86400.0
      )::numeric, 1)
      from first_indexed i
      join first_membership m on m.application_id = i.application_id
      where i.first_indexed_at >= m.first_seen_at
    ),
    'recentUrlsLeftBeforeIndexedInspection', (
      select count(*)
      from recent_left l
      where not exists (
        select 1
        from public.planning_seo_inspections i
        where i.application_id = l.application_id
          and i.is_indexed
          and i.inspected_at <= l.left_at
      )
    ),
    'recentUrlsLeftObserved', (select count(*) from recent_left),
    'planningClicks', (select coalesce(sum(clicks), 0) from traffic),
    'planningImpressions', (select coalesce(sum(impressions), 0) from traffic),
    'notablePagesWithTraffic', (
      select count(*)
      from traffic t
      join public.planning_seo_notable n on n.application_id = t.application_id
      where n.active and t.impressions > 0
    ),
    'notableCohortPages', (
      select coalesce(max(pages) filter (where cohort = 'notable'), 0)
      from cohort_traffic
    ),
    'recentCohortPages', (
      select coalesce(max(pages) filter (where cohort = 'recent'), 0)
      from cohort_traffic
    ),
    'notableCohortClicks', (
      select coalesce(max(clicks) filter (where cohort = 'notable'), 0)
      from cohort_traffic
    ),
    'recentCohortClicks', (
      select coalesce(max(clicks) filter (where cohort = 'recent'), 0)
      from cohort_traffic
    ),
    'notableCohortImpressions', (
      select coalesce(max(impressions) filter (where cohort = 'notable'), 0)
      from cohort_traffic
    ),
    'recentCohortImpressions', (
      select coalesce(max(impressions) filter (where cohort = 'recent'), 0)
      from cohort_traffic
    ),
    'sitemapObservations', coalesce((
      select jsonb_agg(to_jsonb(latest_sitemaps) order by sitemap_path)
      from latest_sitemaps
    ), '[]'::jsonb),
    'topPlanningPages', coalesce((
      select jsonb_agg(to_jsonb(top_pages)) from top_pages
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.openlist_planning_recent_sitemap(int, int) from public;
revoke all on function public.openlist_planning_notable_sitemap(int, int) from public;
revoke all on function public.openlist_sync_planning_sitemap_memberships(uuid[], uuid[]) from public;
revoke all on function public.openlist_planning_seo_inspection_candidates(int) from public;
revoke all on function public.openlist_upsert_planning_search_performance(jsonb) from public;
revoke all on function public.openlist_promote_planning_seo_notable(int, int, int, int) from public;
revoke all on function public.openlist_planning_seo_report() from public;

grant execute on function public.openlist_planning_recent_sitemap(int, int) to anon, authenticated, service_role;
grant execute on function public.openlist_planning_notable_sitemap(int, int) to anon, authenticated, service_role;
grant execute on function public.openlist_sync_planning_sitemap_memberships(uuid[], uuid[]) to service_role;
grant execute on function public.openlist_planning_seo_inspection_candidates(int) to service_role;
grant execute on function public.openlist_upsert_planning_search_performance(jsonb) to service_role;
grant execute on function public.openlist_promote_planning_seo_notable(int, int, int, int) to service_role;
grant execute on function public.openlist_planning_seo_report() to service_role;
