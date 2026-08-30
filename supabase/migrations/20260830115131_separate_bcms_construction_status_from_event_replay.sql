create or replace function public.openlist_bcms_refresh_construction_batch(p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_catalog'
set statement_timeout to '30s'
as $function$
declare
  start_cursor uuid;
  final_cursor uuid;
  batch_limit int;
  batch_ids uuid[];
  refreshed int := 0;
begin
  batch_limit := greatest(1, least(coalesce(p_limit,200),2000));

  select coalesce(nullif(cursor_text,'')::uuid,'00000000-0000-0000-0000-000000000000'::uuid)
    into start_cursor
  from public.bcms_pipeline_checkpoints
  where stage='construction_catchup';
  start_cursor := coalesce(start_cursor,'00000000-0000-0000-0000-000000000000'::uuid);

  select array_agg(s.planning_application_id order by s.planning_application_id), count(*)::int
    into batch_ids, refreshed
  from (
    select l.planning_application_id
    from public.planning_building_control_links l
    where l.planning_application_id > start_cursor
    group by l.planning_application_id
    order by l.planning_application_id
    limit batch_limit
  ) s;

  if refreshed = 0 then
    insert into public.bcms_pipeline_checkpoints(stage,cursor_text,last_success_at,last_error,counters)
    values('construction_catchup',start_cursor::text,now(),null,jsonb_build_object('refreshed',0,'complete',true))
    on conflict(stage) do update
      set last_success_at=excluded.last_success_at,last_error=null,counters=excluded.counters,updated_at=now();
    return jsonb_build_object('refreshedApplications',0,'cursor',start_cursor,'complete',true);
  end if;

  final_cursor := batch_ids[array_length(batch_ids,1)];

  with linked_notices as (
    select l.planning_application_id,n.*
    from public.planning_building_control_links l
    join public.building_control_notices n on n.id=l.notice_id
    where l.planning_application_id = any(batch_ids)
  ), completion as (
    select n.planning_application_id,n.id notice_id,
           max(r.completion_certificate_validated_at) completion_date
    from linked_notices n
    left join public.building_control_records r
      on r.source_resource_id=n.source_resource_id
     and r.building_control_authority_code=n.building_control_authority_code
     and r.cn_number=n.cn_number
    group by n.planning_application_id,n.id
  ), evidence as (
    select n.planning_application_id,
           count(*)::int notice_count,
           bool_or(n.commencement_date is not null) has_commencement,
           bool_and(coalesce(n.total_phases,1)=1) unphased,
           bool_and(n.completion_certificate_count>0) has_completion,
           bool_and(coalesce(n.project_status,'') ~* '\mcomplete(d)?\M') explicitly_complete,
           coalesce(sum(n.completion_units),0) completion_units,
           max(n.commencement_date) commencement_date,
           max(c.completion_date) completion_date,
           min(n.cn_number) cn_number,
           max(sn.extracted_residential_units) residential_units
    from linked_notices n
    left join completion c
      on c.planning_application_id=n.planning_application_id and c.notice_id=n.id
    left join public.planning_seo_notable sn
      on sn.application_id=n.planning_application_id
    group by n.planning_application_id
  ), derived as (
    select e.*,
      case
        when notice_count=1 and unphased and has_completion and (
          (residential_units is not null and completion_units>=residential_units)
          or (residential_units is null and explicitly_complete)
        ) then 'completed'
        when has_commencement then 'commenced'
      end construction_status
    from evidence e
  )
  update public.planning_applications p
  set construction_status=d.construction_status,
      construction_evidence_date=case when d.construction_status='completed' then d.completion_date else d.commencement_date end,
      construction_evidence_source=case when d.construction_status is null then null else 'NBCO/BCMS open data' end,
      construction_evidence_detail=case
        when d.construction_status is null then null
        when d.notice_count>1 or not d.unphased then 'Matched phased building-control records'
        else 'Matched building-control notice '||d.cn_number
      end
  from derived d
  where p.id=d.planning_application_id;

  insert into public.bcms_pipeline_checkpoints(stage,cursor_text,last_success_at,last_error,counters)
  values('construction_catchup',final_cursor::text,now(),null,
         jsonb_build_object('refreshed',refreshed,'complete',refreshed<batch_limit))
  on conflict(stage) do update
    set cursor_text=excluded.cursor_text,last_success_at=excluded.last_success_at,
        last_error=null,counters=excluded.counters,updated_at=now();

  return jsonb_build_object('refreshedApplications',refreshed,'cursor',final_cursor,'complete',refreshed<batch_limit);
end
$function$;
