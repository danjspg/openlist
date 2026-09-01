-- Keep status-only Planning browse queries on an ordered index path.
-- The previous (normalized_status, registration_date desc) index used PostgreSQL's
-- default NULLS FIRST ordering for DESC, while the application explicitly asks
-- for NULLS LAST. That mismatch forced broad status cohorts to be scanned and
-- sorted before LIMIT was applied.

create index if not exists planning_applications_status_browse_idx
  on public.planning_applications (
    normalized_status,
    registration_date desc nulls last,
    reference desc
  );

-- The replacement index has the same normalized_status leading key and also
-- serves ordered browse queries, so the older index is redundant.
drop index if exists public.planning_applications_normalized_status_idx;
