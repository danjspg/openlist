alter table public.planning_seo_notable
  add column if not exists notable_categories text[] not null default '{}'::text[],
  add column if not exists classification_reasons jsonb not null default '{}'::jsonb,
  add column if not exists classification_sources text[] not null default '{}'::text[],
  add column if not exists priority_eligible boolean not null default true;

comment on column public.planning_seo_notable.notable_categories is
  'Stable search/indexing categories. Deterministic and press categories may coexist.';
comment on column public.planning_seo_notable.classification_reasons is
  'Route-keyed classifier details. Each enrichment route must preserve the other route keys.';
comment on column public.planning_seo_notable.classification_sources is
  'Additive routes that classified or explicitly enriched the application, such as deterministic and press. This metadata may outlive priority eligibility.';
comment on column public.planning_seo_notable.priority_eligible is
  'Whether this classified/enriched row currently receives priority sitemap and description-audit treatment. Structural classification metadata may outlive eligibility.';

update public.planning_seo_notable
set classification_sources = array[source],
    notable_categories = case
      when source = 'press' then array['press']::text[]
      else notable_categories
    end,
    classification_reasons = case
      when source = 'press' then jsonb_build_object(
        'press', jsonb_build_object('reasons', jsonb_build_array(reason))
      )
      else classification_reasons
    end
where cardinality(classification_sources) = 0;

create index if not exists planning_seo_notable_categories_gin_idx
  on public.planning_seo_notable using gin (notable_categories)
  where active;

create index if not exists planning_seo_notable_priority_sitemap_idx
  on public.planning_seo_notable (created_at, application_id)
  where active and priority_eligible;

create index if not exists planning_applications_notable_latest_outcome_idx
  on public.planning_applications ((greatest(
    decision_date, final_grant_date, withdrawal_date, appeal_decision_date
  )), id)
  where greatest(
    decision_date, final_grant_date, withdrawal_date, appeal_decision_date
  ) is not null;

create or replace function public.openlist_planning_notable_structural_window_eligible(
  p_normalized_status text,
  p_decision_date date,
  p_final_grant_date date,
  p_withdrawal_date date,
  p_appeal_decision_date date,
  p_as_of date default current_date,
  p_retention_months int default 12
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(p_normalized_status, 'unknown') = any(array[
    'pre_validation','registered','under_assessment',
    'further_information_requested','further_information_received','appealed'
  ]) or greatest(
    p_decision_date,
    p_final_grant_date,
    p_withdrawal_date,
    p_appeal_decision_date
  ) >= p_as_of - make_interval(months => greatest(1, least(coalesce(p_retention_months, 12), 60)));
$$;

revoke all on function public.openlist_planning_notable_structural_window_eligible(text, date, date, date, date, date, int) from public, anon, authenticated;
grant execute on function public.openlist_planning_notable_structural_window_eligible(text, date, date, date, date, date, int) to service_role;

-- Priority eligibility keeps this cohort comfortably beneath the XML
-- protocol's 50,000 URL ceiling. Classification rows remain durable even when
-- structural priority expires.
create or replace function public.openlist_planning_notable_sitemap(
  p_limit int default 1000,
  p_offset int default 0
)
returns table (
  id uuid,
  local_authority_code text,
  reference text,
  registration_date date,
  updated_at timestamptz
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
    p.registration_date,
    p.updated_at
  from public.planning_seo_notable n
  join public.planning_applications p on p.id = n.application_id
  where n.active and n.priority_eligible
  order by n.created_at, p.local_authority_code, p.reference, p.id
  limit greatest(1, least(coalesce(p_limit, 1000), 1000))
  offset greatest(0, least(coalesce(p_offset, 0), 49999));
$$;

drop function if exists public.openlist_planning_notable_sitemap_year(int, int, int);

create or replace function public.openlist_planning_notable_reconciliation_candidates(
  p_after uuid default '00000000-0000-0000-0000-000000000000'::uuid,
  p_limit int default 1000,
  p_retention_months int default 12,
  p_recent_changed_days int default 3,
  p_full_window boolean default false
)
returns table (
  id uuid,
  local_authority text,
  local_authority_code text,
  reference text,
  proposal text,
  applicant_name text,
  application_type text,
  status text,
  normalized_status text,
  registration_date date,
  decision_date date,
  final_grant_date date,
  withdrawal_date date,
  appeal_decision_date date,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_catalog
set statement_timeout = '15s'
as $$
  select
    p.id,
    p.local_authority,
    p.local_authority_code,
    p.reference,
    p.proposal,
    p.applicant_name,
    p.application_type,
    p.status,
    p.normalized_status,
    p.registration_date,
    p.decision_date,
    p.final_grant_date,
    p.withdrawal_date,
    p.appeal_decision_date,
    p.updated_at
  from public.planning_applications p
  left join public.planning_seo_notable n on n.application_id = p.id
  where p.id > coalesce(p_after, '00000000-0000-0000-0000-000000000000'::uuid)
    and (
      (
        p_full_window
        and public.openlist_planning_notable_structural_window_eligible(
          p.normalized_status, p.decision_date, p.final_grant_date,
          p.withdrawal_date, p.appeal_decision_date, current_date, p_retention_months
        )
      )
      or p.updated_at >= now() - make_interval(days => greatest(1, least(coalesce(p_recent_changed_days, 3), 30)))
      or (
        n.application_id is not null
        and n.priority_eligible is distinct from (
          (
            'deterministic' = any(n.classification_sources)
            and public.openlist_planning_notable_structural_window_eligible(
              p.normalized_status, p.decision_date, p.final_grant_date,
              p.withdrawal_date, p.appeal_decision_date, current_date, p_retention_months
            )
          )
          or exists (
            select 1 from unnest(n.classification_sources) source_name
            where source_name <> 'deterministic'
          )
        )
      )
    )
  order by p.id
  limit greatest(1, least(coalesce(p_limit, 1000), 1000));
$$;

revoke all on function public.openlist_planning_notable_reconciliation_candidates(uuid, int, int, int, boolean) from public, anon, authenticated;
grant execute on function public.openlist_planning_notable_reconciliation_candidates(uuid, int, int, int, boolean) to service_role;

create or replace function public.openlist_planning_notable_description_candidates(
  p_limit int default 30
)
returns table (
  id uuid,
  local_authority text,
  local_authority_code text,
  reference text,
  proposal text,
  location text,
  applicant_name text,
  source_application_id bigint,
  source_url text,
  registration_date date,
  evidence jsonb
)
language sql
stable
security definer
set search_path = public, pg_catalog
set statement_timeout = '15s'
as $$
  select
    p.id,
    p.local_authority,
    p.local_authority_code,
    p.reference,
    p.proposal,
    p.location,
    p.applicant_name,
    p.source_application_id,
    p.source_url,
    p.registration_date,
    n.evidence
  from public.planning_seo_notable n
  join public.planning_applications p on p.id = n.application_id
  where n.active and n.priority_eligible
    and (
      length(btrim(coalesce(p.proposal, ''))) < 160
      or p.proposal ~* '(…|\.\.\.|\m(and|or|with|to|for|of|the|including|comprising))\s*$'
    )
    and case
      when n.evidence #>> '{description_audit,checked_at}' ~ '^\d{4}-\d{2}-\d{2}T'
        then (n.evidence #>> '{description_audit,checked_at}')::timestamptz < now() - interval '30 days'
      else true
    end
  order by
    n.evidence #>> '{description_audit,checked_at}' nulls first,
    n.updated_at,
    n.application_id
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

revoke all on function public.openlist_planning_notable_description_candidates(int) from public;
grant execute on function public.openlist_planning_notable_description_candidates(int)
  to service_role;
