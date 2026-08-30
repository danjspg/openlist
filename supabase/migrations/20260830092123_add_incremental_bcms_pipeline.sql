-- BCMS/NBCO ingestion is deliberately staged:
-- external source -> immutable/versioned raw rows -> normalized current rows
-- -> notice aggregation -> safe planning links -> conservative UI state.

create table public.bcms_pipeline_checkpoints (
  stage text primary key check (stage in ('acquisition_append','acquisition_audit','normalization','matching','notable_catchup','construction_catchup')),
  cursor_text text null,
  source_freshness_at timestamptz null,
  last_success_at timestamptz null,
  last_error text null,
  counters jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.bcms_pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  stage text not null,
  mode text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  start_cursor text null,
  end_cursor text null,
  counters jsonb not null default '{}'::jsonb,
  error text null
);
create index bcms_pipeline_runs_stage_started_idx on public.bcms_pipeline_runs(stage, started_at desc);

create table public.bcms_raw_record_versions (
  id uuid primary key default gen_random_uuid(),
  source_resource_id text not null,
  source_record_id bigint not null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null,
  acquired_at timestamptz not null default now(),
  acquisition_run_id uuid null references public.bcms_pipeline_runs(id) on delete set null,
  processed_at timestamptz null,
  processing_attempts int not null default 0,
  processing_error text null,
  next_processing_attempt_at timestamptz not null default now(),
  processing_terminal boolean not null default false,
  unique (source_resource_id, source_record_id, content_hash)
);
create index bcms_raw_unprocessed_idx on public.bcms_raw_record_versions(acquired_at, id) where processed_at is null;
create index bcms_raw_retryable_idx on public.bcms_raw_record_versions(next_processing_attempt_at, acquired_at, id)
  where processed_at is null and not processing_terminal;
create index bcms_raw_source_record_idx on public.bcms_raw_record_versions(source_resource_id, source_record_id, acquired_at desc);

create table if not exists public.building_control_records (
  id uuid primary key default gen_random_uuid(),
  source_resource_id text not null,
  source_row_id bigint not null,
  raw_version_id uuid null references public.bcms_raw_record_versions(id),
  source_snapshot_hash text not null default 'incremental-v2',
  source_content_hash text not null,
  building_control_authority text not null,
  building_control_authority_code text not null,
  cn_number text not null,
  planning_permission_reference_raw text null,
  planning_permission_reference_normalized text null,
  planning_reference_is_compound boolean not null default false,
  commencement_date date null,
  validation_date date null,
  project_status text null,
  validation_status text null,
  phase_number int null,
  total_phases int null,
  units_for_phase int null,
  completion_certificate_number text null,
  completion_certificate_validated_at date null,
  completion_units numeric null,
  source_payload jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_resource_id, source_row_id)
);
alter table public.building_control_records add column if not exists raw_version_id uuid null references public.bcms_raw_record_versions(id);
alter table public.building_control_records add column if not exists completion_certificate_number text null;
alter table public.building_control_records add column if not exists completion_certificate_validated_at date null;
alter table public.building_control_records add column if not exists completion_units numeric null;
create index if not exists building_control_records_authority_cn_v2_idx on public.building_control_records(building_control_authority_code, cn_number);

insert into public.bcms_pipeline_checkpoints(stage,cursor_text,last_success_at,counters)
select 'acquisition_append',coalesce(max(source_row_id),0)::text,now(),jsonb_build_object('seededFromPersistedRows',count(*))
from public.building_control_records
on conflict(stage) do nothing;

create table if not exists public.building_control_notices (
  id uuid primary key default gen_random_uuid(),
  source_resource_id text not null,
  building_control_authority text not null,
  building_control_authority_code text not null,
  cn_number text not null,
  source_notice_key text not null unique,
  planning_permission_reference_raw text null,
  planning_permission_reference_normalized text null,
  planning_reference_is_compound boolean not null default false,
  commencement_date date null,
  validation_date date null,
  project_status text null,
  validation_status text null,
  phase_numbers int[] not null default '{}',
  total_phases int null,
  row_count int not null default 0,
  building_row_count int not null default 0,
  completion_certificate_count int not null default 0,
  completion_units numeric null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_source_change_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_resource_id, building_control_authority_code, cn_number)
);
alter table public.building_control_notices add column if not exists completion_units numeric null;
alter table public.building_control_notices add column if not exists last_source_change_at timestamptz not null default now();
create index if not exists building_control_notices_match_idx on public.building_control_notices(building_control_authority_code, planning_permission_reference_normalized) where not planning_reference_is_compound;

create table if not exists public.planning_building_control_links (
  id uuid primary key default gen_random_uuid(),
  planning_application_id uuid not null references public.planning_applications(id) on delete cascade,
  notice_id uuid not null references public.building_control_notices(id) on delete cascade,
  match_method text not null,
  confidence text not null check (confidence in ('high','review')),
  matched_reference text not null,
  authority_mapping_version text not null default 'bcms-v2',
  validation_summary jsonb not null default '{}'::jsonb,
  linked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_verified_at timestamptz not null default now(),
  unique(planning_application_id, notice_id, match_method)
);
alter table public.planning_building_control_links add column if not exists updated_at timestamptz not null default now();
create index if not exists planning_building_control_links_notice_idx on public.planning_building_control_links(notice_id);

create table public.bcms_match_queue (
  id bigint generated always as identity primary key,
  notice_id uuid null references public.building_control_notices(id) on delete cascade,
  planning_application_id uuid null references public.planning_applications(id) on delete cascade,
  priority smallint not null default 10,
  state text not null default 'pending' check (state in ('pending','processing','linked','noop','ambiguous','unmatched','failed')),
  attempts int not null default 0,
  available_at timestamptz not null default now(),
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((notice_id is null) <> (planning_application_id is null))
);
create unique index bcms_match_queue_notice_unique on public.bcms_match_queue(notice_id) where notice_id is not null;
create unique index bcms_match_queue_application_unique on public.bcms_match_queue(planning_application_id) where planning_application_id is not null;
create index bcms_match_queue_work_idx on public.bcms_match_queue(priority, available_at, id) where state in ('pending','failed');

create table public.bcms_match_anomalies (
  id uuid primary key default gen_random_uuid(),
  queue_id bigint null references public.bcms_match_queue(id) on delete set null,
  notice_id uuid null references public.building_control_notices(id) on delete cascade,
  planning_application_id uuid null references public.planning_applications(id) on delete cascade,
  anomaly_type text not null check (anomaly_type in ('ambiguous','notable-link-missing','processing-failure')),
  details jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz null
);
create index bcms_match_anomalies_open_idx on public.bcms_match_anomalies(anomaly_type, detected_at) where resolved_at is null;

alter table public.planning_applications
  add column if not exists construction_status text null check (construction_status in ('commenced','completed')),
  add column if not exists construction_evidence_date date null,
  add column if not exists construction_evidence_source text null,
  add column if not exists construction_evidence_detail text null;

create index if not exists planning_applications_construction_commenced_registration_idx
  on public.planning_applications(registration_date desc, reference desc, local_authority_code)
  where construction_status = 'commenced';

alter table public.planning_application_events drop constraint if exists planning_application_events_event_type_check;
alter table public.planning_application_events add constraint planning_application_events_event_type_check check (event_type = any(array[
  'application_received','application_validated','further_information_requested','further_information_received',
  'decision_made','decision_notice_issued','final_grant','appeal_lodged','appeal_notification','appeal_decided',
  'withdrawn','status_changed','decision_changed','decision_due_changed','source_date_corrected',
  'works_commenced','completion_certificate_validated','other'
]));

create or replace function public.openlist_normalise_bcms_reference(value text)
returns text language sql immutable set search_path = pg_catalog as $$
  select upper(regexp_replace(coalesce(value,''), '[^a-zA-Z0-9]', '', 'g'));
$$;

create or replace function public.openlist_bcms_authority_code(value text)
returns text language sql immutable set search_path = pg_catalog as $$
  select case regexp_replace(lower(coalesce(value,'')), '[^a-z0-9]', '', 'g')
    when 'carlowcountycouncil' then 'CARLOW' when 'cavancountycouncil' then 'CAVAN'
    when 'clarecountycouncil' then 'CLARE' when 'corkcitycouncil' then 'CORKCITY'
    when 'corkcountycouncil' then 'CORKCOCO' when 'donegalcountycouncil' then 'DONEGAL'
    when 'dublincitycouncil' then 'DUBLINCITY' when 'dunlaoghairerathdowncountycouncil' then 'DLR'
    when 'fingalcountycouncil' then 'FINGAL' when 'galwaycitycouncil' then 'GALWAYCITY'
    when 'galwaycountycouncil' then 'GALWAYCOCO' when 'kerrycountycouncil' then 'KERRY'
    when 'kildarecountycouncil' then 'KILDARE' when 'kilkennycountycouncil' then 'KILKENNY'
    when 'laoiscountycouncil' then 'LAOIS' when 'leitrimcountycouncil' then 'LEITRIM'
    when 'limerickcityandcountycouncil' then 'LIMERICK' when 'longfordcountycouncil' then 'LONGFORD'
    when 'louthcountycouncil' then 'LOUTH' when 'mayocountycouncil' then 'MAYO'
    when 'meathcountycouncil' then 'MEATH' when 'monaghancountycouncil' then 'MONAGHAN'
    when 'offalycountycouncil' then 'OFFALY' when 'roscommoncountycouncil' then 'ROSCOMMON'
    when 'sligocountycouncil' then 'SLIGO' when 'southdublincountycouncil' then 'SOUTHDUBLIN'
    when 'tipperarycountycouncil' then 'TIPPERARY' when 'waterfordcityandcountycouncil' then 'WATERFORD'
    when 'westmeathcountycouncil' then 'WESTMEATH' when 'wexfordcountycouncil' then 'WEXFORD'
    when 'wicklowcountycouncil' then 'WICKLOW' else null end;
$$;

create or replace function public.openlist_bcms_store_acquired_rows(
  p_resource_id text, p_rows jsonb, p_run_id uuid, p_mode text, p_end_cursor text, p_source_freshness_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog set statement_timeout = '15s' as $$
declare inserted_count int; bootstrap_count int; changed_count int; input_count int := jsonb_array_length(coalesce(p_rows, '[]'::jsonb));
begin
  with inserted as (
    insert into public.bcms_raw_record_versions(source_resource_id, source_record_id, content_hash, payload, acquisition_run_id, processed_at)
    select p_resource_id, (row->>'_id')::bigint, row->>'_openlist_content_hash', row - '_openlist_content_hash', p_run_id,
      case when exists (
        select 1 from public.building_control_records current_row
        where current_row.source_resource_id=p_resource_id
          and current_row.source_row_id=(row->>'_id')::bigint
          and current_row.source_payload <@ (row - '_openlist_content_hash')
      ) and not exists (
        select 1 from public.bcms_raw_record_versions prior
        where prior.source_resource_id=p_resource_id and prior.source_record_id=(row->>'_id')::bigint
      ) then now() end
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) row
    on conflict(source_resource_id, source_record_id, content_hash) do nothing
    returning processed_at
  )
  select count(*),count(*) filter(where processed_at is not null),count(*) filter(where processed_at is null)
  into inserted_count,bootstrap_count,changed_count from inserted;
  insert into public.bcms_pipeline_checkpoints(stage,cursor_text,source_freshness_at,last_success_at,last_error,counters)
  values(case when p_mode='audit' then 'acquisition_audit' else 'acquisition_append' end,p_end_cursor,p_source_freshness_at,now(),null,jsonb_build_object('input',input_count,'newOrChanged',changed_count,'baselined',bootstrap_count,'unchanged',input_count-inserted_count))
  on conflict(stage) do update set cursor_text=excluded.cursor_text,source_freshness_at=excluded.source_freshness_at,last_success_at=excluded.last_success_at,last_error=null,counters=excluded.counters,updated_at=now();
  return jsonb_build_object('inputRows',input_count,'newOrChangedRows',changed_count,'baselinedRows',bootstrap_count,'unchangedRows',input_count-inserted_count,'cursor',p_end_cursor);
end $$;

create or replace function public.openlist_bcms_process_raw_batch(p_limit int default 200)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog set statement_timeout = '15s' as $$
declare processed_count int := 0; failed_count int := 0; changed_count int := 0; queued_count int := 0; item record; authority_code text; ref_raw text; affected_notice uuid;
begin
  for item in select * from public.bcms_raw_record_versions where processed_at is null and not processing_terminal and next_processing_attempt_at<=now() order by next_processing_attempt_at,acquired_at,id limit greatest(1,least(coalesce(p_limit,200),500)) for update skip locked loop
    begin
      authority_code := public.openlist_bcms_authority_code(item.payload->>'LocalAuthority');
      if authority_code is null then raise exception 'unmapped authority: %', item.payload->>'LocalAuthority'; end if;
      ref_raw := nullif(btrim(item.payload->>'CN_Planning_Permission_Number'),'');
      insert into public.building_control_records(
        source_resource_id,source_row_id,raw_version_id,source_snapshot_hash,source_content_hash,building_control_authority,building_control_authority_code,cn_number,
        planning_permission_reference_raw,planning_permission_reference_normalized,planning_reference_is_compound,commencement_date,validation_date,
        project_status,validation_status,phase_number,total_phases,units_for_phase,completion_certificate_number,completion_certificate_validated_at,completion_units
      ) values (
        item.source_resource_id,item.source_record_id,item.id,'incremental-v2',item.content_hash,item.payload->>'LocalAuthority',authority_code,coalesce(nullif(btrim(item.payload->>'CN_Number'),''),'missing-'||item.source_record_id),
        ref_raw,public.openlist_normalise_bcms_reference(ref_raw),coalesce(ref_raw ~* '(;|,|\s&\s|\+|\mand\M)',false),
        case when item.payload->>'CN_Commencement_Date' ~ '^20[1-9][0-9]-[0-9]{2}-[0-9]{2}' then left(item.payload->>'CN_Commencement_Date',10)::date end,
        case when item.payload->>'CN_Validation_Date' ~ '^20[1-9][0-9]-[0-9]{2}-[0-9]{2}' then left(item.payload->>'CN_Validation_Date',10)::date end,
        item.payload->>'CN_Project_Status',item.payload->>'CN_Validation_Status',nullif(item.payload->>'CN_Phase_for_this_Notice','')::int,
        nullif(item.payload->>'CN_Total_Number_of_Phases','')::int,nullif(item.payload->>'CN_Units_for_phase','')::int,nullif(btrim(item.payload->>'CCC_Number'),''),
        case when item.payload->>'CCC_Date_Validated' ~ '^20[1-9][0-9]-[0-9]{2}-[0-9]{2}' then left(item.payload->>'CCC_Date_Validated',10)::date end,
        nullif(item.payload->>'CCC_Units_Completed','')::int
      ) on conflict(source_resource_id,source_row_id) do update set
        raw_version_id=excluded.raw_version_id,source_content_hash=excluded.source_content_hash,building_control_authority=excluded.building_control_authority,
        building_control_authority_code=excluded.building_control_authority_code,cn_number=excluded.cn_number,planning_permission_reference_raw=excluded.planning_permission_reference_raw,
        planning_permission_reference_normalized=excluded.planning_permission_reference_normalized,planning_reference_is_compound=excluded.planning_reference_is_compound,
        commencement_date=excluded.commencement_date,validation_date=excluded.validation_date,project_status=excluded.project_status,validation_status=excluded.validation_status,
        phase_number=excluded.phase_number,total_phases=excluded.total_phases,units_for_phase=excluded.units_for_phase,completion_certificate_number=excluded.completion_certificate_number,
        completion_certificate_validated_at=excluded.completion_certificate_validated_at,completion_units=excluded.completion_units,last_seen_at=now(),updated_at=now()
      where building_control_records.source_content_hash is distinct from excluded.source_content_hash;
      if found then changed_count := changed_count + 1; end if;

      insert into public.building_control_notices(source_resource_id,building_control_authority,building_control_authority_code,cn_number,source_notice_key,planning_permission_reference_raw,planning_permission_reference_normalized,planning_reference_is_compound,commencement_date,validation_date,project_status,validation_status,phase_numbers,total_phases,row_count,building_row_count,completion_certificate_count,completion_units,last_seen_at,last_source_change_at,updated_at)
      select r.source_resource_id,min(r.building_control_authority),r.building_control_authority_code,r.cn_number,r.source_resource_id||':'||r.building_control_authority_code||':'||r.cn_number,min(r.planning_permission_reference_raw),min(r.planning_permission_reference_normalized),bool_or(r.planning_reference_is_compound),min(r.commencement_date),min(r.validation_date),min(r.project_status),min(r.validation_status),coalesce(array_agg(distinct r.phase_number order by r.phase_number) filter(where r.phase_number is not null),'{}'),max(r.total_phases),count(*),count(*),count(distinct r.completion_certificate_number) filter(where r.completion_certificate_number is not null),sum(r.completion_units),now(),now(),now()
      from public.building_control_records r where r.source_resource_id=item.source_resource_id and r.building_control_authority_code=authority_code and r.cn_number=coalesce(nullif(btrim(item.payload->>'CN_Number'),''),'missing-'||item.source_record_id)
      group by r.source_resource_id,r.building_control_authority_code,r.cn_number
      on conflict(source_notice_key) do update set planning_permission_reference_raw=excluded.planning_permission_reference_raw,planning_permission_reference_normalized=excluded.planning_permission_reference_normalized,planning_reference_is_compound=excluded.planning_reference_is_compound,commencement_date=excluded.commencement_date,validation_date=excluded.validation_date,project_status=excluded.project_status,validation_status=excluded.validation_status,phase_numbers=excluded.phase_numbers,total_phases=excluded.total_phases,row_count=excluded.row_count,building_row_count=excluded.building_row_count,completion_certificate_count=excluded.completion_certificate_count,completion_units=excluded.completion_units,last_seen_at=now(),last_source_change_at=now(),updated_at=now()
      returning id into affected_notice;
      insert into public.bcms_match_queue(notice_id,priority,state,available_at)
      values(affected_notice,case when exists(select 1 from public.planning_seo_notable n join public.planning_applications p on p.id=n.application_id where n.active and p.local_authority_code=authority_code and public.openlist_normalise_bcms_reference(p.reference)=public.openlist_normalise_bcms_reference(ref_raw)) then 0 else 10 end,'pending',now())
      on conflict(notice_id) where notice_id is not null do update set priority=least(bcms_match_queue.priority,excluded.priority),state='pending',available_at=now(),updated_at=now();
      queued_count := queued_count + 1;
      update public.bcms_raw_record_versions set processed_at=now(),processing_attempts=processing_attempts+1,processing_error=null,processing_terminal=false where id=item.id;
      processed_count := processed_count + 1;
    exception when others then
      update public.bcms_raw_record_versions set processing_attempts=processing_attempts+1,processing_error=sqlerrm,
        processing_terminal=processing_attempts+1>=8,
        next_processing_attempt_at=now()+make_interval(mins=>least(1440,5*(2^least(processing_attempts,8))::int))
      where id=item.id;
      failed_count := failed_count + 1;
    end;
  end loop;
  insert into public.bcms_pipeline_checkpoints(stage,last_success_at,last_error,counters) values('normalization',now(),case when failed_count>0 then failed_count||' row failures' end,jsonb_build_object('processed',processed_count,'changed',changed_count,'queued',queued_count,'failures',failed_count)) on conflict(stage) do update set last_success_at=excluded.last_success_at,last_error=excluded.last_error,counters=excluded.counters,updated_at=now();
  return jsonb_build_object('processedRows',processed_count,'newOrChangedNormalizedRows',changed_count,'queuedNotices',queued_count,'failures',failed_count);
end $$;

create or replace function public.openlist_bcms_requeue_raw_failures(p_limit int default 200)
returns int language plpgsql security definer set search_path=public,pg_catalog set statement_timeout='15s' as $$
declare requeued int;
begin
  with candidates as (
    select id from public.bcms_raw_record_versions
    where processed_at is null and processing_error is not null
    order by acquired_at,id
    limit greatest(1,least(coalesce(p_limit,200),500))
    for update skip locked
  )
  update public.bcms_raw_record_versions raw
  set processing_attempts=0,processing_error=null,processing_terminal=false,next_processing_attempt_at=now()
  from candidates where raw.id=candidates.id;
  get diagnostics requeued=row_count;
  return requeued;
end $$;

create or replace function public.openlist_bcms_enqueue_notable_catchup(p_after uuid default '00000000-0000-0000-0000-000000000000',p_limit int default 500)
returns jsonb language plpgsql security definer set search_path = public, pg_catalog set statement_timeout='15s' as $$
declare queued int; notice_queued int; final_cursor uuid;
begin
  with candidates as (select n.application_id from public.planning_seo_notable n where n.active and n.application_id>p_after order by n.application_id limit greatest(1,least(coalesce(p_limit,500),1000))), inserted as (
    insert into public.bcms_match_queue(planning_application_id,priority,state,available_at) select application_id,0,'pending',now() from candidates
    on conflict(planning_application_id) where planning_application_id is not null do update set priority=0,state=case when bcms_match_queue.state='linked' then 'noop' else 'pending' end,available_at=now(),updated_at=now() returning planning_application_id)
  select count(*),(array_agg(planning_application_id order by planning_application_id desc))[1] into queued,final_cursor from inserted;
  with candidates as (select n.application_id from public.planning_seo_notable n where n.active and n.application_id>p_after order by n.application_id limit greatest(1,least(coalesce(p_limit,500),1000)))
  insert into public.bcms_match_queue(notice_id,priority,state,available_at)
  select distinct notice.id,0,'pending',now()
  from candidates c join public.planning_applications p on p.id=c.application_id
  join public.building_control_notices notice on notice.building_control_authority_code=p.local_authority_code and not notice.planning_reference_is_compound and notice.planning_permission_reference_normalized=public.openlist_normalise_bcms_reference(p.reference)
  on conflict(notice_id) where notice_id is not null do update set priority=0,state=case when bcms_match_queue.state='linked' then 'noop' else 'pending' end,available_at=now(),updated_at=now();
  get diagnostics notice_queued = row_count;
  insert into public.bcms_pipeline_checkpoints(stage,cursor_text,last_success_at,counters) values('notable_catchup',final_cursor::text,now(),jsonb_build_object('queued',queued)) on conflict(stage) do update set cursor_text=excluded.cursor_text,last_success_at=excluded.last_success_at,counters=excluded.counters,updated_at=now();
  return jsonb_build_object('notableApplicationsQueued',queued,'matchingNoticesQueued',notice_queued,'cursor',final_cursor,'complete',queued<greatest(1,least(coalesce(p_limit,500),1000)));
end $$;

-- Matching is exact within authority and refuses compound or colliding
-- references. Unmatched is an expected state; ambiguity remains auditable.
create or replace function public.openlist_bcms_refresh_construction_state(p_application_id uuid)
returns void language plpgsql security definer set search_path=public,pg_catalog set statement_timeout='15s' as $$
declare derived record;
begin
  with evidence as (
    select
      count(*)::int notice_count,
      bool_or(n.commencement_date is not null) has_commencement,
      bool_and(coalesce(n.total_phases,1)=1) unphased,
      bool_and(n.completion_certificate_count>0) has_completion,
      bool_and(coalesce(n.project_status,'') ~* '\mcomplete(d)?\M') explicitly_complete,
      coalesce(sum(n.completion_units),0) completion_units,
      max(n.commencement_date) commencement_date,
      max((select max(r.completion_certificate_validated_at) from public.building_control_records r where r.source_resource_id=n.source_resource_id and r.building_control_authority_code=n.building_control_authority_code and r.cn_number=n.cn_number)) completion_date,
      min(n.cn_number) cn_number,
      max(sn.extracted_residential_units) residential_units
    from public.planning_building_control_links l
    join public.building_control_notices n on n.id=l.notice_id
    left join public.planning_seo_notable sn on sn.application_id=l.planning_application_id
    where l.planning_application_id=p_application_id
  ), status as (
    select *,case
      when notice_count=1 and unphased and has_completion and (
        (residential_units is not null and completion_units>=residential_units)
        or (residential_units is null and explicitly_complete)
      ) then 'completed'
      when has_commencement then 'commenced'
    end construction_status
    from evidence
  )
  select construction_status,
    case when construction_status='completed' then completion_date else commencement_date end evidence_date,
    case when construction_status is null then null when notice_count>1 or not unphased then 'Matched phased building-control records' else 'Matched building-control notice '||cn_number end detail
  into derived from status;

  update public.planning_applications
  set construction_status=derived.construction_status,
      construction_evidence_date=derived.evidence_date,
      construction_evidence_source=case when derived.construction_status is null then null else 'NBCO/BCMS open data' end,
      construction_evidence_detail=derived.detail
  where id=p_application_id;
end $$;

create or replace function public.openlist_bcms_refresh_construction_batch(p_limit int default 200)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog set statement_timeout='15s' as $$
declare item record; refreshed int:=0; start_cursor uuid; final_cursor uuid;
begin
  select coalesce(nullif(cursor_text,'')::uuid,'00000000-0000-0000-0000-000000000000'::uuid)
  into start_cursor from public.bcms_pipeline_checkpoints where stage='construction_catchup';
  start_cursor:=coalesce(start_cursor,'00000000-0000-0000-0000-000000000000'::uuid);

  for item in
    select distinct l.planning_application_id
    from public.planning_building_control_links l
    where l.planning_application_id>start_cursor
    order by l.planning_application_id
    limit greatest(1,least(coalesce(p_limit,200),500))
  loop
    insert into public.planning_application_events(application_id,event_type,event_date,event_source,source_field,label,raw_source_value,provenance,event_key)
    select item.planning_application_id,'works_commenced',n.commencement_date,'nbco_bcms_open_data','CN_Commencement_Date',case when n.total_phases>1 then 'Construction commenced (phase record)' else 'Construction commenced' end,n.cn_number,'reconstructed','bcms:notice:'||n.id||':commenced'
    from public.planning_building_control_links l join public.building_control_notices n on n.id=l.notice_id
    where l.planning_application_id=item.planning_application_id and n.commencement_date is not null
    on conflict(application_id,event_key) do update set event_date=excluded.event_date,label=excluded.label,raw_source_value=excluded.raw_source_value,detected_at=now();

    insert into public.planning_application_events(application_id,event_type,event_date,event_source,source_field,label,raw_source_value,provenance,event_key)
    select item.planning_application_id,'completion_certificate_validated',r.completion_certificate_validated_at,'nbco_bcms_open_data','CCC_Date_Validated','Completion certificate validated',r.completion_certificate_number,'reconstructed','bcms:record:'||r.id||':completed'
    from public.planning_building_control_links l join public.building_control_notices n on n.id=l.notice_id
    join public.building_control_records r on r.source_resource_id=n.source_resource_id and r.building_control_authority_code=n.building_control_authority_code and r.cn_number=n.cn_number
    where l.planning_application_id=item.planning_application_id and r.completion_certificate_validated_at is not null and r.completion_certificate_number is not null
    on conflict(application_id,event_key) do update set event_date=excluded.event_date,raw_source_value=excluded.raw_source_value,detected_at=now();

    perform public.openlist_bcms_refresh_construction_state(item.planning_application_id);
    final_cursor:=item.planning_application_id;
    refreshed:=refreshed+1;
  end loop;

  insert into public.bcms_pipeline_checkpoints(stage,cursor_text,last_success_at,counters)
  values('construction_catchup',coalesce(final_cursor,start_cursor)::text,now(),jsonb_build_object('refreshed',refreshed,'complete',refreshed<greatest(1,least(coalesce(p_limit,200),500))))
  on conflict(stage) do update set cursor_text=excluded.cursor_text,last_success_at=excluded.last_success_at,last_error=null,counters=excluded.counters,updated_at=now();
  return jsonb_build_object('refreshedApplications',refreshed,'cursor',coalesce(final_cursor,start_cursor),'complete',refreshed<greatest(1,least(coalesce(p_limit,200),500)));
end $$;

create or replace function public.openlist_bcms_match_batch(p_limit int default 200)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog set statement_timeout='15s' as $$
declare item record; candidate_count int; app_id uuid; stale_app uuid; notice_row public.building_control_notices%rowtype; linked int:=0; noop int:=0; ambiguous int:=0; unmatched int:=0; failures int:=0; checked_notable int:=0; did_link boolean;
begin
  for item in select * from public.bcms_match_queue where state in('pending','failed') and available_at<=now() order by priority,id limit greatest(1,least(coalesce(p_limit,200),500)) for update skip locked loop
    begin
      candidate_count:=0; app_id:=null; notice_row:=null; did_link:=false;
      update public.bcms_match_queue set state='processing',attempts=attempts+1,updated_at=now() where id=item.id;
      if item.planning_application_id is not null then checked_notable:=checked_notable+1; select n.* into notice_row from public.building_control_notices n join public.planning_applications p on p.id=item.planning_application_id where not n.planning_reference_is_compound and n.building_control_authority_code=p.local_authority_code and n.planning_permission_reference_normalized=public.openlist_normalise_bcms_reference(p.reference) order by n.commencement_date desc nulls last,n.id limit 1; app_id:=item.planning_application_id; candidate_count:=case when notice_row.id is null then 0 else 1 end;
      else select * into notice_row from public.building_control_notices where id=item.notice_id; select count(*),(array_agg(p.id order by p.id))[1] into candidate_count,app_id from public.planning_applications p where p.local_authority_code=notice_row.building_control_authority_code and public.openlist_normalise_bcms_reference(p.reference)=notice_row.planning_permission_reference_normalized; if notice_row.planning_reference_is_compound then candidate_count:=2; end if; end if;
      if item.notice_id is not null and notice_row.id is not null then
        for stale_app in
          delete from public.planning_building_control_links l
          where l.notice_id=notice_row.id and (coalesce(candidate_count,0)<>1 or l.planning_application_id is distinct from app_id)
          returning l.planning_application_id
        loop
          delete from public.planning_application_events e
          where e.application_id=stale_app and (
            e.event_key='bcms:notice:'||notice_row.id||':commenced'
            or e.event_key in (
              select 'bcms:record:'||r.id||':completed' from public.building_control_records r
              where r.source_resource_id=notice_row.source_resource_id and r.building_control_authority_code=notice_row.building_control_authority_code and r.cn_number=notice_row.cn_number
            )
          );
          perform public.openlist_bcms_refresh_construction_state(stale_app);
        end loop;
      end if;
      if notice_row.id is null or app_id is null then update public.bcms_match_queue set state='unmatched',updated_at=now() where id=item.id; unmatched:=unmatched+1;
      elsif coalesce(candidate_count,1)>1 then update public.bcms_match_queue set state='ambiguous',updated_at=now() where id=item.id; insert into public.bcms_match_anomalies(queue_id,notice_id,planning_application_id,anomaly_type,details) values(item.id,notice_row.id,item.planning_application_id,'ambiguous',jsonb_build_object('candidateCount',candidate_count)) ; ambiguous:=ambiguous+1;
      else
        did_link := not exists(select 1 from public.planning_building_control_links where planning_application_id=app_id and notice_id=notice_row.id and match_method='exact_authority_normalized_reference');
        insert into public.planning_building_control_links(planning_application_id,notice_id,match_method,confidence,matched_reference,validation_summary) values(app_id,notice_row.id,'exact_authority_normalized_reference','high',notice_row.planning_permission_reference_normalized,jsonb_build_object('authorityCode',notice_row.building_control_authority_code,'reference',notice_row.planning_permission_reference_normalized)) on conflict(planning_application_id,notice_id,match_method) do update set last_verified_at=now(),updated_at=now();
        if did_link then linked:=linked+1; else noop:=noop+1; end if;
        if notice_row.commencement_date is not null then insert into public.planning_application_events(application_id,event_type,event_date,event_source,source_field,label,raw_source_value,provenance,event_key) values(app_id,'works_commenced',notice_row.commencement_date,'nbco_bcms_open_data','CN_Commencement_Date',case when notice_row.total_phases>1 then 'Construction commenced (phase record)' else 'Construction commenced' end,notice_row.cn_number,'reconstructed','bcms:notice:'||notice_row.id||':commenced') on conflict(application_id,event_key) do update set event_date=excluded.event_date,label=excluded.label,raw_source_value=excluded.raw_source_value,detected_at=now(); end if;
        insert into public.planning_application_events(application_id,event_type,event_date,event_source,source_field,label,raw_source_value,provenance,event_key)
        select app_id,'completion_certificate_validated',r.completion_certificate_validated_at,'nbco_bcms_open_data','CCC_Date_Validated','Completion certificate validated',r.completion_certificate_number,'reconstructed','bcms:record:'||r.id||':completed'
        from public.building_control_records r
        where r.source_resource_id=notice_row.source_resource_id and r.building_control_authority_code=notice_row.building_control_authority_code and r.cn_number=notice_row.cn_number and r.completion_certificate_validated_at is not null and r.completion_certificate_number is not null
        on conflict(application_id,event_key) do update set event_date=excluded.event_date,raw_source_value=excluded.raw_source_value,detected_at=now();
        perform public.openlist_bcms_refresh_construction_state(app_id);
        update public.bcms_match_anomalies set resolved_at=now() where queue_id=item.id and resolved_at is null;
        update public.bcms_match_queue set state=case when did_link then 'linked' else 'noop' end,updated_at=now() where id=item.id;
      end if;
    exception when others then update public.bcms_match_queue set state='failed',last_error=sqlerrm,available_at=now()+interval '1 hour',updated_at=now() where id=item.id; failures:=failures+1; end;
  end loop;
  insert into public.bcms_pipeline_checkpoints(stage,last_success_at,last_error,counters) values('matching',now(),case when failures>0 then failures||' failures' end,jsonb_build_object('notableCandidatesChecked',checked_notable,'newlyLinked',linked,'alreadyLinkedNoop',noop,'ambiguous',ambiguous,'unmatched',unmatched,'failures',failures)) on conflict(stage) do update set last_success_at=excluded.last_success_at,last_error=excluded.last_error,counters=excluded.counters,updated_at=now();
  return jsonb_build_object('notableCandidatesChecked',checked_notable,'newlyLinked',linked,'alreadyLinkedNoop',noop,'ambiguous',ambiguous,'unmatched',unmatched,'failures',failures);
end $$;

create or replace function public.openlist_bcms_integrity_report()
returns jsonb language sql stable security definer set search_path=public,pg_catalog set statement_timeout='15s' as $$
  select jsonb_build_object('generatedAt',now(),'watermarks',(select jsonb_object_agg(stage,jsonb_build_object('cursor',cursor_text,'lastSuccessAt',last_success_at,'freshnessAt',source_freshness_at,'lastError',last_error,'counters',counters)) from public.bcms_pipeline_checkpoints),'notablePopulation',jsonb_build_object('linked',count(*) filter(where exists(select 1 from public.planning_building_control_links l where l.planning_application_id=n.application_id)),'unmatched',count(*) filter(where q.state='unmatched'),'ambiguous',count(*) filter(where q.state='ambiguous'),'pending',count(*) filter(where q.state in('pending','processing','failed')))) from public.planning_seo_notable n left join public.bcms_match_queue q on q.planning_application_id=n.application_id where n.active;
$$;

alter table public.bcms_pipeline_checkpoints enable row level security;
alter table public.bcms_pipeline_runs enable row level security;
alter table public.bcms_raw_record_versions enable row level security;
alter table public.building_control_records enable row level security;
alter table public.building_control_notices enable row level security;
alter table public.planning_building_control_links enable row level security;
alter table public.bcms_match_queue enable row level security;
alter table public.bcms_match_anomalies enable row level security;
revoke all on public.bcms_pipeline_checkpoints,public.bcms_pipeline_runs,public.bcms_raw_record_versions,public.building_control_records,public.building_control_notices,public.planning_building_control_links,public.bcms_match_queue,public.bcms_match_anomalies from anon, authenticated;
grant select,insert,update,delete on public.bcms_pipeline_checkpoints,public.bcms_pipeline_runs,public.bcms_raw_record_versions,public.building_control_records,public.building_control_notices,public.planning_building_control_links,public.bcms_match_queue,public.bcms_match_anomalies to service_role;
grant usage,select on sequence public.bcms_match_queue_id_seq to service_role;
revoke all on function public.openlist_bcms_store_acquired_rows(text,jsonb,uuid,text,text,timestamptz),public.openlist_bcms_process_raw_batch(int),public.openlist_bcms_requeue_raw_failures(int),public.openlist_bcms_enqueue_notable_catchup(uuid,int),public.openlist_bcms_refresh_construction_state(uuid),public.openlist_bcms_refresh_construction_batch(int),public.openlist_bcms_match_batch(int),public.openlist_bcms_integrity_report() from public,anon,authenticated;
grant execute on function public.openlist_bcms_store_acquired_rows(text,jsonb,uuid,text,text,timestamptz),public.openlist_bcms_process_raw_batch(int),public.openlist_bcms_requeue_raw_failures(int),public.openlist_bcms_enqueue_notable_catchup(uuid,int),public.openlist_bcms_refresh_construction_state(uuid),public.openlist_bcms_refresh_construction_batch(int),public.openlist_bcms_match_batch(int),public.openlist_bcms_integrity_report() to service_role;
