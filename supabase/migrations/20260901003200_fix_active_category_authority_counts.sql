create or replace function public.openlist_planning_public_category_page_active(
  p_category text,
  p_include_older boolean default false,
  p_authority_code text default null,
  p_limit integer default 25,
  p_offset integer default 0,
  p_active_only boolean default false
) returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_catalog'
set statement_timeout to '8s'
as $function$
  with eligible as materialized (
    select n.application_id,n.display_name,n.notable_categories,p.local_authority_code,p.registration_date,p.reference,p.normalized_status
    from public.planning_seo_notable n
    join public.planning_applications p on p.id=n.application_id
    where n.active and n.notable_categories @> array[p_category]::text[]
  ),
  corpus as (
    select * from eligible
    where not p_active_only or normalized_status in ('pre_validation','registered','under_assessment','further_information_requested','further_information_received','appealed')
  ),
  authority_filtered as (
    select * from eligible where p_authority_code is null or local_authority_code=p_authority_code
  ),
  filtered as (
    select * from authority_filtered
    where not p_active_only or normalized_status in ('pre_validation','registered','under_assessment','further_information_requested','further_information_received','appealed')
  ),
  page_rows as (
    select * from filtered
    order by registration_date desc nulls last,reference desc,application_id
    limit greatest(1,least(coalesce(p_limit,25),40))
    offset greatest(0,least(coalesce(p_offset,0),40000))
  )
  select jsonb_build_object(
    'rows',coalesce((select jsonb_agg(jsonb_build_object('application',to_jsonb(p),'displayName',page_rows.display_name,'categories',page_rows.notable_categories) order by page_rows.registration_date desc nulls last,page_rows.reference desc,page_rows.application_id) from page_rows join public.planning_applications p on p.id=page_rows.application_id),'[]'::jsonb),
    'totalCount',(select count(*) from filtered),
    'overallTotalCount',(select count(*) from eligible),
    'overallActiveCount',(select count(*) from eligible where normalized_status in ('pre_validation','registered','under_assessment','further_information_requested','further_information_received','appealed')),
    'activeCount',(select count(*) from authority_filtered where normalized_status in ('pre_validation','registered','under_assessment','further_information_requested','further_information_received','appealed')),
    'authorityCounts',coalesce((select jsonb_agg(jsonb_build_object('code',a.local_authority_code,'count',a.category_count) order by a.category_count desc,a.local_authority_code) from (select local_authority_code,count(*) category_count from corpus group by local_authority_code) a),'[]'::jsonb)
  );
$function$;

grant execute on function public.openlist_planning_public_category_page_active(text,boolean,text,integer,integer,boolean) to anon, authenticated, service_role;
