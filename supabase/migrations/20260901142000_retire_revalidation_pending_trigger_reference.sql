create or replace function public.openlist_set_planning_content_updated_at()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
begin
  -- Revalidation now lives in the dedicated planning_revalidation_queue table.
  -- Any actual change to planning_applications should advance updated_at.
  if new is distinct from old then
    new.updated_at := now();
  end if;
  return new;
end;
$function$;
