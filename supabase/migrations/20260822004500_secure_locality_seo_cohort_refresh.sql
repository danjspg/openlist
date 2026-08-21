-- New PostgreSQL functions receive EXECUTE for PUBLIC by default. The cohort
-- refresh mutates private membership history and is strictly a service task.
revoke execute on function public.openlist_refresh_locality_seo_cohorts(integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.openlist_refresh_locality_seo_cohorts(integer, integer, integer)
  to service_role;
