# Sitemap snapshot failure model

## Invariants

- `next build` performs no Supabase reads. Application Supabase clients reject build-phase reads and the build verification command fails if the marker appears, even when application code catches the error.
- Crawler sitemap requests read only the committed `data/sitemap-snapshots.json` artifact. They never call PostgREST and cannot reconstruct locality counts or cohorts.
- Planning locality priority and expanded snapshots are disjoint and their union must equal the live membership universe at snapshot-generation time.
- Snapshot generation bypasses PostgREST entirely. It uses one direct PostgreSQL connection and performs bounded statements sequentially with a 20-second statement timeout.

## Route audit

| Route | Previous synchronous dependency | New source |
| --- | --- | --- |
| `/sitemap.xml` | canonical places, public categories, recent Planning RPC | committed `root` snapshot plus code-defined static routes |
| `/sitemaps/planning-notable.xml` | notable Planning RPC | committed `planningNotable` snapshot |
| `/sitemaps/sold-prices-localities.xml` | locality cohort RPC | committed `soldPricesLocalities` snapshot |
| `/sitemaps/planning-localities.xml` | priority locality RPC | committed `planningLocalitiesPriority` snapshot |
| `/sitemaps/planning-localities-expanded.xml` | expanded locality RPC | committed `planningLocalitiesExpanded` snapshot |
| `/robots.txt` | none | code-defined static sitemap URLs |

All five DB-backed sitemap surfaces are explicitly `force-dynamic`. Dynamic is a build-safety guard; it does not imply a live database read because their only data input is the bundled snapshot.

## Metadata audit

Static metadata exports and `robots.ts` do not read Supabase. Data-backed `generateMetadata` functions live on request-rendered routes. Planning and sold-price route segments are forced dynamic so their page and metadata data access cannot be evaluated during Vercel's build.

## Refresh and failure behavior

The `Refresh sitemap snapshots` workflow runs daily at 09:20 UTC, after the main Planning/locality maintenance cluster. It executes database reads sequentially, validates the complete snapshot set, runs sitemap tests and a real `next build`, and commits only a fully valid artifact to `main`.

Recent and notable Planning URLs are read from `planning_seo_sitemap_memberships`, the durable cohort snapshot populated by the SEO collection workflow. Snapshot publication therefore does not repeat the live recent/notable selection scans. Locality URLs are read from the already-materialised locality membership functions; publication never invokes cohort or activity reconstruction.

The file replacement is atomic. If any RPC, validation, test, rebase, push, build, or deployment fails:

1. the existing snapshot file is not overwritten;
2. the existing production deployment continues serving its last-known-good sitemap data;
3. no crawler request falls through to Supabase;
4. the workflow fails visibly and can be rerun after database health is restored.

A successful snapshot commit follows the normal Vercel Git deployment. Deployment readiness alone is not proof of publication; production sitemap status, entry counts, snapshot header, and locality-universe coverage should be checked after deployment.
