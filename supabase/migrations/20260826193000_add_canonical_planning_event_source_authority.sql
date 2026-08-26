create or replace function public.openlist_planning_event_source_rank(p_event_type text, p_event_source text)
returns integer
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_event_type in ('appeal_lodged','appeal_decided') and p_event_source = 'an_coimisiun_pleanala_open_data' then 100
    when p_event_type in ('works_commenced','completion_certificate_validated') and p_event_source = 'nbco_bcms_open_data' then 100
    when p_event_source in ('cork_county_api','cork_city_api','wexford_api','kildare_api','eplan') then 90
    when p_event_source = 'national_arcgis' then 50
    when p_event_source = 'openlist_refresh' then 40
    else 25
  end;
$$;

comment on function public.openlist_planning_event_source_rank(text,text) is
'Field/event-specific source authority rank. ACP is authoritative for appeal milestones; NBCO/BCMS for building-control milestones; direct council sources outrank the national planning dataset for local planning lifecycle facts.';

create or replace function public.openlist_is_canonical_planning_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.planning_application_events e
    where e.id = p_event_id
      and (
        (e.event_type in ('works_commenced','completion_certificate_validated')
          and e.event_source = 'nbco_bcms_open_data')
        or
        (e.event_type in ('appeal_lodged','appeal_decided') and (
          e.event_source = 'an_coimisiun_pleanala_open_data'
          or not exists (
            select 1
            from public.planning_application_events stronger
            where stronger.application_id = e.application_id
              and stronger.event_type = e.event_type
              and stronger.event_source = 'an_coimisiun_pleanala_open_data'
          )
        ))
        or
        e.event_type not in ('works_commenced','completion_certificate_validated','appeal_lodged','appeal_decided')
      )
  );
$$;

comment on function public.openlist_is_canonical_planning_event(uuid) is
'Resolves whether a raw planning event is part of the canonical OpenList lifecycle stream. Raw lower-authority events remain stored for provenance and QA.';

create or replace view public.planning_canonical_events
with (security_invoker = true)
as
select
  e.*,
  public.openlist_planning_event_source_rank(e.event_type,e.event_source) as source_authority_rank
from public.planning_application_events e
where public.openlist_is_canonical_planning_event(e.id);

comment on view public.planning_canonical_events is
'Canonical resolved planning lifecycle stream. Consumers such as public timelines and alert eligibility should read this layer rather than independently deduplicating raw source events.';

grant select on public.planning_canonical_events to anon, authenticated, service_role;
revoke execute on function public.openlist_is_canonical_planning_event(uuid) from public, anon, authenticated;
grant execute on function public.openlist_is_canonical_planning_event(uuid) to service_role;
revoke execute on function public.openlist_planning_event_source_rank(text,text) from public;
grant execute on function public.openlist_planning_event_source_rank(text,text) to anon, authenticated, service_role;

create or replace function public.openlist_enqueue_planning_alert_deliveries(p_limit integer default 200)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  bounded_limit integer := greatest(1, least(coalesce(p_limit, 200), 1000));
  inserted_count integer;
begin
  with eligible as (
    select
      subscription.id as subscription_id,
      observed.id as observed_change_id,
      observed.observed_at,
      event.id as event_id,
      event.application_id,
      event.event_type,
      event.event_date,
      event.source_field,
      event.new_value,
      case event.event_type
        when 'appeal_decided' then 100
        when 'final_grant' then 95
        when 'decision_changed' then 92
        when 'decision_made' then 90
        when 'withdrawn' then 88
        when 'appeal_lodged' then 85
        when 'further_information_requested' then 80
        when 'further_information_received' then 78
        when 'decision_due_changed' then 60
        when 'status_changed' then 40
        else 10
      end as event_priority
    from public.planning_alert_observed_changes observed
    join public.planning_alert_subscriptions subscription
      on subscription.application_id = observed.application_id
     and subscription.enabled
    join public.planning_canonical_events event
      on event.id = observed.event_id
    where observed.observed_at >= subscription.created_at
      and event.event_type = any(array[
        'further_information_requested','further_information_received','decision_made',
        'final_grant','appeal_lodged','appeal_decided','withdrawn','decision_changed',
        'decision_due_changed','status_changed'
      ])
      and abs(extract(epoch from (event.detected_at - observed.observed_at))) <= 300
      and not (
        event.source_field = any(array[
          'further_information_requested_date','further_information_received_date',
          'decision_date','final_grant_date','withdrawal_date',
          'appeal_lodged_date','appeal_decision_date'
        ])
        and event.event_date < (subscription.created_at at time zone 'Europe/Dublin')::date
      )
      and not (
        event.event_type = 'status_changed'
        and lower(trim(coalesce(event.new_value, ''))) = any(array[
          '', 'unknown', 'n/a', 'na', 'none', 'null', 'not applicable',
          'not available', 'not recorded', 'not supplied', 'undefined'
        ])
      )
      and not (
        event.event_type = any(array['decision_made', 'decision_changed'])
        and lower(trim(coalesce(event.new_value, ''))) = any(array[
          '', 'unknown', 'n/a', 'na', 'none', 'null', 'not applicable',
          'not available', 'not recorded', 'not supplied', 'undefined'
        ])
      )
  ), ranked as (
    select eligible.*,
      row_number() over (
        partition by subscription_id, application_id, observed_at
        order by event_priority desc, event_id
      ) as batch_rank
    from eligible
  )
  insert into public.planning_alert_deliveries(
    subscription_id,event_id,observed_change_id,status,attempt_count,next_attempt_at
  )
  select subscription_id,event_id,observed_change_id,'queued',0,now()
  from ranked
  where batch_rank = 1
  order by observed_at, observed_change_id, subscription_id
  limit bounded_limit
  on conflict (subscription_id,event_id) do nothing;

  get diagnostics inserted_count = row_count;
  return jsonb_build_object('queued',inserted_count,'limit',bounded_limit);
end;
$function$;
