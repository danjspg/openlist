update public.planning_applications
set
  source_url =
    'https://planning.agileapplications.ie/corkcoco/application-details/?ref=' ||
    replace(reference, '/', '%2F'),
  updated_at = now()
where
  local_authority_code = 'CORKCOCO'
  and reference is not null;
