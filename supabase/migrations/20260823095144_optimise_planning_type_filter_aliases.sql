create or replace function public.openlist_planning_application_type_values(p_type text)
returns text[]
language sql
immutable
parallel safe
set search_path = public
as $$
  select case public.openlist_planning_application_type_key(p_type)
    when 'permission' then array['PERMISSION','Permission','TEMPORARY PERMISSION','Permission (Maritime)','APPROVAL','REDIII Permisssion']::text[]
    when 'retention' then array['RETENTION','Permission for Retention','Retention','Retention Permission','Permission for Retention (SDZ)']::text[]
    when 'permission_retention' then array['Permission and Retention']::text[]
    when 'outline_permission' then array['OUTLINE PERMISSION','Outline Permisson','Outline Permission','Permission and Outline Permission']::text[]
    when 'permission_consequent' then array['PERMISSION CONSEQUENT','Permission Consequent','Perm.consequent on Grant of Outline Perm','Perm on foot of Outline permission','Perm. following Grant of Outline Perm.','Permission & Perm. consq. on Grant of OP','Permission on Foot of Outline Permission']::text[]
    when 'extension_duration' then array['EXTENSION OF DURATION','Extension of Duration','Extension Of Duration Of Permission','Further Extension of Duration of Permission','Further Extension of Duration of Perm']::text[]
    when 'exemption' then array['Declaration of Exemption Sect. 5','Section 5','Certificate of Exemption - Part V','Sub-article 6','Cert under Part 5 of 2000 Act as amended','Dec Under Section 5']::text[]
    when 'strategic' then array['SDZ Application','Permission (SDZ)','Permission (SHD)','Permission (LRD)','LRD Application','Strategic Housing Development','SHD3-Application to ABP','LRD Permission','SDZ Application Clonburris','LRD3-Application','Permission for Retention (SDZ)','Strategic Infrastructure Application']::text[]
    when 'public_authority' then array['Application Under Part 8','Part Vlll (public consultation)','Section 179A Social Housing Exemption','Application Under Part 10','Section 179 A','Part X (public consultation)']::text[]
    else array['N/A','n/a','Compliance with Conditions','Pre-Application Consultation','Outdoor Event Licence','Local Area Plan Acknowledgement of Submi','Compliance Naming','Quarry Registration']::text[]
  end;
$$;

create or replace function public.openlist_planning_dashboard_aggregate(
  p_authority_code text default null,
  p_q text default null,
  p_area text default null,
  p_status text default null,
  p_application_type text default null
)
returns jsonb
language sql
stable
parallel safe
set search_path = public
set statement_timeout = '15s'
as $$
with filtered as materialized (
  select
    p.registration_date,
    coalesce(p.normalized_status, 'unknown') as status_key,
    p.application_type,
    p.grid_easting,
    p.grid_northing,
    case
      when p_authority_code is null then p.local_authority_code
      else public.openlist_planning_locality(p.location, p.ward, p.local_authority_code)
    end as area_label
  from public.planning_applications p
  where (p_authority_code is null or p.local_authority_code = p_authority_code)
    and (
      nullif(trim(p_q), '') is null
      or p.reference ilike '%' || trim(p_q) || '%'
      or p.proposal ilike '%' || trim(p_q) || '%'
      or p.location ilike '%' || trim(p_q) || '%'
      or p.applicant_name ilike '%' || trim(p_q) || '%'
    )
    and (
      nullif(trim(p_area), '') is null
      or p.location ilike '%' || trim(p_area) || '%'
      or (
        p_authority_code is not null
        and public.openlist_planning_locality(p.location, p.ward, p.local_authority_code) = trim(p_area)
      )
      or (
        p_authority_code is null
        and (p.local_authority ilike trim(p_area) or p.local_authority_code = trim(p_area))
      )
    )
    and (
      nullif(trim(p_status), '') is null
      or p.normalized_status = public.openlist_planning_status_key(p_status)
    )
    and (
      nullif(trim(p_application_type), '') is null
      or p.application_type = any(public.openlist_planning_application_type_values(p_application_type))
    )
),
latest as (
  select max(registration_date) as latest_date from filtered
),
month_counts as (
  select to_char(date_trunc('month', registration_date), 'YYYY-MM') as label, count(*)::int as count
  from filtered
  where registration_date is not null
  group by 1
),
area_counts as (
  select area_label as label, count(*)::int as count
  from filtered
  where nullif(trim(area_label), '') is not null
  group by area_label
),
status_counts as (
  select public.openlist_planning_status_label(status_key) as label, count(*)::int as count
  from filtered
  group by status_key
),
type_raw_counts as (
  select application_type, count(*)::int as count
  from filtered
  group by application_type
),
type_counts as (
  select
    public.openlist_planning_application_type_label(public.openlist_planning_application_type_key(application_type)) as label,
    sum(count)::int as count
  from type_raw_counts
  group by public.openlist_planning_application_type_key(application_type)
),
map_groups as (
  select
    area_label as label,
    count(*)::int as count,
    avg(grid_easting::numeric) as easting,
    avg(grid_northing::numeric) as northing
  from filtered
  where nullif(trim(area_label), '') is not null
    and grid_easting is not null
    and grid_northing is not null
  group by area_label
  order by count desc, area_label
  limit 28
),
map_bounds as (
  select
    min(easting) as min_easting,
    max(easting) as max_easting,
    min(northing) as min_northing,
    max(northing) as max_northing
  from map_groups
),
latest_rows as materialized (
  select f.*
  from filtered f, latest l
  where l.latest_date is not null
    and f.registration_date >= date_trunc('month', l.latest_date)::date
    and f.registration_date < (date_trunc('month', l.latest_date) + interval '1 month')::date
),
latest_status_counts as (
  select public.openlist_planning_status_label(status_key) as label, count(*)::int as count
  from latest_rows
  group by status_key
),
latest_type_raw_counts as (
  select application_type, count(*)::int as count
  from latest_rows
  group by application_type
),
latest_type_counts as (
  select
    public.openlist_planning_application_type_label(public.openlist_planning_application_type_key(application_type)) as label,
    sum(count)::int as count
  from latest_type_raw_counts
  group by public.openlist_planning_application_type_key(application_type)
)
select jsonb_build_object(
  'totalCount', (select count(*)::int from filtered),
  'latestRegistrationDate', (select latest_date::text from latest),
  'latestRegistrationMonth', (select to_char(latest_date, 'YYYY-MM') from latest),
  'latestMonthCount', (select count(*)::int from latest_rows),
  'previousMonthCount', case
    when (select latest_date from latest) is null then null
    else (
      select count(*)::int from filtered f, latest l
      where f.registration_date >= (date_trunc('month', l.latest_date) - interval '1 month')::date
        and f.registration_date < date_trunc('month', l.latest_date)::date
    )
  end,
  'latestMonthChange', case
    when (select latest_date from latest) is null then null
    else (select count(*)::int from latest_rows) - (
      select count(*)::int from filtered f, latest l
      where f.registration_date >= (date_trunc('month', l.latest_date) - interval '1 month')::date
        and f.registration_date < date_trunc('month', l.latest_date)::date
    )
  end,
  'areaStats', coalesce((
    select jsonb_agg(jsonb_build_object('label', label, 'count', count) order by count desc, label)
    from (select * from area_counts order by count desc, label limit 12) ranked
  ), '[]'::jsonb),
  'statusStats', coalesce((
    select jsonb_agg(jsonb_build_object('label', label, 'count', count) order by count desc, label)
    from (select * from status_counts order by count desc, label limit 8) ranked
  ), '[]'::jsonb),
  'typeStats', coalesce((
    select jsonb_agg(jsonb_build_object('label', label, 'count', count) order by count desc, label)
    from (select * from type_counts order by count desc, label limit 8) ranked
  ), '[]'::jsonb),
  'monthStats', coalesce((
    select jsonb_agg(jsonb_build_object('label', label, 'count', count) order by label)
    from (select * from month_counts order by label desc limit 12) ranked
  ), '[]'::jsonb),
  'mapPoints', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'label', g.label,
        'count', g.count,
        'x', ((g.easting - b.min_easting) / greatest(b.max_easting - b.min_easting, 1)) * 100,
        'y', 100 - (((g.northing - b.min_northing) / greatest(b.max_northing - b.min_northing, 1)) * 100)
      ) order by g.count desc, g.label
    )
    from map_groups g cross join map_bounds b
  ), '[]'::jsonb),
  'latestMonthAreaStats', coalesce((
    select jsonb_agg(jsonb_build_object('label', label, 'count', count) order by count desc, label)
    from (
      select area_label as label, count(*)::int as count
      from latest_rows where nullif(trim(area_label), '') is not null
      group by area_label order by count desc, area_label limit 8
    ) ranked
  ), '[]'::jsonb),
  'latestMonthStatusStats', coalesce((
    select jsonb_agg(jsonb_build_object('label', label, 'count', count) order by count desc, label)
    from (select * from latest_status_counts order by count desc, label limit 6) ranked
  ), '[]'::jsonb),
  'latestMonthTypeStats', coalesce((
    select jsonb_agg(jsonb_build_object('label', label, 'count', count) order by count desc, label)
    from (select * from latest_type_counts order by count desc, label limit 6) ranked
  ), '[]'::jsonb),
  'areaOptions', coalesce((
    select jsonb_agg(to_jsonb(label) order by count desc, label)
    from (select * from area_counts order by count desc, label limit 80) ranked
  ), '[]'::jsonb),
  'statusOptions', coalesce((
    select jsonb_agg(to_jsonb(label) order by count desc, label) from status_counts
  ), '[]'::jsonb),
  'typeOptions', coalesce((
    select jsonb_agg(to_jsonb(label) order by count desc, label) from type_counts
  ), '[]'::jsonb)
);
$$;
