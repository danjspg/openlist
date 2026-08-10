# OpenList Vercel crawl-efficiency implementation

Implementation date: 10 August 2026
Scope: application and migration changes, Supabase RPC installation, and Vercel preview validation. No crawler block was enabled. Production application deployment remained pending at the time of this report update.

## Executive summary

The implementation removes the main architectural causes identified in the production investigation:

- The public root layout no longer reads auth cookies. A small private, no-store session endpoint hydrates account navigation in the browser, while protected Viewings pages continue to enforce server-side authentication.
- Canonical planning and sold-price dynamic routes are configured as six-hour, on-demand ISR routes rather than generating tens of thousands of pages during the build.
- Planning filter states are served by a separate dynamic utility render reached through an internal middleware rewrite. Canonical unfiltered routes no longer consume `searchParams`.
- Planning facet controls and research shortcuts now use GET forms/buttons rather than query-string anchors, removing the crawler-friendly combinatorial link graph while preserving normal human use.
- Planning and unified-search query states emit `X-Robots-Tag: noindex, follow`; their HTML metadata canonicalises to the corresponding base route.
- Planning aggregation now calls a Postgres RPC that filters, groups, counts, and sorts in the database and returns compact JSON. The Vercel function no longer downloads up to 44,500 rows for aggregation.
- Planning application records, planning research context, county area candidates, sold-area planning context, and unified search results have central, argument-specific caches.
- Sitemap timestamps no longer become artificially fresh on every build.
- Middleware no longer runs on sold-price area pages or ordinary homepage requests.

Expected impact: legitimate crawlers retain access to canonical planning details and authority pages, but repeated canonical requests can reuse ISR/data-cache entries and crawler discovery no longer fans out through filter/search permutations.

## Database migration status

The two RPC functions in `supabase/migrations/20260810120000_add_planning_dashboard_aggregate.sql` were applied manually through the Supabase SQL Editor before preview deployment and verified through the Data API.

Because the SQL was applied manually, the remote `supabase_migrations.schema_migrations` history may not yet record version `20260810120000`. The migration is idempotent and should be reconciled through the normal Supabase CLI workflow when CLI authentication is available.

The migration defines:

- `openlist_planning_locality(...)`, a deterministic locality normaliser used by aggregation;
- `openlist_planning_dashboard_aggregate(...)`, a stable JSON aggregation RPC;
- a function-level statement timeout exemption for the recurring dashboard RPC.

Three proposed search indexes were intentionally omitted from the final migration after their SQL Editor index builds overloaded the database. The validated RPC does not require them for the current dataset.

## Public rendering architecture

Previously, `app/layout.tsx` called `getCurrentUser()`. That helper calls `cookies()`, so every route sharing the root layout became request-dependent.

The root layout is now cookie-free and wraps its output in `AuthStateProvider`. The provider calls `GET /api/auth/session` after hydration and exposes only an authenticated boolean. The endpoint is private and `no-store`; user identity is never embedded in cached public HTML.

`Nav`, the footer account link, and the Viewings landing-page CTA consume that client auth state. The signed-out HTML is safe as the public default. `/my-viewings` and its create/edit/detail routes still use `requireUser()` or `getCurrentUser()` on the server. Browser QA confirmed that a signed-out visit to `/my-viewings` redirects to `/sign-in?redirectTo=%2Fmy-viewings`.

## Route cache status

The “After” classifications below describe the implemented Next route design. Final production route-manifest and Vercel cache-header verification remain pending the migration and preview prerequisite described above; they are not presented as measured production results.

| Route | Before | After | Revalidation |
|---|---|---|---:|
| `/` | Dynamic because of root auth | Static/ISR eligible; no request APIs in the route or root layout | 6 hours |
| `/planning` | Dynamic, including unfiltered crawler requests | Canonical static/ISR render; filter queries internally rewrite to a separate dynamic utility route | 6 hours |
| `/planning/[authority]` | Dynamic | On-demand ISR; no build-time authority fan-out | 6 hours |
| `/planning/[authority]/[reference]` | Dynamic cache miss per crawler request | On-demand ISR plus cached record and research data | 6 hours |
| `/search` | Dynamic and uncached | Dynamic utility route; results cached by normalized query and query states noindex | 1 hour data cache |
| `/sold-prices/[county]` | Dynamic | On-demand ISR; no build-time county fan-out | 6 hours |
| `/sold-prices/[county]/[areaSlug]` | Dynamic | On-demand ISR plus cached planning support query | 6 hours |
| `/sold-prices` | Dynamic because of root auth and date-range query state | Root-auth cause removed; existing query-dependent render remains with cached analytics | Existing six-hour data caches |

`generateStaticParams()` intentionally returns an empty list for planning authorities/details and sold-price county/area routes. Next can generate a requested canonical path on demand and retain it as ISR without building all 44,500 planning records or every market page at deploy time.

## Filter crawl control

Indexable routes remain:

- `/planning`
- `/planning/[authority]`
- `/planning/[authority]/[reference]`

Utility states containing `q`, `area`, `council`, `status`, or `type` are noindex. Middleware adds `X-Robots-Tag: noindex, follow` and rewrites planning index/authority query requests internally to `/planning/applications`. That utility page also supplies `robots: noindex, follow` metadata and canonical metadata for `/planning` or the selected authority.

The canonical visible URL and human GET-form behavior are preserved. Filter facets, planning-detail “research this area” actions, sold-area “search all planning”, and unified-search shortcuts no longer expose query permutations as anchors. Canonical result links to planning details and sold-price SEO pages remain ordinary crawlable links.

Local header verification confirmed:

```text
/search?q=x
X-Robots-Tag: noindex, follow

/planning/cork?area=Carrigaline
X-Robots-Tag: noindex, follow
X-Middleware-Rewrite: /planning/applications?area=Carrigaline&_authority=cork
```

The planning utility request currently returns 500 locally only because the required RPC migration is not installed in the connected database. The rewrite and robots response were verified independently.

## Planning aggregation

Previously, filtered aggregation paged through the complete relevant planning dataset in 1,000-row batches, then filtered, counted, grouped, mapped, and sorted those rows in Node. National requests could transfer and process 44,500 rows.

`lib/planning.ts` no longer contains the full-row aggregate loader or Node aggregation pipeline. It calls `openlist_planning_dashboard_aggregate` with scalar authority/query/area/status/type arguments. Postgres applies the filters, calculates total/latest/month/facet/map summaries, and returns only compact JSON. Next caches that JSON by the complete argument set for six hours.

The migration retains exact counts and the existing facet semantics, including authority grouping nationally and normalized locality grouping within an authority. The final RPC materializes only the compact columns required by the dashboard rather than the wide `source_payload` rows.

## Planning detail research caching

The following cache keys are centralized and argument-specific:

- `planning-application:v2` — authority code and canonical reference; six hours;
- `planning-research-context:v2` — complete planning record, including `updated_at`; six hours;
- `planning-ppr-area-candidates:v2` — county; 24 hours;
- `planning-applications-for-sold-price-area:v2` — county, locality, and limit; six hours;
- `unified-property-search:v2` — normalized search query; one hour.

Because the planning record (including `updated_at`) is part of the research-context arguments, a changed source record receives a new cache entry rather than reusing an overly broad locality result.

Local browser timing for `/planning/cork/ref-MjYvMDI0NA` was approximately 57 seconds on the first uncached request while the remote data service was slow, then 330 ms on the consecutive request. This is development timing, not a Vercel CPU or production latency claim, but it confirms reuse of the intended cached work. The page, canonical links, map iframe, and form-based unified-search action rendered correctly.

## Sitemap

The sitemap still includes the 5,000 recent planning details. Planning SEO scope was not reduced.

- Static routes, authority routes, and sold-price route lists no longer receive `new Date()` on every build.
- Planning-detail `lastModified` uses `updated_at`, then `registration_date`, and is omitted only if neither source timestamp exists.
- Sitemap revalidation remains 24 hours.

This removes artificial freshness churn while preserving the source-derived signal for planning records.

## Middleware

The previous matcher ran middleware for `/` and all `/sold-prices/:path*` requests, including every sold-area page.

The matcher is now limited to:

- `/` only when both auth callback query parameters are present;
- a single-segment `/sold-prices/:county` path, where redirect/validation logic is needed;
- planning paths only when a recognized utility query key is present;
- `/search` only when `q` is present.

Canonical homepage, planning, planning-detail, sold-area, and ordinary search landing requests avoid middleware. Existing sold-price short-town redirects and invalid single-segment protection remain intact.

## SEO impact

Canonical planning authority and detail pages remain `index, follow` with their existing canonical metadata and structured content. Googlebot and Bingbot are not blocked. The sitemap still advertises planning details.

Only utility query/filter states are noindex. Canonical sold-price county and area metadata was not changed, and no valuable sold-price route was removed from the sitemap.

No AI crawler restrictions were enabled.

## Verification

| Check | Result |
|---|---|
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm test` | Pass: 22/22 |
| `npm run build` | Pass: compiled and generated all 44 static pages |
| Route manifest | Pass: `/` and `/planning` are six-hour prerenders; parameterized planning and sold-price routes are on-demand SSG/ISR |
| Supabase Data API | Pass: ordinary read 0.21 s; national aggregate 0.93 s; Cork aggregate 2.39 s; filtered Cork aggregate 0.57 s in direct checks |
| Desktop browser QA | Pass for homepage, planning detail, unified search, sold-area UI, and signed-out auth flow |
| Mobile browser QA | Pass at 390×844 for planning detail and Viewings; no horizontal overflow (`scrollWidth === innerWidth`) |
| Planning detail repeat | 57 s uncached remote-data request, then 330 ms locally |
| Filter rewrite/noindex header | Pass: preview response returns `X-Robots-Tag: noindex, follow`, noindex metadata, and the authority canonical |
| Map | Pass; OpenStreetMap iframe rendered on the planning detail |
| Signed-in QA | Not available; preview signed-out `/my-viewings` redirects to `/sign-in?redirectTo=%2Fmy-viewings` and server auth enforcement remains unchanged |
| Preview deployment | Pass: Vercel preview built successfully; canonical planning detail and sold-area requests changed from `MISS` to `HIT` on the second request |
| Preview authority route | Pass after applying the RPC's 15-second function timeout: `/planning/cork` returned 200 and changed from `MISS` at 0.91 s to `HIT` at 0.10 s |
| Preview sitemap | Pass: valid XML, 5,105 unique URLs, 5,000 planning details, and no query-string URLs |

The final local and Vercel builds both completed successfully after the database recovered and the planning RPC was installed.

## Required completion sequence

1. Confirm the per-function statement timeout exemption in Supabase and rerun the canonical authority preview check.
2. Commit and push the selectively scoped release files.
3. Promote the validated build to production.
4. Repeat the canonical, filtered, search, sold-area, sitemap, and auth smoke checks against `www.openlist.ie`.
5. Reconcile migration version `20260810120000` in Supabase migration history when CLI authentication is available.

## Deferred and optional work

- Optional AI crawler policy for ClaudeBot, GPTBot, Bytespider, or PetalBot if architecture-level caching still leaves unacceptable cost. Googlebot and Bingbot should remain allowed.
- A privacy-safe log drain or durable telemetry if overnight attribution is operationally important.
- A persisted normalized planning locality column if query plans show the deterministic locality function is still a material database cost at scale.
- Database `EXPLAIN (ANALYZE, BUFFERS)` review after migration on representative authority, status, type, locality, and text filters; no speculative additional indexes should be added before that evidence.
