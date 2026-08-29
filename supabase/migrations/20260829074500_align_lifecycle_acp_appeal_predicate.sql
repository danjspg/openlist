-- Keep lifecycle auditing aligned with the canonical ACP sync rule.
-- case_type and category are independent appeal indicators. Using COALESCE
-- can hide an appeal category whenever case_type is populated with another label.

create or replace function public.openlist_planning_lifecycle_inconsistencies_for_check(p_check text, p_limit integer default 500)
returns table(severity text, anomaly_type text, application_id uuid, local_authority_code text, reference text, normalized_status text, event_date date, detail text)
language plpgsql
stable
security definer
set search_path to 'public','pg_catalog'
set statement_timeout to '10s'
as $function$
begin
  if p_check = 'APPEAL_DECIDED_STILL_APPEALED' then
    return query
    select 'high'::text, p_check, p.id, p.local_authority_code, p.reference, p.normalized_status,
      p.appeal_decision_date, 'Appeal decision date is present but current status is still appealed.'::text
    from public.planning_applications p
    where p.normalized_status = 'appealed' and p.appeal_decision_date is not null
    order by p.appeal_decision_date desc nulls last, p.id
    limit greatest(1, least(coalesce(p_limit, 500), 2000));

  elsif p_check = 'APPEAL_DATE_ORDER_ERROR' then
    return query
    select 'warning'::text, p_check, p.id, p.local_authority_code, p.reference, p.normalized_status,
      p.appeal_decision_date,
      format('Appeal decision date %s precedes lodged date %s.', p.appeal_decision_date, p.appeal_lodged_date)::text
    from public.planning_applications p
    where p.appeal_lodged_date is not null
      and p.appeal_decision_date is not null
      and p.appeal_decision_date < p.appeal_lodged_date
    order by p.appeal_decision_date desc nulls last, p.id
    limit greatest(1, least(coalesce(p_limit, 500), 2000));

  elsif p_check in ('ACP_DECISION_STATE_MISMATCH', 'ACP_OPEN_STATE_MISMATCH') then
    return query
    with authoritative_acp as materialized (
      select distinct on (l.planning_application_id)
        l.planning_application_id,
        c.acp_case_number,
        c.received_date,
        c.decision_date,
        nullif(btrim(c.decision), '') as decision
      from public.planning_appeal_links l
      join public.planning_appeal_cases c on c.id = l.appeal_case_id
      where l.match_method = 'exact_authority_reference'
        and l.confidence = 'high'
        and (
          lower(coalesce(c.case_type, '')) like '%appeal%'
          or lower(coalesce(c.category, '')) like '%appeal%'
        )
      order by l.planning_application_id,
        c.received_date desc nulls last,
        c.source_updated_at desc nulls last,
        c.acp_case_number desc
    )
    select
      'high'::text,
      p_check,
      p.id,
      p.local_authority_code,
      p.reference,
      p.normalized_status,
      case when p_check = 'ACP_DECISION_STATE_MISMATCH' then a.decision_date else a.received_date end,
      case
        when p_check = 'ACP_DECISION_STATE_MISMATCH' then
          format('Authoritative ACP appeal %s says decision=%s on %s; OpenList status/date/outcome disagree.', a.acp_case_number, coalesce(a.decision,'(blank)'), a.decision_date)::text
        else
          format('Authoritative ACP appeal %s is open but OpenList current state/date disagree.', a.acp_case_number)::text
      end
    from authoritative_acp a
    join public.planning_applications p on p.id = a.planning_application_id
    where (
      p_check = 'ACP_DECISION_STATE_MISMATCH'
      and a.decision_date is not null
      and (
        p.normalized_status <> 'appeal_decided'
        or p.appeal_lodged_date is distinct from a.received_date
        or p.appeal_decision_date is distinct from a.decision_date
        or coalesce(btrim(p.appeal_decision_text),'') is distinct from coalesce(a.decision,'')
        or p.appeal_decision_source is distinct from 'an_coimisiun_pleanala_open_data'
      )
    ) or (
      p_check = 'ACP_OPEN_STATE_MISMATCH'
      and a.decision_date is null
      and a.received_date is not null
      and (
        p.normalized_status <> 'appealed'
        or p.appeal_lodged_date is distinct from a.received_date
        or p.appeal_lodged_source is distinct from 'an_coimisiun_pleanala_open_data'
        or p.appeal_decision_date is not null
        or p.appeal_decision_text is not null
      )
    )
    order by 7 desc nulls last, p.id
    limit greatest(1, least(coalesce(p_limit, 500), 2000));
  else
    raise exception 'Unknown lifecycle consistency check: %', p_check using errcode = '22023';
  end if;
end;
$function$;

revoke all on function public.openlist_planning_lifecycle_inconsistencies_for_check(text, integer) from public, anon, authenticated;
grant execute on function public.openlist_planning_lifecycle_inconsistencies_for_check(text, integer) to service_role;
