create or replace function public.openlist_planning_council_activity_12m()
returns jsonb
language sql
stable
parallel safe
set search_path = public
set statement_timeout = '15s'
as $$
with latest as (
  select max(registration_date) as period_end
  from public.planning_applications
  where registration_date is not null
), comparison_window as (
  select
    period_end,
    (period_end - interval '12 months' + interval '1 day')::date as period_start
  from latest
), council_counts as (
  select
    p.local_authority_code as label,
    count(*)::int as count
  from public.planning_applications p
  cross join comparison_window w
  where w.period_end is not null
    and p.registration_date >= w.period_start
    and p.registration_date <= w.period_end
    and nullif(trim(p.local_authority_code), '') is not null
  group by p.local_authority_code
)
select jsonb_build_object(
  'periodStart', (select period_start::text from comparison_window),
  'periodEnd', (select period_end::text from comparison_window),
  'stats', coalesce((
    select jsonb_agg(
      jsonb_build_object('label', label, 'count', count)
      order by count desc, label
    )
    from council_counts
  ), '[]'::jsonb)
);
$$;

grant execute on function public.openlist_planning_council_activity_12m()
  to anon, authenticated, service_role;
