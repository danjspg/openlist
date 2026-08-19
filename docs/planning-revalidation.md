# Planning detail revalidation

Planning detail pages are cached indefinitely and refreshed only after normal Cork or national planning ingestion changes a record.

Configure the same high-entropy value as `PLANNING_REVALIDATION_SECRET` in Vercel and as the `PLANNING_REVALIDATION_SECRET` GitHub Actions secret. Configure `PLANNING_REVALIDATION_URL` in GitHub Actions as the production site origin, for example `https://www.openlist.ie` (without a trailing slash).

The planning refresh workflow runs `scripts/drain-planning-revalidation.mjs` after its normal Cork and national writes. It makes authenticated `POST` requests to `/api/internal/planning-revalidate`, draining batches of at most 100 up to 20 times. A failed request or row fails the workflow and leaves its durable pending marker intact for retry.

Historical status, lifecycle, proposal, and event backfills do not use this drain. Nearby sold-price context on a planning detail can remain stale until a future targeted PPR invalidation mechanism is added.
