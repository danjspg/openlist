-- Notable Planning v2 keeps structural classification durable while priority
-- eligibility varies by residential scale and the latest real lifecycle event.
alter table public.planning_seo_notable
  add column if not exists extracted_residential_units int null
    check (extracted_residential_units between 1 and 5000);

comment on column public.planning_seo_notable.extracted_residential_units is
  'Exact deterministic residential scale signal. Public taxonomy remains 10-49 residential and 50+ residential-large.';

create index if not exists planning_seo_notable_structural_scale_idx
  on public.planning_seo_notable (extracted_residential_units, application_id)
  where active and 'deterministic' = any(classification_sources);

create index if not exists planning_events_meaningful_lifecycle_idx
  on public.planning_application_events (application_id, event_date desc)
  where event_type in (
    'application_received','application_validated','decision_due_changed',
    'further_information_requested','further_information_received',
    'decision_made','final_grant','withdrawn',
    'appeal_lodged','appeal_decided','decision_changed'
  );

create or replace function public.openlist_planning_notable_retention_months(
  p_residential_units int
)
returns int
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when coalesce(p_residential_units, 0) >= 100 then 60
    when coalesce(p_residential_units, 0) >= 50 then 24
    else 12
  end;
$$;

revoke all on function public.openlist_planning_notable_retention_months(int) from public, anon, authenticated;
grant execute on function public.openlist_planning_notable_retention_months(int) to service_role;

drop function if exists public.openlist_planning_notable_reconciliation_candidates(uuid, int, int, int, boolean);
create function public.openlist_planning_notable_reconciliation_candidates(
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
  latest_lifecycle_event_date date,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_catalog
set statement_timeout = '15s'
as $$
  select
    p.id, p.local_authority, p.local_authority_code, p.reference, p.proposal,
    p.applicant_name, p.application_type, p.status, p.normalized_status,
    p.registration_date, p.decision_date, p.final_grant_date,
    p.withdrawal_date, p.appeal_decision_date, lifecycle.latest_event_date,
    p.updated_at
  from public.planning_applications p
  left join public.planning_seo_notable n on n.application_id = p.id
  left join lateral (
    select max(e.event_date) as latest_event_date
    from public.planning_application_events e
    where e.application_id = p.id
      and e.event_type in (
        'application_received','application_validated','decision_due_changed',
        'further_information_requested','further_information_received',
        'decision_made','final_grant','withdrawn',
        'appeal_lodged','appeal_decided','decision_changed'
      )
  ) lifecycle on true
  where p.id > coalesce(p_after, '00000000-0000-0000-0000-000000000000'::uuid)
    and (
      -- A confirmed full reconciliation is bounded/resumable and targets only
      -- existing notable rows plus plausible residential count descriptions.
      (p_full_window and (
        n.application_id is not null
        or p.proposal ~* '\m[0-9]{1,4}\s*(no\.?\s*)?(residential\s+units?|housing\s+units?|houses?|homes?|dwellings?|apartments?)\M'
        or public.openlist_planning_notable_structural_window_eligible(
          p.normalized_status, p.decision_date, p.final_grant_date,
          p.withdrawal_date, p.appeal_decision_date, current_date, p_retention_months
        )
      ))
      or p.updated_at >= now() - make_interval(days => greatest(1, least(coalesce(p_recent_changed_days, 3), 30)))
      or (
        n.application_id is not null
        and n.priority_eligible is distinct from (
          (
            'deterministic' = any(n.classification_sources)
            and (
              coalesce(p.normalized_status, 'unknown') = any(array[
                'pre_validation','registered','under_assessment',
                'further_information_requested','further_information_received','appealed'
              ])
              or greatest(
                p.decision_date, p.final_grant_date, p.withdrawal_date,
                p.appeal_decision_date, lifecycle.latest_event_date
              ) >= current_date - make_interval(months =>
                public.openlist_planning_notable_retention_months(n.extracted_residential_units)
              )
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

-- Production-safe reporting for rollout validation; all work starts from the
-- small structural table and uses indexed joins.
create or replace function public.openlist_notable_v2_rollout_report()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
set statement_timeout = '15s'
as $$
  select jsonb_build_object(
    'generatedAt', now(),
    'structuralNotable', count(*) filter (where n.active),
    'priorityEligible', count(*) filter (where n.active and n.priority_eligible),
    'historicalNotable', count(*) filter (where n.active and not n.priority_eligible),
    'residential10to19', count(*) filter (where n.active and n.extracted_residential_units between 10 and 19),
    'residential20to49', count(*) filter (where n.active and n.extracted_residential_units between 20 and 49),
    'residential50to99', count(*) filter (where n.active and n.extracted_residential_units between 50 and 99),
    'residential100plus', count(*) filter (where n.active and n.extracted_residential_units >= 100),
    'historicalByScale', jsonb_build_object(
      '10-49', count(*) filter (where n.active and not n.priority_eligible and n.extracted_residential_units between 10 and 49),
      '50-99', count(*) filter (where n.active and not n.priority_eligible and n.extracted_residential_units between 50 and 99),
      '100+', count(*) filter (where n.active and not n.priority_eligible and n.extracted_residential_units >= 100)
    )
  )
  from public.planning_seo_notable n;
$$;

revoke all on function public.openlist_notable_v2_rollout_report() from public, anon, authenticated;
grant execute on function public.openlist_notable_v2_rollout_report() to service_role;

create or replace function public.openlist_planning_locality_notables(
  p_authority_code text,
  p_locality text,
  p_include_older boolean default false,
  p_limit int default 100
)
returns table(application_id uuid, display_name text, notable_categories text[])
language sql
stable
security definer
set search_path = public, pg_catalog
set statement_timeout = '15s'
as $$
  select n.application_id,n.display_name,n.notable_categories
  from public.planning_seo_notable n
  join public.planning_applications p on p.id=n.application_id
  where n.active
    and (p_include_older or n.priority_eligible)
    and p.local_authority_code=p_authority_code
    and p.location ilike '%'||replace(replace(replace(p_locality,'\','\\'),'%','\%'),'_','\_')||'%' escape '\'
  order by p.registration_date desc nulls last,p.reference desc,p.id
  limit greatest(1,least(coalesce(p_limit,100),200));
$$;

revoke all on function public.openlist_planning_locality_notables(text,text,boolean,int) from public;
grant execute on function public.openlist_planning_locality_notables(text,text,boolean,int) to anon,authenticated,service_role;
