create index if not exists planning_applications_authority_normalized_reference_idx
on public.planning_applications (
  local_authority_code,
  upper(regexp_replace(coalesce(reference,''),'[^A-Za-z0-9]','','g'))
);
