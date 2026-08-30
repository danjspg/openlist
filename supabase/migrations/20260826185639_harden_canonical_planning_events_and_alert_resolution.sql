create or replace function public.openlist_is_canonical_planning_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.planning_application_events e
    where e.id = p_event_id
      and (
        (
          e.event_type in ('works_commenced','completion_certificate_validated')
          and e.event_source = 'nbco_bcms_open_data'
          and e.id = (
            select candidate.id
            from public.planning_application_events candidate
            where candidate.application_id = e.application_id
              and candidate.event_type = e.event_type
              and candidate.event_source = 'nbco_bcms_open_data'
              and candidate.event_date is not distinct from e.event_date
            order by candidate.detected_at desc, candidate.id desc
            limit 1
          )
        )
        or
        (
          e.event_type in ('appeal_lodged','appeal_decided')
          and e.id = (
            select candidate.id
            from public.planning_application_events candidate
            where candidate.application_id = e.application_id
              and candidate.event_type = e.event_type
              and candidate.event_date is not distinct from e.event_date
            order by
              public.openlist_planning_event_source_rank(candidate.event_type,candidate.event_source) desc,
              candidate.detected_at desc,
              candidate.id desc
            limit 1
          )
        )
        or
        e.event_type not in ('works_commenced','completion_certificate_validated','appeal_lodged','appeal_decided')
      )
  );
$$;

comment on function public.openlist_is_canonical_planning_event(uuid) is
'Resolves whether a raw planning event belongs to the canonical OpenList lifecycle. Appeal authority is resolved per application + event type + milestone date, preventing an unrelated ACP appeal milestone from suppressing distinct council history.';

create or replace function public.openlist_resolve_canonical_planning_event(p_event_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with observed as (
    select e.*
    from public.planning_application_events e
    where e.id = p_event_id
  )
  select case
    when o.event_type in ('appeal_lodged','appeal_decided') then (
      select candidate.id
      from public.planning_application_events candidate
      where candidate.application_id = o.application_id
        and candidate.event_type = o.event_type
        and candidate.event_date is not distinct from o.event_date
      order by
        public.openlist_planning_event_source_rank(candidate.event_type,candidate.event_source) desc,
        candidate.detected_at desc,
        candidate.id desc
      limit 1
    )
    when o.event_type in ('works_commenced','completion_certificate_validated') then (
      select candidate.id
      from public.planning_application_events candidate
      where candidate.application_id = o.application_id
        and candidate.event_type = o.event_type
        and candidate.event_source = 'nbco_bcms_open_data'
        and candidate.event_date is not distinct from o.event_date
      order by candidate.detected_at desc, candidate.id desc
      limit 1
    )
    else o.id
  end
  from observed o;
$$;

comment on function public.openlist_resolve_canonical_planning_event(uuid) is
'Maps an observed raw event to the canonical event representing the same real-world milestone. Alert observations remain auditable against the source event while delivery uses the authoritative event.';

revoke execute on function public.openlist_resolve_canonical_planning_event(uuid) from public, anon, authenticated;
grant execute on function public.openlist_resolve_canonical_planning_event(uuid) to service_role;

create or replace view public.planning_canonical_events
with (security_invoker = true)
as
select
  e.*,
  public.openlist_planning_event_source_rank(e.event_type,e.event_source) as source_authority_rank
from public.planning_application_events e
where public.openlist_is_canonical_planning_event(e.id);

create or replace function public.openlist_preserve_planning_alert_watch_non_null_state()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if old.state is not null and new.state is not null then
    new.state := old.state || jsonb_strip_nulls(new.state);
  end if;
  return new;
end;
$$;

drop trigger if exists planning_alert_watch_preserve_non_null_state on public.planning_alert_watch_state;
create trigger planning_alert_watch_preserve_non_null_state
before update of state on public.planning_alert_watch_state
for each row
execute function public.openlist_preserve_planning_alert_watch_non_null_state();

comment on function public.openlist_preserve_planning_alert_watch_non_null_state() is
'Prevents temporary source omissions/nulls from erasing the last observed non-null watcher value and later resurrecting the same milestone as a false change.';

create or replace function public.openlist_enqueue_planning_alert_deliveries(p_limit integer default 200)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  bounded_limit integer := greatest(1, least(coalesce(p_limit, 200), 1000));
  inserted_count integer;
begin
  with eligible as (
    select
      subscription.id as subscription_id,
      observed.id as observed_change_id,
      observed.observed_at,
      canonical.id as event_id,
      canonical.application_id,
      canonical.event_type,
      canonical.event_date,
      canonical.source_field,
      canonical.new_value,
      case canonical.event_type
        when 'appeal_decided' then 100
        when 'final_grant' then 95
        when 'decision_changed' then 92
        when 'decision_made' then 90
        when 'withdrawn' then 88
        when 'appeal_lodged' then 85
        when 'further_information_requested' then 80
        when 'further_information_received' then 78
        when 'decision_due_changed' then 60
        when 'status_changed' then 40
        else 10
      end as event_priority
    from public.planning_alert_observed_changes observed
    join public.planning_alert_subscriptions subscription
      on subscription.application_id = observed.application_id
     and subscription.enabled
    join public.planning_application_events observed_event
      on observed_event.id = observed.event_id
    join lateral (
      select event.*
      from public.planning_canonical_events event
      where event.id = public.openlist_resolve_canonical_planning_event(observed.event_id)
      limit 1
    ) canonical on true
    where observed.observed_at >= subscription.created_at
      and canonical.event_type = any(array[
        'further_information_requested','further_information_received','decision_made',
        'final_grant','appeal_lodged','appeal_decided','withdrawn','decision_changed',
        'decision_due_changed','status_changed'
      ])
      and abs(extract(epoch from (observed_event.detected_at - observed.observed_at))) <= 300
      and not (
        canonical.source_field = any(array[
          'further_information_requested_date','further_information_received_date',
          'decision_date','final_grant_date','withdrawal_date',
          'appeal_lodged_date','appeal_decision_date'
        ])
        and canonical.event_date < (subscription.created_at at time zone 'Europe/Dublin')::date
      )
      and not (
        canonical.event_type = 'status_changed'
        and lower(trim(coalesce(canonical.new_value, ''))) = any(array[
          '', 'unknown', 'n/a', 'na', 'none', 'null', 'not applicable',
          'not available', 'not recorded', 'not supplied', 'undefined'
        ])
      )
      and not (
        canonical.event_type = any(array['decision_made', 'decision_changed'])
        and lower(trim(coalesce(canonical.new_value, ''))) = any(array[
          '', 'unknown', 'n/a', 'na', 'none', 'null', 'not applicable',
          'not available', 'not recorded', 'not supplied', 'undefined'
        ])
      )
  ), ranked as (
    select eligible.*,
      row_number() over (
        partition by subscription_id, application_id, observed_at
        order by event_priority desc, event_id
      ) as batch_rank
    from eligible
  )
  insert into public.planning_alert_deliveries(
    subscription_id,event_id,observed_change_id,status,attempt_count,next_attempt_at
  )
  select subscription_id,event_id,observed_change_id,'queued',0,now()
  from ranked
  where batch_rank = 1
  order by observed_at, observed_change_id, subscription_id
  limit bounded_limit
  on conflict (subscription_id,event_id) do nothing;

  get diagnostics inserted_count = row_count;
  return jsonb_build_object('queued',inserted_count,'limit',bounded_limit);
end;
$function$;