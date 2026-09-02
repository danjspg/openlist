# Production database resilience

## 2026-08-31 incident finding

`PGRST002` was a symptom, not a missing schema. During the incident direct SQL intermittently remained available while PostgREST catalog work and indexed application reads expanded from milliseconds to 13–48 seconds. PostgreSQL logged statement cancellations, long checkpoints, connection resets, dynamic-shared-area attachment failures and parallel-worker exits. Planning and PPR failed together.

The restart restored service by clearing the saturated process/cache state. Immediately afterward there were 16 of 60 connections, no blockers, no idle transactions and no queries older than ten seconds. The instance has a small resource envelope (about 224 MB `shared_buffers`, 384 MB `effective_cache_size`, 2.1 MB `work_mem`, and two parallel workers). Within four minutes of the cold restart it had read about 200 MB of database blocks. Cold-cache request fan-out and overlapping maintenance can therefore exhaust I/O and memory headroom without a lock or one intrinsically bad query.

The precomputed Planning locality sitemap query returned all 2,358 memberships in about 56 ms after restart. The product expansion itself is not the pathological operation. Repeated reconstruction, broad page fan-out and cold reads were the multipliers.

## Synchronous request audit

These are approximate PostgREST calls on a cold Data Cache miss. A warm shared
cache/ISR hit performs zero database work. “Dynamic shell” means Vercel invokes
the route, but its data still comes from shared tagged caches; it does not mean
one database read per visitor.

| Surface | Before | After | Cache/rendering | Link prefetch | Failure behaviour |
| --- | ---: | ---: | --- | --- | --- |
| Homepage | about 15–17 | 6, including two-step notable hydration; no more than four concurrent | dynamic shell; all data cached for 6h and publication-tagged | off for data routes | optional blocks disappear; core navigation remains |
| `/planning` | 6–8 | 6 cold, 0 warm | dynamic shell to keep builds DB-free; shared snapshots/data caches | off | snapshot/recent/locality/notable sections fail open |
| Filtered Planning search | 3–6 | 1 bounded result/count query | explicitly dynamic, `noindex, follow` | off | core query fails once; no aggregate fallback or retry |
| Authority Planning page | 3–4 | 3 cold, 0 warm | on-demand ISR, 6h | off | directory and optional metrics can be omitted |
| Planning locality page | 6–8 | 1 compact RPC | on-demand ISR plus 6h page-model cache | off | stale model is retained; cold failure renders a degraded shell without reconstruction |
| Planning area directory | 1–3 plus speculative destination renders | 1–3 paged snapshot reads, 0 warm | dynamic shell because it has query-state and must keep builds DB-free | off for every locality/authority destination | stale cache retained; cold failure renders an empty directory, not a rebuild |
| Planning detail | 1 core + 2–5 supporting | unchanged intentionally | exact row cached indefinitely; supporting context cached and fail-open | off on all inbound public lists | exact-record lookup remains core; timeline/context may be omitted |
| Planning category | 1 exact paginated RPC | 1 exact paginated RPC | dynamic query shell; RPC cached for 6h | off | cached data is retained; no page-time text classification |
| Sold-prices hub | 8–9 | 4 cold, 0 warm; spotlights collapsed from four reads to one | dynamic shell; shared snapshot caches | off | optional cards become neutral/empty |
| Sold-price locality | 3 + N nearby-area analytics | 2 (snapshot + bounded recent rows) | on-demand ISR, 6h | off | stale snapshot retained; cold failure omits insights and sales |

Planning status search still uses the existing indexed normalized-status plan;
the `decision_made` index fix and exact Planning lookup index were not changed.
No duplicate indexes were added.

Supabase JS automatic PostgREST retries remain disabled. A shared fetch budget
aborts an upstream request after eight seconds. Optional/decorative reads also
use a small process-local breaker: at most four run concurrently per server
instance, three recent 429/5xx/timeout failures open it for 15 seconds, and core
exact-record/search reads are never blocked by it. Serverless instances do not
share breaker state, which is intentional: it provides bounded local shedding,
not a distributed availability claim. Logs contain only the API pathname,
duration/status and a classification; query strings and user values are omitted.

## Cache and failure model

Public snapshots are read first. A snapshot loader throws on an upstream error
so `unstable_cache` cannot replace a last-known-good value with an empty result;
the public wrapper catches outside the cache and returns a neutral optional
section only when no stale value is available. Live requests never fall from
`openlist_planning_dashboard_snapshot` into
`openlist_planning_dashboard_aggregate`, and PPR comparison pages never rebuild
analytics from the sales corpus. The compact locality RPC reads the maintained
membership snapshot and only bounded, index-backed recent/decision/notable rows.
It does not call a locality refresh function.

The homepage, Planning hub, Planning directory and sold-prices hub deliberately
remain dynamic shells without a page-level `revalidate`: pre-rendering those
fixed routes would make `next build` contact Supabase. Their loaders provide the
shared cache. Parameterised authority/locality pages use on-demand ISR because
`generateStaticParams()` is empty, so builds still perform zero Supabase reads.
The build audit fails if a build-time Supabase fetch is attempted.

## Background work

The repository has a dense 05:00–08:00 UTC maintenance cluster. Description catch-up remains outside that window and its throughput must not be raised. Classification, notable-quality, lifecycle-consistency, integrity, appeal processing and sitemap publication now share `openlist-db-maintenance`; schedules are spaced so that the group is unlikely to accumulate multiple pending runs. GitHub retains only one pending run per concurrency group, so do not compress these schedules or manually queue several shared-lane jobs at once. This change does not increase job cadence, concurrency, timeout or retries.

Historical ACP acquisition and internal processing remain separate jobs and
checkpoints. A manual `process_only` dispatch skips ACP entirely and consumes
only `planning_appeal_processing_queue`. Internal processing is capped at 25
rows per RPC and 10 batches for the historical job (20 for the weekly job),
stops on the first unavailable/error result and records its own
`acp_internal_processing` state. It does not run the population-wide unlinked
case rediscovery query. Queue rows already committed by earlier batches are the
resume position; retrying cannot re-download or duplicate the acquired source.

The sitemap publisher runs at 09:20 UTC, uses one direct connection, sequential bounded reads and precomputed membership tables. A failure preserves the committed last-known-good artifact.

## Maintenance outcome model

Routine audits distinguish these outcomes:

- `healthy`: verification completed and the checked state is acceptable.
- `mismatch`: the source was positively verified and disagrees with OpenList.
- `unavailable`: verification could not complete, including PostgreSQL `57014`.
- `error`: OpenList's workflow, configuration or write path failed.
- `source_degraded`: an external provider was partially unavailable or rate-limited while OpenList remained resumable.

Only `mismatch` can authorise an existing narrowly scoped repair. `unavailable`
never authorises repair and does not create a lifecycle-contradiction issue.
The lifecycle audit stops its remaining RPCs after an unavailable check rather
than amplifying saturation. A previously verified high-severity mismatch stays
actionable even if a later check is unavailable.

The notable-quality audit honours bounded `Retry-After` delays for 429s. A
partial provider failure is reported as `source_degraded`; more than 50 source
failures, more than 10% of the checked corpus, or a non-404 source failure on a
candidate that has remained unverified for seven days is actionable. Database/update
errors remain `error`, and positively verified repair candidates remain
`mismatch`.

Sitemap requests never use the live database. Refresh generation uses the
existing category-membership GIN index and samples at most three members per
public category instead of loading a 50,000-row corpus through the retired RPC.
If refresh is unavailable, the committed snapshot remains active. That
condition is non-actionable for up to 72 hours, then turns red so a persistently
stale crawler surface cannot be hidden.

## Incident runbook

1. Pause or cancel only clearly heavy maintenance: description/historical catch-up, notable reconciliation, locality cohort refresh, Planning/PPR ingestion and repair jobs. Do not cancel alert delivery or normal user sessions indiscriminately.
2. Compare a direct `select 1` with a one-row REST read. If SQL works but REST fails, inspect PostgREST connection/catalog health; do not infer a missing schema from `PGRST002`.
3. Capture connection counts by role/state, blockers, oldest transaction, active statements over ten seconds, `pg_stat_statements`, checkpoint/WAL counters and recent Postgres/API logs before restarting.
4. Treat more than 80% connection use, any old idle-in-transaction session, growing blockers, repeated statement timeouts, or indexed reads above two seconds as unhealthy. Keep maintenance paused until two consecutive checks are clean.
5. Cancel only identified pathological maintenance statements. A restart is a last-resort recovery action because it destroys the active-session evidence and produces a cold cache.
6. Resume one maintenance workflow at a time. Recheck REST latency, connections and statements after each; stop if indexed reads exceed two seconds or timeout errors recur.

The temporary 60-second authenticator timeout used during recovery is not the durable solution. Runtime callers fail sooner, and PostgREST role configuration should return to a modest ceiling after schema-cache recovery is confirmed.
