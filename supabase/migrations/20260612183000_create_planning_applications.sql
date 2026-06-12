create table if not exists public.planning_applications (
  id uuid primary key default gen_random_uuid(),
  local_authority text not null,
  local_authority_code text not null,
  source_application_id bigint null,
  reference text not null,
  web_reference text null,
  application_type text null,
  proposal text null,
  location text null,
  applicant_name text null,
  agent_name text null,
  status text null,
  decision_text text null,
  registration_date date null,
  valid_date date null,
  decision_date date null,
  final_grant_date date null,
  appeal_lodged_date date null,
  appeal_decision_date date null,
  dispatch_date date null,
  appeal_notify_date date null,
  ward text null,
  area_ids int[] null,
  ward_ids int[] null,
  parish_ids int[] null,
  grid_reference text null,
  grid_easting numeric null,
  grid_northing numeric null,
  pending_amendment boolean null,
  source_url text null,
  source_api_url text null,
  source_payload jsonb null,
  ingested_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint planning_applications_authority_reference_key
    unique (local_authority_code, reference)
);

create index if not exists planning_applications_authority_idx
  on public.planning_applications (local_authority_code);

create index if not exists planning_applications_registration_date_idx
  on public.planning_applications (registration_date desc);

create index if not exists planning_applications_status_idx
  on public.planning_applications (status);

create index if not exists planning_applications_location_search_idx
  on public.planning_applications using gin (
    to_tsvector('english', coalesce(location, '') || ' ' || coalesce(proposal, ''))
  );

alter table public.planning_applications enable row level security;

drop policy if exists "Public read planning applications" on public.planning_applications;
create policy "Public read planning applications"
  on public.planning_applications
  for select
  to anon, authenticated
  using (true);

grant select on public.planning_applications to anon, authenticated;
grant select, insert, update, delete on public.planning_applications to service_role;
