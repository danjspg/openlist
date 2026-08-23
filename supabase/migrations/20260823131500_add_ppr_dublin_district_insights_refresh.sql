create or replace function public.openlist_refresh_ppr_dublin_district_insights()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.ppr_market_insights
  where range_key = 'last-year'
    and market_slug in (
      'dublin-1','dublin-2','dublin-3','dublin-4','dublin-5','dublin-6','dublin-6w',
      'dublin-7','dublin-8','dublin-9','dublin-10','dublin-11','dublin-12','dublin-13',
      'dublin-14','dublin-15','dublin-16','dublin-18','dublin-22','dublin-24'
    );

  insert into public.ppr_market_insights (
    range_key, market_slug, market_label, market_type, county, total_sales_count,
    median_all_time_eur, average_all_time_eur, last_sale_date,
    momentum_current_label, momentum_current_median_eur, momentum_current_count,
    momentum_previous_label, momentum_previous_median_eur, momentum_previous_count,
    momentum_yoy_change_pct, momentum_three_year_change_pct,
    activity_current_period_label, activity_current_period_count,
    activity_previous_period_label, activity_previous_period_count,
    activity_change_pct, activity_has_reliable_change,
    distribution_p25_eur, distribution_p75_eur,
    build_new_median_eur, build_new_count, build_second_hand_median_eur, build_second_hand_count,
    build_premium_amount_eur, build_premium_pct, updated_at
  )
  with districts(prefix, market_slug, market_label) as (
    values
      ('D01','dublin-1','Dublin 1'),('D02','dublin-2','Dublin 2'),('D03','dublin-3','Dublin 3'),
      ('D04','dublin-4','Dublin 4'),('D05','dublin-5','Dublin 5'),('D06','dublin-6','Dublin 6'),
      ('D6W','dublin-6w','Dublin 6W'),('D07','dublin-7','Dublin 7'),('D08','dublin-8','Dublin 8'),
      ('D09','dublin-9','Dublin 9'),('D10','dublin-10','Dublin 10'),('D11','dublin-11','Dublin 11'),
      ('D12','dublin-12','Dublin 12'),('D13','dublin-13','Dublin 13'),('D14','dublin-14','Dublin 14'),
      ('D15','dublin-15','Dublin 15'),('D16','dublin-16','Dublin 16'),('D18','dublin-18','Dublin 18'),
      ('D22','dublin-22','Dublin 22'),('D24','dublin-24','Dublin 24')
  ), bounds as (
    select current_date::date as current_end,
           (current_date - interval '12 months' + interval '1 day')::date as current_start,
           (current_date - interval '12 months')::date as previous_end,
           (current_date - interval '24 months' + interval '1 day')::date as previous_start,
           (current_date - interval '36 months')::date as baseline_end,
           (current_date - interval '48 months' + interval '1 day')::date as baseline_start
  ), scoped as (
    select d.prefix, d.market_slug, d.market_label, s.date_of_sale,
           s.price_eur::numeric as price_eur, s.is_new_dwelling
    from districts d
    join public.ppr_sales s on upper(s.eircode_prefix) = d.prefix
    cross join bounds b
    where s.date_of_sale between b.baseline_start and b.current_end
  ), agg as (
    select prefix, market_slug, market_label,
      count(*) filter (where date_of_sale between b.current_start and b.current_end)::int as current_count,
      count(*) filter (where date_of_sale between b.previous_start and b.previous_end)::int as previous_count,
      count(*) filter (where date_of_sale between b.baseline_start and b.baseline_end)::int as baseline_count,
      percentile_cont(0.5) within group (order by price_eur) filter (where date_of_sale between b.current_start and b.current_end) as current_median,
      percentile_cont(0.5) within group (order by price_eur) filter (where date_of_sale between b.previous_start and b.previous_end) as previous_median,
      percentile_cont(0.5) within group (order by price_eur) filter (where date_of_sale between b.baseline_start and b.baseline_end) as baseline_median,
      avg(price_eur) filter (where date_of_sale between b.current_start and b.current_end) as current_average,
      max(date_of_sale) filter (where date_of_sale between b.current_start and b.current_end) as last_sale,
      percentile_cont(0.25) within group (order by price_eur) filter (where date_of_sale between b.current_start and b.current_end) as p25,
      percentile_cont(0.75) within group (order by price_eur) filter (where date_of_sale between b.current_start and b.current_end) as p75,
      count(*) filter (where date_of_sale between b.current_start and b.current_end and is_new_dwelling is true)::int as new_count,
      percentile_cont(0.5) within group (order by price_eur) filter (where date_of_sale between b.current_start and b.current_end and is_new_dwelling is true) as new_median,
      count(*) filter (where date_of_sale between b.current_start and b.current_end and is_new_dwelling is false)::int as second_count,
      percentile_cont(0.5) within group (order by price_eur) filter (where date_of_sale between b.current_start and b.current_end and is_new_dwelling is false) as second_median
    from scoped cross join bounds b
    group by prefix, market_slug, market_label
  )
  select
    'last-year', market_slug, market_label, 'dublin_district', 'Dublin', current_count,
    current_median, current_average, last_sale,
    case when current_count >= 24 and previous_count >= 24 then 'Last 12 months' end,
    case when current_count >= 24 and previous_count >= 24 then current_median end,
    case when current_count >= 24 and previous_count >= 24 then current_count end,
    case when current_count >= 24 and previous_count >= 24 then 'Previous 12 months' end,
    case when current_count >= 24 and previous_count >= 24 then previous_median end,
    case when current_count >= 24 and previous_count >= 24 then previous_count end,
    case when current_count >= 24 and previous_count >= 24 and previous_median > 0
      then ((current_median - previous_median) / previous_median) * 100 end,
    case when baseline_count >= 24 and baseline_median > 0
      then ((current_median - baseline_median) / baseline_median) * 100 end,
    'Last 12 months', current_count, 'Previous 12 months', previous_count,
    case when current_count >= 24 and previous_count >= 24 and previous_count > 0
      then ((current_count - previous_count)::numeric / previous_count) * 100 end,
    (current_count >= 24 and previous_count >= 24),
    case when current_count >= 12 then p25 end,
    case when current_count >= 12 then p75 end,
    case when new_count >= 8 and second_count >= 8 then new_median end,
    case when new_count >= 8 and second_count >= 8 then new_count end,
    case when new_count >= 8 and second_count >= 8 then second_median end,
    case when new_count >= 8 and second_count >= 8 then second_count end,
    case when new_count >= 8 and second_count >= 8 then new_median - second_median end,
    case when new_count >= 8 and second_count >= 8 and second_median > 0
      then ((new_median - second_median) / second_median) * 100 end,
    now()
  from agg;
end;
$$;

revoke all on function public.openlist_refresh_ppr_dublin_district_insights() from public;
revoke all on function public.openlist_refresh_ppr_dublin_district_insights() from anon;
revoke all on function public.openlist_refresh_ppr_dublin_district_insights() from authenticated;
grant execute on function public.openlist_refresh_ppr_dublin_district_insights() to service_role;
