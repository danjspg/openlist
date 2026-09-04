-- Finalise the planning application spatial sidecar after bulk hydration.
-- The sidecar is the canonical spatial query surface for radius alerts and maps.

alter table public.planning_application_locations
  add constraint planning_application_locations_application_id_fkey
  foreign key (application_id)
  references public.planning_applications(id)
  on delete cascade
  not valid;

alter table public.planning_application_locations
  validate constraint planning_application_locations_application_id_fkey;

create index if not exists planning_application_locations_geog_gist_idx
  on public.planning_application_locations
  using gist (location_geog);

create or replace function public.openlist_planning_applications_within_radius(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer,
  p_limit integer default 100
)
returns table (
  application_id uuid,
  distance_m double precision
)
language sql
stable
security invoker
set search_path = ''
set statement_timeout = '5s'
as $$
  select
    l.application_id,
    extensions.st_distance(
      l.location_geog,
      extensions.st_setsrid(
        extensions.st_makepoint(p_lng, p_lat),
        4326
      )::extensions.geography
    ) as distance_m
  from public.planning_application_locations l
  where p_radius_m between 1 and 50000
    and p_limit between 1 and 1000
    and extensions.st_dwithin(
      l.location_geog,
      extensions.st_setsrid(
        extensions.st_makepoint(p_lng, p_lat),
        4326
      )::extensions.geography,
      p_radius_m
    )
  order by l.location_geog OPERATOR(extensions.<->) extensions.st_setsrid(
    extensions.st_makepoint(p_lng, p_lat),
    4326
  )::extensions.geography
  limit p_limit;
$$;

revoke all on function public.openlist_planning_applications_within_radius(double precision, double precision, integer, integer)
  from public, anon, authenticated;
grant execute on function public.openlist_planning_applications_within_radius(double precision, double precision, integer, integer)
  to service_role;

comment on table public.planning_application_locations is
  'Spatial sidecar for planning applications. Holds reusable map/radius coordinates independently of planning lifecycle content.';
