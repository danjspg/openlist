create or replace function public.openlist_guard_planning_lifecycle_consistency()
returns trigger
language plpgsql
as $$
begin
  if new.appeal_decision_date is not null and new.normalized_status = 'appealed' then
    new.normalized_status := 'appeal_decided';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_openlist_guard_planning_lifecycle_consistency on public.planning_applications;
create trigger trg_openlist_guard_planning_lifecycle_consistency
before insert or update of normalized_status, appeal_decision_date
on public.planning_applications
for each row
execute function public.openlist_guard_planning_lifecycle_consistency();

update public.planning_applications
set normalized_status = 'appeal_decided', updated_at = now()
where normalized_status = 'appealed'
  and appeal_decision_date is not null;

create or replace function public.openlist_planning_lifecycle_inconsistencies()
returns table (
  severity text,
  anomaly_type text,
  application_id uuid,
  local_authority_code text,
  reference text,
  normalized_status text,
  event_date date,
  detail text
)
language sql
stable
as $$
  select
    'high'::text,
    'APPEAL_DECIDED_STILL_APPEALED'::text,
    p.id,
    p.local_authority_code,
    p.reference,
    p.normalized_status,
    p.appeal_decision_date,
    'Appeal decision date is present but current status is still appealed.'::text
  from public.planning_applications p
  where p.normalized_status = 'appealed'
    and p.appeal_decision_date is not null

  union all

  select
    'high'::text,
    'APPEAL_DATE_ORDER_ERROR'::text,
    p.id,
    p.local_authority_code,
    p.reference,
    p.normalized_status,
    p.appeal_decision_date,
    format('Appeal decision date %s precedes lodged date %s.', p.appeal_decision_date, p.appeal_lodged_date)::text
  from public.planning_applications p
  where p.appeal_lodged_date is not null
    and p.appeal_decision_date is not null
    and p.appeal_decision_date < p.appeal_lodged_date;
$$;

grant execute on function public.openlist_planning_lifecycle_inconsistencies() to service_role;
