revoke all on public.planning_area_alert_subscriptions from anon;
revoke all on public.planning_area_alert_deliveries from anon, authenticated;
grant select, insert, update, delete on public.planning_area_alert_subscriptions to authenticated;
