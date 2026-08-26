create index if not exists ppr_area_stats_candidate_lookup_idx
  on public.ppr_area_stats (county, geography_type, sales_count desc)
  include (area_slug, last_sale_date);
