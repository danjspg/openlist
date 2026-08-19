alter table public.planning_applications
  add column if not exists revalidation_pending boolean not null default false;

create index if not exists planning_applications_revalidation_pending_idx
  on public.planning_applications (updated_at, id)
  where revalidation_pending = true;

-- Content writes need a revision marker for race-safe queue draining. Clearing
-- queue bookkeeping alone deliberately preserves the content revision.
create or replace function public.openlist_set_planning_content_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if (to_jsonb(new) - 'updated_at' - 'revalidation_pending')
     is distinct from
     (to_jsonb(old) - 'updated_at' - 'revalidation_pending') then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists planning_applications_content_updated_at on public.planning_applications;
create trigger planning_applications_content_updated_at
before update on public.planning_applications
for each row execute function public.openlist_set_planning_content_updated_at();
