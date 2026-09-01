-- Snapshot publication is background maintenance, but it must not monopolise a
-- PostgREST backend for minutes at a time. The publisher invokes this function
-- one authority per transaction; cap each aggregate so a pathological authority
-- fails and can be retried without saturating normal public reads.
alter function public.openlist_refresh_planning_dashboard_snapshots(text[])
  set statement_timeout = '45s';

comment on function public.openlist_refresh_planning_dashboard_snapshots(text[]) is
  'Refreshes explicitly requested Planning dashboard snapshots. Callers should publish one authority per transaction; each aggregate is capped at 45 seconds so maintenance cannot monopolise public database capacity.';
