create table if not exists public.ppr_national_snapshots (
  id uuid primary key default gen_random_uuid(),
  range_key text not null unique,
  label text not null,
  sales_count int not null,
  median_price_eur numeric,
  avg_price_eur numeric,
  p25_price_eur numeric,
  p75_price_eur numeric,
  current_period_label text,
  previous_period_label text,
  current_period_count int,
  previous_period_count int,
  activity_change_pct numeric,
  yoy_change_pct numeric,
  latest_sale_date date,
  strongest_county text,
  strongest_county_yoy_change_pct numeric,
  updated_at timestamptz default now()
);

create table if not exists public.ppr_comparison_rows (
  id uuid primary key default gen_random_uuid(),
  range_key text not null,
  group_key text not null,
  market_slug text not null,
  label text not null,
  href text not null,
  county text,
  sales_volume int not null,
  median_price_eur numeric not null,
  yoy_change_pct numeric,
  new_build_median_eur numeric,
  second_hand_median_eur numeric,
  vs_national_median_pct numeric,
  distance_from_dublin_km numeric,
  sort_rank int,
  updated_at timestamptz default now()
);

create table if not exists public.ppr_market_insights (
  id uuid primary key default gen_random_uuid(),
  range_key text not null,
  market_slug text not null,
  market_label text not null,
  market_type text not null,
  county text,
  total_sales_count int not null,
  median_all_time_eur numeric,
  average_all_time_eur numeric,
  last_sale_date date,
  momentum_current_label text,
  momentum_current_median_eur numeric,
  momentum_current_count int,
  momentum_previous_label text,
  momentum_previous_median_eur numeric,
  momentum_previous_count int,
  momentum_yoy_change_pct numeric,
  momentum_three_year_change_pct numeric,
  activity_current_period_label text,
  activity_current_period_count int,
  activity_previous_period_label text,
  activity_previous_period_count int,
  activity_change_pct numeric,
  activity_has_reliable_change boolean not null default false,
  average_days_between_sales numeric,
  peak_month_name text,
  peak_month_evidence_years int,
  distribution_p25_eur numeric,
  distribution_p75_eur numeric,
  build_new_median_eur numeric,
  build_new_count int,
  build_second_hand_median_eur numeric,
  build_second_hand_count int,
  build_premium_amount_eur numeric,
  build_premium_pct numeric,
  updated_at timestamptz default now()
);

create unique index if not exists ppr_comparison_rows_scope_market_idx
  on public.ppr_comparison_rows (range_key, group_key, market_slug);

create unique index if not exists ppr_market_insights_scope_market_idx
  on public.ppr_market_insights (range_key, market_slug);

create index if not exists ppr_comparison_rows_group_idx
  on public.ppr_comparison_rows (group_key, range_key, sort_rank);

create index if not exists ppr_market_insights_market_idx
  on public.ppr_market_insights (market_slug, range_key);

alter table public.ppr_national_snapshots enable row level security;
alter table public.ppr_comparison_rows enable row level security;
alter table public.ppr_market_insights enable row level security;

drop policy if exists "Public read PPR national snapshots" on public.ppr_national_snapshots;
create policy "Public read PPR national snapshots"
  on public.ppr_national_snapshots
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Public read PPR comparison rows" on public.ppr_comparison_rows;
create policy "Public read PPR comparison rows"
  on public.ppr_comparison_rows
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Public read PPR market insights" on public.ppr_market_insights;
create policy "Public read PPR market insights"
  on public.ppr_market_insights
  for select
  to anon, authenticated
  using (true);

grant select on public.ppr_national_snapshots to anon, authenticated;
grant select on public.ppr_comparison_rows to anon, authenticated;
grant select on public.ppr_market_insights to anon, authenticated;
