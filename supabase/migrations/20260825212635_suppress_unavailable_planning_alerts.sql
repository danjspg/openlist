create or replace function public.openlist_enqueue_planning_alert_deliveries(
  p_limit integer default 200
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  bounded_limit integer := greatest(1, least(coalesce(p_limit, 200), 1000));
  inserted_count integer;
begin
  insert into public.planning_alert_deliveries(
    subscription_id,
    event_id,
    observed_change_id,
    status,
    attempt_count,
    next_attempt_at
  )
  select
    subscription.id,
    observed.event_id,
    observed.id,
    'queued',
    0,
    now()
  from public.planning_alert_observed_changes observed
  join public.planning_alert_subscriptions subscription
    on subscription.application_id = observed.application_id
   and subscription.enabled
  join public.planning_application_events event
    on event.id = observed.event_id
  where observed.observed_at >= subscription.created_at
    and not (
      event.event_type = 'status_changed'
      and lower(trim(coalesce(event.new_value, ''))) = any(array[
        '', 'unknown', 'n/a', 'na', 'none', 'null', 'not applicable',
        'not available', 'not recorded', 'not supplied', 'undefined'
      ])
    )
    and not (
      event.event_type = any(array['decision_made', 'decision_changed', 'appeal_decided'])
      and lower(trim(coalesce(event.new_value, ''))) = any(array[
        '', 'unknown', 'n/a', 'na', 'none', 'null', 'not applicable',
        'not available', 'not recorded', 'not supplied', 'undefined'
      ])
    )
  order by observed.observed_at, observed.id, subscription.id
  limit bounded_limit
  on conflict (subscription_id, event_id) do nothing;

  get diagnostics inserted_count = row_count;
  return jsonb_build_object('queued', inserted_count, 'limit', bounded_limit);
end;
$$;

-- Neutralise any not-yet-sent noise that was queued before this migration.
update public.planning_alert_deliveries delivery
set
  status = 'failed',
  next_attempt_at = null,
  claimed_at = null,
  claim_token = null,
  last_error = 'Suppressed: planning update has no meaningful user-facing value.',
  updated_at = now()
from public.planning_application_events event
where event.id = delivery.event_id
  and delivery.status in ('queued', 'sending')
  and (
    (
      event.event_type = 'status_changed'
      and lower(trim(coalesce(event.new_value, ''))) = any(array[
        '', 'unknown', 'n/a', 'na', 'none', 'null', 'not applicable',
        'not available', 'not recorded', 'not supplied', 'undefined'
      ])
    )
    or (
      event.event_type = any(array['decision_made', 'decision_changed', 'appeal_decided'])
      and lower(trim(coalesce(event.new_value, ''))) = any(array[
        '', 'unknown', 'n/a', 'na', 'none', 'null', 'not applicable',
        'not available', 'not recorded', 'not supplied', 'undefined'
      ])
    )
  );
