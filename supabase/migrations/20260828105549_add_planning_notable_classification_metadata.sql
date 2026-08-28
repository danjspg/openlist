alter table public.planning_seo_notable
  add column if not exists notable_categories text[] not null default '{}'::text[],
  add column if not exists classification_reasons jsonb not null default '{}'::jsonb,
  add column if not exists classification_sources text[] not null default '{}'::text[];

comment on column public.planning_seo_notable.notable_categories is
  'Stable search/indexing categories. Deterministic and press categories may coexist.';
comment on column public.planning_seo_notable.classification_reasons is
  'Route-keyed classifier details. Each enrichment route must preserve the other route keys.';
comment on column public.planning_seo_notable.classification_sources is
  'Additive routes that currently make the application notable, such as deterministic and press.';

update public.planning_seo_notable
set classification_sources = array[source],
    notable_categories = case
      when source = 'press' then array['press']::text[]
      else notable_categories
    end,
    classification_reasons = case
      when source = 'press' then jsonb_build_object(
        'press', jsonb_build_object('reasons', jsonb_build_array(reason))
      )
      else classification_reasons
    end
where cardinality(classification_sources) = 0;

create index if not exists planning_seo_notable_categories_gin_idx
  on public.planning_seo_notable using gin (notable_categories)
  where active;

-- The notable set is durable and can grow by a few thousand rows per year.
-- Keep each RPC response bounded while allowing the cached sitemap route to
-- page through the XML protocol's 50,000 URL ceiling.
create or replace function public.openlist_planning_notable_sitemap(
  p_limit int default 1000,
  p_offset int default 0
)
returns table (
  id uuid,
  local_authority_code text,
  reference text,
  registration_date date,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_catalog
set statement_timeout = '15s'
as $$
  select
    p.id,
    p.local_authority_code,
    p.reference,
    p.registration_date,
    p.updated_at
  from public.planning_seo_notable n
  join public.planning_applications p on p.id = n.application_id
  where n.active
  order by n.created_at, p.local_authority_code, p.reference, p.id
  limit greatest(1, least(coalesce(p_limit, 1000), 1000))
  offset greatest(0, least(coalesce(p_offset, 0), 49999));
$$;

create or replace function public.openlist_planning_notable_sitemap_year(
  p_year int,
  p_limit int default 1000,
  p_offset int default 0
)
returns table (
  id uuid,
  local_authority_code text,
  reference text,
  registration_date date,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_catalog
set statement_timeout = '15s'
as $$
  select
    p.id,
    p.local_authority_code,
    p.reference,
    p.registration_date,
    p.updated_at
  from public.planning_seo_notable n
  join public.planning_applications p on p.id = n.application_id
  where n.active
    and (
      (p_year is null and p.registration_date is null)
      or (
        p_year is not null
        and p.registration_date >= make_date(p_year, 1, 1)
        and p.registration_date < make_date(p_year + 1, 1, 1)
      )
    )
  order by p.registration_date, p.local_authority_code, p.reference, p.id
  limit greatest(1, least(coalesce(p_limit, 1000), 1000))
  offset greatest(0, least(coalesce(p_offset, 0), 49999));
$$;

revoke all on function public.openlist_planning_notable_sitemap_year(int, int, int) from public;
grant execute on function public.openlist_planning_notable_sitemap_year(int, int, int)
  to anon, authenticated, service_role;

create or replace function public.openlist_planning_notable_description_candidates(
  p_limit int default 30
)
returns table (
  id uuid,
  local_authority text,
  local_authority_code text,
  reference text,
  proposal text,
  location text,
  applicant_name text,
  source_application_id bigint,
  source_url text,
  registration_date date,
  evidence jsonb
)
language sql
stable
security definer
set search_path = public, pg_catalog
set statement_timeout = '15s'
as $$
  select
    p.id,
    p.local_authority,
    p.local_authority_code,
    p.reference,
    p.proposal,
    p.location,
    p.applicant_name,
    p.source_application_id,
    p.source_url,
    p.registration_date,
    n.evidence
  from public.planning_seo_notable n
  join public.planning_applications p on p.id = n.application_id
  where n.active
    and (
      length(btrim(coalesce(p.proposal, ''))) < 160
      or p.proposal ~* '(…|\.\.\.|\m(and|or|with|to|for|of|the|including|comprising))\s*$'
    )
    and case
      when n.evidence #>> '{description_audit,checked_at}' ~ '^\d{4}-\d{2}-\d{2}T'
        then (n.evidence #>> '{description_audit,checked_at}')::timestamptz < now() - interval '30 days'
      else true
    end
  order by
    n.evidence #>> '{description_audit,checked_at}' nulls first,
    n.updated_at,
    n.application_id
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

revoke all on function public.openlist_planning_notable_description_candidates(int) from public;
grant execute on function public.openlist_planning_notable_description_candidates(int)
  to service_role;
