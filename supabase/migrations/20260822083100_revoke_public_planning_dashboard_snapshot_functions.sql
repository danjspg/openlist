-- CREATE FUNCTION grants EXECUTE to PUBLIC by default. Keep both dashboard
-- functions server-only even when a migration is replayed on a new database.
revoke all on function public.openlist_refresh_planning_dashboard_snapshots(text[])
  from public, anon, authenticated;
grant execute on function public.openlist_refresh_planning_dashboard_snapshots(text[])
  to service_role;

revoke all on function public.openlist_planning_dashboard_snapshot(text)
  from public, anon, authenticated;
grant execute on function public.openlist_planning_dashboard_snapshot(text)
  to service_role;
