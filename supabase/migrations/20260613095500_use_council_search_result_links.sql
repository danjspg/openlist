update public.planning_applications
set
  source_url =
    'https://planning.agileapplications.ie/corkcoco/search-applications/results?criteria=' ||
    '%7B%22query%22%3A%22' ||
    replace(reference, '/', '%2F') ||
    '%22%7D',
  updated_at = now()
where
  local_authority_code = 'CORKCOCO'
  and reference is not null;
