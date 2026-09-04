create or replace function public.openlist_planning_public_category_index(p_category text)
returns jsonb
language sql
stable
security definer
set search_path = 'public', 'pg_catalog'
set statement_timeout = '8s'
as $function$
  select jsonb_build_object(
    'entries', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'applicationId', n.application_id,
          'displayName', n.display_name,
          'categories', n.notable_categories,
          'authorityCode', p.local_authority_code,
          'registrationDate', p.registration_date,
          'reference', p.reference,
          'normalizedStatus', p.normalized_status
        )
        order by p.registration_date desc nulls last, p.reference desc, n.application_id
      ),
      '[]'::jsonb
    )
  )
  from public.planning_seo_notable n
  join public.planning_applications p on p.id = n.application_id
  where n.active
    and n.notable_categories @> array[p_category]::text[];
$function$;

revoke all on function public.openlist_planning_public_category_index(text) from public, anon, authenticated;
grant execute on function public.openlist_planning_public_category_index(text) to service_role;
