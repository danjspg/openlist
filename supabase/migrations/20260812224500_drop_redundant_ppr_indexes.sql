-- The two single-column indexes below are redundant with live composite
-- indexes whose leading columns are identical. The planning full-text index
-- belongs to an older search implementation; live planning search uses
-- ILIKE/trigram matching and production statistics show no scans on it.
-- Keep the area_slug and eircode_prefix indexes: their intended composite
-- replacements are not present in the live database.

drop index if exists public.ppr_sales_county_idx;
drop index if exists public.planning_applications_authority_idx;
drop index if exists public.planning_applications_location_search_idx;

-- Run maintenance earlier on the two source tables that receive recurring
-- imports. This makes dead space reusable well before PostgreSQL's broad
-- default threshold is reached.
alter table public.ppr_sales set (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 2000,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_analyze_threshold = 2000
);

alter table public.planning_applications set (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 500,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_analyze_threshold = 500
);
