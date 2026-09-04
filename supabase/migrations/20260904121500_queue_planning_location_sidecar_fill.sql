-- Make sidecar hydration progress explicitly through the staging table so each
-- batch only scans unprocessed source rows instead of repeatedly anti-joining
-- against an ever-growing sidecar table.

alter table public.openlist_planning_coordinate_stage
  add column if not exists sidecar_done boolean not null default false;

-- Mark rows already materialised in the sidecar as done. This is safe and
-- cheap because the staging table is UNLOGGED and the sidecar is narrow.
update public.openlist_planning_coordinate_stage s
set sidecar_done = true
from public.planning_applications p
join public.planning_application_locations l on l.application_id = p.id
where p.local_authority_code = s.local_authority_code
  and p.reference = s.reference
  and not s.sidecar_done;

create index if not exists openlist_planning_coordinate_stage_sidecar_pending_idx
  on public.openlist_planning_coordinate_stage(local_authority_code, reference)
  where not ambiguous and not sidecar_done;

create or replace function public.openlist_fill_planning_location_sidecar(p_limit integer default 5000)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '30s'
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit,5000),1),5000);
  v_processed integer := 0;
  v_inserted integer := 0;
begin
  with candidates as materialized (
    select
      s.local_authority_code,
      s.reference,
      p.id as application_id,
      s.grid_easting,
      s.grid_northing
    from public.openlist_planning_coordinate_stage s
    join public.planning_applications p
      on p.local_authority_code = s.local_authority_code
     and p.reference = s.reference
    where not s.ambiguous
      and not s.sidecar_done
    order by s.local_authority_code, s.reference
    limit v_limit
    for update of s skip locked
  ), inserted as (
    insert into public.planning_application_locations(
      application_id, grid_easting, grid_northing, location_geog, source
    )
    select
      c.application_id,
      c.grid_easting,
      c.grid_northing,
      extensions.st_transform(
        extensions.st_setsrid(
          extensions.st_makepoint(c.grid_easting, c.grid_northing),
          2157
        ),
        4326
      )::extensions.geography,
      'national_arcgis'
    from candidates c
    on conflict (application_id) do nothing
    returning application_id
  ), marked as (
    update public.openlist_planning_coordinate_stage s
    set sidecar_done = true
    from candidates c
    where s.local_authority_code = c.local_authority_code
      and s.reference = c.reference
    returning 1
  )
  select
    (select count(*)::integer from candidates),
    (select count(*)::integer from inserted)
  into v_processed, v_inserted;

  return pg_catalog.jsonb_build_object(
    'processed', v_processed,
    'inserted', v_inserted
  );
end;
$function$;

revoke all on function public.openlist_fill_planning_location_sidecar(integer)
  from public, anon, authenticated;
grant execute on function public.openlist_fill_planning_location_sidecar(integer)
  to service_role;

create or replace function public.openlist_planning_location_sidecar_status()
returns jsonb
language sql
security invoker
set search_path = ''
set statement_timeout = '30s'
as $function$
select pg_catalog.jsonb_build_object(
  'locations', (select count(*) from public.planning_application_locations),
  'ambiguous_source_keys', (select count(*) from public.openlist_planning_coordinate_stage where ambiguous),
  'remaining_matched', (
    select count(*)
    from public.openlist_planning_coordinate_stage s
    join public.planning_applications p
      on p.local_authority_code = s.local_authority_code
     and p.reference = s.reference
    where not s.ambiguous and not s.sidecar_done
  )
);
$function$;
