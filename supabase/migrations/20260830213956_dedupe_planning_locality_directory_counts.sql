create or replace function public.openlist_planning_locality_directory(p_limit integer default 3000)
returns table(
  canonical_path text,
  county text,
  authority_code text,
  locality_label text,
  locality_slug text,
  evidence jsonb,
  active_count bigint
)
language sql stable security definer set search_path = public as $$
  with active_counts as (
    select
      p.local_authority_code as authority_code,
      lower(public.openlist_planning_locality(p.location, p.ward, p.local_authority_code)) as locality_key,
      count(*)::bigint as active_count
    from public.planning_applications p
    where p.normalized_status in ('pre_validation','registered','under_assessment','further_information_requested','further_information_received','appealed')
    group by p.local_authority_code,
      lower(public.openlist_planning_locality(p.location, p.ward, p.local_authority_code))
  )
  select m.canonical_path, m.county, m.authority_code, m.locality_label, m.locality_slug, m.evidence,
         coalesce(a.active_count, 0)::bigint as active_count
  from public.locality_seo_memberships m
  left join active_counts a
    on a.authority_code = m.authority_code and a.locality_key = lower(m.locality_label)
  where m.surface = 'planning' and m.left_at is null
  order by m.score desc, m.canonical_path
  limit greatest(1, least(p_limit, 3000))
$$;

revoke all on function public.openlist_planning_locality_directory(integer) from public, anon, authenticated;
grant execute on function public.openlist_planning_locality_directory(integer) to service_role;