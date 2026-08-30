alter table public.planning_alert_watch_state
  add column if not exists initialization_requested_at timestamptz,
  add column if not exists initialization_attempted_at timestamptz;

create index if not exists planning_alert_deliveries_observed_change_id_idx
  on public.planning_alert_deliveries (observed_change_id)
  where observed_change_id is not null;

create table public.planning_revalidation_queue (
  application_id uuid primary key references public.planning_applications(id) on delete cascade,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index planning_revalidation_queue_requested_idx
  on public.planning_revalidation_queue (requested_at, application_id);

alter table public.planning_revalidation_queue enable row level security;
revoke all on table public.planning_revalidation_queue from anon, authenticated;
grant select, insert, update, delete on table public.planning_revalidation_queue to service_role;

create or replace function public.openlist_ensure_planning_alert_watch()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.enabled then
    insert into public.planning_alert_watch_state (
      application_id,
      initialization_requested_at,
      updated_at
    ) values (
      new.application_id,
      now(),
      now()
    )
    on conflict (application_id) do update
    set initialization_requested_at = case
          when planning_alert_watch_state.initialized_at is null
            then coalesce(planning_alert_watch_state.initialization_requested_at, excluded.initialization_requested_at)
          else planning_alert_watch_state.initialization_requested_at
        end,
        updated_at = now();
  end if;
  return new;
end;
$$;

revoke execute on function public.openlist_ensure_planning_alert_watch() from public, anon, authenticated;
grant execute on function public.openlist_ensure_planning_alert_watch() to service_role;

drop trigger if exists ensure_planning_alert_watch on public.planning_alert_subscriptions;
create trigger ensure_planning_alert_watch
after insert or update of enabled on public.planning_alert_subscriptions
for each row execute function public.openlist_ensure_planning_alert_watch();

insert into public.planning_alert_watch_state (
  application_id,
  initialization_requested_at,
  updated_at
)
select
  subscription.application_id,
  min(subscription.created_at),
  now()
from public.planning_alert_subscriptions subscription
where subscription.enabled
group by subscription.application_id
on conflict (application_id) do update
set initialization_requested_at = coalesce(
      planning_alert_watch_state.initialization_requested_at,
      excluded.initialization_requested_at
    ),
    updated_at = now();
