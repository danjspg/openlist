alter table public.planning_seo_notable
  add column if not exists display_name text null,
  add column if not exists search_aliases text[] not null default '{}'::text[];

create index if not exists planning_seo_notable_aliases_gin_idx
  on public.planning_seo_notable using gin (search_aliases);

create or replace function public.openlist_planning_notable_alias_ids(
  p_q text,
  p_limit int default 100
)
returns uuid[]
language sql
stable
security definer
set search_path = public, pg_catalog
set statement_timeout = '5s'
as $$
  select coalesce(array_agg(m.application_id order by m.application_id), '{}'::uuid[])
  from (
    select distinct n.application_id
    from public.planning_seo_notable n
    cross join lateral unnest(n.search_aliases) alias(value)
    where n.active
      and nullif(btrim(coalesce(p_q, '')), '') is not null
      and alias.value ilike '%' || replace(replace(btrim(p_q), '%', '\%'), '_', '\_') || '%' escape '\'
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ) m;
$$;

revoke all on function public.openlist_planning_notable_alias_ids(text, int) from public, anon, authenticated;
grant execute on function public.openlist_planning_notable_alias_ids(text, int) to service_role;

insert into public.planning_seo_notable (
  application_id,
  source,
  reason,
  evidence,
  active,
  display_name,
  search_aliases,
  updated_at
)
select
  p.id,
  'press',
  'Notable local business planning application identified in Irish press coverage.',
  jsonb_build_object(
    'publisher', 'Irish Examiner',
    'published_at', '2026-08-14',
    'headline', 'Boxd coffee to open new Cork city location',
    'url', 'https://www.irishexaminer.com/property/developmentconstruction/arid-41895655.html'
  ),
  true,
  'Boxd Coffee',
  array['Boxd', 'Boxd Coffee', 'Boxd Washington Street', 'Boxd Cork', 'CC & H Imperial Ltd'],
  now()
from public.planning_applications p
where p.local_authority_code = 'CORKCITY'
  and p.reference = '26/44496'
on conflict (application_id) do update
set source = excluded.source,
    reason = excluded.reason,
    evidence = excluded.evidence,
    active = true,
    display_name = excluded.display_name,
    search_aliases = excluded.search_aliases,
    updated_at = now();