-- Normalize the duplicate Dublin 8 canonical-place representation and make locality snapshot freshness explicit.

insert into public.planning_canonical_place_aliases (
  place_slug,
  alias,
  alias_normalized,
  authority_code,
  source,
  confidence
)
select
  'dublin-8',
  'Dublin 08',
  'dublin 08',
  null,
  'canonical_normalization',
  100
where exists (select 1 from public.planning_canonical_places where slug = 'dublin-8')
  and not exists (
    select 1
    from public.planning_canonical_place_aliases
    where place_slug = 'dublin-8'
      and alias_normalized = 'dublin 08'
      and authority_code is null
  );

delete from public.planning_canonical_place_aliases
where place_slug = 'dublin-08';

delete from public.planning_canonical_place_memberships
where place_slug = 'dublin-08';

delete from public.planning_canonical_places
where slug = 'dublin-08';

create or replace function public.openlist_refresh_planning_locality_activity_counts(
  p_authority_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '20s'
as $$
declare
  v_refreshed integer := 0;
  v_changed integer := 0;
begin
  if nullif(trim(p_authority_code), '') is null then
    raise exception 'p_authority_code is required';
  end if;

  with active_counts as materialized (
    select
      lower(public.openlist_planning_locality(p.location, p.ward, p.local_authority_code)) as locality_key,
      count(*)::bigint as active_count
    from public.planning_applications p
    where p.local_authority_code = p_authority_code
      and p.normalized_status in (
        'pre_validation',
        'registered',
        'under_assessment',
        'further_information_requested',
        'further_information_received',
        'appealed'
      )
    group by lower(public.openlist_planning_locality(p.location, p.ward, p.local_authority_code))
  ), refreshed as materialized (
    select m.id, m.active_count as previous_active_count, coalesce(a.active_count, 0)::bigint as active_count
    from public.locality_seo_memberships m
    left join active_counts a on a.locality_key = lower(m.locality_label)
    where m.surface = 'planning'
      and m.left_at is null
      and m.authority_code = p_authority_code
  ), changed as (
    select count(*)::integer as count
    from refreshed
    where previous_active_count is distinct from active_count
  ), updated as (
    update public.locality_seo_memberships m
    set active_count = r.active_count,
        activity_refreshed_at = now()
    from refreshed r
    where m.id = r.id
    returning 1
  )
  select
    (select count from changed),
    (select count(*)::integer from updated)
  into v_changed, v_refreshed;

  return jsonb_build_object(
    'authorityCode', p_authority_code,
    'changed', v_changed,
    'refreshed', v_refreshed,
    'refreshedAt', now()
  );
end;
$$;

revoke all on function public.openlist_refresh_planning_locality_activity_counts(text)
  from public, anon, authenticated;
grant execute on function public.openlist_refresh_planning_locality_activity_counts(text)
  to service_role;
