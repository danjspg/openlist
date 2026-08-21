-- Support the daily active-planning candidate loader without scanning and sorting
-- large status cohorts through the generic normalized-status index.
create index if not exists planning_applications_active_followup_id_idx
  on public.planning_applications (id)
  where normalized_status in (
    'pre_validation',
    'registered',
    'under_assessment',
    'further_information_requested',
    'further_information_received',
    'appealed'
  );

-- Support the 90-day decision-made follow-up cohort by date before ordering/paging.
create index if not exists planning_applications_decision_made_date_idx
  on public.planning_applications (decision_date, id)
  where normalized_status = 'decision_made'
    and decision_date is not null;
