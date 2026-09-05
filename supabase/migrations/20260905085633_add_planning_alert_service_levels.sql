alter table public.planning_alert_subscriptions
  add column if not exists service_level text not null default 'fast';

alter table public.planning_alert_subscriptions
  drop constraint if exists planning_alert_subscriptions_service_level_check;

alter table public.planning_alert_subscriptions
  add constraint planning_alert_subscriptions_service_level_check
  check (service_level in ('standard', 'fast'));

comment on column public.planning_alert_subscriptions.service_level is
  'Monitoring service level. fast targets roughly hourly source checks; standard targets roughly daily checks.';

create index if not exists planning_alert_subscriptions_enabled_service_level_application_idx
  on public.planning_alert_subscriptions (service_level, application_id)
  where enabled = true;

create or replace function public.openlist_select_planning_alert_watch_batch(
  p_service_level text,
  p_limit integer default 100
)
returns table(application_id uuid)
language sql
stable
security invoker
set search_path = public
as $$
  with effective_service as (
    select
      s.application_id,
      case when bool_or(s.service_level = 'fast') then 'fast' else 'standard' end as service_level
    from public.planning_alert_subscriptions s
    where s.enabled = true
    group by s.application_id
  )
  select e.application_id
  from effective_service e
  left join public.planning_alert_watch_state w
    on w.application_id = e.application_id
  where e.service_level = p_service_level
    and p_service_level in ('standard', 'fast')
    and (
      w.last_checked_at is null
      or w.last_checked_at < now() - case
        when p_service_level = 'fast' then interval '55 minutes'
        else interval '23 hours 55 minutes'
      end
    )
  order by w.last_checked_at asc nulls first, e.application_id
  limit greatest(1, least(coalesce(p_limit, 100), 100));
$$;

revoke all on function public.openlist_select_planning_alert_watch_batch(text, integer) from public, anon, authenticated;
grant execute on function public.openlist_select_planning_alert_watch_batch(text, integer) to service_role;
