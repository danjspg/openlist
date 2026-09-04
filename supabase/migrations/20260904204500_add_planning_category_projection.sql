create table if not exists public.planning_public_category_entries (
  category text not null,
  application_id uuid not null references public.planning_applications(id) on delete cascade,
  display_name text,
  notable_categories text[] not null default '{}'::text[],
  local_authority_code text,
  registration_date date,
  reference text not null,
  normalized_status text,
  updated_at timestamptz not null default now(),
  primary key (category, application_id)
);

create index if not exists planning_public_category_entries_page_idx
  on public.planning_public_category_entries (category, registration_date desc nulls last, reference desc, application_id);

create index if not exists planning_public_category_entries_counts_idx
  on public.planning_public_category_entries (category, local_authority_code, normalized_status);

alter table public.planning_public_category_entries enable row level security;
revoke all on table public.planning_public_category_entries from public, anon, authenticated;
grant select, insert, update, delete on table public.planning_public_category_entries to service_role;

insert into public.planning_public_category_entries (
  category,
  application_id,
  display_name,
  notable_categories,
  local_authority_code,
  registration_date,
  reference,
  normalized_status,
  updated_at
)
select
  category,
  n.application_id,
  n.display_name,
  n.notable_categories,
  p.local_authority_code,
  p.registration_date,
  p.reference,
  p.normalized_status,
  now()
from public.planning_seo_notable n
join public.planning_applications p on p.id = n.application_id
cross join lateral unnest(n.notable_categories) as category
where n.active
on conflict (category, application_id) do update set
  display_name = excluded.display_name,
  notable_categories = excluded.notable_categories,
  local_authority_code = excluded.local_authority_code,
  registration_date = excluded.registration_date,
  reference = excluded.reference,
  normalized_status = excluded.normalized_status,
  updated_at = excluded.updated_at;

create or replace function public.openlist_sync_planning_public_category_entries_from_notable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    delete from public.planning_public_category_entries where application_id = old.application_id;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.application_id is distinct from new.application_id then
    delete from public.planning_public_category_entries where application_id = old.application_id;
  end if;

  delete from public.planning_public_category_entries where application_id = new.application_id;

  if new.active then
    insert into public.planning_public_category_entries (
      category,
      application_id,
      display_name,
      notable_categories,
      local_authority_code,
      registration_date,
      reference,
      normalized_status,
      updated_at
    )
    select
      category,
      new.application_id,
      new.display_name,
      new.notable_categories,
      p.local_authority_code,
      p.registration_date,
      p.reference,
      p.normalized_status,
      now()
    from public.planning_applications p
    cross join lateral unnest(new.notable_categories) as category
    where p.id = new.application_id;
  end if;

  return new;
end;
$function$;

create or replace function public.openlist_sync_planning_public_category_entries_from_application()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.planning_public_category_entries
  set local_authority_code = new.local_authority_code,
      registration_date = new.registration_date,
      reference = new.reference,
      normalized_status = new.normalized_status,
      updated_at = now()
  where application_id = new.id;
  return new;
end;
$function$;

drop trigger if exists planning_public_category_entries_from_notable on public.planning_seo_notable;
create trigger planning_public_category_entries_from_notable
after insert or delete or update of application_id, display_name, notable_categories, active
on public.planning_seo_notable
for each row execute function public.openlist_sync_planning_public_category_entries_from_notable();

drop trigger if exists planning_public_category_entries_from_application on public.planning_applications;
create trigger planning_public_category_entries_from_application
after update of local_authority_code, registration_date, reference, normalized_status
on public.planning_applications
for each row execute function public.openlist_sync_planning_public_category_entries_from_application();

create or replace function public.openlist_planning_public_category_page_active(
  p_category text,
  p_include_older boolean default false,
  p_authority_code text default null,
  p_limit integer default 25,
  p_offset integer default 0,
  p_active_only boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = 'public', 'pg_catalog'
set statement_timeout = '8s'
as $function$
  with eligible as materialized (
    select *
    from public.planning_public_category_entries
    where category = p_category
  ),
  corpus as (
    select * from eligible
    where not p_active_only or normalized_status in ('pre_validation','registered','under_assessment','further_information_requested','further_information_received','appealed')
  ),
  authority_filtered as (
    select * from eligible where p_authority_code is null or local_authority_code = p_authority_code
  ),
  filtered as (
    select * from authority_filtered
    where not p_active_only or normalized_status in ('pre_validation','registered','under_assessment','further_information_requested','further_information_received','appealed')
  ),
  page_rows as (
    select * from filtered
    order by registration_date desc nulls last, reference desc, application_id
    limit greatest(1, least(coalesce(p_limit,25),40))
    offset greatest(0, least(coalesce(p_offset,0),40000))
  )
  select jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'application', to_jsonb(p),
          'displayName', page_rows.display_name,
          'categories', page_rows.notable_categories
        )
        order by page_rows.registration_date desc nulls last, page_rows.reference desc, page_rows.application_id
      )
      from page_rows
      join public.planning_applications p on p.id = page_rows.application_id
    ), '[]'::jsonb),
    'totalCount', (select count(*) from filtered),
    'overallTotalCount', (select count(*) from eligible),
    'overallActiveCount', (select count(*) from eligible where normalized_status in ('pre_validation','registered','under_assessment','further_information_requested','further_information_received','appealed')),
    'activeCount', (select count(*) from authority_filtered where normalized_status in ('pre_validation','registered','under_assessment','further_information_requested','further_information_received','appealed')),
    'authorityCounts', coalesce((
      select jsonb_agg(
        jsonb_build_object('code', a.local_authority_code, 'count', a.category_count)
        order by a.category_count desc, a.local_authority_code
      )
      from (
        select local_authority_code, count(*) category_count
        from corpus
        group by local_authority_code
      ) a
    ), '[]'::jsonb)
  );
$function$;

revoke all on function public.openlist_planning_public_category_page_active(text, boolean, text, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.openlist_planning_public_category_page_active(text, boolean, text, integer, integer, boolean) to service_role;
