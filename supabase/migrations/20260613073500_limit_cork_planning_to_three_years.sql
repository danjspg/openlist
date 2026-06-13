delete from public.planning_applications
where
  local_authority_code = 'CORKCOCO'
  and registration_date < date '2023-06-13';

delete from public.planning_commencements
where
  local_authority_code = 'CORKCOCO'
  and (
    period_month < date '2023-05-01'
    or period_month > date '2026-04-01'
  );
