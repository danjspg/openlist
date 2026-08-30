create index if not exists idx_planning_truncated_description_catchup
  on public.planning_applications (registration_date desc, last_source_checked_at asc nulls first)
  where char_length(coalesce(proposal, '')) = 80;

create or replace function public.openlist_truncated_description_batch(p_limit integer default 1500)
returns table (
  id uuid,
  local_authority_code text,
  reference text,
  proposal text,
  source_application_id bigint,
  registration_date date,
  last_source_checked_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         p.local_authority_code,
         p.reference,
         p.proposal,
         p.source_application_id,
         p.registration_date,
         p.last_source_checked_at
  from public.planning_applications p
  where char_length(coalesce(p.proposal, '')) = 80
  order by
    case when p.registration_date >= date '2024-01-01' then 0 else 1 end,
    case when p.last_source_checked_at is null then 0 else 1 end,
    p.registration_date desc nulls last,
    p.last_source_checked_at asc nulls first,
    p.id
  limit greatest(1, least(coalesce(p_limit, 1500), 5000));
$$;

grant execute on function public.openlist_truncated_description_batch(integer) to service_role;
