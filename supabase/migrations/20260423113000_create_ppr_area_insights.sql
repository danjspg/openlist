create table if not exists public.ppr_area_insights (
  id uuid primary key default gen_random_uuid(),
  range_key text not null,
  county text not null,
  area_slug text not null,
  area_label text not null,
  total_sales_count int not null,
  median_all_time_eur numeric,
  average_all_time_eur numeric,
  last_sale_date date,
  current_period_label text,
  previous_period_label text,
  current_median_eur numeric,
  previous_median_eur numeric,
  momentum_yoy_change_pct numeric,
  three_year_change_pct numeric,
  current_period_count int,
  previous_period_count int,
  activity_change_pct numeric,
  average_days_between_sales numeric,
  peak_month_name text,
  peak_month_evidence_years int,
  p25_price_eur numeric,
  p75_price_eur numeric,
  new_build_count int,
  new_build_median_eur numeric,
  second_hand_count int,
  second_hand_median_eur numeric,
  premium_amount_eur numeric,
  premium_pct numeric,
  updated_at timestamptz default now()
);

create unique index if not exists ppr_area_insights_scope_area_idx
  on public.ppr_area_insights (range_key, county, area_slug);

create index if not exists ppr_area_insights_area_idx
  on public.ppr_area_insights (county, area_slug, range_key);

alter table public.ppr_area_insights enable row level security;

drop policy if exists "Public read PPR area insights" on public.ppr_area_insights;
create policy "Public read PPR area insights"
  on public.ppr_area_insights
  for select
  to anon, authenticated
  using (true);

grant select on public.ppr_area_insights to anon, authenticated;
