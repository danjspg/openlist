-- Treat obvious source sentinels / corrupt future dates as unknown rather than
-- publishing impossible lifecycle facts. This deliberately does not alter merely
-- suspicious date ordering: only dates that cannot plausibly be real are removed.
create or replace function public.openlist_sanitize_impossible_appeal_dates()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if new.appeal_lodged_date is not null
     and (new.appeal_lodged_date <= date '1900-01-01'
          or new.appeal_lodged_date > current_date + interval '2 years') then
    new.appeal_lodged_date := null;
  end if;

  if new.appeal_decision_date is not null
     and (new.appeal_decision_date <= date '1900-01-01'
          or new.appeal_decision_date > current_date + interval '2 years') then
    new.appeal_decision_date := null;
  end if;

  return new;
end;
$function$;

drop trigger if exists planning_applications_sanitize_impossible_appeal_dates
  on public.planning_applications;
create trigger planning_applications_sanitize_impossible_appeal_dates
before insert or update of appeal_lodged_date, appeal_decision_date
on public.planning_applications
for each row execute function public.openlist_sanitize_impossible_appeal_dates();

with repaired as (
  update public.planning_applications
  set
    appeal_lodged_date = case
      when appeal_lodged_date <= date '1900-01-01'
        or appeal_lodged_date > current_date + interval '2 years' then null
      else appeal_lodged_date
    end,
    appeal_decision_date = case
      when appeal_decision_date <= date '1900-01-01'
        or appeal_decision_date > current_date + interval '2 years' then null
      else appeal_decision_date
    end,
    updated_at = now()
  where (appeal_lodged_date is not null and (
           appeal_lodged_date <= date '1900-01-01'
           or appeal_lodged_date > current_date + interval '2 years'))
     or (appeal_decision_date is not null and (
           appeal_decision_date <= date '1900-01-01'
           or appeal_decision_date > current_date + interval '2 years'))
  returning id
), queued as (
  insert into public.planning_revalidation_queue(application_id, requested_at, updated_at)
  select id, now(), now() from repaired
  on conflict (application_id) do update
    set requested_at = excluded.requested_at,
        updated_at = excluded.updated_at
  returning application_id
)
select count(*) from queued;

-- Canonical lifecycle events are derived from the same source fields. Remove only
-- impossible appeal dates so timelines cannot retain a value already quarantined
-- from the canonical application row.
delete from public.planning_canonical_events
where event_type in ('appeal_lodged', 'appeal_decided')
  and (event_date <= date '1900-01-01'
       or event_date > current_date + interval '2 years');
