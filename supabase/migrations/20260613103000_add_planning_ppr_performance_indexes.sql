create extension if not exists pg_trgm;

create index if not exists planning_applications_authority_registration_reference_idx
  on public.planning_applications (
    local_authority_code,
    registration_date desc,
    reference desc
  );

create index if not exists planning_applications_authority_status_registration_idx
  on public.planning_applications (
    local_authority_code,
    status,
    registration_date desc
  );

create index if not exists planning_applications_authority_type_registration_idx
  on public.planning_applications (
    local_authority_code,
    application_type,
    registration_date desc
  );

create index if not exists planning_applications_location_trgm_idx
  on public.planning_applications
  using gin (location gin_trgm_ops);

create index if not exists planning_applications_reference_trgm_idx
  on public.planning_applications
  using gin (reference gin_trgm_ops);

create index if not exists planning_commencements_authority_metric_period_idx
  on public.planning_commencements (
    local_authority_code,
    metric,
    period_month desc
  );

create index if not exists ppr_sales_county_area_price_date_idx
  on public.ppr_sales (
    county,
    area_slug,
    price_eur,
    date_of_sale desc
  );

create index if not exists ppr_sales_county_area_new_date_idx
  on public.ppr_sales (
    county,
    area_slug,
    is_new_dwelling,
    date_of_sale desc
  );
