do $$
declare
  definition text;
  updated_definition text;
begin
  select pg_get_functiondef('public.openlist_refresh_locality_seo_cohorts(integer,integer,integer)'::regprocedure)
    into definition;

  updated_definition := replace(
    definition,
    $old$or locality_label ~ '[0-9]'$old$,
    $new$or (
      locality_label ~ '[0-9]'
      and not (
        authority_code in ('DUBLINCITY','FINGAL','SOUTHDUBLIN','DLR')
        and locality_label ~* '^dublin[[:space:]]+[0-9]{1,2}[a-z]?$'
      )
    )$new$
  );
  if updated_definition = definition then
    raise exception 'Could not locate numeric-locality exclusion in openlist_refresh_locality_seo_cohorts';
  end if;
  definition := updated_definition;

  updated_definition := replace(
    definition,
    $old$or lower(locality_label) in ($old$,
    $new$or locality_label ~* '(^|[[:space:]])(p[.]?o[.]?|post office)([[:space:]]|$)'
    or locality_label ~* '^co[.]?[[:space:]]+'
    or lower(locality_label) in ($new$
  );
  if updated_definition = definition then
    raise exception 'Could not locate locality alias exclusion in openlist_refresh_locality_seo_cohorts';
  end if;

  execute updated_definition;
end;
$$;

-- Remove any low-quality aliases that the previously over-escaped regex could admit.
update public.locality_seo_memberships
set left_at = now(), updated_at = now()
where surface = 'planning'
  and left_at is null
  and (
    locality_label ~* '(^|[[:space:]])(p[.]?o[.]?|post office)([[:space:]]|$)'
    or locality_label ~* '^co[.]?[[:space:]]+'
  );

-- Refresh immediately so high-signal Dublin postal districts enter the live cohort.
select public.openlist_refresh_locality_seo_cohorts(100, 42, 20);

-- This is a correctness repair, so restore the intended cohort cap immediately rather
-- than retaining displaced members solely because their 42-day residence has not elapsed.
with ranked as (
  select id,
         row_number() over (order by score desc, canonical_path) as rn
  from public.locality_seo_memberships
  where surface = 'planning' and left_at is null
)
update public.locality_seo_memberships m
set left_at = now(), updated_at = now()
from ranked r
where m.id = r.id and r.rn > 100;
