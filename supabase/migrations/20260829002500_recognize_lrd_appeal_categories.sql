do $$
declare
  function_signature regprocedure;
  function_definition text;
  corrected_definition text;
begin
  foreach function_signature in array array[
    'public.openlist_sync_authoritative_appeal_state(uuid)'::regprocedure,
    'public.openlist_guard_acp_appeal_precedence()'::regprocedure,
    'public.openlist_process_acp_appeal_batch(integer)'::regprocedure,
    'public.openlist_requeue_matchable_unlinked_acp_cases(integer)'::regprocedure,
    'public.openlist_planning_lifecycle_inconsistencies()'::regprocedure
  ]
  loop
    select pg_get_functiondef(function_signature) into function_definition;
    corrected_definition := replace(
      function_definition,
      'lower(coalesce(c.case_type,c.category,'''')) like ''%appeal%''',
      '(lower(coalesce(c.case_type,'''')) like ''%appeal%'' or lower(coalesce(c.category,'''')) like ''%appeal%'')'
    );
    corrected_definition := replace(
      corrected_definition,
      'lower(coalesce(c.case_type, c.category, '''')) like ''%appeal%''',
      '(lower(coalesce(c.case_type, '''')) like ''%appeal%'' or lower(coalesce(c.category, '''')) like ''%appeal%'')'
    );

    if corrected_definition = function_definition then
      raise exception 'Expected ACP appeal predicate was not found in %', function_signature;
    end if;
    if corrected_definition like '%coalesce(c.case_type%c.category%' then
      raise exception 'Unsafe ACP appeal predicate remains in %', function_signature;
    end if;

    execute corrected_definition;
  end loop;
end;
$$;

revoke execute on function public.openlist_requeue_matchable_unlinked_acp_cases(integer) from public, anon, authenticated;
grant execute on function public.openlist_requeue_matchable_unlinked_acp_cases(integer) to service_role;
