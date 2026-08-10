create or replace function public.openlist_planning_locality(
  p_location text,
  p_ward text,
  p_authority_code text
)
returns text
language plpgsql
immutable
parallel safe
set search_path = public
as $$
declare
  cleaned text;
  county_name text;
  locality text;
  cork_locality_pattern constant text := '\m(Newtownshandrum|Castletownbere|Watergrasshill|Courtmacsherry|Fountainstown|Carrigtwohill|Minane Bridge|Passage West|Ballinhassig|Ballinspittle|Ballyvourney|Little Island|Mitchelstown|Ballincollig|Carrigaline|Castlemartyr|Crosshaven|Rosscarbery|Skibbereen|Ballygarvan|Ballylickey|Newmarket|Ringaskiddy|Timoleague|Whitegate|Ballycotton|Ballydehob|Ballineen|Charleville|Clonakilty|Enniskeane|Innishannon|Macroom|Millstreet|Myrtleville|Shanagarry|Belgooly|Buttevant|Coachford|Doneraile|Dunmanway|Glanworth|Kilworth|Rathcormac|Riverstick|Allihies|Aghada|Bandon|Bantry|Blarney|Boherbue|Cobh|Cloyne|Douglas|Dripsey|Fermoy|Freemount|Glanmire|Goleen|Kanturk|Killeagh|Kinsale|Leap|Liscarroll|Mallow|Midleton|Rylane|Schull|Tower|Youghal|Baltimore|Banteer)\M';
begin
  if p_authority_code in ('CORKCOCO', 'CORKCITY') then
    locality := (regexp_match(coalesce(p_location, ''), cork_locality_pattern, 'i'))[1];
    if locality is not null then
      return initcap(locality);
    end if;
  end if;

  cleaned := trim(regexp_replace(coalesce(p_location, ''), '\s+', ' ', 'g'));
  cleaned := regexp_replace(cleaned, '\m[A-Z][0-9]{2}\s?[A-Z0-9]{4}\M', '', 'gi');

  county_name := case p_authority_code
    when 'CORKCOCO' then 'Cork' when 'CORKCITY' then 'Cork'
    when 'KILDARE' then 'Kildare' when 'GALWAYCOCO' then 'Galway'
    when 'GALWAYCITY' then 'Galway' when 'MEATH' then 'Meath'
    when 'WICKLOW' then 'Wicklow' when 'LIMERICK' then 'Limerick'
    when 'WATERFORD' then 'Waterford' when 'DONEGAL' then 'Donegal'
    when 'WEXFORD' then 'Wexford' when 'TIPPERARY' then 'Tipperary'
    when 'KERRY' then 'Kerry' when 'MAYO' then 'Mayo'
    when 'CLARE' then 'Clare' when 'LOUTH' then 'Louth'
    when 'LAOIS' then 'Laois' when 'KILKENNY' then 'Kilkenny'
    when 'OFFALY' then 'Offaly' when 'CAVAN' then 'Cavan'
    when 'ROSCOMMON' then 'Roscommon' when 'WESTMEATH' then 'Westmeath'
    when 'MONAGHAN' then 'Monaghan' when 'SLIGO' then 'Sligo'
    when 'CARLOW' then 'Carlow' when 'LONGFORD' then 'Longford'
    when 'LEITRIM' then 'Leitrim' else null
  end;

  if county_name is not null then
    cleaned := regexp_replace(cleaned, '\mcounty\s+' || county_name || '\M\.?', '', 'gi');
    cleaned := regexp_replace(cleaned, '\mco\.?\s*' || county_name || '\M\.?', '', 'gi');
    cleaned := regexp_replace(cleaned, ',\s*' || county_name || '\.?\s*$', '', 'i');
  end if;

  cleaned := trim(both ' ,.' from regexp_replace(cleaned, '\s*,\s*', ', ', 'g'));

  if cleaned <> '' then
    select trim(part)
      into locality
      from unnest(regexp_split_to_array(cleaned, ',')) with ordinality as parts(part, position)
      where trim(part) <> '' and trim(part) !~ '^\d+$'
      order by position desc
      limit 1;
    if coalesce(locality, '') <> '' then return locality; end if;
  end if;

  return nullif(
    trim(regexp_replace(
      coalesce(p_ward, ''),
      '^(The\s+)?Municipal\s+District(s|\s+of)?\s*:\s*',
      '',
      'i'
    )),
    ''
  );
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
    p.status,
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
    and (nullif(trim(p_status), '') is null or p.status = trim(p_status))
    and (
      nullif(trim(p_application_type), '') is null
      or p.application_type = trim(p_application_type)
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
  select status as label, count(*)::int as count
  from filtered
  where nullif(trim(status), '') is not null
  group by status
),
type_counts as (
  select application_type as label, count(*)::int as count
  from filtered
  where nullif(trim(application_type), '') is not null
  group by application_type
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
    from (
      select status as label, count(*)::int as count
      from latest_rows where nullif(trim(status), '') is not null
      group by status order by count desc, status limit 6
    ) ranked
  ), '[]'::jsonb),
  'latestMonthTypeStats', coalesce((
    select jsonb_agg(jsonb_build_object('label', label, 'count', count) order by count desc, label)
    from (
      select application_type as label, count(*)::int as count
      from latest_rows where nullif(trim(application_type), '') is not null
      group by application_type order by count desc, application_type limit 6
    ) ranked
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

grant execute on function public.openlist_planning_locality(text, text, text)
  to anon, authenticated, service_role;
grant execute on function public.openlist_planning_dashboard_aggregate(text, text, text, text, text)
  to anon, authenticated, service_role;
