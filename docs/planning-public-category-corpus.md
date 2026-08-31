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

The script clamps every run to at most ten batches of 250, scans in UUID order,
returns `nextCursor`, and reports scanned, matched, inserted, updated, unchanged
and failed counts. Reads and writes are serial. Revalidation queue insertion is
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
