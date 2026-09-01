-- Public development-type pages are browse pages, not SEO-priority pages.
-- Use the full exact classifier-owned category membership by default and return
-- the planning-lifecycle active count for the current authority filter.
-- p_include_older is retained for backwards-compatible RPC callers but no longer
-- narrows the user-facing category corpus to priority_eligible rows.
create or replace function public.openlist_planning_public_category_page(
  p_category text,
  p_include_older boolean default false,
  p_authority_code text default null,
  p_limit int default 25,
  p_offset int default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
set statement_timeout = '8s'
as $$
  with eligible as materialized (
    select
      n.application_id,
      n.display_name,
      n.notable_categories,
      p.local_authority_code,
      p.registration_date,
      p.reference,
      p.normalized_status
    from public.planning_seo_notable n
    join public.planning_applications p on p.id = n.application_id
    where n.active
      and n.notable_categories @> array[p_category]::text[]
  ),
  filtered as (
    select *
    from eligible
    where p_authority_code is null or local_authority_code = p_authority_code
  ),
  page_rows as (
    select *
    from filtered
    order by registration_date desc nulls last, reference desc, application_id
    limit greatest(1, least(coalesce(p_limit, 25), 40))
    offset greatest(0, least(coalesce(p_offset, 0), 40000))
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'application', jsonb_build_object(
            'id', p.id,
            'local_authority', p.local_authority,
            'local_authority_code', p.local_authority_code,
            'reference', p.reference,
            'web_reference', p.web_reference,
            'application_type', p.application_type,
            'proposal', p.proposal,
            'location', p.location,
            'eircode', p.eircode,
            'applicant_name', p.applicant_name,
            'agent_name', p.agent_name,
            'status', p.status,
            'normalized_status', p.normalized_status,
            'decision_text', p.decision_text,
            'registration_date', p.registration_date,
            'valid_date', p.valid_date,
            'decision_date', p.decision_date,
            'decision_due_date', p.decision_due_date,
            'final_grant_date', p.final_grant_date,
            'expiry_date', p.expiry_date,
            'further_information_requested_date', p.further_information_requested_date,
            'further_information_received_date', p.further_information_received_date,
            'withdrawal_date', p.withdrawal_date,
            'appeal_lodged_date', p.appeal_lodged_date,
            'appeal_decision_date', p.appeal_decision_date,
            'appeal_decision_text', p.appeal_decision_text,
            'appeal_lodged_source', p.appeal_lodged_source,
            'appeal_decision_source', p.appeal_decision_source,
            'dispatch_date', p.dispatch_date,
            'appeal_notify_date', p.appeal_notify_date,
            'ward', p.ward,
            'grid_reference', p.grid_reference,
            'grid_easting', p.grid_easting,
            'grid_northing', p.grid_northing,
            'source_url', p.source_url,
            'updated_at', p.updated_at,
            'construction_status', p.construction_status,
            'construction_evidence_date', p.construction_evidence_date,
            'construction_evidence_source', p.construction_evidence_source,
            'construction_evidence_detail', p.construction_evidence_detail
          ),
          'displayName', page_rows.display_name,
          'categories', page_rows.notable_categories
        )
        order by page_rows.registration_date desc nulls last,
                 page_rows.reference desc,
                 page_rows.application_id
      )
      from page_rows
      join public.planning_applications p on p.id = page_rows.application_id
    ), '[]'::jsonb),
    'totalCount', (select count(*) from filtered),
    'overallTotalCount', (select count(*) from eligible),
    'activeCount', (
      select count(*)
      from filtered
      where normalized_status in (
        'pre_validation',
        'registered',
        'under_assessment',
        'further_information_requested',
        'further_information_received',
        'appealed'
      )
    ),
    'authorityCounts', coalesce((
      select jsonb_agg(
        jsonb_build_object('code', authority.local_authority_code, 'count', authority.category_count)
        order by authority.category_count desc, authority.local_authority_code
      )
      from (
        select local_authority_code, count(*) as category_count
        from eligible
        group by local_authority_code
      ) authority
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.openlist_planning_public_category_page(text, boolean, text, int, int) from public;
grant execute on function public.openlist_planning_public_category_page(text, boolean, text, int, int)
  to anon, authenticated, service_role;
