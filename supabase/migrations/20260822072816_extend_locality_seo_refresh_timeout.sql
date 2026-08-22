-- Locality cohort selection intentionally scans the planning corpus and can take
-- longer than the PostgREST authenticator's default 8 second statement timeout.
-- This RPC is restricted to service_role, runs only from trusted maintenance jobs,
-- and should be allowed enough time to complete without aborting the SEO workflow.
alter function public.openlist_refresh_locality_seo_cohorts(integer, integer, integer)
  set statement_timeout = '60s';
