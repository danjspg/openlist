create or replace function public.openlist_normalize_planning_status(p_status text)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  value text := regexp_replace(
    replace(replace(lower(trim(coalesce(p_status, ''))), '_', ' '), '-', ' '),
    '\s+',
    ' ',
    'g'
  );
begin
  if value = '' or value = 'n/a' then return 'unknown'; end if;
  if value = any(array['pre validation','pre reg','unregistered application','validation']) then return 'pre_validation'; end if;
  if value = any(array['new application','new application set up','registered application','application registered','registration','valid']) then return 'registered'; end if;
  if value = any(array['officer allocation','referral','assessment period','35 day assessment','45 day assessment','49 day assessment','planner assignment','planners report','recommendation review','recommended decision','recommended decision entered','managers order','publication required','provisional recommendation']) then return 'under_assessment'; end if;
  if value = any(array['further information','additional information','additional information requested','ai requested','decision request a.i.','request ai approval','ai request approved','significant ai requested','clarification of ai requested','cai requested','additional information approval required','additional information consultees','ai referral','cai consultees','sai referral','sai consultees']) then return 'further_information_requested'; end if;
  if value = any(array['further information received','additional information received','ai received','cai received','ai not significant']) then return 'further_information_received'; end if;
  if value = any(array['decision','decision made','decision notice issued','decision issued','decision following a.i.','decision review']) then return 'decision_made'; end if;
  if value = any(array['final grant','final grant review']) then return 'final_grant'; end if;
  if value = any(array['appealed','appeal lodged','application appealed','application under appeal','appealed financial','decision appealed','leave to appeal','planner rpt to abp','planners report to acp','appeal report sent to abp','appeal comments due','file to acp']) then return 'appealed'; end if;
  if value = 'appeal decided' then return 'appeal_decided'; end if;
  if value = any(array['withdrawn','application withdrawn','planning application withdrawn','deemed withdrawn','withdrawal of application on appeal']) then return 'withdrawn'; end if;
  if value = any(array['invalid','invalid application','invalid details sent to applicant','invalid site notice','invalid due to site notice','incompleted','incompleted application']) then return 'invalid'; end if;
  if value = any(array['application closed','application finalised','pac report & file closed','pac meeting & file closed']) then return 'finalised'; end if;
  return 'unknown';
end;
$$;

create or replace function public.openlist_planning_status_is_terminal(p_status text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(p_status, 'unknown') = any(
    array['final_grant','appeal_decided','withdrawn','invalid','finalised']
  );
$$;

alter table public.planning_applications
  add column if not exists normalized_status text not null default 'unknown';

alter table public.planning_applications
  drop constraint if exists planning_applications_normalized_status_check;
alter table public.planning_applications
  add constraint planning_applications_normalized_status_check check (
    normalized_status = any(array[
      'pre_validation','registered','under_assessment',
      'further_information_requested','further_information_received',
      'decision_made','final_grant','appealed','appeal_decided',
      'withdrawn','invalid','finalised','unknown'
    ])
  );

create index if not exists planning_applications_normalized_status_idx
  on public.planning_applications (normalized_status, registration_date desc);

create table if not exists public.planning_application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.planning_applications(id) on delete cascade,
  event_type text not null check (event_type = any(array[
    'application_received','application_validated',
    'further_information_requested','further_information_received',
    'decision_made','decision_notice_issued','final_grant',
    'appeal_lodged','appeal_notification','appeal_decided',
    'withdrawn','status_changed','decision_changed',
    'source_date_corrected','other'
  ])),
  event_date date not null,
  detected_at timestamptz not null default now(),
  event_source text not null,
  source_field text null,
  label text not null,
  old_value text null,
  new_value text null,
  raw_source_value text null,
  provenance text not null check (provenance in ('reconstructed', 'observed')),
  event_key text not null,
  created_at timestamptz not null default now(),
  unique (application_id, event_key)
);

create index if not exists planning_application_events_timeline_idx
  on public.planning_application_events (
    application_id,
    event_date,
    detected_at,
    event_type,
    id
  );

create index if not exists planning_application_events_observed_idx
  on public.planning_application_events (detected_at, application_id)
  where provenance = 'observed';

alter table public.planning_application_events enable row level security;
drop policy if exists "Public read planning application events"
  on public.planning_application_events;
create policy "Public read planning application events"
  on public.planning_application_events
  for select
  to anon, authenticated
  using (true);

revoke all on table public.planning_application_events from anon, authenticated;
grant select on table public.planning_application_events to anon, authenticated;
grant select, insert on table public.planning_application_events to service_role;

create or replace function public.openlist_set_planning_normalized_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  new.normalized_status := public.openlist_normalize_planning_status(new.status);
  return new;
end;
$$;

drop trigger if exists planning_application_normalize_status
  on public.planning_applications;
create trigger planning_application_normalize_status
before insert or update of status
on public.planning_applications
for each row execute function public.openlist_set_planning_normalized_status();

create or replace function public.openlist_capture_planning_events()
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
  specific_final_grant boolean := false;
  specific_appeal_decided boolean := false;
  specific_decision boolean := false;
begin
  if tg_op = 'INSERT' then
    insert into public.planning_application_events (
      application_id,event_type,event_date,detected_at,event_source,source_field,
      label,old_value,new_value,raw_source_value,provenance,event_key
    )
    select
      new.id,
      milestone.event_type,
      milestone.event_date,
      captured_at,
      source_name,
      milestone.source_field,
      case
        when milestone.event_type = 'decision_made' and nullif(trim(new.decision_text), '') is not null
          then 'Decision: ' || trim(new.decision_text)
        else milestone.label
      end,
      null,
      case when milestone.event_type = 'decision_made' then nullif(trim(new.decision_text), '') else milestone.event_date::text end,
      case when milestone.event_type = 'decision_made' then nullif(trim(new.decision_text), '') else milestone.event_date::text end,
      'reconstructed',
      'source:' || milestone.source_field || ':' || milestone.event_date::text
    from (values
      ('application_received'::text, new.registration_date, 'registration_date'::text, 'Application received'::text),
      ('application_validated', new.valid_date, 'valid_date', 'Application validated'),
      ('decision_made', new.decision_date, 'decision_date', 'Decision made'),
      ('decision_notice_issued', new.dispatch_date, 'dispatch_date', 'Decision notice issued'),
      ('final_grant', new.final_grant_date, 'final_grant_date', 'Final grant'),
      ('appeal_lodged', new.appeal_lodged_date, 'appeal_lodged_date', 'Appeal lodged'),
      ('appeal_notification', new.appeal_notify_date, 'appeal_notify_date', 'Appeal notification recorded'),
      ('appeal_decided', new.appeal_decision_date, 'appeal_decision_date', 'Appeal decided')
    ) milestone(event_type,event_date,source_field,label)
    where milestone.event_date is not null
    on conflict (application_id,event_key) do nothing;
    return new;
  end if;

  insert into public.planning_application_events (
    application_id,event_type,event_date,detected_at,event_source,source_field,
    label,old_value,new_value,raw_source_value,provenance,event_key
  )
  select
    new.id,
    milestone.event_type,
    milestone.new_date,
    captured_at,
    source_name,
    milestone.source_field,
    case
      when milestone.event_type = 'decision_made' and nullif(trim(new.decision_text), '') is not null
        then 'Decision: ' || trim(new.decision_text)
      else milestone.label
    end,
    null,
    case when milestone.event_type = 'decision_made' then nullif(trim(new.decision_text), '') else milestone.new_date::text end,
    case when milestone.event_type = 'decision_made' then nullif(trim(new.decision_text), '') else milestone.new_date::text end,
    'observed',
    'source:' || milestone.source_field || ':' || milestone.new_date::text
  from (values
    ('application_received'::text, old.registration_date, new.registration_date, 'registration_date'::text, 'Application received'::text),
    ('application_validated', old.valid_date, new.valid_date, 'valid_date', 'Application validated'),
    ('decision_made', old.decision_date, new.decision_date, 'decision_date', 'Decision made'),
    ('decision_notice_issued', old.dispatch_date, new.dispatch_date, 'dispatch_date', 'Decision notice issued'),
    ('final_grant', old.final_grant_date, new.final_grant_date, 'final_grant_date', 'Final grant'),
    ('appeal_lodged', old.appeal_lodged_date, new.appeal_lodged_date, 'appeal_lodged_date', 'Appeal lodged'),
    ('appeal_notification', old.appeal_notify_date, new.appeal_notify_date, 'appeal_notify_date', 'Appeal notification recorded'),
    ('appeal_decided', old.appeal_decision_date, new.appeal_decision_date, 'appeal_decision_date', 'Appeal decided')
  ) milestone(event_type,old_date,new_date,source_field,label)
  where milestone.old_date is null and milestone.new_date is not null
  on conflict (application_id,event_key) do nothing;

  specific_decision := old.decision_date is null and new.decision_date is not null;
  specific_final_grant := old.final_grant_date is null and new.final_grant_date is not null;
  specific_appeal_decided := old.appeal_decision_date is null and new.appeal_decision_date is not null;

  insert into public.planning_application_events (
    application_id,event_type,event_date,detected_at,event_source,source_field,
    label,old_value,new_value,raw_source_value,provenance,event_key
  )
  select
    new.id,
    'source_date_corrected',
    captured_date,
    captured_at,
    'openlist_refresh',
    correction.source_field,
    correction.label || ' date updated',
    correction.old_date::text,
    correction.new_date::text,
    correction.new_date::text,
    'observed',
    'observed:' || correction.source_field || ':' || correction.old_date::text || ':' || correction.new_date::text || ':' || captured_date::text
  from (values
    (old.registration_date, new.registration_date, 'registration_date'::text, 'Application received'::text),
    (old.valid_date, new.valid_date, 'valid_date', 'Application validated'),
    (old.decision_date, new.decision_date, 'decision_date', 'Decision'),
    (old.dispatch_date, new.dispatch_date, 'dispatch_date', 'Decision notice'),
    (old.final_grant_date, new.final_grant_date, 'final_grant_date', 'Final grant'),
    (old.appeal_lodged_date, new.appeal_lodged_date, 'appeal_lodged_date', 'Appeal lodged'),
    (old.appeal_notify_date, new.appeal_notify_date, 'appeal_notify_date', 'Appeal notification'),
    (old.appeal_decision_date, new.appeal_decision_date, 'appeal_decision_date', 'Appeal decision')
  ) correction(old_date,new_date,source_field,label)
  where correction.old_date is not null
    and correction.new_date is not null
    and correction.old_date is distinct from correction.new_date
  on conflict (application_id,event_key) do nothing;

  if old.normalized_status is distinct from new.normalized_status
     and not (new.normalized_status = 'decision_made' and specific_decision)
     and not (new.normalized_status = 'final_grant' and specific_final_grant)
     and not (new.normalized_status = 'appeal_decided' and specific_appeal_decided) then
    insert into public.planning_application_events (
      application_id,event_type,event_date,detected_at,event_source,source_field,
      label,old_value,new_value,raw_source_value,provenance,event_key
    ) values (
      new.id,
      case when new.normalized_status = 'withdrawn' then 'withdrawn' else 'status_changed' end,
      captured_date,
      captured_at,
      'openlist_refresh',
      'status',
      case when new.normalized_status = 'withdrawn' then 'Application withdrawn'
        else 'Status changed to ' || replace(initcap(replace(new.normalized_status, '_', ' ')), 'Fi', 'FI') end,
      old.normalized_status,
      new.normalized_status,
      nullif(trim(new.status), ''),
      'observed',
      'observed:status:' || old.normalized_status || ':' || new.normalized_status || ':' || captured_date::text
    ) on conflict (application_id,event_key) do nothing;
  end if;

  if regexp_replace(lower(trim(coalesce(old.decision_text, ''))), '\s+', ' ', 'g')
       is distinct from regexp_replace(lower(trim(coalesce(new.decision_text, ''))), '\s+', ' ', 'g')
     and not specific_decision then
    insert into public.planning_application_events (
      application_id,event_type,event_date,detected_at,event_source,source_field,
      label,old_value,new_value,raw_source_value,provenance,event_key
    ) values (
      new.id,'decision_changed',captured_date,captured_at,'openlist_refresh','decision_text',
      case when nullif(trim(new.decision_text), '') is null then 'Decision updated'
        else 'Decision updated: ' || trim(new.decision_text) end,
      nullif(trim(old.decision_text), ''),nullif(trim(new.decision_text), ''),
      nullif(trim(new.decision_text), ''),'observed',
      'observed:decision:' || md5(coalesce(old.decision_text, '')) || ':' || md5(coalesce(new.decision_text, '')) || ':' || captured_date::text
    ) on conflict (application_id,event_key) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists planning_application_capture_events
  on public.planning_applications;
create trigger planning_application_capture_events
after insert or update of status,decision_text,registration_date,valid_date,
  decision_date,final_grant_date,appeal_lodged_date,appeal_decision_date,
  dispatch_date,appeal_notify_date
on public.planning_applications
for each row execute function public.openlist_capture_planning_events();

create or replace function public.openlist_backfill_planning_events(
  p_limit int default 2000,
  p_after_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set statement_timeout = '120s'
as $$
declare
  processed int;
  inserted int;
  normalized int;
  next_id uuid;
begin
  create temporary table if not exists openlist_planning_event_batch (
    id uuid primary key
  ) on commit drop;
  truncate openlist_planning_event_batch;

  insert into openlist_planning_event_batch (id)
  select p.id
  from public.planning_applications p
  where p_after_id is null or p.id > p_after_id
  order by p.id
  limit greatest(1, least(coalesce(p_limit, 2000), 5000));

  get diagnostics processed = row_count;
  select id into next_id
  from openlist_planning_event_batch
  order by id desc
  limit 1;

  with status_mappings as materialized (
    select
      p.status,
      public.openlist_normalize_planning_status(p.status) as normalized_status
    from openlist_planning_event_batch batch
    join public.planning_applications p on p.id = batch.id
    group by p.status
  )
  update public.planning_applications p
  set normalized_status = mapping.normalized_status
  from openlist_planning_event_batch batch,status_mappings mapping
  where p.id = batch.id
    and p.status is not distinct from mapping.status
    and p.normalized_status is distinct from mapping.normalized_status;

  get diagnostics normalized = row_count;

  insert into public.planning_application_events (
    application_id,event_type,event_date,detected_at,event_source,source_field,
    label,old_value,new_value,raw_source_value,provenance,event_key
  )
  select
    p.id,
    milestone.event_type,
    milestone.event_date,
    now(),
    case when p.local_authority_code = 'CORKCOCO' then 'cork_county_api' else 'national_arcgis' end,
    milestone.source_field,
    case
      when milestone.event_type = 'decision_made' and nullif(trim(p.decision_text), '') is not null
        then 'Decision: ' || trim(p.decision_text)
      else milestone.label
    end,
    null,
    case when milestone.event_type = 'decision_made' then nullif(trim(p.decision_text), '') else milestone.event_date::text end,
    case when milestone.event_type = 'decision_made' then nullif(trim(p.decision_text), '') else milestone.event_date::text end,
    'reconstructed',
    'source:' || milestone.source_field || ':' || milestone.event_date::text
  from openlist_planning_event_batch batch
  join public.planning_applications p on p.id = batch.id
  cross join lateral (values
    ('application_received'::text, p.registration_date, 'registration_date'::text, 'Application received'::text),
    ('application_validated', p.valid_date, 'valid_date', 'Application validated'),
    ('decision_made', p.decision_date, 'decision_date', 'Decision made'),
    ('decision_notice_issued', p.dispatch_date, 'dispatch_date', 'Decision notice issued'),
    ('final_grant', p.final_grant_date, 'final_grant_date', 'Final grant'),
    ('appeal_lodged', p.appeal_lodged_date, 'appeal_lodged_date', 'Appeal lodged'),
    ('appeal_notification', p.appeal_notify_date, 'appeal_notify_date', 'Appeal notification recorded'),
    ('appeal_decided', p.appeal_decision_date, 'appeal_decision_date', 'Appeal decided')
  ) milestone(event_type,event_date,source_field,label)
  where milestone.event_date is not null
  on conflict (application_id,event_key) do nothing;

  get diagnostics inserted = row_count;
  return jsonb_build_object(
    'processed', processed,
    'normalized', normalized,
    'inserted', inserted,
    'nextId', next_id,
    'done', processed < greatest(1, least(coalesce(p_limit, 2000), 5000))
  );
end;
$$;

create or replace function public.openlist_planning_timeline_report()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
set statement_timeout = '120s'
as $$
  with application_counts as (
    select
      p.id,
      num_nonnulls(
        p.registration_date,p.valid_date,p.decision_date,p.dispatch_date,
        p.final_grant_date,p.appeal_lodged_date,p.appeal_notify_date,
        p.appeal_decision_date
      ) as provable_events
    from public.planning_applications p
  )
  select jsonb_build_object(
    'capturedAt', now(),
    'applications', count(*),
    'atLeastOne', count(*) filter (where provable_events >= 1),
    'atLeastTwo', count(*) filter (where provable_events >= 2),
    'atLeastThree', count(*) filter (where provable_events >= 3),
    'eventsStored', (select count(*) from public.planning_application_events),
    'reconstructedEvents', (
      select count(*) from public.planning_application_events where provenance = 'reconstructed'
    ),
    'observedEvents', (
      select count(*) from public.planning_application_events where provenance = 'observed'
    ),
    'unknownStatuses', (
      select count(*) from public.planning_applications where normalized_status = 'unknown'
    )
  )
  from application_counts;
$$;

revoke all on function public.openlist_normalize_planning_status(text) from public;
revoke all on function public.openlist_planning_status_is_terminal(text) from public;
revoke all on function public.openlist_backfill_planning_events(int, uuid) from public;
revoke all on function public.openlist_planning_timeline_report() from public;
grant execute on function public.openlist_normalize_planning_status(text) to anon, authenticated, service_role;
grant execute on function public.openlist_planning_status_is_terminal(text) to service_role;
grant execute on function public.openlist_backfill_planning_events(int, uuid) to service_role;
grant execute on function public.openlist_planning_timeline_report() to service_role;

-- Normalized terminal states now prevent unnecessary historical refreshes.
-- Decision-made and appealed applications remain eligible until a genuinely
-- terminal normalized state or definitive grant/appeal-decision date arrives.
create or replace function public.openlist_planning_status_refresh_buckets(
  p_bucket_limit int default 12
)
returns table (
  local_authority_code text,
  period_start date,
  period_end date,
  candidate_count bigint,
  least_recently_checked_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_catalog
set statement_timeout = '15s'
as $$
  with unresolved_candidates as materialized (
    select
      p.local_authority_code,
      date_trunc('month', p.registration_date)::date as period_start,
      p.last_source_checked_at,
      case when p.appeal_lodged_date is not null or p.normalized_status = 'appealed' then 1 else 2 end as stage_priority
    from public.planning_applications p
    where p.registration_date < current_date - 90
      and p.final_grant_date is null
      and p.appeal_decision_date is null
      and not public.openlist_planning_status_is_terminal(p.normalized_status)
      and (
        p.appeal_lodged_date is not null
        or p.normalized_status = 'appealed'
        or p.decision_date is null
      )
    order by p.last_source_checked_at asc nulls first, p.registration_date, p.local_authority_code
    limit 6000
  ),
  recent_decision_candidates as materialized (
    select
      p.local_authority_code,
      date_trunc('month', p.registration_date)::date as period_start,
      p.last_source_checked_at,
      3 as stage_priority
    from public.planning_applications p
    where p.registration_date < current_date - 90
      and p.final_grant_date is null
      and p.appeal_decision_date is null
      and p.appeal_lodged_date is null
      and not public.openlist_planning_status_is_terminal(p.normalized_status)
      and p.decision_date >= current_date - 180
    order by p.last_source_checked_at asc nulls first, p.decision_date desc, p.registration_date, p.local_authority_code
    limit 6000
  ),
  eligible as materialized (
    select * from unresolved_candidates
    union all
    select * from recent_decision_candidates
  ),
  buckets as (
    select
      e.local_authority_code,
      e.period_start,
      (e.period_start + interval '1 month')::date as period_end,
      count(*)::bigint as candidate_count,
      case when count(*) filter (where e.last_source_checked_at is null) > 0
        then null else min(e.last_source_checked_at) end as least_recently_checked_at,
      min(e.stage_priority) as stage_priority
    from eligible e
    group by e.local_authority_code, e.period_start
  )
  select b.local_authority_code,b.period_start,b.period_end,b.candidate_count,b.least_recently_checked_at
  from buckets b
  order by b.least_recently_checked_at asc nulls first,b.stage_priority,b.period_start,b.local_authority_code
  limit greatest(1, least(coalesce(p_bucket_limit, 12), 50));
$$;

create or replace function public.openlist_mark_planning_status_bucket_checked(
  p_authority_code text,
  p_period_start date,
  p_period_end date
)
returns int
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare affected int;
begin
  update public.planning_applications p
  set last_source_checked_at = now()
  where p.local_authority_code = p_authority_code
    and p.registration_date >= p_period_start
    and p.registration_date < p_period_end
    and p.final_grant_date is null
    and p.appeal_decision_date is null
    and not public.openlist_planning_status_is_terminal(p.normalized_status)
    and (
      p.appeal_lodged_date is not null
      or p.normalized_status = 'appealed'
      or p.decision_date is null
      or p.decision_date >= current_date - 180
    );
  get diagnostics affected = row_count;
  return affected;
end;
$$;
