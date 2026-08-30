-- Preserve the historical null-authority behaviour for any direct RPC callers while
-- routing canonical authority/locality requests through the optimized implementation.

alter function public.openlist_planning_area_aggregate(text, text)
  rename to openlist_planning_area_aggregate_indexed;

create or replace function public.openlist_planning_area_aggregate(
  p_authority_code text,
  p_area text
)
returns jsonb
language plpgsql
stable
set search_path = public
set statement_timeout = '10s'
as $function$
begin
  if p_authority_code is null then
    return public.openlist_planning_dashboard_aggregate_generic(
      null,
      null,
      p_area,
      null,
      null
    );
  end if;

  return public.openlist_planning_area_aggregate_indexed(
    p_authority_code,
    p_area
  );
end;
$function$;

comment on function public.openlist_planning_area_aggregate(text, text) is
  'Routes canonical authority/locality dashboards to the indexed aggregate while preserving the null-authority fallback.';
