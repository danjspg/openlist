create index if not exists idx_planning_truncated_description_recent
  on public.planning_applications (last_source_checked_at asc nulls first, registration_date desc, id)
  where char_length(coalesce(proposal, '')) = 80
    and registration_date >= date '2024-01-01';

create index if not exists idx_planning_truncated_description_historical
  on public.planning_applications (last_source_checked_at asc nulls first, registration_date desc, id)
  where char_length(coalesce(proposal, '')) = 80
    and (registration_date < date '2024-01-01' or registration_date is null);

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
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 1500), 5000));
  v_recent integer;
begin
  select count(*) into v_recent
  from (
    select 1
    from public.planning_applications p
    where char_length(coalesce(p.proposal, '')) = 80
      and p.registration_date >= date '2024-01-01'
    order by p.last_source_checked_at asc nulls first, p.registration_date desc, p.id
    limit v_limit
  ) q;

  return query
  select p.id, p.local_authority_code, p.reference, p.proposal,
         p.source_application_id::bigint, p.registration_date, p.last_source_checked_at
  from public.planning_applications p
  where char_length(coalesce(p.proposal, '')) = 80
    and p.registration_date >= date '2024-01-01'
  order by p.last_source_checked_at asc nulls first, p.registration_date desc, p.id
  limit v_limit;

  if v_recent < v_limit then
    return query
    select p.id, p.local_authority_code, p.reference, p.proposal,
           p.source_application_id::bigint, p.registration_date, p.last_source_checked_at
    from public.planning_applications p
    where char_length(coalesce(p.proposal, '')) = 80
      and (p.registration_date < date '2024-01-01' or p.registration_date is null)
    order by p.last_source_checked_at asc nulls first, p.registration_date desc, p.id
    limit (v_limit - v_recent);
  end if;
end;
$$;

grant execute on function public.openlist_truncated_description_batch(integer) to service_role;
