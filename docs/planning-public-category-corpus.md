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

The dedicated manually dispatched GitHub workflow defaults to read-only `audit`
mode. Its one-tranche and serial apply modes additionally require
`confirm_apply=true`, and every write command passes the explicit `--apply` flag
to the strictly bounded script. The write job shares the
`openlist-db-maintenance` concurrency lane with other heavy audits. It has no
schedule and cannot start the historical backlog without an operator dispatch.
The separate daily classifier remains limited to recently changed rows (eight
batches of 250); it maintains newly ingested/edited records but never starts the
historical repair backlog.

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
156 full 2,500-row tranches and one final tranche of about 1,563 rows. The serial
driver calls the existing bounded implementation once per tranche; it does not
change its 250 x 10 limits.

Before the first run, confirm PR #140 is deployed on `main`, no other database
maintenance workflow is running, and baseline health is normal. The GitHub job
enters the shared `openlist-db-maintenance` concurrency lane and never overlaps
serial tranches.

### Phase A: three-tranche canary

Merge and deploy #140, then start exactly three bounded production tranches:

```sh
gh workflow run planning-public-category-reconciliation.yml --ref main \
  -f mode=serial-apply \
  -f confirm_apply=true \
  -f cursor=00000000-0000-0000-0000-000000000000 \
  -f max_batches=10 \
  -f max_runs=3 \
  -f pause_seconds=20
```

Record its run ID and inspect application/Data API health. To run another
three-tranche canary from the saved cursor:

```sh
gh workflow run planning-public-category-reconciliation.yml --ref main \
  -f mode=serial-apply \
  -f confirm_apply=true \
  -f max_batches=10 \
  -f max_runs=3 \
  -f pause_seconds=20 \
  -f resume_run_id=<CANARY_RUN_ID>
```

The workflow downloads the prior run's state artifact. It refuses a corrupt,
missing, wrong-mode or inconsistent state rather than restarting from zero.

### Phase B: serial completion

After the canary is healthy, continue from the most recent successful serial run.
`max_runs=200` is only an execution ceiling; the driver stops as soon as the
corpus reports complete:

```sh
gh workflow run planning-public-category-reconciliation.yml --ref main \
  -f mode=serial-apply \
  -f confirm_apply=true \
  -f max_batches=10 \
  -f max_runs=200 \
  -f pause_seconds=20 \
  -f resume_run_id=<LATEST_SUCCESSFUL_SERIAL_RUN_ID>
```

After each successful tranche the driver atomically replaces its JSON state file,
prints one concise summary, runs one Data API probe, optionally runs one cheap
database health query, and pauses for 20 seconds before continuing. The state
contains the last successful cursor, completed tranches, scanned/inserted/updated/
unchanged totals and timestamp. A failed health probe stops the job after the
successful cursor has been saved, so resumption does not repeat earlier ranges.

With 156 inter-tranche pauses, the default pause contributes about 52 minutes.
Allowing roughly 10–25 minutes for the sequential reads/upserts and health probes,
the expected end-to-end duration is approximately 60–80 minutes. The workflow
timeout is 120 minutes.

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
UUID ordering is not a time ordering and provides no snapshot across the serial
run.

### Automatic stop conditions

The driver stops without starting another tranche when:

- a tranche throws or reports a failure;
- the cursor is absent, malformed, inconsistent or does not advance;
- bounds or scanned counts differ from 250 x 10 / 2,500;
- the Data API probe times out after eight seconds or returns non-2xx;
- the optional direct DB probe sees a lock waiter, idle transaction or another
  query active for more than 30 seconds;
- state cannot be atomically persisted.

There are no automatic retries. Resume explicitly using the stopped workflow's
artifact only after the underlying condition is understood.

### Phase C: one final full audit

Run the complete read-only count audit once after serial completion:

```sh
node scripts/audit-planning-public-category-corpus.mjs \
  --output=artifacts/planning-public-category-final-audit.json
```

### Final gate for PR #141

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

1. Deploy the classifier/reconciliation PR and run the three-tranche canary.
2. If health remains normal, resume serial completion from the saved artifact.
3. Re-run the full read-only count audit and require every final gate above.
4. Only then deploy the stacked pagination/RPC PR.
5. Verify page 1/page 2, authority filtering and locality summaries in production.

The failure mode during steps 1–3 is the existing incomplete category UI, not a
database fan-out. After step 4, a database outage can still make an uncached
category detail request fail, but it cannot trigger classification or repair work;
cached responses remain available under the existing six-hour application cache.
