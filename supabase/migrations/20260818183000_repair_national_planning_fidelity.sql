create or replace function public.openlist_normalize_planning_status(p_status text)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  value text := regexp_replace(
    replace(replace(lower(trim(coalesce(p_status, ''))), '_', ' '), '-', ' '),
    '\s+',
    ' ',
    'g'
  );
begin
  if value = '' or value = 'n/a' then return 'unknown'; end if;
  if value = any(array['pre validation','pre reg','unregistered application','validation']) then return 'pre_validation'; end if;
  if value = any(array['new application','new application set up','registered application','application registered','registration','valid']) then return 'registered'; end if;
  if value = any(array['officer allocation','referral','assessment period','35 day assessment','45 day assessment','49 day assessment','planner assignment','planners report','recommendation review','recommended decision','recommended decision entered','managers order','publication required','provisional recommendation','application under review']) then return 'under_assessment'; end if;
  if value = any(array['further information','additional information','additional information requested','ai requested','decision request a.i.','request ai approval','ai request approved','significant ai requested','clarification of ai requested','cai requested','additional information approval required','additional information consultees','ai referral','cai consultees','sai referral','sai consultees']) then return 'further_information_requested'; end if;
  if value = any(array['further information received','additional information received','ai received','cai received','ai not significant']) then return 'further_information_received'; end if;
  if value = any(array['decision','decision made','decision notice issued','decision issued','decision following a.i.','decision review']) then return 'decision_made'; end if;
  if value = any(array['final grant','final grant review']) then return 'final_grant'; end if;
  if value = any(array['appealed','appeal lodged','application appealed','application under appeal','appealed financial','decision appealed','leave to appeal','planner rpt to abp','planners report to acp','appeal report sent to abp','appeal comments due','file to acp']) then return 'appealed'; end if;
  if value = 'appeal decided' then return 'appeal_decided'; end if;
  if value = any(array['withdrawn','application withdrawn','planning application withdrawn','deemed withdrawn','withdrawal of application on appeal']) then return 'withdrawn'; end if;
  if value = any(array['invalid','invalid application','invalid details sent to applicant','invalid site notice','invalid due to site notice','incompleted','incompleted application']) then return 'invalid'; end if;
  if value = any(array['application closed','application finalised','pac report & file closed','pac meeting & file closed','application archived']) then return 'finalised'; end if;
  return 'unknown';
end;
$$;

update public.planning_applications
set normalized_status = public.openlist_normalize_planning_status(status)
where lower(trim(status)) in ('application under review', 'application archived')
  and normalized_status is distinct from public.openlist_normalize_planning_status(status);

create or replace function public.openlist_repair_national_planning_links(
  p_authority_code text,
  p_limit integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
set statement_timeout = '120s'
as $$
declare
  authority_code text := upper(trim(coalesce(p_authority_code, '')));
  tenant text;
  repaired integer := 0;
begin
  if authority_code = 'DLR' then tenant := 'dunlaoghaire';
  elsif authority_code = 'FINGAL' then tenant := 'fingal';
  else raise exception 'Unsupported national planning authority: %', authority_code;
  end if;

  if p_limit < 1 or p_limit > 5000 then
    raise exception 'p_limit must be between 1 and 5000';
  end if;

  with candidates as materialized (
    select id, reference
    from public.planning_applications
    where local_authority_code = authority_code
      and source_url is distinct from (
        'https://planning.agileapplications.ie/' || tenant ||
        '/search-applications/results?criteria=%7B%22query%22%3A%22' ||
        replace(replace(replace(reference, '%', '%25'), '/', '%2F'), ' ', '%20') ||
        '%22%7D'
      )
    order by id
    limit p_limit
  )
  update public.planning_applications application
  set source_url =
    'https://planning.agileapplications.ie/' || tenant ||
    '/search-applications/results?criteria=%7B%22query%22%3A%22' ||
    replace(replace(replace(candidate.reference, '%', '%25'), '/', '%2F'), ' ', '%20') ||
    '%22%7D'
  from candidates candidate
  where application.id = candidate.id;

  get diagnostics repaired = row_count;
  return jsonb_build_object('authority', authority_code, 'updated', repaired);
end;
$$;

revoke all on function public.openlist_repair_national_planning_links(text, integer) from public;
grant execute on function public.openlist_repair_national_planning_links(text, integer) to service_role;
