-- Persistent sitemap membership for permanent locality pages.  The table is private:
-- only compact RPC results cross the web boundary.
create table if not exists public.locality_seo_memberships (
  id uuid primary key default gen_random_uuid(),
  surface text not null check (surface in ('sold_prices', 'planning')),
  canonical_path text not null,
  county text null,
  authority_code text null,
  locality_label text not null,
  locality_slug text not null,
  score numeric not null default 0,
  evidence jsonb not null default '{}'::jsonb,
  entered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  left_at timestamptz null,
  first_impression_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (surface, canonical_path, entered_at)
);

create unique index if not exists locality_seo_memberships_one_active_idx
  on public.locality_seo_memberships (surface, canonical_path) where left_at is null;
create index if not exists locality_seo_memberships_active_surface_idx
  on public.locality_seo_memberships (surface, score desc, canonical_path) where left_at is null;

alter table public.locality_seo_memberships enable row level security;
revoke all on public.locality_seo_memberships from anon, authenticated;
grant select, insert, update, delete on public.locality_seo_memberships to service_role;

create table if not exists public.locality_seo_search_performance (
  canonical_path text not null,
  data_date date not null,
  clicks numeric not null default 0,
  impressions numeric not null default 0,
  ctr numeric not null default 0,
  position numeric not null default 0,
  collected_at timestamptz not null default now(),
  primary key (canonical_path, data_date)
);
alter table public.locality_seo_search_performance enable row level security;
revoke all on public.locality_seo_search_performance from anon, authenticated;
grant select, insert, update, delete on public.locality_seo_search_performance to service_role;

-- The normalised slug deliberately mirrors the existing JS route slugging for the
-- ASCII corpus. Candidate rows with accents that cannot round-trip safely are rejected.
create or replace function public.openlist_locality_slug(p_value text)
returns text language sql immutable parallel safe set search_path = public as $$
  select trim(both '-' from regexp_replace(lower(trim(coalesce(p_value, ''))), '[^a-z0-9]+', '-', 'g'))
$$;

create or replace function public.openlist_refresh_locality_seo_cohorts(
  p_size integer default 100,
  p_min_residence_days integer default 42,
  p_max_rotation integer default 20
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_size integer := greatest(1, least(coalesce(p_size, 100), 500));
  v_min_days integer := greatest(1, coalesce(p_min_residence_days, 42));
  v_rotation integer := greatest(0, least(coalesce(p_max_rotation, 20), v_size));
  v_surface text;
  v_active integer;
begin
  -- Candidates are intentionally based only on existing derived locality data.
  create temporary table locality_candidates on commit drop as
  with ppr as (
    select 'sold_prices'::text as surface,
      '/sold-prices/' || public.openlist_locality_slug(s.county) || '/' || s.area_slug as canonical_path,
      s.county, null::text as authority_code, initcap(replace(s.area_slug, '-', ' ')) as locality_label,
      s.area_slug as locality_slug,
      (ln(greatest(s.sales_count, 1)) * 20 + case when s.last_sale_date >= current_date - interval '3 years' then 30 else 0 end)::numeric as score,
      jsonb_build_object('salesCount', s.sales_count, 'lastSaleDate', s.last_sale_date) as evidence
    from public.ppr_area_stats s
    where s.geography_type = 'area' and s.sales_count >= 12 and s.last_sale_date >= current_date - interval '3 years'
      and s.area_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and length(s.area_slug) >= 3
      and s.area_slug <> public.openlist_locality_slug(s.county) and s.area_slug <> 'janeville'
  ), planning as (
    select 'planning'::text as surface,
      '/planning/' || a.slug || '/areas/' || public.openlist_locality_slug(public.openlist_planning_locality(p.location, p.ward, p.local_authority_code)) as canonical_path,
      null::text as county, p.local_authority_code as authority_code,
      public.openlist_planning_locality(p.location, p.ward, p.local_authority_code) as locality_label,
      public.openlist_locality_slug(public.openlist_planning_locality(p.location, p.ward, p.local_authority_code)) as locality_slug,
      (ln(count(*)::numeric) * 20 + case when max(p.registration_date) >= current_date - interval '2 years' then 30 else 0 end)::numeric as score,
      jsonb_build_object('applicationCount', count(*), 'latestRegistrationDate', max(p.registration_date)) as evidence
    from public.planning_applications p
    join (values
      ('CORKCOCO','cork'),('CORKCITY','cork-city'),('DUBLINCITY','dublin-city'),('FINGAL','fingal'),('SOUTHDUBLIN','south-dublin'),('DLR','dun-laoghaire-rathdown'),('KILDARE','kildare'),('GALWAYCOCO','galway-county'),('GALWAYCITY','galway-city'),('MEATH','meath'),('WICKLOW','wicklow'),('LIMERICK','limerick'),('WATERFORD','waterford'),('DONEGAL','donegal'),('WEXFORD','wexford'),('TIPPERARY','tipperary'),('KERRY','kerry'),('MAYO','mayo'),('CLARE','clare'),('LOUTH','louth'),('LAOIS','laois'),('KILKENNY','kilkenny'),('OFFALY','offaly'),('CAVAN','cavan'),('ROSCOMMON','roscommon'),('WESTMEATH','westmeath'),('MONAGHAN','monaghan'),('SLIGO','sligo'),('CARLOW','carlow'),('LONGFORD','longford'),('LEITRIM','leitrim')
    ) a(code, slug) on a.code = p.local_authority_code
    where p.registration_date is not null
    group by p.local_authority_code, a.slug, public.openlist_planning_locality(p.location, p.ward, p.local_authority_code)
    having count(*) >= 8 and max(p.registration_date) >= current_date - interval '3 years'
  ) select * from ppr union all select * from planning;

  delete from locality_candidates where locality_slug = '' or locality_label is null or length(locality_label) > 80
    or locality_label ~ '[0-9]' or lower(locality_label) in ('county cork','county dublin','ireland');

  foreach v_surface in array array['sold_prices','planning'] loop
    select count(*) into v_active from public.locality_seo_memberships where surface = v_surface and left_at is null;
    -- First six weeks are deliberately stable once the initial cohort is full.
    if v_active >= v_size and not exists (
      select 1 from public.locality_seo_memberships
      where surface = v_surface and left_at is null and entered_at <= now() - make_interval(days => v_min_days)
    ) then continue; end if;

    create temporary table locality_selected on commit drop as
      select c.* from locality_candidates c
      join public.locality_seo_memberships m on m.surface = c.surface and m.canonical_path = c.canonical_path and m.left_at is null
      where c.surface = v_surface and m.entered_at > now() - make_interval(days => v_min_days)
      union all
      select c.* from locality_candidates c where c.surface = v_surface and not exists (
        select 1 from public.locality_seo_memberships m where m.surface = c.surface and m.canonical_path = c.canonical_path and m.left_at is null
      ) order by score desc, canonical_path limit v_size;

    -- Do not churn: eligible previous members win ties and at most p_max_rotation can leave per refresh.
    update public.locality_seo_memberships m set left_at = now(), updated_at = now()
      where m.surface = v_surface and m.left_at is null and not exists (
        select 1 from locality_selected s where s.canonical_path = m.canonical_path
      ) and m.id in (
        select id from public.locality_seo_memberships where surface = v_surface and left_at is null
          and entered_at <= now() - make_interval(days => v_min_days) order by score asc, canonical_path limit v_rotation
      );
    insert into public.locality_seo_memberships (surface, canonical_path, county, authority_code, locality_label, locality_slug, score, evidence)
      select s.surface, s.canonical_path, s.county, s.authority_code, s.locality_label, s.locality_slug, s.score, s.evidence from locality_selected s
      where not exists (select 1 from public.locality_seo_memberships m where m.surface=s.surface and m.canonical_path=s.canonical_path and m.left_at is null)
      on conflict do nothing;
    update public.locality_seo_memberships m set score=c.score, evidence=c.evidence, last_seen_at=now(), updated_at=now()
      from locality_candidates c where m.surface=c.surface and m.canonical_path=c.canonical_path and m.left_at is null;
    drop table locality_selected;
  end loop;
  return jsonb_build_object('soldPrices', (select count(*) from public.locality_seo_memberships where surface='sold_prices' and left_at is null), 'planning', (select count(*) from public.locality_seo_memberships where surface='planning' and left_at is null));
end;
$$;

create or replace function public.openlist_locality_seo_sitemap(p_surface text, p_limit integer default 100)
returns table(canonical_path text, last_modified timestamptz) language sql stable security definer set search_path = public as $$
  select canonical_path, updated_at from public.locality_seo_memberships
  where surface = p_surface and left_at is null order by score desc, canonical_path limit greatest(1, least(p_limit, 500))
$$;
grant execute on function public.openlist_refresh_locality_seo_cohorts(integer, integer, integer) to service_role;
grant execute on function public.openlist_locality_seo_sitemap(text, integer) to anon, authenticated, service_role;
