alter table public.planning_applications
  add column if not exists further_information_requested_date date null,
  add column if not exists further_information_received_date date null,
  add column if not exists withdrawal_date date null,
  add column if not exists decision_due_date date null,
  add column if not exists expiry_date date null;

-- Detail pages use the existing authority/reference unique index. The refresh and
-- backfill paths also join on that key, so none of these sparse dates needs its
-- own write-amplifying index yet.

alter table public.planning_application_events
  drop constraint if exists planning_application_events_event_type_check;
alter table public.planning_application_events
  add constraint planning_application_events_event_type_check check (event_type = any(array[
    'application_received','application_validated',
    'further_information_requested','further_information_received',
    'decision_made','decision_notice_issued','final_grant',
    'appeal_lodged','appeal_notification','appeal_decided',
    'withdrawn','status_changed','decision_changed','decision_due_changed',
    'source_date_corrected','other'
  ])) not valid;
alter table public.planning_application_events
  validate constraint planning_application_events_event_type_check;

create or replace function public.openlist_capture_planning_lifecycle_events()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  captured_at timestamptz := now();
  captured_date date := current_date;
  source_name text := case
    when new.local_authority_code = 'CORKCOCO' then 'cork_county_api'
    else 'national_arcgis'
  end;
begin
  insert into public.planning_application_events (
    application_id,event_type,event_date,detected_at,event_source,source_field,
    label,old_value,new_value,raw_source_value,provenance,event_key
  )
  select
    new.id,milestone.event_type,milestone.new_date,captured_at,source_name,
    milestone.source_field,milestone.label,null,milestone.new_date::text,
    milestone.new_date::text,
    case when tg_op = 'INSERT' then 'reconstructed' else 'observed' end,
    'source:' || milestone.source_field || ':' || milestone.new_date::text
  from (values
    (
      'further_information_requested'::text,
      case when tg_op = 'INSERT' then null::date else old.further_information_requested_date end,
      new.further_information_requested_date,
      'further_information_requested_date'::text,
      'Further information requested'::text
    ),
    (
      'further_information_received',
      case when tg_op = 'INSERT' then null::date else old.further_information_received_date end,
      new.further_information_received_date,
      'further_information_received_date',
      'Further information received'
    ),
    (
      'withdrawn',
      case when tg_op = 'INSERT' then null::date else old.withdrawal_date end,
      new.withdrawal_date,
      'withdrawal_date',
      'Application withdrawn'
    )
  ) milestone(event_type,old_date,new_date,source_field,label)
  where milestone.old_date is null and milestone.new_date is not null
  on conflict (application_id,event_key) do nothing;

  if tg_op = 'UPDATE' then
    insert into public.planning_application_events (
      application_id,event_type,event_date,detected_at,event_source,source_field,
      label,old_value,new_value,raw_source_value,provenance,event_key
    )
    select
      new.id,'source_date_corrected',captured_date,captured_at,'openlist_refresh',
      correction.source_field,correction.label || ' date updated',
      correction.old_date::text,correction.new_date::text,
      correction.new_date::text,'observed',
      'observed:' || correction.source_field || ':' || correction.old_date::text ||
        ':' || correction.new_date::text || ':' || captured_date::text
    from (values
      (old.further_information_requested_date,new.further_information_requested_date,'further_information_requested_date'::text,'Further information requested'::text),
      (old.further_information_received_date,new.further_information_received_date,'further_information_received_date','Further information received'),
      (old.withdrawal_date,new.withdrawal_date,'withdrawal_date','Application withdrawal')
    ) correction(old_date,new_date,source_field,label)
    where correction.old_date is not null
      and correction.new_date is not null
      and correction.old_date is distinct from correction.new_date
    on conflict (application_id,event_key) do nothing;

    if old.decision_due_date is not null
       and old.decision_due_date is distinct from new.decision_due_date then
      insert into public.planning_application_events (
        application_id,event_type,event_date,detected_at,event_source,source_field,
        label,old_value,new_value,raw_source_value,provenance,event_key
      ) values (
        new.id,'decision_due_changed',captured_date,captured_at,'openlist_refresh',
        'decision_due_date',
        case when new.decision_due_date is null
          then 'Decision due date removed from source'
          else 'Decision due date updated' end,
        old.decision_due_date::text,new.decision_due_date::text,
        new.decision_due_date::text,'observed',
        'observed:decision_due_date:' || old.decision_due_date::text || ':' ||
          coalesce(new.decision_due_date::text, 'null') || ':' || captured_date::text
      ) on conflict (application_id,event_key) do nothing;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists planning_application_capture_lifecycle_events
  on public.planning_applications;
create trigger planning_application_capture_lifecycle_events
after insert or update of further_information_requested_date,
  further_information_received_date,withdrawal_date,decision_due_date
on public.planning_applications
for each row execute function public.openlist_capture_planning_lifecycle_events();

create or replace function public.openlist_backfill_national_planning_lifecycle(
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set statement_timeout = '120s'
as $$
declare
  submitted_count integer := 0;
  matched_count integer := 0;
  updated_count integer := 0;
  inserted_event_count integer := 0;
  enriched_application_count integer := 0;
  field_updates jsonb;
  event_updates jsonb;
begin
  create temporary table if not exists openlist_national_lifecycle_candidates (
    application_id uuid primary key,
    local_authority_code text not null,
    reference text not null,
    old_fi_requested date,
    old_fi_received date,
    old_withdrawal date,
    old_decision_due date,
    old_expiry date,
    old_appeal_lodged date,
    old_appeal_decided date,
    fi_requested date,
    fi_received date,
    withdrawal date,
    decision_due date,
    expiry date,
    appeal_lodged date,
    appeal_decided date
  ) on commit drop;
  truncate openlist_national_lifecycle_candidates;

  create temporary table if not exists openlist_national_lifecycle_inserted_events (
    application_id uuid not null,
    event_type text not null,
    source_field text not null
  ) on commit drop;
  truncate openlist_national_lifecycle_inserted_events;

  select jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) into submitted_count;

  insert into openlist_national_lifecycle_candidates
  with parsed as (
    select distinct on (upper(trim(row.local_authority_code)), trim(row.reference))
      upper(trim(row.local_authority_code)) as local_authority_code,
      trim(row.reference) as reference,
      row.source_application_id,
      row.further_information_requested_date,
      row.further_information_received_date,
      row.withdrawal_date,
      row.decision_due_date,
      row.expiry_date,
      row.appeal_lodged_date,
      row.appeal_decision_date
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as row(
      local_authority_code text,
      reference text,
      source_application_id bigint,
      further_information_requested_date date,
      further_information_received_date date,
      withdrawal_date date,
      decision_due_date date,
      expiry_date date,
      appeal_lodged_date date,
      appeal_decision_date date
    )
    where nullif(trim(row.local_authority_code), '') is not null
      and nullif(trim(row.reference), '') is not null
    order by upper(trim(row.local_authority_code)),trim(row.reference),
      row.source_application_id desc nulls last
  )
  select
    application.id,application.local_authority_code,application.reference,
    application.further_information_requested_date,
    application.further_information_received_date,
    application.withdrawal_date,application.decision_due_date,
    application.expiry_date,application.appeal_lodged_date,
    application.appeal_decision_date,
    parsed.further_information_requested_date,
    parsed.further_information_received_date,parsed.withdrawal_date,
    parsed.decision_due_date,parsed.expiry_date,parsed.appeal_lodged_date,
    parsed.appeal_decision_date
  from parsed
  join public.planning_applications application
    on application.local_authority_code = parsed.local_authority_code
   and application.reference = parsed.reference;

  get diagnostics matched_count = row_count;

  with inserted as (
    insert into public.planning_application_events (
      application_id,event_type,event_date,detected_at,event_source,source_field,
      label,old_value,new_value,raw_source_value,provenance,event_key
    )
    select
      candidate.application_id,milestone.event_type,milestone.event_date,now(),
      'national_arcgis',milestone.source_field,milestone.label,null,
      milestone.event_date::text,milestone.event_date::text,'reconstructed',
      'source:' || milestone.source_field || ':' || milestone.event_date::text
    from openlist_national_lifecycle_candidates candidate
    cross join lateral (values
      ('further_information_requested'::text,candidate.old_fi_requested,candidate.fi_requested,'further_information_requested_date'::text,'Further information requested'::text),
      ('further_information_received',candidate.old_fi_received,candidate.fi_received,'further_information_received_date','Further information received'),
      ('withdrawn',candidate.old_withdrawal,candidate.withdrawal,'withdrawal_date','Application withdrawn'),
      ('appeal_lodged',candidate.old_appeal_lodged,candidate.appeal_lodged,'appeal_lodged_date','Appeal lodged'),
      ('appeal_decided',candidate.old_appeal_decided,candidate.appeal_decided,'appeal_decision_date','Appeal decided')
    ) milestone(event_type,old_date,event_date,source_field,label)
    where milestone.old_date is null and milestone.event_date is not null
    on conflict (application_id,event_key) do nothing
    returning application_id,event_type,source_field
  )
  insert into openlist_national_lifecycle_inserted_events
  select application_id,event_type,source_field from inserted;

  get diagnostics inserted_event_count = row_count;

  update public.planning_applications application
  set
    further_information_requested_date = candidate.fi_requested,
    further_information_received_date = candidate.fi_received,
    withdrawal_date = candidate.withdrawal,
    decision_due_date = candidate.decision_due,
    expiry_date = candidate.expiry,
    appeal_lodged_date = candidate.appeal_lodged,
    appeal_decision_date = candidate.appeal_decided,
    updated_at = now()
  from openlist_national_lifecycle_candidates candidate
  where application.id = candidate.application_id
    and row(
      application.further_information_requested_date,
      application.further_information_received_date,application.withdrawal_date,
      application.decision_due_date,application.expiry_date,
      application.appeal_lodged_date,application.appeal_decision_date
    ) is distinct from row(
      candidate.fi_requested,candidate.fi_received,candidate.withdrawal,
      candidate.decision_due,candidate.expiry,candidate.appeal_lodged,
      candidate.appeal_decided
    );

  get diagnostics updated_count = row_count;

  select coalesce(jsonb_object_agg(field_name, changed), '{}'::jsonb)
  into field_updates
  from (
    select field_name,count(*)::integer as changed
    from openlist_national_lifecycle_candidates candidate
    cross join lateral (values
      ('further_information_requested_date',candidate.old_fi_requested is distinct from candidate.fi_requested),
      ('further_information_received_date',candidate.old_fi_received is distinct from candidate.fi_received),
      ('withdrawal_date',candidate.old_withdrawal is distinct from candidate.withdrawal),
      ('decision_due_date',candidate.old_decision_due is distinct from candidate.decision_due),
      ('expiry_date',candidate.old_expiry is distinct from candidate.expiry),
      ('appeal_lodged_date',candidate.old_appeal_lodged is distinct from candidate.appeal_lodged),
      ('appeal_decision_date',candidate.old_appeal_decided is distinct from candidate.appeal_decided)
    ) changes(field_name,is_changed)
    where is_changed
    group by field_name
  ) counts;

  select count(distinct application_id)::integer
  into enriched_application_count
  from openlist_national_lifecycle_inserted_events;

  select coalesce(jsonb_object_agg(event_type, inserted), '{}'::jsonb)
  into event_updates
  from (
    select event_type,count(*)::integer as inserted
    from openlist_national_lifecycle_inserted_events
    group by event_type
  ) counts;

  return jsonb_build_object(
    'submitted',submitted_count,
    'matched',matched_count,
    'updated',updated_count,
    'fieldUpdates',field_updates,
    'eventsInserted',inserted_event_count,
    'eventUpdates',event_updates,
    'applicationsEnriched',enriched_application_count
  );
end;
$$;

create or replace function public.openlist_national_planning_lifecycle_report()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
set statement_timeout = '120s'
as $$
  with national as materialized (
    select * from public.planning_applications
    where local_authority_code <> 'CORKCOCO'
  ), field_counts as (
    select jsonb_build_object(
      'further_information_requested_date',count(*) filter (where further_information_requested_date is not null),
      'further_information_received_date',count(*) filter (where further_information_received_date is not null),
      'withdrawal_date',count(*) filter (where withdrawal_date is not null),
      'decision_due_date',count(*) filter (where decision_due_date is not null),
      'expiry_date',count(*) filter (where expiry_date is not null),
      'appeal_lodged_date',count(*) filter (where appeal_lodged_date is not null),
      'appeal_decision_date',count(*) filter (where appeal_decision_date is not null)
    ) as value from national
  ), event_counts as (
    select coalesce(jsonb_object_agg(event_type,event_count), '{}'::jsonb) as value
    from (
      select event_type,count(*) as event_count
      from public.planning_application_events
      where event_type = any(array[
        'further_information_requested','further_information_received',
        'withdrawn','appeal_lodged','appeal_decided','decision_due_changed'
      ])
      group by event_type
    ) counts
  )
  select jsonb_build_object(
    'nationalApplications',(select count(*) from national),
    'fields',(select value from field_counts),
    'activeDecisionDue',(
      select count(*) from national
      where decision_due_date is not null
        and normalized_status <> 'decision_made'
        and not public.openlist_planning_status_is_terminal(normalized_status)
        and decision_date is null
        and nullif(trim(coalesce(decision_text, '')), '') is null
        and withdrawal_date is null
    ),
    'applicationsWithLifecycleEvents',(
      select count(distinct application_id)
      from public.planning_application_events
      where source_field = any(array[
        'further_information_requested_date','further_information_received_date',
        'withdrawal_date','appeal_lodged_date','appeal_decision_date'
      ])
    ),
    'events',(select value from event_counts),
    'totalEvents',(select count(*) from public.planning_application_events)
  );
$$;

revoke all on function public.openlist_backfill_national_planning_lifecycle(jsonb) from public;
grant execute on function public.openlist_backfill_national_planning_lifecycle(jsonb) to service_role;
revoke all on function public.openlist_national_planning_lifecycle_report() from public;
grant execute on function public.openlist_national_planning_lifecycle_report() to service_role;
