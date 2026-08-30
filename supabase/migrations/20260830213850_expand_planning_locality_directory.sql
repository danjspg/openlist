create or replace function public.openlist_refresh_locality_seo_cohorts(
  p_size integer default 100,
  p_min_residence_days integer default 42,
  p_max_rotation integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '60s'
as $$
declare
  v_size integer := greatest(1, least(coalesce(p_size, 100), 5000));
  v_min_days integer := greatest(1, coalesce(p_min_residence_days, 42));
  v_rotation integer := greatest(0, least(coalesce(p_max_rotation, 20), v_size));
  v_surface text;
  v_active integer;
  v_target_size integer;
begin
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

  delete from locality_candidates
  where locality_slug = ''
    or locality_label is null
    or length(locality_label) > 80
    or length(locality_label) < 4
    or (
      locality_label ~ '[0-9]'
      and not (
        authority_code in ('DUBLINCITY','FINGAL','SOUTHDUBLIN','DLR')
        and locality_label ~* '^dublin[[:space:]]+[0-9]{1,2}[a-z]?$'
      )
    )
    or locality_label ~* '(^|[[:space:]])(p[.]?o[.]?|post office)([[:space:]]|$)'
    or locality_label ~* '^co[.]?[[:space:]]*'
    or locality_label ~* 'protected[[:space:]]+structure'
    or locality_label ~* '^[-()[:space:]]*aca[()[:space:]-]*$'
    or lower(locality_label) in (
      'carlow','cavan','clare','cork','donegal','dublin','galway','kerry','kildare','kilkenny','laois','leitrim','limerick','longford','louth','mayo','meath','monaghan','offaly','roscommon','sligo','tipperary','waterford','westmeath','wexford','wicklow','county cork','county dublin','ireland','dubl','dubli','dub','co'
    );

  foreach v_surface in array array['sold_prices','planning'] loop
    v_target_size := case when v_surface = 'planning' then 3000 else least(v_size, 100) end;
    select count(*) into v_active from public.locality_seo_memberships where surface = v_surface and left_at is null;

    if v_active >= v_target_size and not exists (
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
      ) order by score desc, canonical_path limit v_target_size;

    update public.locality_seo_memberships m set left_at = now(), updated_at = now()
      where m.surface = v_surface and m.left_at is null and not exists (
        select 1 from locality_selected s where s.canonical_path = m.canonical_path
      ) and m.id in (
        select id from public.locality_seo_memberships where surface = v_surface and left_at is null
          and entered_at <= now() - make_interval(days => v_min_days) order by score asc, canonical_path limit v_rotation
      );

    insert into public.locality_seo_memberships (surface, canonical_path, county, authority_code, locality_label, locality_slug, score, evidence)
      select s.surface, s.canonical_path, s.county, s.authority_code, s.locality_label, s.locality_slug, s.score, s.evidence from locality_selected s
      where not exists (
        select 1 from public.locality_seo_memberships m where m.surface=s.surface and m.canonical_path=s.canonical_path and m.left_at is null
      ) on conflict do nothing;

    update public.locality_seo_memberships m set score=c.score, evidence=c.evidence, last_seen_at=now(), updated_at=now()
      from locality_candidates c where m.surface=c.surface and m.canonical_path=c.canonical_path and m.left_at is null;
    drop table locality_selected;
  end loop;

  return jsonb_build_object(
    'soldPrices', (select count(*) from public.locality_seo_memberships where surface='sold_prices' and left_at is null),
    'planning', (select count(*) from public.locality_seo_memberships where surface='planning' and left_at is null)
  );
end;
$$;

create or replace function public.openlist_locality_seo_sitemap(p_surface text, p_limit integer default 100)
returns table(canonical_path text, last_modified timestamptz)
language sql stable security definer set search_path = public as $$
  select canonical_path, updated_at
  from public.locality_seo_memberships
  where surface = p_surface and left_at is null
  order by score desc, canonical_path
  limit greatest(1, least(p_limit, 5000))
$$;

grant execute on function public.openlist_locality_seo_sitemap(text, integer) to anon, authenticated, service_role;

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
language sql stable security definer set search_path = public as $$
  with active_counts as (
    select
      p.local_authority_code as authority_code,
      public.openlist_planning_locality(p.location, p.ward, p.local_authority_code) as locality_label,
      count(*)::bigint as active_count
    from public.planning_applications p
    where p.normalized_status in ('pre_validation','registered','under_assessment','further_information_requested','further_information_received','appealed')
    group by p.local_authority_code, public.openlist_planning_locality(p.location, p.ward, p.local_authority_code)
  )
  select m.canonical_path, m.county, m.authority_code, m.locality_label, m.locality_slug, m.evidence,
         coalesce(a.active_count, 0)::bigint as active_count
  from public.locality_seo_memberships m
  left join active_counts a
    on a.authority_code = m.authority_code and lower(a.locality_label) = lower(m.locality_label)
  where m.surface = 'planning' and m.left_at is null
  order by m.score desc, m.canonical_path
  limit greatest(1, least(p_limit, 3000))
$$;

revoke all on function public.openlist_planning_locality_directory(integer) from public, anon, authenticated;
grant execute on function public.openlist_planning_locality_directory(integer) to service_role;