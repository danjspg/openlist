-- Keep Eircode routing-area fallbacks indexed and exact. This avoids broad
-- locality substring searches such as "%Cork%" or "%Dublin%" when an exact
-- coordinate is unavailable.

alter table public.planning_applications
  add column if not exists eircode_prefix text null;

update public.planning_applications
set eircode_prefix = substr(eircode, 1, 3)
where eircode is not null
  and eircode ~ '^([AC-FHKNPRTV-Y][0-9]{2}|D6W) [0-9AC-FHKNPRTV-Y]{4}$'
  and eircode_prefix is distinct from substr(eircode, 1, 3);

create index if not exists planning_applications_eircode_prefix_date_idx
  on public.planning_applications (eircode_prefix, registration_date desc)
  where eircode_prefix is not null;
