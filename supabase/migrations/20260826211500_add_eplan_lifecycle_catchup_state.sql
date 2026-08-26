create table if not exists public.eplan_lifecycle_catchup_attempts (
  application_id uuid primary key references public.planning_applications(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  outcome text not null check (outcome in ('enriched','no_change','not_found','error')),
  fields_added integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);

create index if not exists eplan_lifecycle_catchup_attempts_outcome_attempted_idx
  on public.eplan_lifecycle_catchup_attempts(outcome, attempted_at);

alter table public.eplan_lifecycle_catchup_attempts enable row level security;
revoke all on public.eplan_lifecycle_catchup_attempts from anon, authenticated;
grant all on public.eplan_lifecycle_catchup_attempts to service_role;

create or replace function public.openlist_eplan_lifecycle_catchup_candidates(p_limit integer default 80)
returns table(
  id uuid,
  reference text,
  local_authority_code text,
  normalized_status text,
  further_information_requested_date date,
  further_information_received_date date,
  decision_due_date date,
  decision_date date,
  withdrawal_date date,
  appeal_lodged_date date,
  expiry_date date
)
language sql
stable
security definer
set search_path = public, pg_catalog
set statement_timeout = '15s'
as $$
  select
    p.id,p.reference,p.local_authority_code,p.normalized_status,
    p.further_information_requested_date,p.further_information_received_date,
    p.decision_due_date,p.decision_date,p.withdrawal_date,p.appeal_lodged_date,p.expiry_date
  from public.planning_applications p
  left join public.eplan_lifecycle_catchup_attempts a on a.application_id = p.id
  where p.local_authority_code in (
    'KERRY','MEATH','OFFALY','WATERFORD','CARLOW','CAVAN','CLARE','DONEGAL',
    'GALWAYCOCO','GALWAYCITY','KILDARE','KILKENNY','LAOIS','LEITRIM','LIMERICK',
    'LONGFORD','LOUTH','MAYO','MONAGHAN','ROSCOMMON','SLIGO','TIPPERARY','WESTMEATH','WICKLOW'
  )
    and p.normalized_status in (
      'pre_validation','registered','under_assessment','further_information_requested',
      'further_information_received','appealed'
    )
    and (
      p.further_information_requested_date is null
      or (p.normalized_status = 'further_information_received' and p.further_information_received_date is null)
      or (p.normalized_status = 'appealed' and p.appeal_lodged_date is null)
    )
    and (
      a.application_id is null
      or (a.outcome = 'error' and a.attempted_at < now() - interval '1 day')
    )
  order by p.registration_date desc nulls last, p.id
  limit greatest(1, least(coalesce(p_limit,80), 200));
$$;

revoke all on function public.openlist_eplan_lifecycle_catchup_candidates(integer) from public, anon, authenticated;
grant execute on function public.openlist_eplan_lifecycle_catchup_candidates(integer) to service_role;
