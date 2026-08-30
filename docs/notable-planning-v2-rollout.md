# Notable Planning v2 rollout

## Production-safe pre-migration audit

Read-only audit on 30 August 2026, over 48,867 bounded reconciliation candidates:

| Metric | Before | V2 projection |
| --- | ---: | ---: |
| Structurally notable | 2,904 | 3,214 |
| Priority eligible | 2,224 | 2,465 |
| Old `residential-large` / new 50+ band | 1,052 | 674 |
| Old `residential-large` priority eligible | 767 | replaced by scale-sensitive projection above |
| New 10–49 `residential` band | — | 651 |
| Net-new 10–19 schemes | — | 205 |
| Existing 20+ schemes with corrected extracted total | — | 9 |

Projected historical residential rows are 150 at 10–49 units, 61 at 50–99, and 45 at 100+.

The existing phase-1 corpus contains 237,567 normalized building-control rows, 152,183 notices, and 94,699 links overall. It linked 334 of the projected 3,214 structural applications before the v2 notable catch-up. The other 2,880 are unmatched or not yet audited. Phase 1 did not persist ambiguity as a first-class state, so an honest pre-migration ambiguity count is unavailable; v2 records it explicitly. Newly repaired is zero before rollout by definition.

The pre-migration application table has no derived construction column, so the `Construction commenced` result count is zero/unavailable before rollout. A second bounded, read-only check found 94,694 existing link rows backed by a notice with a commencement date. That is an evidence-work upper bound rather than an application count because phased applications can have multiple links. The resumable internal construction catch-up reports the exact distinct application count as it derives state; the public filter includes only rows whose final verified derived state is exactly `commenced`, excluding `completed`, ambiguous and unlinked records.

The read-only audit took 448,829 ms because the prior reconciliation path paged the broad structural window. The append checkpoint is seeded from the maximum already-persisted source row, so normal acquisition starts at the current corpus edge rather than row zero. A scheduled append run is capped at five 1,000-row pages; a content-hash audit is capped at ten ordered 1,000-row pages and makes no datastore request when the dataset freshness timestamp is unchanged after a completed sweep. During the first audit only, phase-one rows whose persisted legacy payload is contained unchanged in the newly acquired full row are stored as processed raw baselines; they are not sent through normalization. Legacy-subset differences and later full-row hash changes remain processable. Normalization, matching and construction derivation remain capped at 200 records/applications per internal batch. The one-time notable and broader construction catch-ups are independently resumable and read only the persisted corpus.

## Safe rollout order

1. Apply `20260830120000_notable_planning_v2.sql` and `20260830121000_add_incremental_bcms_pipeline.sql`.
2. Run the notable reconciliation in confirmed, bounded chunks. Preserve each reported safe cursor.
3. Run `npm run planning:notable:v2:report` and compare the database report with the projection above.
4. Run internal BCMS notable catch-up with `npm run bcms:process -- --notable-catchup --cursor=<safe-cursor>`. This makes zero external requests.
5. Continue internal normalization/matching and the resumable `construction_catchup` until counters reach zero pending work; inspect ambiguity/failure anomalies. This derives filter state for existing phase-1 links without an external request.
6. Enable the independent acquisition and processing schedules. Acquisition persists raw versions before advancing its checkpoint; processing never contacts NBCO/BCMS.
7. Use `openlist_bcms_integrity_report()` for linked/unmatched/ambiguous/failure and freshness monitoring.

No step requires a global BCMS redownload or all-planning × all-BCMS match.
