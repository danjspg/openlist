create extension if not exists pgcrypto;

create table if not exists public.ppr_sales (
  id uuid primary key default gen_random_uuid(),
  source_row_hash text unique,
  date_of_sale date not null,
  address_raw text not null,
  address_normalised text,
  locality text,
  county text,
  eircode text null,
  eircode_prefix text null,
  price_eur numeric(12,2) not null,
  price_display text,
  property_description_raw text null,
  is_new_dwelling boolean null,
  vat_exclusive boolean null,
  source_url text null,
  year int,
  month int,
  area_slug text,
  lat numeric null,
  lng numeric null,
  ingested_at timestamptz default now()
);

create table if not exists public.ppr_area_stats (
  id uuid primary key default gen_random_uuid(),
  geography_type text,
  county text,
  area_slug text,
  eircode_prefix text null,
  period_start date,
  period_end date,
  sales_count int,
  median_price_eur numeric,
  avg_price_eur numeric,
  min_price_eur numeric,
  max_price_eur numeric,
  last_sale_date date,
  updated_at timestamptz default now()
);

create table if not exists public.ppr_area_monthly (
  id uuid primary key default gen_random_uuid(),
  county text,
  area_slug text,
  year_month date,
  sales_count int,
  median_price_eur numeric,
  avg_price_eur numeric
);

create index if not exists ppr_sales_county_idx
  on public.ppr_sales (county);

create index if not exists ppr_sales_area_slug_idx
  on public.ppr_sales (area_slug);

create index if not exists ppr_sales_eircode_prefix_idx
  on public.ppr_sales (eircode_prefix);

create index if not exists ppr_sales_date_of_sale_idx
  on public.ppr_sales (date_of_sale desc);

create index if not exists ppr_sales_price_eur_idx
  on public.ppr_sales (price_eur);

create index if not exists ppr_sales_county_area_date_idx
  on public.ppr_sales (county, area_slug, date_of_sale desc);

create index if not exists ppr_sales_address_search_idx
  on public.ppr_sales using gin (
    to_tsvector('english', coalesce(address_normalised, address_raw, ''))
  );

create index if not exists ppr_area_stats_area_idx
  on public.ppr_area_stats (county, area_slug);

create index if not exists ppr_area_stats_eircode_prefix_idx
  on public.ppr_area_stats (eircode_prefix);

create index if not exists ppr_area_monthly_area_month_idx
  on public.ppr_area_monthly (county, area_slug, year_month desc);

create or replace function public.refresh_ppr_area_summaries()
returns void
language plpgsql
as $$
begin
  delete from public.ppr_area_monthly;
  delete from public.ppr_area_stats;

  insert into public.ppr_area_monthly (
    county,
    area_slug,
    year_month,
    sales_count,
    median_price_eur,
    avg_price_eur
  )
  select
    county,
    area_slug,
    date_trunc('month', date_of_sale)::date as year_month,
    count(*)::int as sales_count,
    percentile_cont(0.5) within group (order by price_eur) as median_price_eur,
    avg(price_eur) as avg_price_eur
  from public.ppr_sales
  where county is not null
    and area_slug is not null
  group by county, area_slug, date_trunc('month', date_of_sale)::date;

  insert into public.ppr_area_stats (
    geography_type,
    county,
    area_slug,
    eircode_prefix,
    period_start,
    period_end,
    sales_count,
    median_price_eur,
    avg_price_eur,
    min_price_eur,
    max_price_eur,
    last_sale_date
  )
  select
    'area' as geography_type,
    county,
    area_slug,
    null as eircode_prefix,
    min(date_of_sale) as period_start,
    max(date_of_sale) as period_end,
    count(*)::int as sales_count,
    percentile_cont(0.5) within group (order by price_eur) as median_price_eur,
    avg(price_eur) as avg_price_eur,
    min(price_eur) as min_price_eur,
    max(price_eur) as max_price_eur,
    max(date_of_sale) as last_sale_date
  from public.ppr_sales
  where county is not null
    and area_slug is not null
  group by county, area_slug;
end;
$$;
