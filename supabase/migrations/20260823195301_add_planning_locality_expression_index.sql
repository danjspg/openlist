create index if not exists planning_applications_authority_locality_registration_idx
on public.planning_applications (
  local_authority_code,
  public.openlist_planning_locality(location, ward, local_authority_code),
  registration_date desc
)
include (normalized_status, application_type, grid_easting, grid_northing);
