create table if not exists public.planning_commencements (
  id uuid primary key default gen_random_uuid(),
  local_authority text not null,
  local_authority_code text not null,
  metric text not null,
  period_month date not null,
  year int not null,
  month int not null check (month between 1 and 12),
  value int not null default 0,
  source_url text not null,
  source_dataset text not null,
  source_payload jsonb null,
  ingested_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint planning_commencements_authority_metric_month_key
    unique (local_authority_code, metric, period_month)
);

create index if not exists planning_commencements_authority_idx
  on public.planning_commencements (local_authority_code);

create index if not exists planning_commencements_period_month_idx
  on public.planning_commencements (period_month desc);

create index if not exists planning_commencements_metric_idx
  on public.planning_commencements (metric);

alter table public.planning_commencements enable row level security;

drop policy if exists "Public read planning commencements" on public.planning_commencements;
create policy "Public read planning commencements"
  on public.planning_commencements
  for select
  to anon, authenticated
  using (true);

grant select on public.planning_commencements to anon, authenticated;
grant select, insert, update, delete on public.planning_commencements to service_role;
