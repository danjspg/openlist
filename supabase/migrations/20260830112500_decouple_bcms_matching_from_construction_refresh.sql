create or replace function public.openlist_bcms_match_batch(p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_catalog'
set statement_timeout='15s'
as $function$
declare
  item record;
  candidate_count int;
  app_id uuid;
  stale_app uuid;
  notice_row public.building_control_notices%rowtype;
  linked int:=0;
  noop int:=0;
  ambiguous int:=0;
  unmatched int:=0;
  failures int:=0;
  checked_notable int:=0;
  did_link boolean;
begin
  for item in
    select *
    from public.bcms_match_queue
    where state in('pending','failed') and available_at<=now()
    order by priority,id
    limit greatest(1,least(coalesce(p_limit,200),500))
    for update skip locked
  loop
    begin
      candidate_count:=0;
      app_id:=null;
      notice_row:=null;
      did_link:=false;

      update public.bcms_match_queue
      set state='processing',attempts=attempts+1,updated_at=now()
      where id=item.id;

      if item.planning_application_id is not null then
        checked_notable:=checked_notable+1;
        select n.* into notice_row
        from public.building_control_notices n
        join public.planning_applications p on p.id=item.planning_application_id
        where not n.planning_reference_is_compound
          and n.building_control_authority_code=p.local_authority_code
          and n.planning_permission_reference_normalized=public.openlist_normalise_bcms_reference(p.reference)
        order by n.commencement_date desc nulls last,n.id
        limit 1;
        app_id:=item.planning_application_id;
        candidate_count:=case when notice_row.id is null then 0 else 1 end;
      else
        select * into notice_row from public.building_control_notices where id=item.notice_id;
        select count(*),(array_agg(p.id order by p.id))[1]
        into candidate_count,app_id
        from public.planning_applications p
        where p.local_authority_code=notice_row.building_control_authority_code
          and public.openlist_normalise_bcms_reference(p.reference)=notice_row.planning_permission_reference_normalized;
        if notice_row.planning_reference_is_compound then candidate_count:=2; end if;
      end if;

      if item.notice_id is not null and notice_row.id is not null then
        for stale_app in
          delete from public.planning_building_control_links l
          where l.notice_id=notice_row.id
            and (coalesce(candidate_count,0)<>1 or l.planning_application_id is distinct from app_id)
          returning l.planning_application_id
        loop
          delete from public.planning_application_events e
          where e.application_id=stale_app and (
            e.event_key='bcms:notice:'||notice_row.id||':commenced'
            or e.event_key in (
              select 'bcms:record:'||r.id||':completed'
              from public.building_control_records r
              where r.source_resource_id=notice_row.source_resource_id
                and r.building_control_authority_code=notice_row.building_control_authority_code
                and r.cn_number=notice_row.cn_number
            )
          );
          perform public.openlist_bcms_refresh_construction_state(stale_app);
        end loop;
      end if;

      if notice_row.id is null or app_id is null then
        update public.bcms_match_queue set state='unmatched',updated_at=now() where id=item.id;
        unmatched:=unmatched+1;
      elsif coalesce(candidate_count,1)>1 then
        update public.bcms_match_queue set state='ambiguous',updated_at=now() where id=item.id;
        insert into public.bcms_match_anomalies(queue_id,notice_id,planning_application_id,anomaly_type,details)
        values(item.id,notice_row.id,item.planning_application_id,'ambiguous',jsonb_build_object('candidateCount',candidate_count));
        ambiguous:=ambiguous+1;
      else
        did_link := not exists(
          select 1 from public.planning_building_control_links
          where planning_application_id=app_id
            and notice_id=notice_row.id
            and match_method='exact_authority_normalized_reference'
        );
        insert into public.planning_building_control_links(
          planning_application_id,notice_id,match_method,confidence,matched_reference,validation_summary
        ) values(
          app_id,notice_row.id,'exact_authority_normalized_reference','high',notice_row.planning_permission_reference_normalized,
          jsonb_build_object('authorityCode',notice_row.building_control_authority_code,'reference',notice_row.planning_permission_reference_normalized)
        )
        on conflict(planning_application_id,notice_id,match_method)
        do update set last_verified_at=now(),updated_at=now();

        if did_link then linked:=linked+1; else noop:=noop+1; end if;

        -- Matching only establishes/validates the link. Event materialisation and
        -- derived construction status are intentionally deferred to the separate
        -- resumable construction_catchup stage.
        update public.bcms_match_anomalies set resolved_at=now() where queue_id=item.id and resolved_at is null;
        update public.bcms_match_queue set state=case when did_link then 'linked' else 'noop' end,updated_at=now() where id=item.id;
      end if;
    exception when others then
      update public.bcms_match_queue
      set state='failed',last_error=sqlerrm,available_at=now()+interval '1 hour',updated_at=now()
      where id=item.id;
      failures:=failures+1;
    end;
  end loop;

  insert into public.bcms_pipeline_checkpoints(stage,last_success_at,last_error,counters)
  values('matching',now(),case when failures>0 then failures||' failures' end,
    jsonb_build_object('notableCandidatesChecked',checked_notable,'newlyLinked',linked,'alreadyLinkedNoop',noop,'ambiguous',ambiguous,'unmatched',unmatched,'failures',failures))
  on conflict(stage) do update
  set last_success_at=excluded.last_success_at,last_error=excluded.last_error,counters=excluded.counters,updated_at=now();

  return jsonb_build_object('notableCandidatesChecked',checked_notable,'newlyLinked',linked,'alreadyLinkedNoop',noop,'ambiguous',ambiguous,'unmatched',unmatched,'failures',failures);
end
$function$;
