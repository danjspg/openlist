create or replace function public.openlist_planning_status_key(p_status text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select case lower(regexp_replace(replace(replace(trim(coalesce(p_status, '')), '_', ' '), '-', ' '), '\s+', ' ', 'g'))
    when '' then null
    when 'pre validation' then 'pre_validation'
    when 'application registered' then 'registered'
    when 'under assessment' then 'under_assessment'
    when 'further information requested' then 'further_information_requested'
    when 'further information received' then 'further_information_received'
    when 'decision made' then 'decision_made'
    when 'final grant' then 'final_grant'
    when 'under appeal' then 'appealed'
    when 'appeal decided' then 'appeal_decided'
    when 'withdrawn' then 'withdrawn'
    when 'invalid or incomplete' then 'invalid'
    when 'application finalised' then 'finalised'
    when 'status not classified' then 'unknown'
    else case lower(trim(coalesce(p_status, '')))
      when 'pre_validation' then 'pre_validation'
      when 'registered' then 'registered'
      when 'under_assessment' then 'under_assessment'
      when 'further_information_requested' then 'further_information_requested'
      when 'further_information_received' then 'further_information_received'
      when 'decision_made' then 'decision_made'
      when 'final_grant' then 'final_grant'
      when 'appealed' then 'appealed'
      when 'appeal_decided' then 'appeal_decided'
      when 'withdrawn' then 'withdrawn'
      when 'invalid' then 'invalid'
      when 'finalised' then 'finalised'
      else 'unknown'
    end
  end;
$$;

create or replace function public.openlist_planning_status_label(p_status text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select case coalesce(p_status, 'unknown')
    when 'pre_validation' then 'Pre-validation'
    when 'registered' then 'Application registered'
    when 'under_assessment' then 'Under assessment'
    when 'further_information_requested' then 'Further information requested'
    when 'further_information_received' then 'Further information received'
    when 'decision_made' then 'Decision made'
    when 'final_grant' then 'Final grant'
    when 'appealed' then 'Under appeal'
    when 'appeal_decided' then 'Appeal decided'
    when 'withdrawn' then 'Withdrawn'
    when 'invalid' then 'Invalid or incomplete'
    when 'finalised' then 'Application finalised'
    else 'Status not classified'
  end;
$$;

create or replace function public.openlist_planning_application_type_key(p_type text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select case
    when p_type is null or btrim(p_type) = '' or lower(btrim(p_type)) = 'n/a' then 'other'
    when lower(btrim(p_type)) = 'permission and retention' then 'permission_retention'
    when lower(p_type) like '%retention%' then 'retention'
    when lower(p_type) like '%extension of duration%' then 'extension_duration'
    when lower(p_type) like '%consequent%' or lower(p_type) like '%consq.%' or lower(p_type) like '%foot of outline%' or lower(p_type) like '%following grant of outline%' then 'permission_consequent'
    when lower(p_type) like '%outline perm%' then 'outline_permission'
    when lower(p_type) like '%section 5%' or lower(p_type) like '%sect. 5%' or lower(p_type) like '%sub-article 6%' or lower(p_type) like '%certificate of exemption%' or lower(p_type) like '%cert under part 5%' or lower(p_type) like '%dec under section 5%' then 'exemption'
    when lower(p_type) like '%lrd%' or lower(p_type) like '%shd%' or lower(p_type) like '%sdz%' or lower(p_type) like '%strategic housing%' or lower(p_type) like '%strategic infrastructure%' then 'strategic'
    when lower(p_type) like '%part 8%' or lower(p_type) like '%part viii%' or lower(p_type) like '%part vlll%' or lower(p_type) like '%part 10%' or lower(p_type) like '%part x%' or lower(p_type) like '%179a%' or lower(p_type) like '%179 a%' then 'public_authority'
    when lower(btrim(p_type)) in ('permission','temporary permission','permission (maritime)','approval','rediii permisssion') then 'permission'
    else case lower(btrim(p_type))
      when 'permission & retention' then 'permission_retention'
      when 'outline permission' then 'outline_permission'
      when 'permission consequent' then 'permission_consequent'
      when 'extension of duration' then 'extension_duration'
      when 'exemption / section 5' then 'exemption'
      when 'strategic / large-scale development' then 'strategic'
      when 'public authority / part 8' then 'public_authority'
      when 'other' then 'other'
      else 'other'
    end
  end;
$$;

create or replace function public.openlist_planning_application_type_label(p_type text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select case coalesce(p_type, 'other')
    when 'permission' then 'Permission'
    when 'retention' then 'Retention'
    when 'permission_retention' then 'Permission & retention'
    when 'outline_permission' then 'Outline permission'
    when 'permission_consequent' then 'Permission consequent'
    when 'extension_duration' then 'Extension of duration'
    when 'exemption' then 'Exemption / Section 5'
    when 'strategic' then 'Strategic / large-scale development'
    when 'public_authority' then 'Public authority / Part 8'
    else 'Other'
  end;
$$;
