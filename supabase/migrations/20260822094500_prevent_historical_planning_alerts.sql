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
  inserted_count integer := 0;
begin
  insert into public.planning_alert_deliveries (
    subscription_id,
    event_id,
    status,
    attempt_count,
    next_attempt_at
  )
  select
    subscription.id,
    event.id,
    'queued',
    0,
    now()
  from public.planning_application_events event
  join public.planning_alert_subscriptions subscription
    on subscription.application_id = event.application_id
   and subscription.enabled = true
   and event.detected_at >= subscription.created_at
   and (event.event_date is null or event.event_date >= subscription.created_at::date)
  where event.provenance = 'observed'
    and (
      event.event_type = any(array[
        'further_information_requested',
        'further_information_received',
        'decision_made',
        'final_grant',
        'appeal_lodged',
        'appeal_decided',
        'withdrawn',
        'decision_changed',
        'decision_due_changed'
      ])
      or (
        event.event_type = 'status_changed'
        and event.new_value = any(array[
          'under_assessment',
          'further_information_requested',
          'further_information_received',
          'decision_made',
          'final_grant',
          'appealed',
          'appeal_decided',
          'withdrawn',
          'invalid',
          'finalised'
        ])
      )
    )
    and not exists (
      select 1
      from public.planning_alert_deliveries existing
      where existing.subscription_id = subscription.id
        and existing.event_id = event.id
    )
    and not (
      (event.event_type = 'status_changed' or (event.event_type = 'withdrawn' and event.source_field = 'status'))
      and exists (
        select 1
        from public.planning_application_events specific
        where specific.application_id = event.application_id
          and specific.id <> event.id
          and specific.provenance = 'observed'
          and specific.detected_at = event.detected_at
          and specific.source_field is distinct from 'status'
          and specific.event_type = case event.new_value
            when 'further_information_requested' then 'further_information_requested'
            when 'further_information_received' then 'further_information_received'
            when 'decision_made' then 'decision_made'
            when 'final_grant' then 'final_grant'
            when 'appealed' then 'appeal_lodged'
            when 'appeal_decided' then 'appeal_decided'
            when 'withdrawn' then 'withdrawn'
            else null
          end
      )
    )
  order by event.detected_at, event.id, subscription.id
  limit bounded_limit
  on conflict (subscription_id, event_id) do nothing;

  get diagnostics inserted_count = row_count;
  return jsonb_build_object('queued', inserted_count, 'limit', bounded_limit);
end;
$$;

revoke execute on function public.openlist_enqueue_planning_alert_deliveries(integer) from public, anon, authenticated;
grant execute on function public.openlist_enqueue_planning_alert_deliveries(integer) to service_role;
