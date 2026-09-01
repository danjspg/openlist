-- Serve locality pages from the maintained membership snapshot plus bounded,
-- index-backed recent rows. Never reconstruct the full dashboard in a request.
create or replace function public.openlist_planning_locality_page_model(
  p_authority_code text,
  p_locality_slug text,
  p_include_older boolean default false,
  p_active_only boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
set statement_timeout = '5s'
as $function$
  with membership as materialized (
    select
      m.locality_label,
      m.locality_slug,
      m.evidence,
      m.active_count
    from public.locality_seo_memberships m
    where m.surface = 'planning'
      and m.left_at is null
      and m.authority_code = p_authority_code
      and m.locality_slug = p_locality_slug
    limit 1
  ), locality_applications as not materialized (
    select
      p.id,
      p.local_authority,
      p.local_authority_code,
      p.reference,
      p.application_type,
      p.proposal,
      p.location,
      p.applicant_name,
      p.status,
      p.normalized_status,
      p.decision_text,
      p.registration_date,
      p.decision_date,
      p.final_grant_date,
      p.withdrawal_date,
      p.appeal_lodged_date,
      p.appeal_decision_date,
      p.appeal_decision_text,
      p.further_information_requested_date,
      p.further_information_received_date,
      p.grid_easting,
      p.grid_northing,
      p.construction_status
    from public.planning_applications p
    cross join membership m
    where p.local_authority_code = p_authority_code
      and public.openlist_planning_locality(
        p.location,
        p.ward,
        p.local_authority_code
      ) = m.locality_label
  ), recent_candidates as materialized (
    -- The authority/locality expression index is ordered by registration_date
    -- DESC (Postgres' default NULLS FIRST). Excluding undated rows lets the
    -- database stop after a bounded cohort instead of sorting every locality
    -- row to implement NULLS LAST. The same cohort also bounds the optional
    -- recent-decisions section.
    select l.*
    from locality_applications l
    where l.registration_date is not null
    order by l.registration_date desc, l.reference desc, l.id
    limit 500
  ), recent as (
    select c.*
    from recent_candidates c
    order by c.registration_date desc, c.reference desc, c.id
    limit 8
  ), decisions as (
    select c.*
    from recent_candidates c
    where c.decision_date is not null or c.appeal_decision_date is not null
    order by greatest(c.decision_date, c.appeal_decision_date) desc nulls last,
      c.reference desc,
      c.id
    limit 5
  ), notables as (
    select
      l.*,
      n.display_name,
      n.notable_categories
    from public.planning_seo_notable n
    join locality_applications l on l.id = n.application_id
    where n.active
      and (p_include_older or n.priority_eligible)
      and (
        not p_active_only
        or l.normalized_status in (
          'pre_validation',
          'registered',
          'under_assessment',
          'further_information_requested',
          'further_information_received',
          'appealed'
        )
      )
    order by l.registration_date desc nulls last, l.reference desc, l.id
    limit 60
  )
  select case when not exists (select 1 from membership) then null else jsonb_build_object(
    'locality', (select locality_label from membership),
    'totalCount', coalesce(((select evidence from membership)->>'applicationCount')::integer, 0),
    'activeCount', coalesce((select active_count from membership), 0),
    'latestRegistrationDate', (select evidence->>'latestRegistrationDate' from membership),
    'recentApplications', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.registration_date desc, r.reference desc, r.id)
      from recent r
    ), '[]'::jsonb),
    'recentDecisions', coalesce((
      select jsonb_agg(to_jsonb(d) order by greatest(d.decision_date, d.appeal_decision_date) desc nulls last, d.reference desc, d.id)
      from decisions d
    ), '[]'::jsonb),
    'notables', coalesce((
      select jsonb_agg(jsonb_build_object(
        'application', to_jsonb(n) - 'display_name' - 'notable_categories',
        'displayName', n.display_name,
        'categories', n.notable_categories
      ) order by n.registration_date desc nulls last, n.reference desc, n.id)
      from notables n
    ), '[]'::jsonb)
  ) end
$function$;

revoke all on function public.openlist_planning_locality_page_model(text, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.openlist_planning_locality_page_model(text, text, boolean, boolean)
  to service_role;

comment on function public.openlist_planning_locality_page_model(text, text, boolean, boolean) is
  'Compact locality page model built from the maintained membership snapshot and bounded reads using the authority/locality expression index.';
