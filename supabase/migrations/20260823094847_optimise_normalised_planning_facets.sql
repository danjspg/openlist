create index if not exists planning_applications_normalized_status_idx
  on public.planning_applications (normalized_status, registration_date desc);

create index if not exists planning_applications_normalized_application_type_idx
  on public.planning_applications (
    public.openlist_planning_application_type_key(application_type),
    registration_date desc
  );
