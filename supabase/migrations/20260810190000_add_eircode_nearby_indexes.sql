-- Bounded coordinate candidate lookups for Eircode location intelligence.
-- These indexes support a small bounding-box query before application-side
-- Haversine ranking; no PostGIS extension or full-table transfer is required.

create index if not exists ppr_sales_lat_lng_date_idx
  on public.ppr_sales (lat, lng, date_of_sale desc)
  where lat is not null and lng is not null;

create index if not exists planning_applications_grid_easting_northing_date_idx
  on public.planning_applications (
    grid_easting,
    grid_northing,
    registration_date desc
  )
  where grid_easting is not null and grid_northing is not null;
