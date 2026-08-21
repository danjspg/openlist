-- Tighten the existing selector without changing its ranking or rotation rules.
-- The data audit found postal-address fragments (for example "Lifford PO") and
-- county labels (for example "Co. Dublin") in Planning source locations.
do $$
declare
  definition text;
begin
  select pg_get_functiondef('public.openlist_refresh_locality_seo_cohorts(integer,integer,integer)'::regprocedure)
    into definition;
  definition := replace(
    definition,
    $old$or locality_label ~ '[0-9]' or lower(locality_label) in ('county cork','county dublin','ireland')$old$,
    $new$or locality_label ~ '[0-9]'
    or locality_label ~* '(^|[[:space:]])(p\.?o\.?|post office)([[:space:]]|$)'
    or locality_label ~* '^co\.?[[:space:]]+'
    or lower(locality_label) in ('carlow','cavan','clare','cork','donegal','dublin','galway','kerry','kildare','kilkenny','laois','leitrim','limerick','longford','louth','mayo','meath','monaghan','offaly','roscommon','sligo','tipperary','waterford','westmeath','wexford','wicklow','county cork','county dublin','ireland')$new$
  );
  execute definition;
end;
$$;

update public.locality_seo_memberships
set left_at = now(), updated_at = now()
where surface = 'planning' and left_at is null
  and (
    locality_label ~* '(^|[[:space:]])(p\.?o\.?|post office)([[:space:]]|$)'
    or locality_label ~* '^co\.?[[:space:]]+'
    or lower(locality_label) in ('carlow','cavan','clare','cork','donegal','dublin','galway','kerry','kildare','kilkenny','laois','leitrim','limerick','longford','louth','mayo','meath','monaghan','offaly','roscommon','sligo','tipperary','waterford','westmeath','wexford','wicklow','county cork','county dublin','ireland')
  );
