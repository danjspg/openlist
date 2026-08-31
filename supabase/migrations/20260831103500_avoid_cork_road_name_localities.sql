-- Do not treat a known Cork locality token as the application locality when it is
-- immediately being used as a thoroughfare name (for example Carrigaline Road).
-- This keeps genuine locality mentions such as "Woodville, Glanmire, Cork" while
-- allowing a later real locality such as Douglas to win in "Carrigaline Road, Douglas".

create or replace function public.openlist_planning_locality(
  p_location text,
  p_ward text,
  p_authority_code text
)
returns text
language plpgsql
immutable
parallel safe
set search_path = public
as $function$
declare
  cleaned text;
  county_name text;
  locality text;
  cork_locality_pattern constant text :=
    '\m(Newtownshandrum|Castletownbere|Watergrasshill|Courtmacsherry|Fountainstown|Carrigtwohill|Minane Bridge|Passage West|Ballinhassig|Ballinspittle|Ballyvourney|Little Island|Mitchelstown|Ballincollig|Carrigaline|Castlemartyr|Crosshaven|Rosscarbery|Skibbereen|Ballygarvan|Ballylickey|Newmarket|Ringaskiddy|Timoleague|Whitegate|Ballycotton|Ballydehob|Ballineen|Charleville|Clonakilty|Enniskeane|Innishannon|Macroom|Millstreet|Myrtleville|Shanagarry|Belgooly|Buttevant|Coachford|Doneraile|Dunmanway|Glanworth|Kilworth|Rathcormac|Riverstick|Allihies|Aghada|Bandon|Bantry|Blarney|Boherbue|Cobh|Cloyne|Douglas|Dripsey|Fermoy|Freemount|Glanmire|Goleen|Kanturk|Killeagh|Kinsale|Leap|Liscarroll|Mallow|Midleton|Rylane|Schull|Tower|Youghal|Baltimore|Banteer)\M(?![[:space:]]+(Road|Rd\.?|Street|St\.?|Lane|Ln\.?|Avenue|Ave\.?|Drive|Dr\.?|Way|Quay|Terrace|Crescent|Close|Place|Square)\M)';
begin
  if p_authority_code in ('CORKCOCO', 'CORKCITY') then
    locality := (
      regexp_match(
        coalesce(p_location, ''),
        cork_locality_pattern,
        'i'
      )
    )[1];

    if locality is not null then
      return initcap(locality);
    end if;
  end if;

  cleaned := trim(
    regexp_replace(
      coalesce(p_location, ''),
      '\s+',
      ' ',
      'g'
    )
  );

  cleaned := regexp_replace(
    cleaned,
    '\m[A-Z][0-9]{2}\s?[A-Z0-9]{4}\M',
    '',
    'gi'
  );

  county_name := case p_authority_code
    when 'CORKCOCO' then 'Cork'
    when 'CORKCITY' then 'Cork'
    when 'KILDARE' then 'Kildare'
    when 'GALWAYCOCO' then 'Galway'
    when 'GALWAYCITY' then 'Galway'
    when 'MEATH' then 'Meath'
    when 'WICKLOW' then 'Wicklow'
    when 'LIMERICK' then 'Limerick'
    when 'WATERFORD' then 'Waterford'
    when 'DONEGAL' then 'Donegal'
    when 'WEXFORD' then 'Wexford'
    when 'TIPPERARY' then 'Tipperary'
    when 'KERRY' then 'Kerry'
    when 'MAYO' then 'Mayo'
    when 'CLARE' then 'Clare'
    when 'LOUTH' then 'Louth'
    when 'LAOIS' then 'Laois'
    when 'KILKENNY' then 'Kilkenny'
    when 'OFFALY' then 'Offaly'
    when 'CAVAN' then 'Cavan'
    when 'ROSCOMMON' then 'Roscommon'
    when 'WESTMEATH' then 'Westmeath'
    when 'MONAGHAN' then 'Monaghan'
    when 'SLIGO' then 'Sligo'
    when 'CARLOW' then 'Carlow'
    when 'LONGFORD' then 'Longford'
    when 'LEITRIM' then 'Leitrim'
    else null
  end;

  if county_name is not null then
    cleaned := regexp_replace(
      cleaned,
      '\mcounty\s+' || county_name || '\M\.?',
      '',
      'gi'
    );

    cleaned := regexp_replace(
      cleaned,
      '\mco\.?\s*' || county_name || '\M\.?',
      '',
      'gi'
    );

    cleaned := regexp_replace(
      cleaned,
      ',\s*' || county_name || '\.?\s*$',
      '',
      'i'
    );
  end if;

  cleaned := trim(
    both ' ,.' from regexp_replace(
      cleaned,
      '\s*,\s*',
      ', ',
      'g'
    )
  );

  if cleaned <> '' then
    select trim(part)
    into locality
    from unnest(
      regexp_split_to_array(cleaned, ',')
    ) with ordinality as parts(part, position)
    where trim(part) <> ''
      and trim(part) !~ '^\d+$'
    order by position desc
    limit 1;

    if coalesce(locality, '') <> '' then
      return locality;
    end if;
  end if;

  return nullif(
    trim(
      regexp_replace(
        coalesce(p_ward, ''),
        '^(The\s+)?Municipal\s+District(s|\s+of)?\s*:\s*',
        '',
        'i'
      )
    ),
    ''
  );
end;
$function$;

-- The function is used by an immutable expression index. Rebuild it after changing
-- the function semantics so indexed locality values agree with direct evaluation.
reindex index public.planning_applications_authority_locality_registration_idx;

-- Retire only Cork memberships for which the corrected extractor now finds no
-- application at all. This removes false pages such as Cork City / Carrigaline
-- without deleting legitimate cross-boundary localities such as Blarney or Glanmire.
update public.locality_seo_memberships m
set left_at = now(),
    updated_at = now()
where m.surface = 'planning'
  and m.left_at is null
  and m.authority_code in ('CORKCOCO', 'CORKCITY')
  and not exists (
    select 1
    from public.planning_applications p
    where p.local_authority_code = m.authority_code
      and public.openlist_planning_locality(
        p.location,
        p.ward,
        p.local_authority_code
      ) = m.locality_label
  );

select public.openlist_refresh_planning_locality_activity_counts('CORKCITY');
select public.openlist_refresh_planning_locality_activity_counts('CORKCOCO');
