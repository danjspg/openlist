create table if not exists public.database_size_snapshots (
  snapshot_date date primary key,
  captured_at timestamptz not null default now(),
  database_bytes bigint not null,
  table_sizes jsonb not null default '[]'::jsonb
);

alter table public.database_size_snapshots enable row level security;
revoke all on table public.database_size_snapshots from anon, authenticated;
grant select, insert, update on table public.database_size_snapshots to service_role;

create or replace function public.capture_database_size_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_date date := (now() at time zone 'UTC')::date;
  v_bytes bigint;
  v_tables jsonb;
  v_previous_bytes bigint;
begin
  select pg_database_size(current_database()) into v_bytes;

  select coalesce(jsonb_agg(jsonb_build_object(
    'table_name', table_name,
    'bytes', total_bytes
  ) order by total_bytes desc), '[]'::jsonb)
  into v_tables
  from (
    select schemaname || '.' || relname as table_name,
           pg_total_relation_size(relid) as total_bytes
    from pg_stat_user_tables
    where not (schemaname = 'public' and relname = 'database_size_snapshots')
    order by total_bytes desc
    limit 10
  ) ranked;

  select database_bytes
    into v_previous_bytes
  from public.database_size_snapshots
  where snapshot_date < v_date
  order by snapshot_date desc
  limit 1;

  insert into public.database_size_snapshots(snapshot_date, captured_at, database_bytes, table_sizes)
  values (v_date, now(), v_bytes, v_tables)
  on conflict (snapshot_date) do update
    set captured_at = excluded.captured_at,
        database_bytes = excluded.database_bytes,
        table_sizes = excluded.table_sizes;

  return jsonb_build_object(
    'snapshot_date', v_date,
    'database_bytes', v_bytes,
    'previous_database_bytes', v_previous_bytes,
    'table_sizes', v_tables
  );
end;
$$;

revoke all on function public.capture_database_size_snapshot() from public, anon, authenticated;
grant execute on function public.capture_database_size_snapshot() to service_role;
