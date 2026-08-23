# OpenList production performance sweep methodology

Performance checks must test both the user-visible route and the data path that route depends on. A fast CDN/ISR response is not evidence that the underlying fallback is healthy.

## 1. Public route latency

Run `npm run perf:routes` against production at low rate. Sample representative route classes, not just one example of each product surface:

- Home and top-level product pages.
- Snapshot-backed Planning authority pages, including at least one large authority and two previously problematic authorities.
- Planning area-filter searches and locality SEO pages.
- Sold Prices national, county and locality pages.
- Dynamic/no-store routes.
- Sitemap and robots routes.

Record status, TTFB, total response time, payload size, `x-vercel-cache`, `age` and cache-control. Measure both first/cold-ish and repeated/warm behaviour where meaningful.

## 2. Snapshot/cache coverage

For every database snapshot or precomputed table used to protect a public route, verify live coverage rather than assuming the refresh job completed.

For Planning dashboard snapshots, compare the distinct authority codes in `planning_applications` with `planning_dashboard_snapshots` and require:

- one `NATIONAL` snapshot;
- one snapshot for every authority represented in the corpus;
- a recent `refreshed_at` appropriate to the ingestion cadence.

A missing snapshot is a performance failure even when a cached production page is currently fast, because it makes the expensive fallback reachable.

## 3. Forced fallback/data-path benchmark

Benchmark the underlying RPC/query paths independently of Vercel/Next caching. Do not delete production snapshots merely to force a miss. Instead call or `EXPLAIN (ANALYZE, BUFFERS)` the underlying fallback functions directly with representative parameters.

At minimum test:

- unfiltered national Planning aggregate;
- unfiltered authority aggregate for a large authority and previously problematic authorities;
- authority + area aggregate;
- national + area aggregate;
- result-list queries that request exact counts;
- any new filter/facet combination introduced by product changes.

No request-path database function should operate close to its statement timeout. Treat less than roughly 2x safety margin as a warning even if the query technically succeeds.

## 4. Query-cost sweep

Review `pg_stat_statements` for:

- highest cumulative execution time;
- high mean execution time with meaningful call volume;
- functions near statement timeout;
- user-facing SELECT/RPC work separately from backfills, migrations and maintenance jobs.

A route can look fast from cache while still generating excessive database work from uncached searches or refreshes.

## 5. Failure-path review

For every optimisation that depends on a cache, snapshot, derived table or scheduled refresh, answer explicitly:

1. What happens when the fast-path data is missing?
2. Can one slow authority/partition abort refreshes for all later ones?
3. Is failure visible in QA/monitoring, or does the app silently fall back?
4. Does the fallback preserve correctness as well as availability?

Batch refreshers should be resilient where practical: one failed partition should not prevent unrelated snapshots from being refreshed, and failures should be reported explicitly.

## 6. Regression rule

When a production performance defect is found, add its route shape and underlying query shape to this methodology or the benchmark script. Do not close the defect based only on a warm route response.
