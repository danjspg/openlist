create or replace function public.refresh_ppr_area_summaries()
returns void
language plpgsql
as $$
begin
  delete from public.ppr_area_stats;

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

grant execute on function public.refresh_ppr_area_summaries() to service_role;
