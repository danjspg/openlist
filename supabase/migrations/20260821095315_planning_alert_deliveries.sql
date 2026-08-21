create table public.planning_alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.planning_alert_subscriptions(id) on delete cascade,
  event_id uuid not null references public.planning_application_events(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  next_attempt_at timestamptz null default now(),
  claimed_at timestamptz null,
  claim_token uuid null,
  sent_at timestamptz null,
  provider_message_id text null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_alert_deliveries_subscription_event_key unique (subscription_id, event_id),
  constraint planning_alert_deliveries_claim_shape_check check (
    (status = 'sending' and claimed_at is not null and claim_token is not null)
    or (status <> 'sending' and claimed_at is null and claim_token is null)
  ),
  constraint planning_alert_deliveries_sent_shape_check check (
    (status = 'sent' and sent_at is not null)
    or (status <> 'sent' and sent_at is null)
  ),
  constraint planning_alert_deliveries_retry_shape_check check (
    (status = 'queued' and next_attempt_at is not null and attempt_count < 5)
    or (status <> 'queued' and next_attempt_at is null)
  )
);

create index planning_alert_deliveries_claim_idx
  on public.planning_alert_deliveries (next_attempt_at, created_at, id)
  where status = 'queued' and attempt_count < 5;

-- Needed when an application/event cascade removes delivery history. The
-- subscription/event unique index already covers subscription-side cleanup.
create index planning_alert_deliveries_event_id_idx
  on public.planning_alert_deliveries (event_id);

-- Queue generation starts from each enabled subscription's application and
-- creation time; the existing observed index has the opposite column order.
create index planning_application_events_alert_queue_idx
  on public.planning_application_events (application_id, detected_at, id)
  where provenance = 'observed';

alter table public.planning_alert_deliveries enable row level security;

revoke all on table public.planning_alert_deliveries from anon, authenticated;
grant select, insert, update, delete on table public.planning_alert_deliveries to service_role;

-- Queue only observed lifecycle changes detected after the user subscribed.
-- Status-only changes are deliberately limited to useful destination states.
-- When the same refresh recorded a source-backed milestone, that more specific
-- event wins and the generic status event is not queued.
create function public.openlist_enqueue_planning_alert_deliveries(
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

create function public.openlist_claim_planning_alert_deliveries(
  p_limit integer default 25,
  p_stale_after interval default interval '30 minutes'
)
returns table (
  delivery_id uuid,
  delivery_claim_token uuid,
  subscription_id uuid,
  user_id uuid,
  application_id uuid,
  event_id uuid,
  event_type text,
  event_date date,
  detected_at timestamptz,
  event_label text,
  old_value text,
  new_value text,
  local_authority_code text,
  application_reference text,
  proposal text,
  location text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  bounded_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  stale_after interval := greatest(coalesce(p_stale_after, interval '30 minutes'), interval '5 minutes');
begin
  update public.planning_alert_deliveries delivery
  set
    status = case when delivery.attempt_count >= 5 then 'failed' else 'queued' end,
    next_attempt_at = case when delivery.attempt_count >= 5 then null else now() end,
    claimed_at = null,
    claim_token = null,
    last_error = case
      when delivery.attempt_count >= 5 then 'Delivery claim expired after the final attempt.'
      else 'Delivery claim expired and was returned to the queue.'
    end,
    updated_at = now()
  where delivery.status = 'sending'
    and delivery.claimed_at <= now() - stale_after;

  return query
  with candidates as (
    select delivery.id
    from public.planning_alert_deliveries delivery
    join public.planning_alert_subscriptions subscription
      on subscription.id = delivery.subscription_id
     and subscription.enabled = true
    where delivery.status = 'queued'
      and delivery.attempt_count < 5
      and delivery.next_attempt_at <= now()
    order by delivery.next_attempt_at, delivery.created_at, delivery.id
    limit bounded_limit
    for update of delivery skip locked
  ), claimed as (
    update public.planning_alert_deliveries delivery
    set
      status = 'sending',
      attempt_count = delivery.attempt_count + 1,
      next_attempt_at = null,
      claimed_at = now(),
      claim_token = gen_random_uuid(),
      last_error = null,
      updated_at = now()
    from candidates
    where delivery.id = candidates.id
    returning delivery.*
  )
  select
    claimed.id,
    claimed.claim_token,
    subscription.id,
    subscription.user_id,
    application.id,
    event.id,
    event.event_type,
    event.event_date,
    event.detected_at,
    event.label,
    event.old_value,
    event.new_value,
    application.local_authority_code,
    application.reference,
    application.proposal,
    application.location
  from claimed
  join public.planning_alert_subscriptions subscription
    on subscription.id = claimed.subscription_id
   and subscription.enabled = true
  join public.planning_application_events event on event.id = claimed.event_id
  join public.planning_applications application on application.id = event.application_id
  order by claimed.created_at, claimed.id;
end;
$$;

create function public.openlist_complete_planning_alert_delivery(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_provider_message_id text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated_count integer;
begin
  update public.planning_alert_deliveries
  set
    status = 'sent',
    next_attempt_at = null,
    claimed_at = null,
    claim_token = null,
    sent_at = now(),
    provider_message_id = nullif(trim(p_provider_message_id), ''),
    last_error = null,
    updated_at = now()
  where id = p_delivery_id
    and status = 'sending'
    and claim_token = p_claim_token;

  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

create function public.openlist_fail_planning_alert_delivery(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_error text
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  resulting_status text;
begin
  update public.planning_alert_deliveries delivery
  set
    status = case when delivery.attempt_count >= 5 then 'failed' else 'queued' end,
    next_attempt_at = case
      when delivery.attempt_count >= 5 then null
      else now() + make_interval(mins => least(60, 5 * (2 ^ greatest(delivery.attempt_count - 1, 0))::integer))
    end,
    claimed_at = null,
    claim_token = null,
    last_error = left(coalesce(nullif(trim(p_error), ''), 'Unknown delivery error'), 1000),
    updated_at = now()
  where delivery.id = p_delivery_id
    and delivery.status = 'sending'
    and delivery.claim_token = p_claim_token
  returning delivery.status into resulting_status;

  return coalesce(resulting_status, 'stale');
end;
$$;

-- Disabling an alert must also neutralise work that has not been completed.
create function public.openlist_stop_pending_planning_alert_deliveries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.enabled = true and new.enabled = false then
    update public.planning_alert_deliveries
    set
      status = 'failed',
      next_attempt_at = null,
      claimed_at = null,
      claim_token = null,
      last_error = 'Subscription disabled before delivery.',
      updated_at = now()
    where subscription_id = new.id
      and status in ('queued', 'sending');
  end if;
  return new;
end;
$$;

create trigger stop_pending_planning_alert_deliveries
after update of enabled on public.planning_alert_subscriptions
for each row
execute function public.openlist_stop_pending_planning_alert_deliveries();

-- Harden the v1 subscription timestamp trigger reported by the advisor.
alter function public.set_planning_alert_subscriptions_updated_at()
  set search_path = pg_catalog;

revoke execute on function public.openlist_enqueue_planning_alert_deliveries(integer) from public, anon, authenticated;
revoke execute on function public.openlist_claim_planning_alert_deliveries(integer, interval) from public, anon, authenticated;
revoke execute on function public.openlist_complete_planning_alert_delivery(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.openlist_fail_planning_alert_delivery(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.openlist_stop_pending_planning_alert_deliveries() from public, anon, authenticated;

grant execute on function public.openlist_enqueue_planning_alert_deliveries(integer) to service_role;
grant execute on function public.openlist_claim_planning_alert_deliveries(integer, interval) to service_role;
grant execute on function public.openlist_complete_planning_alert_delivery(uuid, uuid, text) to service_role;
grant execute on function public.openlist_fail_planning_alert_delivery(uuid, uuid, text) to service_role;
