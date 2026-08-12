-- Canonical OpenList Eircode storage is uppercase with one space after the
-- three-character Routing Key (for example A65 F4E2). This migration only
-- rewrites values that confidently match the published Eircode syntax.

alter table public.planning_applications
  add column if not exists eircode text null;

with valid_ppr_eircodes as (
  select
    id,
    upper(regexp_replace(btrim(eircode), '[[:space:]]+', '', 'g')) as compact
  from public.ppr_sales
  where eircode is not null
    and btrim(eircode) <> ''
    and upper(regexp_replace(btrim(eircode), '[[:space:]]+', '', 'g'))
      ~ '^([AC-FHKNPRTV-Y][0-9]{2}|D6W)[0-9AC-FHKNPRTV-Y]{4}$'
), canonical_ppr_eircodes as (
  select
    id,
    substr(compact, 1, 3) || ' ' || substr(compact, 4, 4) as canonical,
    substr(compact, 1, 3) as routing_key
  from valid_ppr_eircodes
)
update public.ppr_sales as sale
set
  eircode = candidate.canonical,
  eircode_prefix = candidate.routing_key
from canonical_ppr_eircodes as candidate
where sale.id = candidate.id
  and (
    sale.eircode is distinct from candidate.canonical
    or sale.eircode_prefix is distinct from candidate.routing_key
  );

with extracted_planning_eircodes as (
  select
    application.id,
    upper(regexp_replace(code_match.value, '[[:space:]]+', '', 'g')) as compact
  from public.planning_applications as application
  cross join lateral (
    select (regexp_match(
      application.location,
      '(?:^|[^0-9A-Z])(([AC-FHKNPRTV-Y][0-9]{2}|D6W)[[:space:]]*[0-9AC-FHKNPRTV-Y]{4})(?:$|[^0-9A-Z])',
      'i'
    ))[1] as value
  ) as code_match
  where application.location is not null
    and code_match.value is not null
), canonical_planning_eircodes as (
  select
    id,
    substr(compact, 1, 3) || ' ' || substr(compact, 4, 4) as canonical
  from extracted_planning_eircodes
  where compact ~ '^([AC-FHKNPRTV-Y][0-9]{2}|D6W)[0-9AC-FHKNPRTV-Y]{4}$'
)
update public.planning_applications as application
set eircode = candidate.canonical
from canonical_planning_eircodes as candidate
where application.id = candidate.id
  and application.eircode is distinct from candidate.canonical;

create index if not exists ppr_sales_eircode_idx
  on public.ppr_sales (eircode);

create index if not exists planning_applications_eircode_idx
  on public.planning_applications (eircode);
