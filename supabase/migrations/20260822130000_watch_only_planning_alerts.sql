create table public.planning_alert_watch_state (
  application_id uuid primary key references public.planning_applications(id) on delete cascade,
  initialized_at timestamptz,
  last_checked_at timestamptz,
  last_successful_check_at timestamptz,
  source_strategy text,
  state jsonb,
  last_error text,
  updated_at timestamptz not null default now()
);

create table public.planning_alert_observed_changes (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.planning_applications(id) on delete cascade,
  event_id uuid not null references public.planning_application_events(id) on delete cascade,
  observed_at timestamptz not null default now(),
  source text not null,
  source_field text not null,
  change_key text not null,
  created_at timestamptz not null default now(),
  unique (event_id),
  unique (application_id, change_key)
);
create index planning_alert_observed_changes_application_observed_idx on public.planning_alert_observed_changes(application_id, observed_at, id);

alter table public.planning_alert_watch_state enable row level security;
alter table public.planning_alert_observed_changes enable row level security;
revoke all on table public.planning_alert_watch_state, public.planning_alert_observed_changes from anon, authenticated;
grant select, insert, update, delete on table public.planning_alert_watch_state, public.planning_alert_observed_changes to service_role;

alter table public.planning_alert_deliveries add column observed_change_id uuid references public.planning_alert_observed_changes(id) on delete cascade;
create unique index planning_alert_deliveries_subscription_observed_change_idx on public.planning_alert_deliveries(subscription_id, observed_change_id) where observed_change_id is not null;

create or replace function public.openlist_enqueue_planning_alert_deliveries(p_limit integer default 200)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare bounded_limit integer := greatest(1, least(coalesce(p_limit,200),1000)); inserted_count integer;
begin
  insert into public.planning_alert_deliveries(subscription_id,event_id,observed_change_id,status,attempt_count,next_attempt_at)
  select s.id,c.event_id,c.id,'queued',0,now()
  from public.planning_alert_observed_changes c
  join public.planning_alert_subscriptions s on s.application_id=c.application_id and s.enabled
  where c.observed_at >= s.created_at
  order by c.observed_at,c.id,s.id limit bounded_limit
  on conflict (subscription_id,event_id) do nothing;
  get diagnostics inserted_count = row_count;
  return jsonb_build_object('queued',inserted_count,'limit',bounded_limit);
end; $$;
revoke execute on function public.openlist_enqueue_planning_alert_deliveries(integer) from public, anon, authenticated;
grant execute on function public.openlist_enqueue_planning_alert_deliveries(integer) to service_role;
