drop index if exists public.planning_applications_construction_commenced_registration_idx;

create index if not exists planning_applications_construction_commenced_registration_idx
on public.planning_applications (registration_date desc nulls last, reference desc)
where construction_status = 'commenced';

create index if not exists planning_applications_construction_commenced_authority_registration_idx
on public.planning_applications (local_authority_code, registration_date desc nulls last, reference desc)
where construction_status = 'commenced';
