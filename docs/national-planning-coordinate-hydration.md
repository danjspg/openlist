# National planning coordinate hydration

This process deliberately separates external acquisition from production database writes.

## 1. Acquire a narrow national coordinate snapshot

Run:

```bash
node scripts/export-national-planning-coordinates.mjs --output national-planning-coordinates.ndjson
```

The exporter talks only to the national ArcGIS Planning Application Points layer. It requests only:

- `OBJECTID`
- `PlanningAuthority`
- `ApplicationNumber`
- point geometry projected by ArcGIS to EPSG:2157 (Irish Transverse Mercator)

It does not connect to Supabase and does not write to OpenList.

An authority can be isolated for validation:

```bash
node scripts/export-national-planning-coordinates.mjs \
  --authority "Kildare County Council" \
  --output kildare-planning-coordinates.ndjson
```

## 2. Validate without database writes

```bash
node scripts/hydrate-planning-coordinates.mjs \
  --input national-planning-coordinates.ndjson \
  --dry-run
```

Dry-run mode parses and validates the snapshot without requiring Supabase credentials.

## 3. Hydrate production in deliberately small batches

After the bounded RPC migration is deployed, begin with a tiny run:

```bash
node scripts/hydrate-planning-coordinates.mjs \
  --input national-planning-coordinates.ndjson \
  --batch-size 50 \
  --delay-ms 1000 \
  --max-rows 50
```

Check database health and Postgres logs before increasing the run. The script defaults to 100 rows per call, waits 500ms between calls, and refuses batch sizes above 250.

The database function:

- matches only on `(local_authority_code, reference)`
- updates only applications missing either coordinate
- preserves applications that already have complete coordinates
- is service-role only
- accepts no more than 250 rows per call
- has a 10-second statement timeout

The existing planning-coordinate trigger derives PostGIS `location_geog` from the newly populated ITM coordinates.

## Operational rule

Do not combine ArcGIS fetching and Supabase writes in one loop. A complete external snapshot should be available first. This makes source acquisition retryable without database impact and makes internal hydration independently resumable and throttleable.
