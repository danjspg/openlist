create or replace function public.openlist_planning_proposal_backfill_candidates(
  p_authority_code text,
  p_limit integer default 50,
  p_from date default date '2000-01-01',
  p_to date default current_date
)
returns table (
  id uuid,
  source_application_id bigint,
  reference text,
  proposal text,
  registration_date date,
  source_url text,
  priority integer,
  search_clicks numeric,
  search_impressions numeric,
  is_notable boolean
)
language sql
stable
security definer
set search_path = public, pg_catalog
set statement_timeout = '30s'
as $$
  with traffic as materialized (
    select
      performance.application_id,
      sum(performance.clicks) as clicks,
      sum(performance.impressions) as impressions
    from public.planning_seo_search_performance performance
    group by performance.application_id
  ), candidates as materialized (
    select
      application.id,
      application.source_application_id,
      application.reference,
      application.proposal,
      application.registration_date,
      application.source_url,
      coalesce(traffic.clicks, 0) as search_clicks,
      coalesce(traffic.impressions, 0) as search_impressions,
      exists (
        select 1
        from public.planning_seo_notable notable
        where notable.application_id = application.id
          and notable.active
      ) as is_notable,
      case
        when coalesce(traffic.clicks, 0) > 0
          or coalesce(traffic.impressions, 0) > 0
          or exists (
            select 1
            from public.planning_seo_notable notable
            where notable.application_id = application.id
              and notable.active
          ) then 0
        when application.registration_date >= current_date - interval '2 years'
          and application.normalized_status <> 'decision_made'
          and not public.openlist_planning_status_is_terminal(application.normalized_status)
          and application.decision_date is null
          and application.withdrawal_date is null then 1
        else 2
      end as priority
    from public.planning_applications application
    left join traffic on traffic.application_id = application.id
    where application.local_authority_code = upper(trim(p_authority_code))
      and application.registration_date between coalesce(p_from, date '2000-01-01')
        and coalesce(p_to, current_date)
      and (
        (
          upper(trim(p_authority_code)) = 'CORKCOCO'
          and char_length(trim(regexp_replace(coalesce(application.proposal, ''), '\s+', ' ', 'g')))
            between 700 and 780
          and trim(application.proposal) !~ '[.!?)]\s*$'
        )
        or (
          upper(trim(p_authority_code)) = 'DLR'
          and char_length(application.proposal) = 80
        )
        or (
          upper(trim(p_authority_code)) = 'FINGAL'
          and char_length(application.proposal) = 70
        )
        or (
          upper(trim(p_authority_code)) = 'WEXFORD'
          and char_length(application.proposal) = 80
        )
      )
  )
  select
    candidate.id,
    candidate.source_application_id,
    candidate.reference,
    candidate.proposal,
    candidate.registration_date,
    candidate.source_url,
    candidate.priority,
    candidate.search_clicks,
    candidate.search_impressions,
    candidate.is_notable
  from candidates candidate
  order by
    candidate.priority,
    candidate.search_clicks desc,
    candidate.search_impressions desc,
    candidate.registration_date desc nulls last,
    candidate.reference desc,
    candidate.id
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

revoke all on function public.openlist_planning_proposal_backfill_candidates(text, integer, date, date) from public;
grant execute on function public.openlist_planning_proposal_backfill_candidates(text, integer, date, date) to service_role;
