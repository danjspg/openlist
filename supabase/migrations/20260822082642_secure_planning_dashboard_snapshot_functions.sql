-- Supabase's default function grants may be copied directly to anon and
-- authenticated roles, so revoking from PUBLIC alone is insufficient here.
-- Only the ingestion workflow's service-role client may run the expensive
-- refresh; the public page reads through the server's service-role client.
revoke all on function public.openlist_refresh_planning_dashboard_snapshots(text[])
  from public, anon, authenticated;
grant execute on function public.openlist_refresh_planning_dashboard_snapshots(text[])
  to service_role;

revoke all on function public.openlist_planning_dashboard_snapshot(text)
  from public, anon, authenticated;
grant execute on function public.openlist_planning_dashboard_snapshot(text)
  to service_role;
