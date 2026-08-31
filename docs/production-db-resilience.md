# Production database resilience

## 2026-08-31 incident finding

`PGRST002` was a symptom, not a missing schema. During the incident direct SQL intermittently remained available while PostgREST catalog work and indexed application reads expanded from milliseconds to 13–48 seconds. PostgreSQL logged statement cancellations, long checkpoints, connection resets, dynamic-shared-area attachment failures and parallel-worker exits. Planning and PPR failed together.

The restart restored service by clearing the saturated process/cache state. Immediately afterward there were 16 of 60 connections, no blockers, no idle transactions and no queries older than ten seconds. The instance has a small resource envelope (about 224 MB `shared_buffers`, 384 MB `effective_cache_size`, 2.1 MB `work_mem`, and two parallel workers). Within four minutes of the cold restart it had read about 200 MB of database blocks. Cold-cache request fan-out and overlapping maintenance can therefore exhaust I/O and memory headroom without a lock or one intrinsically bad query.

The precomputed Planning locality sitemap query returned all 2,358 memberships in about 56 ms after restart. The product expansion itself is not the pathological operation. Repeated reconstruction, broad page fan-out and cold reads were the multipliers.

## Synchronous request audit

The values below are cold-request upper bounds from the route/data-loader call graph before this resilience change. Cache hits reduce them, while a cache miss inside a loader can add a call.

| Surface | Before | Principal multiplier | Current containment |
| --- | ---: | --- | --- |
| Homepage | 8 top-level loaders | Planning, PPR and analytics launched together | every upstream call has an 8-second budget; optional Planning sections fail open |
| `/planning` | 3–6 | recent rows, aggregate/dashboard, filters, council activity and locality redirect lookup | cached compact RPCs; individual calls bounded |
| `/planning/applications` | 3–6 | same dashboard path plus filtered result/count query | individual calls bounded; optional aggregates fail open |
| Planning locality | 2–4 per member | dashboard, notables and aggregate place members | locality membership is precomputed; individual calls bounded |
| Planning detail | 1 core + 2–5 supporting | canonical row, timeline, area candidates and nearby sales | React/cache de-duplicates core lookup; timeline and research fail open; all calls bounded |
| Global search | 3–5 | aliases, places, Planning and optional address/sale lookup | cached for one hour; bounded calls; outer handler returns a degraded result |
| Search suggestions | 2 | Planning directory plus PPR place suggestions | both optional, cached at CDN, bounded and fail open |
| Sold-price locality | 3 + N nearby areas | a full insight query was issued for every nearby card | N per-neighbour insight reads removed; cards use maintained `ppr_area_stats` rows |
| Planning category | 2–3 | large category index plus application hydration | snapshot/cache path retained; bounded calls |

Supabase JS automatic PostgREST retries are disabled. A shared fetch budget aborts an upstream request after eight seconds and emits sanitized slow/timeout diagnostics containing only the API pathname, duration, status and timeout classification. Query strings and user values are not logged. This turns global database pressure into a bounded degraded response rather than a 300-second serverless wait.

## Background work

The repository has a dense 05:00–08:00 UTC maintenance cluster. Description catch-up remains outside that window and its throughput must not be raised. Each workflow retains its own concurrency group so reruns of the same maintenance task cannot overlap. GitHub concurrency groups cannot safely be shared across every workflow: GitHub retains only one pending run per group, so a common group would silently displace other scheduled work. Until a durable database-backed maintenance lease is introduced, avoid manually starting a heavy job while another heavy workflow is active.

The sitemap publisher runs at 09:20 UTC, uses one direct connection, sequential bounded reads and precomputed membership tables. A failure preserves the committed last-known-good artifact.

## Incident runbook

1. Pause or cancel only clearly heavy maintenance: description/historical catch-up, notable reconciliation, locality cohort refresh, Planning/PPR ingestion and repair jobs. Do not cancel alert delivery or normal user sessions indiscriminately.
2. Compare a direct `select 1` with a one-row REST read. If SQL works but REST fails, inspect PostgREST connection/catalog health; do not infer a missing schema from `PGRST002`.
3. Capture connection counts by role/state, blockers, oldest transaction, active statements over ten seconds, `pg_stat_statements`, checkpoint/WAL counters and recent Postgres/API logs before restarting.
4. Treat more than 80% connection use, any old idle-in-transaction session, growing blockers, repeated statement timeouts, or indexed reads above two seconds as unhealthy. Keep maintenance paused until two consecutive checks are clean.
5. Cancel only identified pathological maintenance statements. A restart is a last-resort recovery action because it destroys the active-session evidence and produces a cold cache.
6. Resume one maintenance workflow at a time. Recheck REST latency, connections and statements after each; stop if indexed reads exceed two seconds or timeout errors recur.

The temporary 60-second authenticator timeout used during recovery is not the durable solution. Runtime callers fail sooner, and PostgREST role configuration should return to a modest ceiling after schema-cache recovery is confirmed.
