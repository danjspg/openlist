create index if not exists ppr_sales_area_date_idx
  on public.ppr_sales (area_slug, date_of_sale desc);

create index if not exists ppr_sales_county_date_idx
  on public.ppr_sales (county, date_of_sale desc);

create index if not exists ppr_sales_eircode_prefix_date_idx
  on public.ppr_sales (eircode_prefix, date_of_sale desc);

create index if not exists ppr_sales_new_dwelling_date_idx
  on public.ppr_sales (is_new_dwelling, date_of_sale desc);
