create table public.planning_alert_signup_snapshots (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  application_id uuid references public.planning_applications(id) on delete set null,
  application_reference text not null,
  status_at_signup text not null,
  raw_status_at_signup text,
  signed_up_at timestamptz not null default now()
);

comment on table public.planning_alert_signup_snapshots is
  'Immutable point-in-time planning application state captured whenever an alert subscription becomes enabled.';
comment on column public.planning_alert_signup_snapshots.subscription_id is
  'Subscription UUID at signup time. Deliberately not a foreign key so the historical signup survives alert removal.';
comment on column public.planning_alert_signup_snapshots.status_at_signup is
  'Canonical planning_applications.normalized_status captured at signup time.';
comment on column public.planning_alert_signup_snapshots.raw_status_at_signup is
  'Raw planning_applications.status captured at signup time for later taxonomy analysis.';

create index planning_alert_signup_snapshots_status_signed_up_idx
  on public.planning_alert_signup_snapshots (status_at_signup, signed_up_at);
create index planning_alert_signup_snapshots_subscription_signed_up_idx
  on public.planning_alert_signup_snapshots (subscription_id, signed_up_at);

alter table public.planning_alert_signup_snapshots enable row level security;
revoke all on table public.planning_alert_signup_snapshots from public, anon, authenticated;
grant select on table public.planning_alert_signup_snapshots to service_role;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create function private.capture_planning_alert_signup_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  should_capture boolean := false;
  application_reference text;
  canonical_status text;
  raw_status text;
begin
  if tg_op = 'INSERT' then
    should_capture := new.enabled;
  elsif tg_op = 'UPDATE' then
    should_capture := new.enabled and not old.enabled;
  end if;

  if not should_capture then
    return new;
  end if;

  select
    a.reference,
    coalesce(a.normalized_status, 'unknown'),
    a.status
  into
    application_reference,
    canonical_status,
    raw_status
  from public.planning_applications a
  where a.id = new.application_id;

  if application_reference is null then
    raise exception 'Planning application % could not be loaded for alert signup snapshot', new.application_id;
  end if;

  insert into public.planning_alert_signup_snapshots (
    subscription_id,
    user_id,
    application_id,
    application_reference,
    status_at_signup,
    raw_status_at_signup,
    signed_up_at
  ) values (
    new.id,
    new.user_id,
    new.application_id,
    application_reference,
    canonical_status,
    raw_status,
    now()
  );

  return new;
end;
$$;

revoke all on function private.capture_planning_alert_signup_snapshot() from public, anon, authenticated;

drop trigger if exists capture_planning_alert_signup_snapshot on public.planning_alert_subscriptions;
create trigger capture_planning_alert_signup_snapshot
after insert or update of enabled on public.planning_alert_subscriptions
for each row
execute function private.capture_planning_alert_signup_snapshot();

-- Example internal analytics query:
-- select status_at_signup, count(*) as alert_signups
-- from public.planning_alert_signup_snapshots
-- group by status_at_signup
-- order by alert_signups desc;
