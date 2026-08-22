-- The production index was built concurrently outside the transaction-only
-- migration runner. This records its compatible function setting and history.
alter function public.openlist_planning_dashboard_aggregate(text, text, text, text, text)
  set plan_cache_mode = force_custom_plan;
