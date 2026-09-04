-- Bulk historical population already derives application_id by joining the
-- canonical planning_applications table. Defer the FK check so Postgres does
-- not repeat a planning_applications PK lookup for every sidecar insert.
-- The FK is restored and validated after the historical load completes.

alter table public.planning_application_locations
  drop constraint if exists planning_application_locations_application_id_fkey;
