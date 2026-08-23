alter table public.planning_applications
  add column if not exists status_source text,
  add column if not exists status_observed_at timestamptz;

comment on column public.planning_applications.status_source is
  'Provenance for canonical status when a higher-priority source must be protected. Currently set only for ePlan-observed alert applications.';
comment on column public.planning_applications.status_observed_at is
  'Time the protected canonical status value was observed at its provenance source.';

create or replace function public.openlist_guard_eplan_status_precedence()
returns trigger
language plpgsql
as $$
begin
  -- ePlan is consulted only for the small watched-application cohort, but its
  -- application-detail status can be fresher than the national ArcGIS feed.
  -- Ordinary ingestion does not write status_observed_at. Therefore a status
  -- change that leaves the protected observation timestamp untouched is a
  -- lower-priority overwrite attempt and must not regress the canonical row.
  if old.status_source = 'eplan'
     and new.status is distinct from old.status
     and new.status_observed_at is not distinct from old.status_observed_at then
    new.status := old.status;
    new.status_source := old.status_source;
    new.status_observed_at := old.status_observed_at;
  end if;

  -- Do not allow provenance to be silently cleared by a broad row upsert.
  if old.status_source = 'eplan'
     and new.status_source is distinct from 'eplan'
     and new.status_observed_at is not distinct from old.status_observed_at then
    new.status_source := old.status_source;
    new.status_observed_at := old.status_observed_at;
  end if;

  return new;
end;
$$;

drop trigger if exists planning_application_guard_eplan_status on public.planning_applications;
create trigger planning_application_guard_eplan_status
before update of status, status_source, status_observed_at on public.planning_applications
for each row
execute function public.openlist_guard_eplan_status_precedence();
