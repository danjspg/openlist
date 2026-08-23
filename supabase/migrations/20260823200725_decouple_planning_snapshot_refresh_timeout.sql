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
  v_payload jsonb;
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
    if v_authority = 'NATIONAL' then
      v_payload := public.openlist_planning_dashboard_aggregate_generic(
        null, null, null, null, null
      );
    else
      v_payload := public.openlist_planning_authority_aggregate(v_authority);
    end if;

    insert into public.planning_dashboard_snapshots (authority_code, payload, refreshed_at)
    values (v_authority, v_payload, now())
    on conflict (authority_code) do update
      set payload = excluded.payload, refreshed_at = excluded.refreshed_at;
    v_refreshed := v_refreshed + 1;
  end loop;

  return jsonb_build_object('refreshed', v_refreshed);
end;
$$;

revoke all on function public.openlist_refresh_planning_dashboard_snapshots(text[]) from public;
grant execute on function public.openlist_refresh_planning_dashboard_snapshots(text[]) to service_role;
