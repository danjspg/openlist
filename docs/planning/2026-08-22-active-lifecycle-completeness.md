# Active Planning lifecycle completeness — 2026-08-22

This is an active-only audit. It deliberately excludes the closed historical
backfill cohort.

## Production baseline

The live-status cohort contains 11,455 applications:

| Status | Total | Milestone-date coverage relevant to status |
| --- | ---: | --- |
| Further information requested | 2,922 | 82 FI-request dates (2.8%) |
| Further information received | 85 | 1 FI-received date (1.2%) |
| Appealed | 1,443 | 1,439 appeal-lodged dates (99.7%) |

The national active refresh already selects every active status, batches exact
ArcGIS `OBJECTID` lookups per authority, maps lifecycle columns, preserves a
known date when an authoritative row returns null, and falls back only where
an exact source row is unavailable. It is a background workflow, not a web
request path.

## Cork County authoritative detail API

Five active records were sampled at one request per second:

| Reference | Detail id | Normalised status |
| --- | ---: | --- |
| 25/6736 | 996645 | further information requested |
| 26/1556 | 1000857 | further information requested |
| 26/1142 | 1000432 | further information received |
| 26/1510 | 1000804 | further information received |
| 26/1561 | 1000864 | further information received |

The actual JSON exposes `registrationDate`/`registerDate`, `decisionDate`,
`finalGrantDate`, `appealLodgedDate`, `appealDecisionDate`,
`appealNotifyDate`, `dispatchDate`, `decisionDueDate`, and
`statutoryExpiryDate`. It also exposes a current status label, for example
`Awaiting F.I. Response` and `F.I. Consultees/Awaiting Recommendation`.

It does **not** expose a further-information-request date or a
further-information-received date. The same omission was observed in all five
representative detail responses. The Cork search mapper already maps every
relevant date the search/detail API publishes, including decision due and
appeal dates; it has no FI date fields to map.

Consequently the Cork baseline is source-null, not an OpenList ingestion gap:

| Cork active measure | Total | With date |
| --- | ---: | ---: |
| FI requested | 416 | 0 |
| FI received | 73 | 0 |
| Appealed / appeal lodged | 44 | 44 |
| Any decision due date | 952 | 94 |

No date is inferred from a status, detected time, registration time, or source
update time.

## Alert safety

`openlist_enqueue_planning_alert_deliveries` requires both
`event.detected_at >= subscription.created_at` and, where present,
`event.event_date >= subscription.created_at::date`. Production verification
found zero queued deliveries whose detected or event date predated the related
subscription. The unique `(subscription_id, event_id)` constraint remains the
second duplication guard.

## Outcome

No Cork FI enrichment code was added because the only authoritative endpoint
currently used by OpenList does not publish the two missing values. The daily
active workflow already runs the national exact refresh, Cork detail refresh,
timeline capture through normal upserts, and revalidation. A broad historical
or speculative Cork sweep would not improve these records and is intentionally
out of scope.
