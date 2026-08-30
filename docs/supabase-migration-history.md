# Supabase migration history

Production is the authority for historical migration version numbers.

On 30 August 2026 the repository migration archive had drifted from the versions recorded in `supabase_migrations.schema_migrations`: many SQL files represented the same logical migration under a different timestamp, several production-only migrations were absent from the repository, three local EPlan helper migrations had never been recorded as production migrations, and two local files shared the same migration timestamp.

The archive was reconciled without changing production migration history:

- SQL files with a clear one-to-one production migration were renamed to the production version while preserving their existing blob/content.
- Production-only historical versions were added as explicit archival no-op entries where their final effects are superseded by later canonical migrations. These entries exist only to make the repository history agree with the already-applied production history; they must never be treated as evidence that the historical SQL body was reconstructed exactly.
- Local-only EPlan helper migrations were moved to `supabase/migration_archive/` so Supabase CLI does not attempt to apply versions that production never recorded. Their later required effects are covered by subsequent canonical migrations.
- The duplicate local `20260826214500` version was resolved by restoring the two distinct production versions.

## Rule going forward

Never rename an applied migration or create a second timestamp for an already-applied logical migration. Once a migration reaches production, its version is immutable and the repository file must retain that exact version. External/manual DDL should be followed immediately by a repository migration-history reconciliation before further migrations are added.

Before rollout of a new migration, compare the local migration list with production. A mismatch is an archive/observability problem; do not use a blanket `migration repair` to make the error disappear.

The reconciliation itself intentionally performs no production writes.