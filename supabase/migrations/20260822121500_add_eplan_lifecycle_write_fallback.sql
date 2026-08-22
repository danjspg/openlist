-- Applied in production before this history record. Ordinary ePlan writes use
-- the table API; this function is solely a bounded fallback for rare large
-- legacy rows whose index maintenance exceeds the API's normal timeout.
create or replace function public.openlist_apply_eplan_lifecycle_update(
  p_id uuid,
  p_authority_code text,
  p_reference text,
  p_further_information_requested_date date default null,
  p_further_information_received_date date default null,
  p_withdrawal_date date default null,
  p_appeal_lodged_date date default null,
  p_expiry_date date default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_catalog'
set statement_timeout to '60s'
as $$
declare updated_count integer;
begin
  update public.planning_applications
  set
    further_information_requested_date = coalesce(further_information_requested_date, p_further_information_requested_date),
    further_information_received_date = coalesce(further_information_received_date, p_further_information_received_date),
    withdrawal_date = coalesce(withdrawal_date, p_withdrawal_date),
    appeal_lodged_date = coalesce(appeal_lodged_date, p_appeal_lodged_date),
    expiry_date = coalesce(expiry_date, p_expiry_date)
  where id = p_id and local_authority_code = p_authority_code and reference = p_reference
    and ((p_further_information_requested_date is not null and further_information_requested_date is null)
      or (p_further_information_received_date is not null and further_information_received_date is null)
      or (p_withdrawal_date is not null and withdrawal_date is null)
      or (p_appeal_lodged_date is not null and appeal_lodged_date is null)
      or (p_expiry_date is not null and expiry_date is null));
  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke all on function public.openlist_apply_eplan_lifecycle_update(uuid,text,text,date,date,date,date,date) from public, anon, authenticated;
grant execute on function public.openlist_apply_eplan_lifecycle_update(uuid,text,text,date,date,date,date,date) to service_role;

-- Applied in production before this history record. Native record comparison
-- avoids serialising large Planning rows to JSON in every update trigger.
create or replace function public.openlist_set_planning_content_updated_at()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $$
begin
  if new is distinct from old
     and new.revalidation_pending is not distinct from old.revalidation_pending then
    new.updated_at := now();
  end if;
  return new;
end;
$$;
