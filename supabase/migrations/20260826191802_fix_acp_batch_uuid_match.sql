create or replace function public.openlist_process_acp_appeal_batch(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_catalog'
as $function$
declare
  bounded_limit integer:=greatest(1,least(coalesce(p_limit,100),500));
  q record; c public.planning_appeal_cases%rowtype;
  matched_app uuid; match_count integer; old_app uuid;
  processed integer:=0; failed integer:=0; affected integer:=0;
begin
  for q in
    select appeal_case_id from public.planning_appeal_processing_queue
    where status in ('pending','failed') and next_attempt_at<=now() and attempt_count<8
    order by requested_at,appeal_case_id
    for update skip locked limit bounded_limit
  loop
    begin
      update public.planning_appeal_processing_queue set status='processing',started_at=now(),updated_at=now() where appeal_case_id=q.appeal_case_id;
      select * into strict c from public.planning_appeal_cases where id=q.appeal_case_id;
      matched_app:=null; match_count:=0;
      if c.planning_authority_case_reference is not null and c.planning_authority_code is not null
         and lower(coalesce(c.case_type,c.category,'')) like '%appeal%' then
        select count(*),(array_agg(id order by id))[1] into match_count,matched_app
        from public.planning_applications p
        where p.local_authority_code=c.planning_authority_code
          and upper(regexp_replace(coalesce(p.reference,''),'[^A-Za-z0-9]','','g'))=
              upper(regexp_replace(c.planning_authority_case_reference,'[^A-Za-z0-9]','','g'));
        if match_count<>1 then matched_app:=null; end if;
      end if;

      for old_app in select planning_application_id from public.planning_appeal_links
        where appeal_case_id=c.id and match_method='exact_authority_reference' and planning_application_id is distinct from matched_app
      loop
        delete from public.planning_appeal_links where appeal_case_id=c.id and planning_application_id=old_app and match_method='exact_authority_reference';
        delete from public.planning_application_events where application_id=old_app and event_source='an_coimisiun_pleanala_open_data'
          and event_key in ('acp:'||c.acp_case_number||':lodged','acp:'||c.acp_case_number||':decided');
        insert into public.planning_revalidation_queue(application_id,requested_at,updated_at) values(old_app,now(),now())
          on conflict(application_id) do update set requested_at=excluded.requested_at,updated_at=excluded.updated_at;
        affected:=affected+1;
      end loop;

      if matched_app is not null then
        insert into public.planning_appeal_links(planning_application_id,appeal_case_id,match_method,confidence,matched_reference,validation_summary)
        values(matched_app,c.id,'exact_authority_reference','high',c.planning_authority_case_reference,
          jsonb_build_object('planningAuthority',c.planning_authority,'acpCaseNumber',c.acp_case_number,'caseType',coalesce(c.case_type,c.category)))
        on conflict(planning_application_id,appeal_case_id) do update set
          match_method=excluded.match_method,confidence=excluded.confidence,matched_reference=excluded.matched_reference,
          validation_summary=excluded.validation_summary,
          matched_at=case when row(public.planning_appeal_links.match_method,public.planning_appeal_links.confidence,public.planning_appeal_links.matched_reference,public.planning_appeal_links.validation_summary)
            is distinct from row(excluded.match_method,excluded.confidence,excluded.matched_reference,excluded.validation_summary)
            then now() else public.planning_appeal_links.matched_at end;

        if c.received_date is not null then
          insert into public.planning_application_events(application_id,event_type,event_date,detected_at,event_source,source_field,label,old_value,new_value,raw_source_value,provenance,event_key)
          values(matched_app,'appeal_lodged',c.received_date,now(),'an_coimisiun_pleanala_open_data','LODGEDON','Appeal lodged with An Coimisiún Pleanála',null,c.acp_case_number,c.acp_case_number,'reconstructed','acp:'||c.acp_case_number||':lodged')
          on conflict(application_id,event_key) do update set event_date=excluded.event_date,event_source=excluded.event_source,source_field=excluded.source_field,label=excluded.label,new_value=excluded.new_value,raw_source_value=excluded.raw_source_value,provenance=excluded.provenance;
        else
          delete from public.planning_application_events where application_id=matched_app and event_key='acp:'||c.acp_case_number||':lodged';
        end if;
        if c.decision_date is not null then
          insert into public.planning_application_events(application_id,event_type,event_date,detected_at,event_source,source_field,label,old_value,new_value,raw_source_value,provenance,event_key)
          values(matched_app,'appeal_decided',c.decision_date,now(),'an_coimisiun_pleanala_open_data','DECIDED_ON',case when nullif(trim(c.decision),'') is not null then 'Appeal decision: '||trim(c.decision) else 'Appeal decided' end,null,nullif(trim(c.decision),''),nullif(trim(c.decision),''),'reconstructed','acp:'||c.acp_case_number||':decided')
          on conflict(application_id,event_key) do update set event_date=excluded.event_date,event_source=excluded.event_source,source_field=excluded.source_field,label=excluded.label,new_value=excluded.new_value,raw_source_value=excluded.raw_source_value,provenance=excluded.provenance;
        else
          delete from public.planning_application_events where application_id=matched_app and event_key='acp:'||c.acp_case_number||':decided';
        end if;
        insert into public.planning_revalidation_queue(application_id,requested_at,updated_at) values(matched_app,now(),now())
          on conflict(application_id) do update set requested_at=excluded.requested_at,updated_at=excluded.updated_at;
        affected:=affected+1;
      else
        delete from public.planning_appeal_links where appeal_case_id=c.id and match_method='exact_authority_reference';
      end if;

      update public.planning_appeal_processing_queue set status='done',completed_at=now(),last_error=null,updated_at=now() where appeal_case_id=c.id;
      processed:=processed+1;
    exception when others then
      update public.planning_appeal_processing_queue set status='failed',attempt_count=attempt_count+1,last_error=sqlerrm,
        next_attempt_at=now()+make_interval(mins=>least(60,greatest(1,(attempt_count+1)*5))),updated_at=now()
      where appeal_case_id=q.appeal_case_id;
      failed:=failed+1;
    end;
  end loop;
  return jsonb_build_object('processed',processed,'failed',failed,'affectedApplications',affected,
    'remaining',(select count(*) from public.planning_appeal_processing_queue where status in ('pending','failed') and attempt_count<8));
end;
$function$;
