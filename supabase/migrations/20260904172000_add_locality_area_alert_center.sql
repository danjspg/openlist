alter table public.planning_area_alert_subscriptions
  drop constraint if exists planning_area_alert_category_check;

alter table public.planning_area_alert_subscriptions
  add constraint planning_area_alert_category_check check (category in (
    'all', 'significant-development', 'residential-development', 'large-residential',
    'wind-farms', 'solar-energy', 'battery-storage', 'retail', 'hotels-restaurants',
    'student-accommodation', 'data-centres', 'infrastructure', 'transport',
    'industrial-logistics', 'waste-recycling', 'quarrying'
  ));

create or replace function public.openlist_planning_locality_alert_center(
  p_authority_code text,
  p_locality_slug text
)
returns table(
  center_lat double precision,
  center_lng double precision,
  sample_count integer
)
language sql
stable
security invoker
set search_path = ''
set statement_timeout = '5s'
as $$
  with membership as materialized (
    select m.locality_label
    from public.locality_seo_memberships m
    where m.surface = 'planning'
      and m.left_at is null
      and m.authority_code = p_authority_code
      and m.locality_slug = p_locality_slug
    limit 1
  ), candidate_ids as materialized (
    select p.id, p.registration_date
    from public.planning_applications p
    cross join membership m
    where p.local_authority_code = p_authority_code
      and public.openlist_planning_locality(
        p.location,
        p.ward,
        p.local_authority_code
      ) = m.locality_label
    order by p.registration_date desc nulls last, p.id
    limit 500
  ), points as materialized (
    select
      l.application_id,
      l.location_geog,
      extensions.st_y(l.location_geog::extensions.geometry) as lat,
      extensions.st_x(l.location_geog::extensions.geometry) as lng
    from candidate_ids c
    join public.planning_application_locations l
      on l.application_id = c.id
    where l.location_geog is not null
  ), medians as (
    select
      percentile_cont(0.5) within group (order by lat) as median_lat,
      percentile_cont(0.5) within group (order by lng) as median_lng,
      count(*)::integer as sample_count
    from points
  ), chosen as (
    select p.lat, p.lng, m.sample_count
    from points p
    cross join medians m
    where m.sample_count > 0
    order by p.location_geog OPERATOR(extensions.<->) extensions.st_setsrid(
      extensions.st_makepoint(m.median_lng, m.median_lat),
      4326
    )::extensions.geography
    limit 1
  )
  select lat, lng, sample_count
  from chosen;
$$;

revoke all on function public.openlist_planning_locality_alert_center(text, text) from public, anon, authenticated;
grant execute on function public.openlist_planning_locality_alert_center(text, text) to service_role;

comment on function public.openlist_planning_locality_alert_center(text, text) is
  'Returns a robust representative mapped point for an OpenList planning locality by selecting the mapped application nearest the median latitude/longitude of up to 500 recent locality applications.';
