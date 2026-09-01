begin;

-- The dedicated planning_revalidation_queue is now the sole exact-path cache
-- invalidation mechanism. Refuse to discard work if an old writer somehow
-- reappears before this migration is applied.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'planning_applications'
      and column_name = 'revalidation_pending'
  ) then
    if exists (
      select 1
      from public.planning_applications
      where revalidation_pending = true
      limit 1
    ) then
      raise exception 'Cannot retire planning_applications.revalidation_pending while pending rows exist';
    end if;

    alter table public.planning_applications
      drop column revalidation_pending;
  end if;
end
$$;

-- Category pages now use the active-aware exact-membership RPC exclusively.
-- Keep migration history intact, but remove superseded callable surfaces so
-- new code cannot accidentally regress to the older category mechanisms.
drop function if exists public.openlist_planning_public_category_index(boolean, integer);
drop function if exists public.openlist_planning_public_category_page(text, boolean, text, integer, integer);

commit;
