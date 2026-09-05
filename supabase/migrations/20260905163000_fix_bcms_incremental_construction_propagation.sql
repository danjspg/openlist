-- Keep incremental BCMS changes off the historical UUID cursor.
-- New/changed links and source records enqueue only the affected planning
-- applications. The existing construction_catchup cursor remains a bounded
-- reconciliation sweep.

create table if not exists public.bcms_construction_refresh_queue (
  planning_application_id uuid primary key references public.planning_applications(id) on delete cascade,
  reason text not null default 'bcms_change',
  queued_at timestamptz not null default now(),
  available_at timestamptz not null default now(),
  attempts integer not null default 0,
  last_error text null,
  updated_at timestamptz not null default now()
);

create index if not exists bcms_construction_refresh_queue_work_idx
  on public.bcms_construction_refresh_queue(available_at, queued_at, planning_application_id);

create or replace function public.openlist_bcms_queue_construction_refresh(
  p_application_id uuid,
  p_reason text default 'bcms_change'
)
returns void
language plpgsql
security definer
set search_path to 'public','pg_catalog'
as $function$
begin
  if p_application_id is null then return; end if;

  insert into public.bcms_construction_refresh_queue(
    planning_application_id, reason, queued_at, available_at, attempts, last_error, updated_at
  ) values (
    p_application_id, coalesce(nullif(p_reason,''),'bcms_change'), now(), now(), 0, null, now()
  )
  on conflict(planning_application_id) do update
  set reason=excluded.reason,
      queued_at=least(public.bcms_construction_refresh_queue.queued_at, excluded.queued_at),
      available_at=now(),
      attempts=0,
      last_error=null,
      updated_at=now();
end
$function$;

create or replace function public.openlist_bcms_queue_link_refresh()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_catalog'
as $function$
begin
  if tg_op='INSERT' then
    perform public.openlist_bcms_queue_construction_refresh(new.planning_application_id,'link_inserted');
  elsif tg_op='DELETE' then
    perform public.openlist_bcms_queue_construction_refresh(old.planning_application_id,'link_removed');
  end if;
  return null;
end
$function$;

drop trigger if exists openlist_bcms_queue_link_refresh_trigger on public.planning_building_control_links;
create trigger openlist_bcms_queue_link_refresh_trigger
after insert or delete on public.planning_building_control_links
for each row execute function public.openlist_bcms_queue_link_refresh();

create or replace function public.openlist_bcms_queue_record_refresh()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_catalog'
as $function$
declare
  app_id uuid;
begin
  if tg_op in ('UPDATE','DELETE') then
    for app_id in
      select distinct l.planning_application_id
      from public.building_control_notices n
      join public.planning_building_control_links l on l.notice_id=n.id
      where n.source_resource_id=old.source_resource_id
        and n.building_control_authority_code=old.building_control_authority_code
        and n.cn_number=old.cn_number
    loop
      perform public.openlist_bcms_queue_construction_refresh(app_id,'source_record_changed');
    end loop;
  end if;

  if tg_op in ('INSERT','UPDATE') then
    for app_id in
      select distinct l.planning_application_id
      from public.building_control_notices n
      join public.planning_building_control_links l on l.notice_id=n.id
      where n.source_resource_id=new.source_resource_id
        and n.building_control_authority_code=new.building_control_authority_code
        and n.cn_number=new.cn_number
    loop
      perform public.openlist_bcms_queue_construction_refresh(app_id,'source_record_changed');
    end loop;
  end if;

  return null;
end
$function$;

drop trigger if exists openlist_bcms_queue_record_refresh_trigger on public.building_control_records;
create trigger openlist_bcms_queue_record_refresh_trigger
after insert or update or delete on public.building_control_records
for each row execute function public.openlist_bcms_queue_record_refresh();

create or replace function public.openlist_bcms_refresh_construction_application(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public','pg_catalog'
set statement_timeout to '15s'
as $function$
begin
  perform public.openlist_bcms_refresh_construction_state(p_application_id);

  -- Remove BCMS lifecycle rows that are no longer supported by a currently
  -- linked notice/record. This also cleans up corrected dates and removed links.
  delete from public.planning_application_events e
  where e.application_id=p_application_id
    and e.event_source='nbco_bcms_open_data'
    and e.event_type in ('works_commenced','completion_certificate_validated')
    and not exists (
      select 1
      from (
        select
          'works_commenced'::text as event_type,
          'bcms:notice:'||n.source_notice_key||':works:'||n.commencement_date::text as event_key
        from public.planning_building_control_links l
        join public.building_control_notices n on n.id=l.notice_id
        where l.planning_application_id=p_application_id
          and n.commencement_date between date '2014-01-01' and current_date+1

        union all

        select distinct
          'completion_certificate_validated'::text,
          'bcms:notice:'||n.source_notice_key||':ccc:'||r.completion_certificate_number||':'||r.completion_certificate_validated_at::text
        from public.planning_building_control_links l
        join public.building_control_notices n on n.id=l.notice_id
        join public.building_control_records r
          on r.source_resource_id=n.source_resource_id
         and r.building_control_authority_code=n.building_control_authority_code
         and r.cn_number=n.cn_number
        where l.planning_application_id=p_application_id
          and r.completion_certificate_number is not null
          and r.completion_certificate_validated_at between date '2014-01-01' and current_date+1
      ) desired
      where desired.event_type=e.event_type and desired.event_key=e.event_key
    );

  insert into public.planning_application_events(
    application_id,event_type,event_date,detected_at,event_source,source_field,
    label,old_value,new_value,raw_source_value,provenance,event_key
  )
  select
    l.planning_application_id,
    'works_commenced',
    n.commencement_date,
    now(),
    'nbco_bcms_open_data',
    'CN_Commencement_Date',
    case
      when n.total_phases>1 and cardinality(n.phase_numbers)=1
        then format('Works commenced (phase %s of %s)',n.phase_numbers[1],n.total_phases)
      else 'Works commenced'
    end,
    null,
    n.commencement_date::text,
    n.cn_number,
    'reconstructed',
    'bcms:notice:'||n.source_notice_key||':works:'||n.commencement_date::text
  from public.planning_building_control_links l
  join public.building_control_notices n on n.id=l.notice_id
  where l.planning_application_id=p_application_id
    and n.commencement_date between date '2014-01-01' and current_date+1
  on conflict(application_id,event_key) do update
  set event_date=excluded.event_date,
      event_source=excluded.event_source,
      source_field=excluded.source_field,
      label=excluded.label,
      new_value=excluded.new_value,
      raw_source_value=excluded.raw_source_value,
      provenance=excluded.provenance
  where row(
    public.planning_application_events.event_date,
    public.planning_application_events.event_source,
    public.planning_application_events.source_field,
    public.planning_application_events.label,
    public.planning_application_events.new_value,
    public.planning_application_events.raw_source_value,
    public.planning_application_events.provenance
  ) is distinct from row(
    excluded.event_date,excluded.event_source,excluded.source_field,excluded.label,
    excluded.new_value,excluded.raw_source_value,excluded.provenance
  );

  insert into public.planning_application_events(
    application_id,event_type,event_date,detected_at,event_source,source_field,
    label,old_value,new_value,raw_source_value,provenance,event_key
  )
  select distinct on(l.planning_application_id,n.id,r.completion_certificate_number,r.completion_certificate_validated_at)
    l.planning_application_id,
    'completion_certificate_validated',
    r.completion_certificate_validated_at,
    now(),
    'nbco_bcms_open_data',
    'CCC_Date_Validated',
    case
      when r.completion_units is not null then
        'Completion certificate validated ('||r.completion_units::text||case when r.completion_units=1 then ' unit)' else ' units)' end
      else 'Completion certificate validated'
    end,
    null,
    r.completion_certificate_validated_at::text,
    r.completion_certificate_number,
    'reconstructed',
    'bcms:notice:'||n.source_notice_key||':ccc:'||r.completion_certificate_number||':'||r.completion_certificate_validated_at::text
  from public.planning_building_control_links l
  join public.building_control_notices n on n.id=l.notice_id
  join public.building_control_records r
    on r.source_resource_id=n.source_resource_id
   and r.building_control_authority_code=n.building_control_authority_code
   and r.cn_number=n.cn_number
  where l.planning_application_id=p_application_id
    and r.completion_certificate_number is not null
    and r.completion_certificate_validated_at between date '2014-01-01' and current_date+1
  order by l.planning_application_id,n.id,r.completion_certificate_number,r.completion_certificate_validated_at,r.id
  on conflict(application_id,event_key) do update
  set event_date=excluded.event_date,
      event_source=excluded.event_source,
      source_field=excluded.source_field,
      label=excluded.label,
      new_value=excluded.new_value,
      raw_source_value=excluded.raw_source_value,
      provenance=excluded.provenance
  where row(
    public.planning_application_events.event_date,
    public.planning_application_events.event_source,
    public.planning_application_events.source_field,
    public.planning_application_events.label,
    public.planning_application_events.new_value,
    public.planning_application_events.raw_source_value,
    public.planning_application_events.provenance
  ) is distinct from row(
    excluded.event_date,excluded.event_source,excluded.source_field,excluded.label,
    excluded.new_value,excluded.raw_source_value,excluded.provenance
  );
end
$function$;

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
  dirty_refreshed int := 0;
  dirty_failures int := 0;
  dirty_item record;
begin
  batch_limit := greatest(1, least(coalesce(p_limit,200),2000));

  -- Always service targeted incremental changes before advancing the historical
  -- cursor. This prevents a newly linked application behind the UUID cursor
  -- from waiting for a future full sweep.
  for dirty_item in
    select planning_application_id
    from public.bcms_construction_refresh_queue
    where available_at<=now()
    order by queued_at,planning_application_id
    limit least(batch_limit,200)
    for update skip locked
  loop
    begin
      perform public.openlist_bcms_refresh_construction_application(dirty_item.planning_application_id);
      delete from public.bcms_construction_refresh_queue
      where planning_application_id=dirty_item.planning_application_id;
      dirty_refreshed:=dirty_refreshed+1;
    exception when others then
      update public.bcms_construction_refresh_queue
      set attempts=attempts+1,
          last_error=sqlerrm,
          available_at=now()+make_interval(mins=>least(60,greatest(1,(attempts+1)*5))),
          updated_at=now()
      where planning_application_id=dirty_item.planning_application_id;
      dirty_failures:=dirty_failures+1;
    end;
  end loop;

  if dirty_refreshed>0 or dirty_failures>0 then
    insert into public.bcms_pipeline_checkpoints(stage,last_success_at,last_error,counters)
    values(
      'construction_catchup',now(),
      case when dirty_failures>0 then dirty_failures||' targeted refresh failures' end,
      jsonb_build_object(
        'mode','targeted',
        'refreshed',dirty_refreshed,
        'failures',dirty_failures,
        'remaining',(select count(*) from public.bcms_construction_refresh_queue)
      )
    )
    on conflict(stage) do update
    set last_success_at=excluded.last_success_at,
        last_error=excluded.last_error,
        counters=excluded.counters,
        updated_at=now();

    return jsonb_build_object(
      'mode','targeted',
      'refreshedApplications',dirty_refreshed,
      'failures',dirty_failures,
      'remaining',(select count(*) from public.bcms_construction_refresh_queue),
      'complete',false
    );
  end if;

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
    values('construction_catchup',start_cursor::text,now(),null,jsonb_build_object('mode','reconciliation','refreshed',0,'complete',true))
    on conflict(stage) do update
      set last_success_at=excluded.last_success_at,last_error=null,counters=excluded.counters,updated_at=now();
    return jsonb_build_object('mode','reconciliation','refreshedApplications',0,'cursor',start_cursor,'complete',true);
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
      end construction_status,
      case when notice_count>1 or not unphased then 'Matched phased building-control records'
           else 'Matched building-control notice '||cn_number end detail
    from evidence e
  ), desired as (
    select planning_application_id,
           construction_status,
           case when construction_status='completed' then completion_date else commencement_date end evidence_date,
           case when construction_status is null then null else 'NBCO/BCMS open data' end evidence_source,
           case when construction_status is null then null else detail end evidence_detail
    from derived
  )
  update public.planning_applications p
  set construction_status=d.construction_status,
      construction_evidence_date=d.evidence_date,
      construction_evidence_source=d.evidence_source,
      construction_evidence_detail=d.evidence_detail
  from desired d
  where p.id=d.planning_application_id
    and (p.construction_status,p.construction_evidence_date,p.construction_evidence_source,p.construction_evidence_detail)
        is distinct from
        (d.construction_status,d.evidence_date,d.evidence_source,d.evidence_detail);

  insert into public.bcms_pipeline_checkpoints(stage,cursor_text,last_success_at,last_error,counters)
  values('construction_catchup',final_cursor::text,now(),null,
         jsonb_build_object('mode','reconciliation','refreshed',refreshed,'complete',refreshed<batch_limit))
  on conflict(stage) do update
    set cursor_text=excluded.cursor_text,last_success_at=excluded.last_success_at,
        last_error=null,counters=excluded.counters,updated_at=now();

  return jsonb_build_object('mode','reconciliation','refreshedApplications',refreshed,'cursor',final_cursor,'complete',refreshed<batch_limit);
end
$function$;

create or replace function public.openlist_bcms_construction_health()
returns jsonb
language sql
stable
security definer
set search_path to 'public','pg_catalog'
set statement_timeout to '15s'
as $function$
  select jsonb_build_object(
    'dirtyQueued',(select count(*) from public.bcms_construction_refresh_queue),
    'dirtyRetryable',(select count(*) from public.bcms_construction_refresh_queue where available_at<=now()),
    'oldestDirtyQueuedAt',(select min(queued_at) from public.bcms_construction_refresh_queue),
    'rawUnprocessed',(select count(*) from public.bcms_raw_record_versions where processed_at is null and not processing_terminal),
    'oldestRawUnprocessedAt',(select min(acquired_at) from public.bcms_raw_record_versions where processed_at is null and not processing_terminal),
    'linkedCommencementMissingState',(
      select count(distinct l.planning_application_id)
      from public.planning_building_control_links l
      join public.building_control_notices n on n.id=l.notice_id
      join public.planning_applications p on p.id=l.planning_application_id
      where n.commencement_date between date '2014-01-01' and current_date+1
        and p.construction_status is null
    ),
    'linkedCommencementMissingEvent',(
      select count(distinct l.planning_application_id)
      from public.planning_building_control_links l
      join public.building_control_notices n on n.id=l.notice_id
      where n.commencement_date between date '2014-01-01' and current_date+1
        and not exists (
          select 1 from public.planning_application_events e
          where e.application_id=l.planning_application_id
            and e.event_type='works_commenced'
            and e.event_source='nbco_bcms_open_data'
            and e.event_date=n.commencement_date
        )
    )
  );
$function$;

-- Seed only the concrete incremental correctness gap. Do not enqueue the
-- unfinished historical construction-state sweep, which remains cursor-driven.
insert into public.bcms_construction_refresh_queue(
  planning_application_id,reason,queued_at,available_at,attempts,last_error,updated_at
)
select distinct l.planning_application_id,'missing_commencement_event',now(),now(),0,null,now()
from public.planning_building_control_links l
join public.building_control_notices n on n.id=l.notice_id
where n.commencement_date between date '2014-01-01' and current_date+1
  and not exists (
    select 1
    from public.planning_application_events e
    where e.application_id=l.planning_application_id
      and e.event_type='works_commenced'
      and e.event_source='nbco_bcms_open_data'
      and e.event_date=n.commencement_date
  )
on conflict(planning_application_id) do update
set reason=excluded.reason,available_at=now(),last_error=null,updated_at=now();
