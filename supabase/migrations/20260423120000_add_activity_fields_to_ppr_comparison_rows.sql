alter table public.ppr_comparison_rows
  add column if not exists current_period_count int,
  add column if not exists previous_period_count int,
  add column if not exists activity_change_pct numeric;
