# OpenList Vercel usage investigation

Investigation date: 10 August 2026
Scope: production diagnostics only; no production code, configuration, Vercel settings, deployment behaviour, database schema, or crawler controls were changed.

## Executive conclusion

The most likely cause of the 9–10 August traffic burst is an external crawler wave triggered by the 9 August property-intelligence release, not a client-side loop, cron job, surviving Playwright run, or application recursion.

**Confidence: Medium.** The causal chain is strong, but Vercel Hobby retains raw request logs for only one hour, so the 17:00–03:00 UTC request rows had expired before this investigation began. The conclusion therefore combines the supplied 12-hour Observability totals and timeline with repository/deployment evidence and two contiguous retained production samples from 08:22–08:35 UTC.

The strongest evidence is:

1. Production deployment `cd9d428` went live at 15:46:17 UTC on 9 August.
2. That release expanded the sitemap from approximately **73 URLs to 5,105 URLs**—about a **70× increase**—including 5,000 indexable planning-detail pages and 31 planning-authority pages.
3. The retained 99 unique production requests were **100% self-identified crawlers**: ClaudeBot 75, Googlebot 13, bingbot 8, and PetalBot 3.
4. The retained route mix closely resembles the supplied aggregate function ratio: **93/99 (93.9%)** retained requests invoked a function, compared with about **37K/40K (92.5%)** in the supplied 12-hour screenshots.
5. **45/99** retained requests were planning-detail pages, **30/99** were planning/search pages, and **90/99** were cache misses.
6. Internal planning links expose crawlable `area`, `status`, and `type` combinations, while each filtered planning request can fetch and process as many as **44,500 planning rows**. The retained sample already shows those combinations being followed by bots.
7. Vercel activity, GitHub Actions, deployment history, repository schedules, and the current process audit found no post-development job capable of generating tens of thousands of production requests.

This is a **significant efficiency issue**, even though the immediate 12-hour Active CPU figure was only about seven minutes. The public site has a large crawl surface attached to uncached dynamic rendering, and some crawler-reachable filters perform full-dataset work. The traffic itself is ordinary crawler behaviour; the expensive application response to it is the scaling issue.

## Key numbers

### Supplied Vercel Observability numbers (last 12 hours)

| Metric | Supplied value |
|---|---:|
| Edge Requests | ~40,000 |
| Vercel Function invocations | ~37,000 |
| Middleware invocations | ~2,600 |
| Fast Data Transfer | ~433 MB |
| Active CPU | ~7 minutes |
| Function errors | ~0% |
| Timeouts | ~0.3% |
| Burst peaks | ~1,500–1,800 requests per graph interval |

These are screenshot/context values supplied with the task; the Hobby account did not permit their historical export through the metrics API.

### Retained raw-log sample

| Measure | Result |
|---|---:|
| Window covered | 08:22:30–08:35:14 UTC, 10 August |
| Unique requests | 99 |
| GET requests | 99 (100%) |
| Self-identified bots | 99 (100%) |
| Requests invoking a Vercel Function | 93 (93.9%) |
| Requests involving middleware | 13 (13.1%; overlaps function requests) |
| Static requests | 4 (4.0%) |
| Cache MISS | 90 (90.9%) |
| HTTP 200 | 85 |
| HTTP 404 | 8 |
| HTTP 504 | 1 |
| Incomplete/no status at capture | 5 |
| Requests with meaningful `area`, `status`, `type`, or `q` parameters | 37 |
| Unique sanitized query fingerprints | 93 |

`requestDurationMs` in these logs is wall-clock duration, not Active CPU. The sample accumulated about 116 minutes of overlapping wall duration, including requests lasting up to 300 seconds, without implying 116 minutes of CPU.

## Vercel access and production state

- The repository is linked through `.vercel/project.json`.
- Project ID: `prj_B0Xv1saCD6kpikTddQIz7CIbsTVG`.
- Team ID: `team_ETMDWzXyHeT4h44JaGEATZDn`.
- Team/project: `danjspgs-projects/openlist`.
- Vercel CLI: 58.9.0; authenticated as `danjspg`.
- Current production deployment: `dpl_DJTwJyQE14Z7mgBCpJhTus6Mqbn1`.
- Deployment commit: `cd9d4284e164e3f63fe2de026ea106dc074311eb`, “Launch OpenList property intelligence experience”.
- Deployment event: 15:46:17 UTC on 9 August; aliases assigned at 15:47:36 UTC.
- Vercel activity contained no later deployment or setting activity in the incident period.
- The team has two projects: `openlist` and an unchanged `playground` project last updated 57 days earlier.

No authentication, linking, project, team, or deployment state was changed.

## Historical-log limitation

The requested 17:00–03:00 UTC log interval could not be exported because Vercel documents only **one hour of runtime-log retention on Hobby**. Requests with an old `--until` returned a billing-limit error, and the Observability metrics API returned `payment_required` for Observability Plus.

The current Vercel CLI also repeated its first 50-row response when pagination was requested for this project. That duplicate output was detected by request ID, rejected as evidence, and removed. Only unique, directly sanitized request rows are retained in this directory.

Official references:

- [Runtime log retention](https://vercel.com/docs/logs/runtime)
- [`vercel logs` options](https://vercel.com/docs/cli/logs)
- [Observability plan access](https://vercel.com/docs/observability)

Consequences:

- A route-by-route top 20 for the historical 40K requests cannot be stated honestly.
- Period A and Period B user-agent counts cannot be directly compared.
- Historical client IP/network concentration and per-request CPU cannot be recovered.
- The tables below describe the retained contiguous sample, not the expired 12-hour population.

## Traffic source

### Automated agents in the retained sample

| Agent | Requests | Share | Main behaviour |
|---|---:|---:|---|
| ClaudeBot | 75 | 75.8% | 32 planning details, 22 authority pages, 7 `/planning`, 7 `/search`, 7 sold-area pages |
| Googlebot | 13 | 13.1% | 9 planning details, 4 `robots.txt` |
| bingbot | 8 | 8.1% | 4 sold-area pages, 2 sold-county pages, 1 planning detail, 1 `/planning` |
| PetalBot | 3 | 3.0% | 3 planning details |

No Playwright, Puppeteer, headless Chrome, ordinary browser, curl, uptime-monitor, or unknown user agent appeared in these 99 rows. The API response did not expose a client IP, so IP/network grouping was not possible.

An earlier preliminary 50-row read also contained Amazonbot, ChatGPT-User, and Bytespider. It was not retained after the corrected, query-sanitized capture, so those names are supporting context only and are not included in the counts above.

### Highest-volume route patterns in the retained sample

| Rank | Route pattern | Requests | Statuses | Cache misses | Avg wall duration | Function behaviour |
|---:|---|---:|---|---:|---:|---|
| 1 | `/planning/:authority/:reference` | 45 | 32×200, 8×404, 1×504, 4 incomplete | 41 | 63.8 s | Dynamic planning detail |
| 2 | `/planning/:authority` | 22 | 22×200 | 22 | 79.2 s | Dynamic authority dashboard |
| 3 | `/sold-prices/:county/:area` | 11 | 10×200, 1 incomplete | 10 | 54.3 s | Middleware + dynamic area page |
| 4 | `/planning` | 8 | 8×200 | 8 | 78.2 s | Dynamic national dashboard/filter page |
| 5 | `/search` | 7 | 7×200 | 7 | 159.5 s | Dynamic unified search |
| 6 | `/robots.txt` | 4 | 4×200 | 0 | 15 ms | Static/cached |
| 7 | `/sold-prices/:county` | 2 | 2×200 | 2 | 0.5 s | Middleware + dynamic county page |

All methods were GET. Exact-path top-20 data, with public planning references and no query values, is saved in `latest-unique-analysis.json`.

### Retained five-minute timeline

| Bucket UTC | Requests | Function requests | Major paths | Agents |
|---|---:|---:|---|---|
| 08:20 | 26 | 26 | planning detail 17; `/planning` 3; authority 3 | ClaudeBot 24; bingbot 1; PetalBot 1 |
| 08:25 | 30 | 26 | planning detail 9; authority 9; sold area 5 | ClaudeBot 20; Googlebot 7; bingbot 2; PetalBot 1 |
| 08:30 | 40 | 38 | planning detail 16; authority 10; `/search` 4 | ClaudeBot 29; Googlebot 6; bingbot 5 |
| 08:35 (partial) | 3 | 3 | planning detail 3 | ClaudeBot 2; PetalBot 1 |

This is systematic breadth-first crawling: 93 distinct sanitized query/path fingerprints across 99 requests, multiple authorities and references, and no repeated client-side API endpoint pattern.

## Post-development traffic

Development reportedly stopped at approximately 18:00 UK time (17:00 UTC). The supplied graph continued to about 02:00 UTC.

The available evidence explains that continuation as crawler work after deployment:

- Production went live 74 minutes before development stopped.
- The release advertised approximately 5,105 sitemap URLs, about 70 times the previous sitemap size.
- Crawler discovery and traversal need not coincide with the deploy or QA session; bots can fetch the sitemap and fan out for hours afterward.
- The retained morning traffic remained entirely crawler-driven on the same deployment.
- Vercel activity shows no later deployment or project action.
- GitHub Actions shows no workflow run on 9 or 10 August; the latest runs were the weekly 5 August data refreshes.
- The only deployed Vercel cron runs at 09:00 UTC, outside the 18:00–02:00 suspicious period.
- The current process audit found a local `next dev --port 3077` process started on 9 August, but it serves localhost and does not call production. No Playwright, Puppeteer, curl loop, Vercel log stream, production monitor, or detached script targeting `openlist.ie` was present.
- Codex browser-control kernels were still resident, but their process configuration had network disabled. Their presence does not account for production traffic.

Current process state cannot prove that a terminated tool did not run overnight. However, the all-bot retained traffic, release timing, crawler-shaped route breadth, and absence of post-QA jobs make surviving QA the less likely explanation.

### Period A versus Period B

The raw Period A/Period B comparison requested cannot be completed because both periods expired from Hobby logs. The defensible comparison is:

| Evidence | Period A: active QA | Period B: after QA |
|---|---|---|
| Raw user agents/routes | Expired | Expired |
| Deployment/project activity | Production deploy at 15:46 UTC, before the boundary | None after the boundary |
| CI/schedules | None on 9 August | None during 17:00–02:00 UTC |
| Supplied traffic graph | Activity present | Large bursts continued |
| Later retained sample | N/A | 100% crawlers on the same release |

Conclusion: QA may explain some early requests, but it does not plausibly explain the several-hour post-QA pattern by itself. External crawling is the best-supported source of Period B.

## Crawler and SEO findings

### Sitemap expansion

Before `cd9d428`, the sitemap contained approximately:

- 22 static routes,
- 46 non-town sold-price market routes,
- 5 curated sold-price area routes,
- total: approximately **73 URLs**.

After `cd9d428`, it contains approximately:

- 23 static routes,
- 31 planning-authority routes,
- 5,000 planning-detail routes (the explicit default limit),
- 46 non-town sold-price market routes,
- 5 curated sold-price area routes,
- total: approximately **5,105 URLs**.

The database currently contains 44,500 planning applications, but the sitemap intentionally selects the latest 5,000.

`robots.txt` allows all public routes and advertises this sitemap. Planning details declare `index, follow` and canonical URLs. The 5,000-page addition is therefore intentional from an SEO perspective, but it exposed a large cold-render workload in one release.

### Query-parameter crawl surface

The more serious crawler trap is the planning dashboard’s internal link graph:

- `/planning` and `/planning/:authority` render links for council/area, status, and application type.
- `planningFilterHref` preserves existing filters while adding another, allowing crawlers to form combinations.
- Every planning detail links to `/search?q=...` and, when a locality is inferred, to `/planning/:authority?area=...`.
- Sold-area pages link to `/planning?area=...`.
- Filtered planning pages continue to render more filter links.

The combinations are finite rather than literally infinite, and canonical metadata points to base routes. However, canonical tags do not prevent crawlers from fetching the URLs. In the retained 99 requests, 37 contained meaningful `area`, `status`, `type`, or `q` parameters, including combined filters.

The sold-price search pagination is also dynamic, but bots would normally need to discover a structured search URL first; it was not present in the retained sample. No unbounded map-bounds URL or map-movement fetch loop was found.

## Client-side request-loop audit

No autonomous production request loop was found.

- No `setInterval`, SWR refresh interval, React Query refetch interval, `router.refresh()` loop, EventSource, WebSocket, service-worker loop, or page auto-refresh exists.
- `SoldPricesSearchForm` makes one `/api/ppr/area-suggestions` call after a 200 ms debounce while a human types. It cancels the prior request with `AbortController` and does not poll.
- `PlanningResultsView` initializes Leaflet once when the user selects the map. Tiles are requested from OpenStreetMap, not Vercel. Cleanup removes the map.
- Planning-detail map iframes also point to OpenStreetMap.
- Sign-out performs one POST only after a click.
- Authentication effects calculate URLs or contact Supabase only after explicit sign-in submission.
- No server-side internal HTTP fetch to `openlist.ie` was found.
- No script, GitHub workflow, webhook, health check, or monitoring configuration in the repository calls the production URL.

## Server-side compute audit

The production build manifest generated for this release lists only `robots.txt`, `sitemap.xml`, and icon routes as prerendered. Public HTML pages are absent from the prerender manifest. Retained Vercel logs confirm that planning details, authority pages, sold-area pages, search, and the homepage run as functions and predominantly miss cache.

The shared root layout reads cookies through `getCurrentUser()`. That makes request context part of the public layout and prevents broad static/ISR treatment even for anonymous crawler requests. This dynamic-layout characteristic existed in a seller-auth form before the release; the new sitemap made its cost much more visible.

### Ranked likely Active CPU contributors

1. **Filtered `/planning` and `/planning/:authority` pages — highest per-request concern.**
   A filtered request calls `getFilteredPlanningAggregateSummary()`, which calls `getPlanningAggregateRows()` without `unstable_cache`. The national path pages through as many as 44,500 rows in 1,000-row batches, then repeatedly filters, counts, groups, maps, and sorts the arrays in Node. It also runs a separate filtered Supabase result/count query. Crawler-visible filter links make this work repeatable and combinatorial.

2. **`/planning/:authority/:reference` — highest volume concern.**
   Each uncached detail render fetches the planning record, fetches up to 800 PPR area candidates for the county, normalizes and scans those candidates to infer locality, and then queries nearby sales. The shared React cache should deduplicate the planning-record lookup within one render, so no clear N+1 was found, but there is no cross-request cache around the research context.

3. **`/search?q=...` — lower volume, expensive when crawled.**
   Unified search runs place, planning, and sometimes address queries in parallel and performs ranking/sorting. It is explicitly dynamic when a query exists. Seven crawler requests in the sample averaged 159.5 seconds wall time and all missed cache. Long wall time likely reflects external I/O and does not equal CPU, but the route is an avoidable crawler target.

4. **`/sold-prices/:county/:area` — moderate volume.**
   It runs cached area analytics plus uncached nearby-area and planning-application queries and passes through sold-price middleware. Analytics snapshots reduce CPU when present, but anonymous crawler requests still invoke a function.

5. **Unfiltered homepage/planning/sold-price dashboards — latent cost.**
   Several data functions use six-hour `unstable_cache`, which reduces repeat computation. They still render through dynamic public functions, and cold cache entries can load and process large datasets.

### Genuine application inefficiencies

- Public HTML is broadly dynamic despite being largely anonymous and cacheable.
- Planning detail pages are uncached function renders even though they declare six-hour revalidation.
- Filtered planning aggregation loads and processes the whole relevant dataset instead of delegating aggregation/filtering to indexed database queries or precomputed summaries.
- Crawler-visible filter links multiply those full-scan requests.
- Detail-page locality matching fetches up to 800 area rows on each uncached request.
- Long wall durations and a retained 504 show resilience/latency pressure under crawler concurrency, even though the supplied error rate remained near zero.

No recursive fetching, component-level duplicate-request cascade, or conventional N+1 loop was identified as the primary cause.

## Cron and background work

| Source | Schedule | Work | Could explain incident? |
|---|---|---|---|
| Vercel Cron | `0 9 * * *` | GET `/api/cron/viewing-reminders`; checks at most 50 viewings and sends reminders | No. One daily invocation around 09:00 UTC, outside the window |
| GitHub Actions: sold prices | `0 14 * * 3` | Weekly PPR refresh in GitHub runner/Supabase | No. Wednesday only; no 9–10 August run |
| GitHub Actions: planning | `0 15 * * 3` | Weekly Cork and national planning ingestion in GitHub runner/Supabase | No. Wednesday only; no 9–10 August run |

The Vercel cron is valid for Hobby: current Vercel documentation permits once-daily jobs with hourly timing precision. Cron-triggered functions consume normal function usage, but one invocation cannot explain the graph.

Official reference: [Cron Jobs usage and Hobby limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).

No Supabase schedule definition, external webhook loop, uptime monitor, or production-URL background script exists in the repository. External systems not represented in the repository could not be audited, but the retained user agents do not resemble monitors.

## CPU warning reconciliation

The two numbers describe different windows and should not be compared as if they were the same counter:

- **~7 minutes** is the supplied OpenList production Observability selection for the last 12 hours.
- **~75% of 4 hours** is approximately three CPU-hours against the Hobby included-usage allowance, which Vercel describes on a monthly/30-day basis rather than a 12-hour project chart.
- Vercel usage/allowance warnings are team/account scoped; the team has OpenList and one older Playground project. The 12-hour screenshot was scoped to OpenList production.

At 37,000 function invocations, seven Active CPU minutes is about **11 ms of Active CPU per invocation on average**. That is plausible because Vercel pauses Active CPU accounting while a function waits for external I/O such as Supabase. It also demonstrates why request wall duration and request count must not be converted directly into CPU.

If the email and screenshot were contemporaneous, roughly 2 hours 53 minutes of the warned three CPU-hours occurred outside the selected 12-hour view, in another project/environment, or earlier in the Hobby allowance window. The team’s second project has not been deployed for 57 days, so earlier OpenList work is the more likely location, but the CLI cannot prove that allocation: `vercel usage` returned `Costs not found (404)` for the Hobby team and detailed historical metrics require Observability Plus.

Therefore:

- The 9–10 August crawler burst did **not** itself consume three CPU-hours; the supplied 12-hour number says about seven minutes.
- The 75% warning principally reflects earlier usage outside that 12-hour selection.
- There is insufficient retained billing detail to identify a specific previous abnormal CPU event.

Official references:

- [Vercel Hobby included usage and 30-day behaviour](https://vercel.com/docs/plans/hobby)
- [Function Active CPU definition](https://vercel.com/docs/functions/usage-and-pricing)
- [Managing and viewing usage](https://vercel.com/docs/pricing/manage-and-optimize-usage)

## Risk assessment

**Classification: Significant issue.**

This is not an emergency outage and the current 12-hour CPU number is small relative to four hours. However, the architecture lets any standards-compliant crawler turn thousands of public URLs and filter combinations into uncached function executions, including full-dataset server-side aggregation. The ongoing crawl sample also contains very long requests, one 504, and multiple incomplete rows.

The issue is worth addressing before the next large crawl or sitemap expansion. It is not necessary to assume malicious traffic or block a specific bot to justify the work.

## Recommended actions (not implemented)

### P0 — urgent before another large crawl wave

1. Make crawler-facing planning filter/search URLs non-indexable/non-followable as appropriate, and stop publishing combinatorial filter links to crawlers. Preserve canonical indexable authority/detail pages while preventing `area`/`status`/`type`/`q` traversal from multiplying dynamic work.
2. Replace full-row filtered planning aggregation with database-side indexed filters/aggregates or precomputed summary tables. A crawler request must not load and reprocess up to 44,500 rows.
3. Make anonymous planning detail and authority pages genuinely cacheable/ISR. Verify on Vercel that repeated anonymous requests become cache hits and do not invoke a function on every crawl.

### P1 — worthwhile

1. Separate authenticated navigation/user state from the shared public root layout, or otherwise avoid making every anonymous public page request-dependent because of `cookies()`.
2. Cache or precompute planning-detail location research so 800 area candidates are not fetched and scanned for every cold request.
3. Review sitemap release strategy. The 5,000 planning-detail URLs are valid, but introducing them all at once against dynamic cold renders creates a predictable crawl spike.
4. Add durable, privacy-safe request telemetry or a log drain before future launches if historical route/user-agent attribution is operationally important; Hobby’s one-hour retention is too short for overnight diagnosis.
5. Add explicit performance tests for anonymous repeated requests to planning detail, filtered planning, unified search, and sold-area pages, including cache-status assertions.

### P2 — optional

1. Review whether every public filter combination merits an internal anchor; use forms or constrained curated links where indexing is not useful.
2. Ensure sitemap `lastModified` changes only when content changes, especially for static/authority routes, to avoid unnecessary recrawl hints.
3. Monitor 404 and 504 rates by route after cache/query changes; eight planning-detail 404s and one 504 appeared in only 99 retained crawler requests.
4. Re-evaluate middleware matching for sold-price routes after public pages become cacheable, so middleware is used only where its redirect/validation behaviour is needed.

## Evidence files

- `vercel-production-log-metadata-latest-50.jsonl` — first sanitized 50-row capture.
- `vercel-production-log-metadata-latest-50-second.jsonl` — second sanitized 50-row capture; one overlap removed during analysis.
- `latest-50-capture-summary.json` and `latest-50-capture-summary-second.json` — capture metadata.
- `latest-unique-analysis.json` — aggregate analysis of 99 unique requests, including exact-path top 20.
- `latest-unique-time-buckets.csv` — five-minute buckets.
- Query values are never stored; only parameter names and one-way fingerprints are retained. No secrets, tokens, headers, email addresses, or client IPs are included.

## Principal commands and checks

Representative read-only commands used:

```text
cat .vercel/project.json
npx vercel whoami
npx vercel ls openlist --yes
npx vercel activity --all --since 2d --limit 100 --json
npx vercel crons list
npx vercel logs --project openlist --environment production --since ... --until ... --json --debug
npx vercel metrics schema vercel.function_invocation --json
npx vercel metrics vercel.function_invocation.count ...
npx vercel usage --json
gh run list --repo danjspg/openlist --limit 30 --json ...
git log / git show / git diff HEAD^ HEAD
repository-wide ripgrep for schedules, fetches, timers, polling, refreshes, webhooks, and production URLs
read-only Supabase count queries
read-only process listing for QA/browser/dev/monitor processes
inspection of .next/prerender-manifest.json and route manifests
```

The Vercel metrics query was refused with `payment_required`; the usage query returned a Hobby-team 404; old bounded logs were refused because the interval exceeded retained entitlement. These failures are evidence of access limits, not evidence that the traffic did not occur.

## Final answers

1. **What caused the usage?** Most likely external crawlers traversing the newly published planning-detail sitemap and crawler-visible planning/search filter links. The application converted most of that crawling into uncached functions.
2. **Why did it continue after development stopped?** The deployment and sitemap remained public. Crawlers discovered and traversed thousands of URLs asynchronously for hours; no local QA process needs to remain active for that to happen.
3. **Does OpenList have a genuine scaling/efficiency problem?** Yes: broadly dynamic public rendering, uncached planning details, full-dataset filtered planning aggregation, and a combinatorial crawl graph. It is significant but not currently an outage.
4. **What should change?** First constrain crawler access to query/filter permutations, move filtered aggregation to the database/precomputed data, and make anonymous public detail/authority pages genuinely cacheable. Then separate auth from the public layout and cache detail research.
5. **Full report:** this file, `docs/vercel-usage-investigation/report.md`.
