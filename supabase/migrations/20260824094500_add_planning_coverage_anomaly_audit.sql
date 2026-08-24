create or replace function public.openlist_planning_coverage_anomalies()
returns table (
  local_authority_code text,
  anomaly_month date,
  applications integer,
  trailing_12_month_avg numeric,
  previous_month_applications integer,
  next_month_applications integer,
  anomaly_type text
)
language sql
stable
security invoker
set search_path = public
as $$
with monthly_raw as (
  select
    local_authority_code,
    date_trunc('month', registration_date)::date as month,
    count(*)::integer as n
  from planning_applications
  where registration_date is not null
  group by 1, 2
),
bounds as (
  select
    local_authority_code,
    min(month) as first_month
  from monthly_raw
  group by 1
),
series as (
  select
    b.local_authority_code,
    b.first_month,
    gs::date as month
  from bounds b
  cross join lateral generate_series(
    b.first_month,
    (date_trunc('month', current_date) - interval '1 month')::date,
    interval '1 month'
  ) gs
),
filled as (
  select
    s.local_authority_code,
    s.first_month,
    s.month,
    coalesce(m.n, 0)::integer as n
  from series s
  left join monthly_raw m
    on m.local_authority_code = s.local_authority_code
   and m.month = s.month
),
scored as (
  select
    local_authority_code,
    first_month,
    month,
    n,
    avg(n::numeric) over (
      partition by local_authority_code
      order by month
      rows between 12 preceding and 1 preceding
    ) as prev12_avg,
    lag(n) over (partition by local_authority_code order by month) as prev_n,
    lead(n) over (partition by local_authority_code order by month) as next_n
  from filled
)
select
  local_authority_code,
  month as anomaly_month,
  n as applications,
  round(prev12_avg, 1) as trailing_12_month_avg,
  prev_n as previous_month_applications,
  next_n as next_month_applications,
  case
    when n = 0 then 'zero_start'
    else 'collapse'
  end as anomaly_type
from scored
where month >= (first_month + interval '12 months')::date
  and prev12_avg >= 10
  and not (local_authority_code = 'DONEGAL' and month = date '2020-04-01')
  and (
    (n = 0 and coalesce(prev_n, 0) > 0)
    or
    (
      n > 0
      and n < prev12_avg * 0.25
      and coalesce(prev_n, 0) >= prev12_avg * 0.5
    )
  )
order by month desc, local_authority_code;
$$;

revoke all on function public.openlist_planning_coverage_anomalies() from public;
revoke all on function public.openlist_planning_coverage_anomalies() from anon;
revoke all on function public.openlist_planning_coverage_anomalies() from authenticated;
grant execute on function public.openlist_planning_coverage_anomalies() to service_role;
