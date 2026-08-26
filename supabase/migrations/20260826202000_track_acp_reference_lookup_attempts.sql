alter table public.planning_appeal_cases
  add column if not exists planning_reference_lookup_attempted_at timestamptz,
  add column if not exists planning_reference_lookup_status text,
  add column if not exists planning_reference_lookup_error text;

alter table public.planning_appeal_cases
  drop constraint if exists planning_appeal_cases_reference_lookup_status_check;

alter table public.planning_appeal_cases
  add constraint planning_appeal_cases_reference_lookup_status_check
  check (planning_reference_lookup_status is null or planning_reference_lookup_status in ('found','not_found','failed'));

create index if not exists planning_appeal_cases_reference_lookup_backlog_idx
  on public.planning_appeal_cases (decision_date desc, source_updated_at desc)
  where lower(coalesce(category,'')) like 'appeals%'
    and decision_date is not null
    and planning_authority_case_reference is null
    and planning_reference_lookup_status is null;
