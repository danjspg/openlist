-- Store spatial enrichment separately from the heavy planning_applications rows.
-- Historical population is performed operationally from the reproducible national
-- coordinate stage, then the GiST index is added after the bulk load.

create table if not exists public.planning_application_locations (
  application_id uuid primary key references public.planning_applications(id) on delete cascade,
  grid_easting double precision not null,
  grid_northing double precision not null,
  location_geog extensions.geography(Point, 4326) not null,
  source text not null default 'national_arcgis',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_application_locations_positive_grid
    check (grid_easting > 0 and grid_northing > 0)
);

comment on table public.planning_application_locations is
  'Spatial enrichment sidecar for planning applications. Keeps coordinate and PostGIS maintenance off planning_applications.';

revoke all on table public.planning_application_locations from public, anon, authenticated;
grant select, insert, update, delete on table public.planning_application_locations to service_role;

create or replace function public.openlist_fill_planning_location_sidecar(p_limit integer default 10000)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '30s'
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit,10000),1),50000);
  v_inserted integer := 0;
begin
  with candidates as (
    select
      p.id as application_id,
      s.grid_easting,
      s.grid_northing
    from public.openlist_planning_coordinate_stage s
    join public.planning_applications p
      on p.local_authority_code = s.local_authority_code
     and p.reference = s.reference
    left join public.planning_application_locations l
      on l.application_id = p.id
    where not s.ambiguous
      and l.application_id is null
    limit v_limit
  ), inserted as (
    insert into public.planning_application_locations(
      application_id,
      grid_easting,
      grid_northing,
      location_geog,
      source
    )
    select
      application_id,
      grid_easting,
      grid_northing,
      extensions.st_transform(
        extensions.st_setsrid(
          extensions.st_makepoint(grid_easting, grid_northing),
          2157
        ),
        4326
      )::extensions.geography,
      'national_arcgis'
    from candidates
    on conflict (application_id) do nothing
    returning application_id
  )
  select count(*) into v_inserted from inserted;

  return pg_catalog.jsonb_build_object('inserted', v_inserted);
end;
$function$;

create or replace function public.openlist_planning_location_sidecar_status()
returns jsonb
language sql
security invoker
set search_path = ''
set statement_timeout = '30s'
as $function$
  select pg_catalog.jsonb_build_object(
    'locations', (select count(*) from public.planning_application_locations),
    'ambiguous_source_keys', (select count(*) from public.openlist_planning_coordinate_stage where ambiguous)
  );
$function$;

revoke all on function public.openlist_fill_planning_location_sidecar(integer) from public, anon, authenticated;
revoke all on function public.openlist_planning_location_sidecar_status() from public, anon, authenticated;
grant execute on function public.openlist_fill_planning_location_sidecar(integer) to service_role;
grant execute on function public.openlist_planning_location_sidecar_status() to service_role;
