-- Spatial foundation for saved Eircode/radius alerts.
--
-- Keep the canonical source coordinates on planning_applications in Irish
-- Transverse Mercator (EPSG:2157), and maintain a WGS84 geography point for
-- indexed radius queries. Historical population is intentionally NOT performed
-- by this migration: it is exposed as a bounded service-role RPC so production
-- can be filled gradually without a large write spike.

create extension if not exists postgis with schema extensions;

alter table public.planning_applications
  add column if not exists location_geog extensions.geography(Point, 4326);

comment on column public.planning_applications.location_geog is
  'PostGIS WGS84 point derived from grid_easting/grid_northing (Irish Transverse Mercator EPSG:2157) for indexed radius matching.';

-- A geography-only maintenance write must not make an application look like its
-- planning content changed. Real coordinate changes still advance updated_at
-- because grid_easting/grid_northing themselves differ.
create or replace function public.openlist_set_planning_content_updated_at()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
begin
  if (to_jsonb(new) - 'updated_at' - 'location_geog')
     is distinct from
     (to_jsonb(old) - 'updated_at' - 'location_geog') then
    new.updated_at := now();
  end if;
  return new;
end;
$function$;

create or replace function public.openlist_set_planning_location_geog()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.grid_easting is not null
     and new.grid_northing is not null
     and new.grid_easting > 0
     and new.grid_northing > 0 then
    new.location_geog := extensions.st_transform(
      extensions.st_setsrid(
        extensions.st_makepoint(
          new.grid_easting::double precision,
          new.grid_northing::double precision
        ),
        2157
      ),
      4326
    )::extensions.geography;
  else
    new.location_geog := null;
  end if;
  return new;
end;
$$;

revoke all on function public.openlist_set_planning_location_geog() from public, anon, authenticated;
grant execute on function public.openlist_set_planning_location_geog() to service_role;

drop trigger if exists planning_applications_location_geog_sync on public.planning_applications;
create trigger planning_applications_location_geog_sync
before insert or update of grid_easting, grid_northing
on public.planning_applications
for each row
execute function public.openlist_set_planning_location_geog();

create index if not exists planning_applications_location_geog_gist_idx
  on public.planning_applications
  using gist (location_geog)
  where location_geog is not null;

-- Populate historical rows in deliberately small, resumable chunks. The caller
-- owns pacing between calls. p_after_id avoids repeatedly scanning already
-- processed rows, while a null cursor starts/restarts from the beginning and is
-- still idempotent because populated rows are skipped.
create or replace function public.openlist_backfill_planning_location_geog(
  p_limit integer default 250,
  p_after_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '15s'
as $$
declare
  v_processed integer := 0;
  v_next_id uuid := null;
begin
  if p_limit < 1 or p_limit > 1000 then
    raise exception 'p_limit must be between 1 and 1000';
  end if;

  with candidates as (
    select a.id
    from public.planning_applications a
    where a.grid_easting is not null
      and a.grid_northing is not null
      and a.grid_easting > 0
      and a.grid_northing > 0
      and a.location_geog is null
      and (p_after_id is null or a.id > p_after_id)
    order by a.id
    limit p_limit
    for update skip locked
  ), updated as (
    update public.planning_applications a
    set location_geog = extensions.st_transform(
      extensions.st_setsrid(
        extensions.st_makepoint(
          a.grid_easting::double precision,
          a.grid_northing::double precision
        ),
        2157
      ),
      4326
    )::extensions.geography
    from candidates c
    where a.id = c.id
    returning a.id
  )
  select count(*)::integer, max(id)
  into v_processed, v_next_id
  from updated;

  return jsonb_build_object(
    'processed', v_processed,
    'next_id', v_next_id,
    'done', v_processed = 0
  );
end;
$$;

revoke all on function public.openlist_backfill_planning_location_geog(integer, uuid)
  from public, anon, authenticated;
grant execute on function public.openlist_backfill_planning_location_geog(integer, uuid)
  to service_role;

-- Internal primitive for area-alert matching. The public application payload is
-- deliberately not returned here; callers receive IDs and distances only and
-- can load the small matched set separately.
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
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
  select
    a.id,
    extensions.st_distance(
      a.location_geog,
      extensions.st_setsrid(
        extensions.st_makepoint(p_lng, p_lat),
        4326
      )::extensions.geography
    ) as distance_m
  from public.planning_applications a
  where a.location_geog is not null
    and p_radius_m between 1 and 50000
    and p_limit between 1 and 1000
    and extensions.st_dwithin(
      a.location_geog,
      extensions.st_setsrid(
        extensions.st_makepoint(p_lng, p_lat),
        4326
      )::extensions.geography,
      p_radius_m
    )
  order by a.location_geog <-> extensions.st_setsrid(
    extensions.st_makepoint(p_lng, p_lat),
    4326
  )::extensions.geography
  limit p_limit;
$$;

revoke all on function public.openlist_planning_applications_within_radius(double precision, double precision, integer, integer)
  from public, anon, authenticated;
grant execute on function public.openlist_planning_applications_within_radius(double precision, double precision, integer, integer)
  to service_role;
