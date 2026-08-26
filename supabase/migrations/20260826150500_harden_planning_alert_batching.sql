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
      event.id as event_id,
      event.application_id,
      event.event_type,
      event.event_date,
      event.source_field,
      event.new_value,
      case event.event_type
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
    join public.planning_application_events event
      on event.id = observed.event_id
    where observed.observed_at >= subscription.created_at
      and event.event_type = any(array[
        'further_information_requested','further_information_received','decision_made',
        'final_grant','appeal_lodged','appeal_decided','withdrawn','decision_changed',
        'decision_due_changed','status_changed'
      ])
      and abs(extract(epoch from (event.detected_at - observed.observed_at))) <= 300
      and not (
        event.source_field = any(array[
          'further_information_requested_date','further_information_received_date',
          'decision_date','final_grant_date','withdrawal_date',
          'appeal_lodged_date','appeal_decision_date'
        ])
        and event.event_date < (subscription.created_at at time zone 'Europe/Dublin')::date
      )
      and not (
        event.event_type = 'status_changed'
        and lower(trim(coalesce(event.new_value, ''))) = any(array[
          '', 'unknown', 'n/a', 'na', 'none', 'null', 'not applicable',
          'not available', 'not recorded', 'not supplied', 'undefined'
        ])
      )
      and not (
        event.event_type = any(array['decision_made', 'decision_changed'])
        and lower(trim(coalesce(event.new_value, ''))) = any(array[
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
