# Planning sitemap and indexation measurement

## What was true before this change

- OpenList exposed one Next.js metadata sitemap at `/sitemap.xml`, cached for 24 hours.
- Planning detail URLs were the latest 5,000 non-null registration dates, ordered by registration date and reference. This was a rolling cohort: an older URL disappeared whenever a newer application displaced it. There was no membership history, permanent cohort, partition, or Search Console measurement.
- Planning detail pages use on-demand rendering (`generateStaticParams()` returns no rows) and a six-hour revalidation window. Generating the sitemap does not render the 5,000 detail pages, but a crawler's first visit to an uncached detail URL invokes Vercel compute and can create an ISR cache entry.
- Valid authority and application pages had self-referencing canonicals and `index,follow`. Filtered search states are rewritten to the dynamic results route with `noindex,follow`. `robots.txt` allowed public planning routes and named only the root sitemap.
- The repository had no Google Search Console API integration. Consequently there was no reliable answer for submitted, discovered, crawled, indexed, time-to-index, URLs leaving the rolling sitemap before an indexed observation, or planning-page organic traffic.

The old selection was bounded, but it was not fully stable for ties and it silently depended on the API row cap. The new recent selection is deterministic (`registration_date`, `reference`, then UUID), explicitly paged to 5,000, and excludes the separate notable cohort so the two sitemap files do not duplicate planning URLs.

## New sitemap model

`/sitemap.xml` keeps the current 5,000-URL recent cohort. `/sitemaps/planning-notable.xml` is a separate permanent, daily-cached cohort advertised in `robots.txt`.

Membership is explicit in `planning_seo_notable`:

- `application_id` is unique and foreign-keyed to the planning record.
- `source`, `reason`, and JSON `evidence` preserve why the URL was selected.
- `active` allows a deliberate removal without deleting the audit record.
- Existing notable records are ordered oldest-first. The sitemap is capped at 5,000, so existing members are never displaced by new ones. Create a sitemap index and stable hash/range partitions before approaching that cap; do not increase one file without also checking response size and function duration.

The collector snapshots both sitemap cohorts in `planning_seo_sitemap_memberships`. Re-running it on the same day is safe: observations and inspections use date-based primary keys, performance uses application/date, and membership upserts preserve the original `first_seen_at`.

To mark an application notable manually:

```sql
insert into public.planning_seo_notable (application_id, source, reason, evidence)
values (
  '<planning-application-uuid>',
  'editorial',
  'Material regional infrastructure application',
  '{"reviewedBy":"editorial","reviewedAt":"2026-08-18"}'::jsonb
)
on conflict (application_id) do update
set source = excluded.source,
    reason = excluded.reason,
    evidence = excluded.evidence,
    active = true,
    updated_at = now();
```

There is also an intentionally conservative promotion function. It selects URLs with activity on at least three days in the trailing 90 days and either two clicks or 100 impressions. It is **not** scheduled automatically. Review the collected data first, then run `npm run planning:seo:collect -- --promote-notable --skip-inspections --skip-performance --skip-sitemaps` if those thresholds are appropriate. Its source, reason, and threshold evidence are stored with each selection.

## Search Console setup

1. Apply `supabase/migrations/20260818120000_add_planning_seo_measurement.sql` before deploying the application code.
2. In a Google Cloud project, enable the Search Console API, create a service account, and download its JSON key.
3. Add the service-account email as a user of the exact Search Console property used by OpenList. Read-only access is sufficient; the client requests only `webmasters.readonly`.
4. Configure these local variables and matching GitHub Actions secrets:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SITE_URL=https://www.openlist.ie`
   - `GOOGLE_SEARCH_CONSOLE_SITE_URL=sc-domain:openlist.ie` (or the exact URL-prefix property)
   - `GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON_BASE64` containing `base64 < key.json | tr -d '\n'`
   - optional `PLANNING_SEO_INSPECTION_LIMIT` (default 200, hard maximum 1,000)

   For local-only use, unencoded JSON can instead be supplied as `GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON`. Do not commit either form.
5. Confirm both sitemap URLs are visible in Search Console. Robots discovery is valid, but submitting each explicitly makes operational status easier to inspect.
6. Run `npm run planning:seo:collect`, then `npm run planning:seo:report`.

The scheduled workflow collects the finalized Search Analytics day from three days ago, current sitemap observations, and up to 200 stratified URL inspections each morning. The inspection sample is 20% notable, 30% URLs that recently left the rolling sitemap, and 50% current recent URLs, with unused slots spilling to any available cohort. Unindexed URLs become eligible again after seven days; indexed URLs after 30 days. This stays well below the URL Inspection API's 2,000-query daily site quota.

Use `--date YYYY-MM-DD` or `--from YYYY-MM-DD --to YYYY-MM-DD` for a performance backfill. `--dry-run` calls Google but does not write; each `--skip-*` flag can omit an API section.

## What the report means

The CLI report includes:

- the exact locally observed recent and notable sitemap membership;
- latest sampled indexed, discovered/not-indexed, unknown, and not-yet-inspected counts;
- median observed days from first membership capture to the first later `PASS` inspection;
- the observed fraction of recent URLs that left before any indexed inspection;
- collected clicks and impressions, notable URLs with impressions, notable-versus-recent traffic per current cohort page, and the top planning pages.

These are measurements, not invented full-population counts:

- URL Inspection reports Google's indexed version, not a live test, and is quota-limited. “Indexed” and “discovered” therefore describe the stratified sample. Discovery is a transparent proxy based on crawl time, sitemap/referrer evidence, or a non-unknown coverage state.
- Search Console's sitemap `submitted` count is stored. Its old `indexed` field is deprecated and is deliberately not used.
- Search Analytics normally lags by two to three days, returns top rows rather than a guaranteed exhaustive result, and caps page/date exports at 50,000 rows per site/search type/day. An absent page is not proof of zero impressions.
- Observed time-to-index is interval-censored: it starts when this collector first sees membership and ends at the first sampled indexed result. It cannot reconstruct historical index dates.
- “Left before indexed” becomes meaningful only after enough URLs have entered and left while daily collection is running.

Official API references: [Search Analytics query](https://developers.google.com/webmaster-tools/v1/searchanalytics/query), [complete-data guidance](https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data), [URL Inspection](https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect), [inspection quotas](https://developers.google.com/webmaster-tools/limits), and [service-account authentication](https://developers.google.com/identity/protocols/oauth2/service-account).

## Recommendation

Choose **A now: keep the recent sitemap near 5,000 and add the permanent notable cohort**. This preserves the current bounded crawl/compute exposure, prevents high-value URLs from aging out, and creates evidence that OpenList did not previously have. Expanding immediately would increase first-hit function and ISR activity without evidence that Google indexes or sends traffic to the additional pages.

Run the measurement for six to eight weeks. If most sampled recent URLs are indexed well before they leave and older/notable pages earn impressions, move to **C: a sitemap index with stable, bounded partitions**. Avoid **B (one larger rolling file)** because it makes displacement slower but does not solve permanence. Avoid **D (the whole historical corpus)** until the data demonstrates value and the separate on-demand revalidation/compute work is complete.

Suggested follow-up issues:

1. Apply the migration, configure Search Console secrets, submit both sitemap URLs, and confirm the first scheduled report.
2. Review promotion thresholds after six to eight weeks; only then decide whether to schedule automatic promotion.
3. Add a sitemap index and stable notable partitions before 4,000 active notable URLs.
4. Revisit whole-corpus exposure together with the planning-page on-demand revalidation and cache-cost work.
5. Consider Search Console bulk export if page-level reporting approaches the API's daily row limit.
