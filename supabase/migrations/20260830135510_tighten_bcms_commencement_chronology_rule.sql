create or replace function public.openlist_bcms_link_eligible(p_application_id uuid, p_notice_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public','pg_catalog'
as $$
  select coalesce((
    select
      coalesce(p.application_type,'') !~* 'extension\s+of\s+duration'
      and (
        n.commencement_date is null
        or p.registration_date is null
        or n.commencement_date >= p.registration_date
      )
      and (
        n.commencement_date is null
        or coalesce(p.application_type,'') ~* 'retention'
        or p.decision_date is null
        or n.commencement_date >= p.decision_date
      )
    from public.planning_applications p
    join public.building_control_notices n on n.id = p_notice_id
    where p.id = p_application_id
  ), false)
$$;
