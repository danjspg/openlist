create or replace function public.openlist_planning_dashboard_snapshot(p_authority_code text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with source as (
    select payload
    from public.planning_dashboard_snapshots
    where authority_code=coalesce(nullif(p_authority_code,''),'NATIONAL')
  ), deduped as (
    select coalesce(jsonb_agg(value order by value), '[]'::jsonb) as options
    from (
      select distinct on (lower(regexp_replace(replace(value,'-',' '),'\s+',' ','g')))
        value
      from source, jsonb_array_elements_text(payload->'areaOptions') value
      order by lower(regexp_replace(replace(value,'-',' '),'\s+',' ','g')),
               (position('-' in value)>0),
               value
    ) x
  )
  select case
    when source.payload is null then null
    else jsonb_set(source.payload,'{areaOptions}',deduped.options,true)
  end
  from source cross join deduped
$$;
