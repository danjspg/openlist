create table public.planning_alert_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid not null references public.planning_applications(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_alert_subscriptions_user_application_key unique (user_id, application_id)
);

-- The unique constraint supports the per-user application lookup and the RLS
-- ownership predicate. The delivery worker will look up enabled subscribers by
-- application after a planning_application_events change is recorded.
create index planning_alert_subscriptions_enabled_application_id_idx
  on public.planning_alert_subscriptions (application_id)
  where enabled;

create function public.set_planning_alert_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_planning_alert_subscriptions_updated_at
before update on public.planning_alert_subscriptions
for each row
execute function public.set_planning_alert_subscriptions_updated_at();

alter table public.planning_alert_subscriptions enable row level security;

revoke all on table public.planning_alert_subscriptions from anon, authenticated;
grant select, insert, update, delete on table public.planning_alert_subscriptions to authenticated;
grant select, insert, update, delete on table public.planning_alert_subscriptions to service_role;

create policy "Users can read their own planning alert subscriptions"
  on public.planning_alert_subscriptions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own planning alert subscriptions"
  on public.planning_alert_subscriptions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own planning alert subscriptions"
  on public.planning_alert_subscriptions
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own planning alert subscriptions"
  on public.planning_alert_subscriptions
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
