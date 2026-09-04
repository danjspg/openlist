create table if not exists public.planning_area_alert_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_application_id uuid references public.planning_applications(id) on delete set null,
  label text not null,
  center_lat double precision not null,
  center_lng double precision not null,
  radius_m integer not null,
  category text not null default 'all',
  event_trigger text not null default 'new',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_area_alert_lat_check check (center_lat between 51.0 and 56.0),
  constraint planning_area_alert_lng_check check (center_lng between -11.5 and -5.0),
  constraint planning_area_alert_radius_check check (radius_m in (500, 1000, 2000, 5000, 10000, 20000, 50000)),
  constraint planning_area_alert_category_check check (category in (
    'all', 'residential-development', 'large-residential', 'wind-farms', 'solar-energy',
    'battery-storage', 'retail', 'hotels-restaurants', 'student-accommodation',
    'data-centres', 'infrastructure', 'transport', 'industrial-logistics',
    'waste-recycling', 'quarrying'
  )),
  constraint planning_area_alert_trigger_check check (event_trigger in ('new', 'approved', 'appealed', 'construction'))
);

create index if not exists planning_area_alert_subscriptions_user_idx
  on public.planning_area_alert_subscriptions(user_id, created_at desc);

create index if not exists planning_area_alert_subscriptions_enabled_idx
  on public.planning_area_alert_subscriptions(enabled, created_at)
  where enabled = true;

create table if not exists public.planning_area_alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.planning_area_alert_subscriptions(id) on delete cascade,
  application_id uuid not null references public.planning_applications(id) on delete cascade,
  event_id uuid not null references public.planning_application_events(id) on delete cascade,
  distance_m double precision not null,
  attempts integer not null default 0,
  last_error text,
  provider_message_id text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (subscription_id, event_id)
);

create index if not exists planning_area_alert_deliveries_pending_idx
  on public.planning_area_alert_deliveries(queued_at, id)
  where sent_at is null and attempts < 5;

alter table public.planning_area_alert_subscriptions enable row level security;
alter table public.planning_area_alert_deliveries enable row level security;

drop policy if exists planning_area_alert_subscriptions_select_own on public.planning_area_alert_subscriptions;
create policy planning_area_alert_subscriptions_select_own
  on public.planning_area_alert_subscriptions for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists planning_area_alert_subscriptions_insert_own on public.planning_area_alert_subscriptions;
create policy planning_area_alert_subscriptions_insert_own
  on public.planning_area_alert_subscriptions for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists planning_area_alert_subscriptions_update_own on public.planning_area_alert_subscriptions;
create policy planning_area_alert_subscriptions_update_own
  on public.planning_area_alert_subscriptions for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists planning_area_alert_subscriptions_delete_own on public.planning_area_alert_subscriptions;
create policy planning_area_alert_subscriptions_delete_own
  on public.planning_area_alert_subscriptions for delete
  to authenticated
  using (user_id = auth.uid());

revoke all on public.planning_area_alert_subscriptions from anon;
revoke all on public.planning_area_alert_deliveries from anon, authenticated;
grant select, insert, update, delete on public.planning_area_alert_subscriptions to authenticated;

comment on table public.planning_area_alert_subscriptions is
  'Authenticated-user private beta alerts for planning activity within a fixed geographic radius.';
comment on table public.planning_area_alert_deliveries is
  'Deduplicated email delivery queue for spatial planning alerts; service-role only.';
