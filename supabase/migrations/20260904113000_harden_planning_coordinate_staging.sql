-- Harden coordinate staging against duplicate authority/reference rows in the national source.
-- Conflicting coordinates are quarantined as ambiguous and are never auto-hydrated.

alter table public.openlist_planning_coordinate_stage
  add column if not exists ambiguous boolean not null default false;

create or replace function public.openlist_stage_planning_coordinates(p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '15s'
as $function$
declare
  v_staged integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;
  if jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 5000 then
    raise exception 'p_rows must contain 1..5000 rows';
  end if;

  with parsed as (
    select
      nullif(btrim(local_authority_code),'') as local_authority_code,
      nullif(btrim(reference),'') as reference,
      grid_easting,
      grid_northing
    from pg_catalog.jsonb_to_recordset(p_rows) as x(
      local_authority_code text,
      reference text,
      grid_easting double precision,
      grid_northing double precision
    )
    where nullif(btrim(local_authority_code),'') is not null
      and nullif(btrim(reference),'') is not null
      and grid_easting is not null
      and grid_northing is not null
  ), grouped as (
    select
      local_authority_code,
      reference,
      min(grid_easting) as grid_easting,
      min(grid_northing) as grid_northing,
      (min(grid_easting) is distinct from max(grid_easting)
       or min(grid_northing) is distinct from max(grid_northing)) as ambiguous
    from parsed
    group by local_authority_code, reference
  )
  insert into public.openlist_planning_coordinate_stage(
    local_authority_code, reference, grid_easting, grid_northing, ambiguous
  )
  select local_authority_code, reference, grid_easting, grid_northing, ambiguous
  from grouped
  on conflict (local_authority_code,reference) do update
  set ambiguous = public.openlist_planning_coordinate_stage.ambiguous
                  or excluded.ambiguous
                  or public.openlist_planning_coordinate_stage.grid_easting is distinct from excluded.grid_easting
                  or public.openlist_planning_coordinate_stage.grid_northing is distinct from excluded.grid_northing;

  get diagnostics v_staged = row_count;
  return pg_catalog.jsonb_build_object('staged',v_staged);
end;
$function$;

create or replace function public.openlist_process_staged_planning_coordinates(p_limit integer default 250)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '10s'
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit,250),1),1000);
  v_updated integer := 0;
  v_pending bigint := 0;
begin
  with candidates as (
    select p.id,s.grid_easting,s.grid_northing
    from public.openlist_planning_coordinate_stage s
    join public.planning_applications p
      on p.local_authority_code=s.local_authority_code
     and p.reference=s.reference
    where not s.ambiguous
      and (p.grid_easting is null or p.grid_northing is null)
    order by p.id
    limit v_limit
    for update of p skip locked
  ), updated as (
    update public.planning_applications p
    set grid_easting=c.grid_easting,
        grid_northing=c.grid_northing
    from candidates c
    where p.id=c.id
    returning p.id
  )
  select count(*) into v_updated from updated;

  select count(*) into v_pending
  from public.openlist_planning_coordinate_stage s
  join public.planning_applications p
    on p.local_authority_code=s.local_authority_code
   and p.reference=s.reference
  where not s.ambiguous
    and (p.grid_easting is null or p.grid_northing is null);

  return pg_catalog.jsonb_build_object('updated',v_updated,'pending',v_pending);
end;
$function$;

create or replace function public.openlist_planning_coordinate_stage_status()
returns jsonb
language sql
security invoker
set search_path=''
set statement_timeout='10s'
as $function$
select pg_catalog.jsonb_build_object(
 'staged',(select count(*) from public.openlist_planning_coordinate_stage),
 'ambiguous',(select count(*) from public.openlist_planning_coordinate_stage where ambiguous),
 'matched',(select count(*) from public.openlist_planning_coordinate_stage s join public.planning_applications p on p.local_authority_code=s.local_authority_code and p.reference=s.reference),
 'pending',(select count(*) from public.openlist_planning_coordinate_stage s join public.planning_applications p on p.local_authority_code=s.local_authority_code and p.reference=s.reference where not s.ambiguous and (p.grid_easting is null or p.grid_northing is null))
);
$function$;
