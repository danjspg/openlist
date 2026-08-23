create or replace function public.openlist_planning_application_type_values(p_type text)
returns text[]
language sql
immutable
parallel safe
set search_path = public
as $$
  select case public.openlist_planning_application_type_key(p_type)
    when 'permission' then array['PERMISSION','Permission','TEMPORARY PERMISSION','Permission (Maritime)','APPROVAL','REDIII Permisssion']::text[]
    when 'retention' then array['RETENTION','Permission for Retention','Retention','Retention Permission','Permission for Retention (SDZ)']::text[]
    when 'permission_retention' then array['Permission and Retention']::text[]
    when 'outline_permission' then array['OUTLINE PERMISSION','Outline Permisson','Outline Permission','Permission and Outline Permission']::text[]
    when 'permission_consequent' then array['PERMISSION CONSEQUENT','Permission Consequent','Perm.consequent on Grant of Outline Perm','Perm on foot of Outline permission','Perm. following Grant of Outline Perm.','Permission & Perm. consq. on Grant of OP','Permission on Foot of Outline Permission']::text[]
    when 'extension_duration' then array['EXTENSION OF DURATION','Extension of Duration','Extension Of Duration Of Permission','Further Extension of Duration of Permission','Further Extension of Duration of Perm']::text[]
    when 'exemption' then array['Declaration of Exemption Sect. 5','Section 5','Certificate of Exemption - Part V','Sub-article 6','Cert under Part 5 of 2000 Act as amended','Dec Under Section 5']::text[]
    when 'strategic' then array['SDZ Application','Permission (SDZ)','Permission (SHD)','Permission (LRD)','LRD Application','Strategic Housing Development','SHD3-Application to ABP','LRD Permission','SDZ Application Clonburris','LRD3-Application','Strategic Infrastructure Application']::text[]
    when 'public_authority' then array['Application Under Part 8','Part Vlll (public consultation)','Section 179A Social Housing Exemption','Application Under Part 10','Section 179 A','Part X (public consultation)']::text[]
    else array['N/A','n/a','Compliance with Conditions','Pre-Application Consultation','Outdoor Event Licence','Local Area Plan Acknowledgement of Submi','Compliance Naming','Quarry Registration']::text[]
  end;
$$;
