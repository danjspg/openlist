create or replace function public.openlist_repair_cork_planning_dates(
  p_repairs jsonb
)
returns jsonb
language sql
security definer
set search_path = public, pg_catalog
set statement_timeout = '120s'
as $$
  with repairs as materialized (
    select *
    from jsonb_to_recordset(coalesce(p_repairs, '[]'::jsonb)) as repair(
      id uuid,
      reference text,
      registration_date date,
      valid_date date,
      decision_date date,
      final_grant_date date,
      appeal_lodged_date date,
      appeal_decision_date date,
      dispatch_date date,
      appeal_notify_date date
    )
  ),
  updated as (
    update public.planning_applications application
    set
      registration_date = repair.registration_date,
      valid_date = repair.valid_date,
      decision_date = repair.decision_date,
      final_grant_date = repair.final_grant_date,
      appeal_lodged_date = repair.appeal_lodged_date,
      appeal_decision_date = repair.appeal_decision_date,
      dispatch_date = repair.dispatch_date,
      appeal_notify_date = repair.appeal_notify_date,
      updated_at = now()
    from repairs repair
    where application.id = repair.id
      and application.reference = repair.reference
      and application.local_authority_code = 'CORKCOCO'
      and row(
        application.registration_date,
        application.valid_date,
        application.decision_date,
        application.final_grant_date,
        application.appeal_lodged_date,
        application.appeal_decision_date,
        application.dispatch_date,
        application.appeal_notify_date
      ) is distinct from row(
        repair.registration_date,
        repair.valid_date,
        repair.decision_date,
        repair.final_grant_date,
        repair.appeal_lodged_date,
        repair.appeal_decision_date,
        repair.dispatch_date,
        repair.appeal_notify_date
      )
    returning application.id
  )
  select jsonb_build_object(
    'submitted', (select count(*) from repairs),
    'updated', (select count(*) from updated)
  );
$$;

revoke all on function public.openlist_repair_cork_planning_dates(jsonb) from public;
grant execute on function public.openlist_repair_cork_planning_dates(jsonb) to service_role;
