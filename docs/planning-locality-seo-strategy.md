# Planning locality SEO strategy

OpenList separates three concerns that should not be conflated:

1. **Browse universe**: every quality-controlled locality page that is useful to a person browsing Planning.
2. **Priority SEO cohort**: locality pages that OpenList actively promotes for indexing because they have stronger demand, activity, notable-development or Search Console signals.
3. **Expanded SEO cohort**: remaining valid locality pages that stay crawlable and internally linked, but are measured separately from the priority cohort.

## Current implementation

- Planning locality browse coverage is capped at 3,000 valid memberships, not the former 100-page SEO cohort.
- `locality_seo_memberships.seo_tier` is either `priority` or `expanded`.
- Priority scoring combines locality volume, notable applications and the last 90 days of Search Console impressions/clicks.
- Notable or traffic-bearing localities remain priority even if they fall outside the base top-500 ranking.
- `/sitemaps/planning-localities.xml` is the priority sitemap for backwards compatibility.
- `/sitemaps/planning-localities-expanded.xml` is the expanded cohort.
- Sitemap `lastmod` comes from actual planning-record updates rather than SEO membership bookkeeping.
- `/planning/areas` is a hierarchy hub, while `/planning/[authority]/areas` exposes complete council-level locality navigation.

## Measurement

The daily Planning SEO workflow reports priority and expanded locality cohorts separately, including URL count, pages with impressions, pages with clicks, clicks, impressions, CTR, average position and impressions per page.

The locality tier refresh runs daily after Search Console collection. This lets observed demand promote a page into the priority cohort without making Search Console performance a requirement for a page to exist.

## Next structural work

### Canonical place dictionary

Source-derived locality parsing should gradually move from string confidence toward resolution against a canonical Irish place dictionary. The resolver should support:

- recognised settlements and suburbs;
- Dublin postal districts;
- aliases and spelling variants;
- authority/county association;
- canonical display label and slug;
- rejection of address fragments, planning terminology and truncated strings.

The source parser can continue to provide candidates, but SEO/browse promotion should eventually require either dictionary resolution or a high-confidence explicit exception.

### Cross-authority geographic pages

Some user-intent geographies cross planning-authority boundaries, for example Dublin postal districts. Authority-specific pages remain canonical operational views, but OpenList should evaluate aggregate geographic pages such as `/planning/areas/dublin-16` that combine relevant authorities and link to council-specific drill-downs.

Do not automatically create aggregate pages for every duplicate locality label. Require a known geographic entity whose real-world extent spans authorities.

### Promotion policy

Keep the tier algorithm explainable. Useful promotion signals include:

- application volume and recency;
- active application count;
- notable planning activity;
- construction activity;
- Search Console impressions/clicks;
- confirmed canonical-place identity.

Search performance should influence promotion, not page existence.
