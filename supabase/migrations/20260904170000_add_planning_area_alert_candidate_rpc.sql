create or replace function public.openlist_planning_area_alert_candidates(
  p_subscription_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer,
  p_category text,
  p_event_trigger text,
  p_created_after timestamptz,
  p_limit integer default 250
)
returns table (
  event_id uuid,
  application_id uuid,
  distance_m double precision
)
language sql
stable
security invoker
set statement_timeout = '5s'
as $$
  with candidate_events as (
    select
      e.id as event_id,
      e.application_id,
      e.detected_at,
      st_distance(
        l.location_geog,
        st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography
      ) as distance_m,
      lower(coalesce(e.new_value, e.label, '')) as decision_value,
      e.event_type
    from public.planning_application_events e
    join public.planning_application_locations l
      on l.application_id = e.application_id
    where e.detected_at > p_created_after
      and e.event_date >= p_created_after::date
      and st_dwithin(
        l.location_geog,
        st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
        p_radius_m
      )
      and (
        p_category = 'all'
        or exists (
          select 1
          from public.planning_seo_notable n
          where n.application_id = e.application_id
            and n.notable_categories @> array[p_category]::text[]
        )
      )
      and not exists (
        select 1
        from public.planning_area_alert_deliveries d
        where d.subscription_id = p_subscription_id
          and d.event_id = e.id
      )
      and (
        (p_event_trigger = 'new' and e.event_type = 'application_received')
        or (p_event_trigger = 'appealed' and e.event_type = 'appeal_lodged')
        or (p_event_trigger = 'construction' and e.event_type = 'works_commenced')
        or (
          p_event_trigger = 'approved'
          and (
            e.event_type = 'final_grant'
            or (
              e.event_type in ('decision_made', 'decision_changed')
              and (
                lower(coalesce(e.new_value, e.label, '')) like '%grant%'
                or lower(coalesce(e.new_value, e.label, '')) like '%conditional%'
                or lower(coalesce(e.new_value, e.label, '')) like '%unconditional%'
                or lower(coalesce(e.new_value, e.label, '')) like '%condition%'
                or lower(coalesce(e.new_value, e.label, '')) like '%approve%'
                or lower(coalesce(e.new_value, e.label, '')) like '%declared exempt%'
                or lower(coalesce(e.new_value, e.label, '')) like '%certificate of exemption%'
              )
              and lower(coalesce(e.new_value, e.label, '')) not like '%split decision%'
              and not (
                lower(coalesce(e.new_value, e.label, '')) like '%grant%'
                and lower(coalesce(e.new_value, e.label, '')) like '%refus%'
              )
              and lower(coalesce(e.new_value, e.label, '')) not like '%additional information%'
              and lower(coalesce(e.new_value, e.label, '')) not like '%request ai%'
              and lower(coalesce(e.new_value, e.label, '')) not like '%not exempt%'
              and lower(coalesce(e.new_value, e.label, '')) not like '%other body%'
              and lower(coalesce(e.new_value, e.label, '')) not like '%withdraw%'
              and lower(coalesce(e.new_value, e.label, '')) not like '%invalid%'
              and lower(coalesce(e.new_value, e.label, '')) not like '%incomplete%'
              and lower(coalesce(e.new_value, e.label, '')) not like '%refus%'
            )
          )
        )
      )
  )
  select event_id, application_id, distance_m
  from candidate_events
  order by detected_at asc, event_id asc
  limit least(greatest(p_limit, 1), 500);
$$;

revoke all on function public.openlist_planning_area_alert_candidates(uuid, double precision, double precision, integer, text, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.openlist_planning_area_alert_candidates(uuid, double precision, double precision, integer, text, text, timestamptz, integer) to service_role;

comment on function public.openlist_planning_area_alert_candidates(uuid, double precision, double precision, integer, text, text, timestamptz, integer) is
  'Returns undelivered lifecycle events matching one spatial planning-area subscription, filtering category and trigger before the bounded result limit.';
