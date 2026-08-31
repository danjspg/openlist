# Planning public category corpus

## Failure and root cause

Public Planning category pages previously reconstructed category membership from
`openlist_planning_public_category_index`. The application requested only 5,000
rows even though 7,463 active notable rows existed on 31 August 2026. Padel was
not a deterministic notable category at all, and wind, solar and battery subtypes
were inferred from proposal text after the bounded index had been loaded. This
made the category corpus incomplete before pagination or rendering began.

`planning_seo_notable.notable_categories` is now the public category source of
truth. `classifyPlanningNotability` owns both the existing internal categories and
the 15 exact public slugs. Ingestion and reconciliation use that same function;
category requests do not classify or search proposal text.

## Production audit baseline

This read-only audit was generated at 2026-08-31T20:43:39Z. It scanned 391,563
applications using one connection and 392 sequential 1,000-row UUID-keyset
batches. Each statement retained the existing eight-second timeout. No write,
retry, concurrent query or long-lived transaction was used.

The rollout baseline was re-run at 2026-08-31T21:08:35Z with identical counts.
The machine-readable artifact is
`docs/planning-public-category-baseline-2026-08-31.json`.

“Represented before” means a canonically qualifying application already had an
active `planning_seo_notable` row. “Exact before” means that row already held the
new public slug. The projected after column is reached only after the bounded
reconciliation has completed; this PR does not auto-run that backfill.

| Public category | Qualifying source | Represented before | Missing notable rows | Exact before | Membership repairs required | Projected exact after |
|---|---:|---:|---:|---:|---:|---:|
| padel | 197 | 9 | 188 | 0 | 197 | 197 |
| residential-development | 3,270 | 3,061 | 209 | 0 | 3,270 | 3,270 |
| large-residential | 3,312 | 2,263 | 1,049 | 0 | 3,312 | 3,312 |
| wind-farms | 489 | 91 | 398 | 0 | 489 | 489 |
| solar-energy | 603 | 142 | 461 | 0 | 603 | 603 |
| battery-storage | 208 | 80 | 128 | 0 | 208 | 208 |
| retail | 712 | 163 | 549 | 163 | 549 | 712 |
| hotels-restaurants | 2,061 | 560 | 1,501 | 0 | 2,061 | 2,061 |
| student-accommodation | 64 | 41 | 23 | 41 | 23 | 64 |
| data-centres | 94 | 36 | 58 | 0 | 94 | 94 |
| infrastructure | 2,012 | 370 | 1,642 | 306 | 1,706 | 2,012 |
| transport | 527 | 124 | 403 | 123 | 404 | 527 |
| industrial-logistics | 2,315 | 474 | 1,841 | 0 | 2,315 | 2,315 |
| waste-recycling | 656 | 91 | 565 | 0 | 656 | 656 |
| quarrying | 694 | 158 | 536 | 0 | 694 | 694 |

All categories have material gaps. Padel’s canonical count is 197, nine were
represented, and 188 active notable rows were missing. Zero production rows have
been repaired by this unmerged implementation; 197 Padel membership writes are
required because even the nine represented rows lack the exact `padel` slug.

## Safe reconciliation

The default audit is read-only:

```sh
node scripts/reconcile-planning-public-categories.mjs \
  --batch-size=250 --max-batches=10 --cursor=00000000-0000-0000-0000-000000000000
```

Apply mode must be explicit:

```sh
node scripts/reconcile-planning-public-categories.mjs --apply \
  --batch-size=250 --max-batches=10 --cursor=<nextCursor>
```

The script refuses a batch size outside 1–250, a batch count outside 1–10, a
non-integer bound, or a non-UUID cursor before its first database read. Every run
is therefore limited to 2,500 scanned rows. It scans in UUID order,
returns `nextCursor`, and reports scanned, matched, inserted, updated, unchanged
and failed counts plus elapsed time. A progress line containing the last safely
committed cursor is emitted after every batch, so termination before the final
artifact does not lose the resume position. Reads and writes are serial.
Revalidation queue insertion is
disabled for category-only maintenance, so a repair cannot create a second large
backlog. Persistence preserves press/manual sources, display names, evidence,
aliases and non-deterministic categories. Repeating an applied batch is
idempotent.

The GitHub workflow defaults manual runs to read-only `category-audit` mode.
`category-reconcile` additionally requires the explicit `apply` input. It shares
the `openlist-db-maintenance` concurrency lane with other heavy audits. The daily
scheduled classifier remains limited to recently changed rows (eight batches of
250); it maintains newly ingested/edited records but never starts the historical
repair backlog.

The complete count audit is also read-only:

```sh
node scripts/audit-planning-public-category-corpus.mjs \
  --output=artifacts/planning-public-category-audit.json
```

## Production reconciliation runbook

Reconcile the application corpus once for all categories. The canonical
classifier emits every matching public slug during the same row scan. Running 15
category-specific scans would multiply reads, cursor state and operational risk
without improving correctness.

The current 391,563-row corpus requires `ceil(391563 / 2500) = 157` apply runs:
156 full 2,500-row runs and one final run of about 1,563 rows. The operator must
start every run explicitly. Do not script a loop over workflow dispatches.

Before the first run, confirm PR #140 is deployed on `main`, no other database
maintenance workflow is running, and the baseline health checks below pass. Use
the GitHub workflow rather than invoking Node directly so the work enters the
shared `openlist-db-maintenance` concurrency lane.

First production apply run:

```sh
gh workflow run planning-notable-classification.yml --ref main \
  -f mode=category-reconcile \
  -f apply=true \
  -f cursor=00000000-0000-0000-0000-000000000000 \
  -f max_batches=10
```

Record the workflow run ID, download its artifact, and copy `nextCursor` exactly.
For run 2 and every subsequent run:

```sh
gh workflow run planning-notable-classification.yml --ref main \
  -f mode=category-reconcile \
  -f apply=true \
  -f cursor=<PREVIOUS_NEXT_CURSOR> \
  -f max_batches=10
```

After each apply and its health checks, rerun the same tranche in read-only mode
using that tranche's **start** cursor:

```sh
gh workflow run planning-notable-classification.yml --ref main \
  -f mode=category-audit \
  -f apply=false \
  -f cursor=<TRANCHE_START_CURSOR> \
  -f max_batches=10
```

The audit's final cursor must equal the apply run's final cursor, failures must be
zero, and inserted/updated must both be zero. Because audit mode passes
`dryRun: true`, it only reads `planning_applications` and existing
`planning_seo_notable` rows; it never calls an upsert or the revalidation queue.

Cursor predicates are exclusive (`id > cursor`). `nextCursor` is the final row of
the last successfully persisted batch. A successful range can be skipped on the
next run. If a read/write response fails, the report retains the cursor from
before that batch. Replaying from that cursor is safe even if an upsert committed
before the response was lost, because the upsert and category merge are
idempotent. Do not advance from a cursor printed only as an input or from a failed
batch's last row.

Newly ingested rows are classified by the same canonical writer after #140 is
deployed. A record changed after its range was scanned is handled by the existing
bounded recent-change classifier. The final full audit remains mandatory because
UUID ordering is not a time ordering and provides no snapshot across 157 manual
runs.

### Safety gate after every apply tranche

Do not dispatch the next apply until all checks pass:

1. The reconciliation artifact reports at most 2,500 scanned rows, zero failures,
   and an exact `nextCursor` (or `complete: true` on the last run).
2. The read-only replay reports zero would-insert and zero would-update rows.
3. PostgreSQL has no query active for more than 10 seconds, idle transaction, or
   lock waiter:

   ```sql
   select
     count(*) filter (where state = 'active' and now() - query_start > interval '10 seconds') as long_active,
     count(*) filter (where state = 'idle in transaction') as idle_in_transaction,
     count(*) filter (where wait_event_type = 'Lock') as lock_waiters
   from pg_stat_activity
   where datname = current_database();
   ```

4. Three uncached/simple Data API reads and representative Planning requests have
   no material latency increase, 5xx burst or `PGRST002` response compared with
   the pre-run baseline.
5. GitHub Actions shows no overlapping ingestion, description catch-up, locality
   refresh, PPR repair, notable quality or integrity job. The shared concurrency
   group serializes workflows that use it, but the operator must also inspect
   independently grouped ingestion workflows.
6. The run ID, start cursor, final/next cursor, elapsed time and all counters are
   recorded in the incident/rollout log.

Stop immediately on any statement timeout, Data API 5xx/PGRST002, lock waiter,
idle transaction, unexplained failure, missing cursor artifact, sustained
Planning latency regression, or unexpected concurrent maintenance. Do not retry
the failed run in a loop. Allow the database to return to its normal baseline,
investigate, and then explicitly replay from the last safe cursor.

### Final gate for PR #141

After `complete: true`, run the full direct, read-only audit command shown above.
For every category require:

- `exactMembership == qualifying`;
- `exactMembershipMismatches == 0`;
- `repairsRequired == 0`;
- `missing == 0`.

Also repeat the database/Data API health checks. Only then apply #141's
function-only migration and merge #141. PR #140 itself contains no migration or
DDL. The stacked #141 migration only executes `create or replace function`,
`revoke`, and `grant`; it creates no table/index, rewrites no data, and requests no
table-level `ACCESS EXCLUSIVE` lock.

## Page rollout and database load

Page rollout is intentionally separate from reconciliation. Do not deploy the
exact-membership page reader until the full cursor sweep has completed and a
second count audit reports `exactMembership == qualifying` for every category.

The page migration adds one SQL function and no table rewrite or index build. A
plain production `EXPLAIN` confirmed exact membership uses the existing partial
GIN index (`planning_seo_notable_categories_gin_idx`) with a bitmap index/heap
plan. Each request performs one RPC, limits rows to 25 (hard maximum 40), and
calculates counts from the matching category cohort. It never runs `ILIKE`, the
classifier, locality reconstruction, or a per-row hydration fan-out. Authority
filtering is part of the same RPC. Locality pages retain their independent
three-card-per-category summary limit.

Rollout order:

1. Deploy the classifier/reconciliation PR.
2. Run read-only category audits and then bounded apply runs, resuming from the
   reported cursor. Stop if normal database latency or session pressure rises.
3. Re-run the full read-only count audit. Require no missing exact membership.
4. Deploy the stacked pagination/RPC PR.
5. Verify page 1/page 2, authority filtering and locality summaries in production.

The failure mode during steps 1–3 is the existing incomplete category UI, not a
database fan-out. After step 4, a database outage can still make an uncached
category detail request fail, but it cannot trigger classification or repair work;
cached responses remain available under the existing six-hour application cache.
