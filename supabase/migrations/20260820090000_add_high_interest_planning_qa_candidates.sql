-- A bounded daily cohort. Search Console determines audit order only; all page
-- facts continue to come from the council sources used by ingestion.
create index if not exists planning_seo_search_performance_recent_qa_idx
  on public.planning_seo_search_performance (data_date desc, application_id);

create or replace function public.openlist_high_interest_planning_qa_candidates(
  p_window_days int default 28,
  p_limit int default 20
)
returns table (
  application_id uuid,
  local_authority_code text,
  reference text,
  clicks numeric,
  impressions numeric
)
language sql
stable
security definer
set search_path = public, pg_catalog
set statement_timeout = '15s'
as $$
  select
    p.id,
    p.local_authority_code,
    p.reference,
    sum(s.clicks) as clicks,
    sum(s.impressions) as impressions
  from public.planning_seo_search_performance s
  join public.planning_applications p on p.id = s.application_id
  where s.data_date >= current_date - greatest(7, least(coalesce(p_window_days, 28), 90))
  group by p.id, p.local_authority_code, p.reference
  order by sum(s.clicks) desc, sum(s.impressions) desc, p.local_authority_code, p.reference
  limit greatest(1, least(coalesce(p_limit, 20), 20));
$$;

revoke all on function public.openlist_high_interest_planning_qa_candidates(int, int) from public;
grant execute on function public.openlist_high_interest_planning_qa_candidates(int, int) to service_role;
