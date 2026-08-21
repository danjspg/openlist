-- Keep the daily active-planning follow-up query for decision-made rows
-- without a recorded decision date on a tiny, targeted index.
-- Production already has this index; IF NOT EXISTS preserves idempotency.
create index if not exists planning_applications_undated_decision_idx
  on public.planning_applications (id)
  where normalized_status = 'decision_made'
    and decision_date is null;
