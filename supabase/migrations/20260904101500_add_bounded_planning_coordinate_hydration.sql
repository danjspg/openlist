-- Hydrate planning coordinates from a pre-fetched national coordinate snapshot.
-- External acquisition is intentionally decoupled from this database write path.
-- This function is service-role only and bounded to at most 250 source rows per call.

create or replace function public.openlist_hydrate_planning_coordinates(p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '10s'
as $function$
declare
  v_processed integer := 0;
  v_matched integer := 0;
  v_updated integer := 0;
  v_skipped_existing integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  if jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 250 then
    raise exception 'p_rows must contain between 1 and 250 rows';
  end if;

  with source_rows as (
    select distinct on (local_authority_code, reference)
      nullif(btrim(local_authority_code), '') as local_authority_code,
      nullif(btrim(reference), '') as reference,
      grid_easting,
      grid_northing
    from pg_catalog.jsonb_to_recordset(p_rows) as x(
      local_authority_code text,
      reference text,
      grid_easting double precision,
      grid_northing double precision
    )
    where nullif(btrim(local_authority_code), '') is not null
      and nullif(btrim(reference), '') is not null
      and grid_easting is not null
      and grid_northing is not null
    order by local_authority_code, reference
  ),
  matched as (
    select
      p.id,
      p.grid_easting as existing_easting,
      p.grid_northing as existing_northing,
      s.grid_easting,
      s.grid_northing
    from source_rows s
    join public.planning_applications p
      on p.local_authority_code = s.local_authority_code
     and p.reference = s.reference
  ),
  updated as (
    update public.planning_applications p
    set
      grid_easting = m.grid_easting,
      grid_northing = m.grid_northing
    from matched m
    where p.id = m.id
      and (m.existing_easting is null or m.existing_northing is null)
    returning p.id
  )
  select
    (select count(*) from source_rows),
    (select count(*) from matched),
    (select count(*) from updated),
    (select count(*) from matched where existing_easting is not null and existing_northing is not null)
  into v_processed, v_matched, v_updated, v_skipped_existing;

  return pg_catalog.jsonb_build_object(
    'processed', v_processed,
    'updated', v_updated,
    'skipped_existing', v_skipped_existing,
    'missing', greatest(v_processed - v_matched, 0)
  );
end;
$function$;

revoke all on function public.openlist_hydrate_planning_coordinates(jsonb) from public;
revoke all on function public.openlist_hydrate_planning_coordinates(jsonb) from anon;
revoke all on function public.openlist_hydrate_planning_coordinates(jsonb) from authenticated;
grant execute on function public.openlist_hydrate_planning_coordinates(jsonb) to service_role;

comment on function public.openlist_hydrate_planning_coordinates(jsonb) is
  'Bounded service-role hydration of missing planning ITM coordinates from an externally acquired snapshot. Existing complete coordinates are preserved.';
