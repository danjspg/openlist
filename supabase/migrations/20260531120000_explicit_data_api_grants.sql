-- Supabase no longer exposes new public-schema tables to the Data API by
-- default. Keep every table used through PostgREST/supabase-js explicit.

grant usage on schema public to anon, authenticated, service_role;

do $$
declare
  sequence_name text;
begin
  if to_regclass('public.listings') is not null then
    grant select, insert, update on table public.listings to anon, authenticated;
    grant select, insert, update, delete on table public.listings to service_role;

    sequence_name := pg_get_serial_sequence('public.listings', 'id');
    if sequence_name is not null then
      execute format(
        'grant usage, select on sequence %s to anon, authenticated, service_role',
        sequence_name
      );
    end if;
  end if;

  if to_regclass('public.enquiries') is not null then
    grant select, insert on table public.enquiries to anon, authenticated;
    grant select, insert, update, delete on table public.enquiries to service_role;

    sequence_name := pg_get_serial_sequence('public.enquiries', 'id');
    if sequence_name is not null then
      execute format(
        'grant usage, select on sequence %s to anon, authenticated, service_role',
        sequence_name
      );
    end if;
  end if;

  if to_regclass('public.ppr_sales') is not null then
    grant select on table public.ppr_sales to anon, authenticated;
    grant select, insert, update, delete on table public.ppr_sales to service_role;
  end if;

  if to_regclass('public.ppr_area_stats') is not null then
    grant select on table public.ppr_area_stats to anon, authenticated;
    grant select, insert, update, delete on table public.ppr_area_stats to service_role;
  end if;

  if to_regclass('public.ppr_area_monthly') is not null then
    grant select on table public.ppr_area_monthly to anon, authenticated;
    grant select, insert, update, delete on table public.ppr_area_monthly to service_role;
  end if;

  if to_regclass('public.ppr_national_snapshots') is not null then
    grant select on table public.ppr_national_snapshots to anon, authenticated;
    grant select, insert, update, delete on table public.ppr_national_snapshots to service_role;
  end if;

  if to_regclass('public.ppr_comparison_rows') is not null then
    grant select on table public.ppr_comparison_rows to anon, authenticated;
    grant select, insert, update, delete on table public.ppr_comparison_rows to service_role;
  end if;

  if to_regclass('public.ppr_market_insights') is not null then
    grant select on table public.ppr_market_insights to anon, authenticated;
    grant select, insert, update, delete on table public.ppr_market_insights to service_role;
  end if;

  if to_regclass('public.ppr_area_insights') is not null then
    grant select on table public.ppr_area_insights to anon, authenticated;
    grant select, insert, update, delete on table public.ppr_area_insights to service_role;
  end if;

  if to_regprocedure('public.refresh_ppr_area_summaries()') is not null then
    grant execute on function public.refresh_ppr_area_summaries() to service_role;
  end if;
end $$;
