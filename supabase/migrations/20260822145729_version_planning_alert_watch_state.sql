alter table public.planning_alert_watch_state
  add column if not exists state_version smallint not null default 1;

alter table public.planning_alert_watch_state
  add constraint planning_alert_watch_state_version_check
  check (state_version between 1 and 100) not valid;

alter table public.planning_alert_watch_state
  validate constraint planning_alert_watch_state_version_check;
