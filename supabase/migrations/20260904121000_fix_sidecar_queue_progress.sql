-- Process the staging queue independently of application matches.
-- This avoids repeatedly scanning historical source rows that do not exist in
-- OpenList (notably older Cork/DLR/South Dublin records) as the matched set is
-- exhausted.
create or replace function public.openlist_fill_planning_location_sidecar(
  p_limit integer default 5000
)
returns jsonb
language plpgsql
set search_path = ''
set statement_timeout = '30s'
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit,5000),1),5000);
  v_processed integer := 0;
  v_inserted integer := 0;
begin
  with candidates as materialized (
    select s.local_authority_code,s.reference,s.grid_easting,s.grid_northing
    from public.openlist_planning_coordinate_stage s
    where not s.ambiguous and not s.sidecar_done
    order by s.local_authority_code,s.reference
    limit v_limit
    for update of s skip locked
  ), matched as materialized (
    select c.local_authority_code,c.reference,c.grid_easting,c.grid_northing,p.id as application_id
    from candidates c
    join public.planning_applications p
      on p.local_authority_code = c.local_authority_code
     and p.reference = c.reference
  ), inserted as (
    insert into public.planning_application_locations(
      application_id,grid_easting,grid_northing,location_geog,source
    )
    select m.application_id,m.grid_easting,m.grid_northing,
      extensions.st_transform(
        extensions.st_setsrid(
          extensions.st_makepoint(m.grid_easting,m.grid_northing),2157
        ),4326
      )::extensions.geography,
      'national_arcgis'
    from matched m
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
  into v_processed,v_inserted;

  return pg_catalog.jsonb_build_object(
    'processed',v_processed,
    'inserted',v_inserted,
    'missing',v_processed-v_inserted
  );
end;
$$;

create or replace function public.openlist_planning_location_sidecar_status()
returns jsonb
language sql
set search_path = ''
set statement_timeout = '30s'
as $$
select pg_catalog.jsonb_build_object(
  'locations',(select count(*) from public.planning_application_locations),
  'queue_pending',(select count(*) from public.openlist_planning_coordinate_stage where not ambiguous and not sidecar_done),
  'queue_done',(select count(*) from public.openlist_planning_coordinate_stage where not ambiguous and sidecar_done),
  'ambiguous_source_keys',(select count(*) from public.openlist_planning_coordinate_stage where ambiguous)
);
$$;