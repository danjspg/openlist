-- Speed the Dublin district snapshot rebuild by matching the expression used by
-- openlist_refresh_ppr_dublin_district_insights(). The previous plan scanned the
-- date index and evaluated upper(eircode_prefix) across hundreds of thousands of
-- rows for each district.
create index if not exists ppr_sales_eircode_prefix_upper_date_idx
  on public.ppr_sales (upper(eircode_prefix), date_of_sale desc)
  include (price_eur, is_new_dwelling)
  where eircode_prefix is not null;
