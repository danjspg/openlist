update public.planning_applications
set
  source_url =
    'https://planning.agileapplications.ie/corkcoco/application-details/' ||
    source_application_id,
  updated_at = now()
where
  local_authority_code = 'CORKCOCO'
  and source_application_id is not null
  and (
    source_url is null
    or source_url like '%/application-details/%2F%'
    or source_url like '%/application-details/%/%'
  );
