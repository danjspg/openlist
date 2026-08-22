-- Common Planning dashboards are read far more often than their source corpus
-- changes. Persist their compact JSON summaries after ingestion instead of
-- re-aggregating hundreds of thousands of applications during page requests.
create table if not exists public.planning_dashboard_snapshots (
  authority_code text primary key,
  payload jsonb not null,
  refreshed_at timestamptz not null default now()
);
alter table public.planning_dashboard_snapshots enable row level security;
revoke all on public.planning_dashboard_snapshots from anon, authenticated;
grant select, insert, update, delete on public.planning_dashboard_snapshots to service_role;

create or replace function public.openlist_refresh_planning_dashboard_snapshots(
  p_authority_codes text[] default null
) returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '10min'
as $$
declare
  v_authority text;
  v_codes text[];
  v_refreshed integer := 0;
begin
  select coalesce(
    p_authority_codes,
    array_prepend('NATIONAL', array_agg(local_authority_code order by local_authority_code))
  ) into v_codes
  from (
    select distinct local_authority_code
    from public.planning_applications
    where local_authority_code is not null
  ) authorities;

  foreach v_authority in array v_codes loop
    insert into public.planning_dashboard_snapshots (authority_code, payload, refreshed_at)
    values (
      v_authority,
      public.openlist_planning_dashboard_aggregate(
        nullif(v_authority, 'NATIONAL'), null, null, null, null
      ),
      now()
    )
    on conflict (authority_code) do update
      set payload = excluded.payload, refreshed_at = excluded.refreshed_at;
    v_refreshed := v_refreshed + 1;
  end loop;

  return jsonb_build_object('refreshed', v_refreshed);
end;
$$;

create or replace function public.openlist_planning_dashboard_snapshot(
  p_authority_code text
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select payload
  from public.planning_dashboard_snapshots
  where authority_code = coalesce(nullif(p_authority_code, ''), 'NATIONAL')
$$;

revoke all on function public.openlist_refresh_planning_dashboard_snapshots(text[]) from public;
grant execute on function public.openlist_refresh_planning_dashboard_snapshots(text[]) to service_role;
grant execute on function public.openlist_planning_dashboard_snapshot(text) to service_role;
