-- BCMS construction propagation is internal maintenance only.
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default, so make the
-- intended service-role boundary explicit.

revoke all on table public.bcms_construction_refresh_queue from anon, authenticated;
grant all on table public.bcms_construction_refresh_queue to service_role;

revoke execute on function public.openlist_bcms_queue_construction_refresh(uuid,text) from public, anon, authenticated;
revoke execute on function public.openlist_bcms_queue_link_refresh() from public, anon, authenticated;
revoke execute on function public.openlist_bcms_queue_record_refresh() from public, anon, authenticated;
revoke execute on function public.openlist_bcms_refresh_construction_application(uuid) from public, anon, authenticated;
revoke execute on function public.openlist_bcms_construction_health() from public, anon, authenticated;
revoke execute on function public.openlist_bcms_refresh_construction_batch(integer) from public, anon, authenticated;

grant execute on function public.openlist_bcms_queue_construction_refresh(uuid,text) to service_role;
grant execute on function public.openlist_bcms_refresh_construction_application(uuid) to service_role;
grant execute on function public.openlist_bcms_construction_health() to service_role;
grant execute on function public.openlist_bcms_refresh_construction_batch(integer) to service_role;
