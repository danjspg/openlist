# Planning application timelines

## Purpose

OpenList stores a small, immutable history of planning application milestones. The public detail page presents this as a compact vertical timeline beneath the current-status and key-facts section. Event labels are primary, dates are secondary, and decision, grant/refusal and appeal outcomes receive stronger emphasis.

The timeline is evidence-led: a dated event is shown only when a council source provides a field that proves that milestone. A missing event means that OpenList does not have a defensible date, not that the event did not happen.

## Source audit

The production `planning_applications` table contains these usable dated fields:

| Source field | Stored event |
| --- | --- |
| `registration_date` | Application received |
| `valid_date` | Application validated |
| `decision_date` | Decision made |
| `dispatch_date` | Decision notice issued |
| `final_grant_date` | Final grant |
| `appeal_lodged_date` | Appeal lodged |
| `appeal_notify_date` | Appeal notification recorded |
| `appeal_decision_date` | Appeal decided |

At the time of implementation, production held 389,448 applications: 51,940 Cork records and 337,508 national records. Every application had a registration date. After the Cork date repair, 332,665 applications had at least two provable milestones and 269,023 had at least three. The event table held 1,120,921 events: 1,044,242 reconstructed from explicit source fields and 76,679 observed during later changes and repairs.

Cork has additional raw payload keys such as `lastLetterDate`, `targetResponseDate` and `responded`, but those names do not prove a particular public milestone. The national ArcGIS source exposes explicit received, decision, grant and appeal dates but no further-information dates.

## What cannot be reconstructed

OpenList does not infer or fabricate:

- further-information request or receipt dates;
- historical dates for status-only transitions;
- a withdrawal date from a generic decision date;
- an appeal outcome description when the source supplies only an appeal decision date;
- historical versions of proposal, applicant or other application fields;
- exact decision-notice dispatch dates where the source field is empty.

These gaps can only be filled if a source later supplies an explicit, semantically reliable date or event history.

## Status taxonomy

Raw council wording remains stored for traceability. `normalized_status` supplies a stable OpenList category for search, presentation and refresh decisions:

`pre_validation`, `registered`, `under_assessment`, `further_information_requested`, `further_information_received`, `decision_made`, `final_grant`, `appealed`, `appeal_decided`, `withdrawn`, `invalid`, `finalised`, or `unknown`.

Known Cork and national labels are mapped explicitly. Unrecognised values remain `unknown`; similar-looking wording is not guessed. Changes that alter raw wording without changing its normalized meaning do not create a public event.

## Event storage and future changes

`planning_application_events` is relational and append-only for application clients. Each event records its application, type, effective date, detection time, source field, public label, raw/old/new values and provenance.

- `reconstructed` events come from existing explicit date fields.
- `observed` events are captured by a database trigger when a later refresh adds or corrects a dated field, changes the normalized status, or changes the decision meaningfully.
- `event_key` provides per-application idempotency, so a retry cannot duplicate the same milestone.
- Database ordering is deterministic by effective date, detection time, event type and id.

The main public timeline intentionally hides low-value technical milestones—validation, decision-notice dispatch, appeal notification and source-date corrections—while retaining them in the event table for provenance and future use.

When a source date is corrected, the original reconstructed event remains immutable and an observed `source_date_corrected` event records the old and new values. The public timeline resolves that correction chain before rendering the milestone. Re-running the same repair therefore creates no duplicate events and does not leave the obsolete date visible.

## Cork source-quality repair

The Cork search API returns proposal text in a shortened representation. For application `26/1595`, the search result ends after exactly 80 characters, while the portal's application-detail request to `/api/application/{id}` returns the complete text in `fullProposal`. New or changed Cork applications now request application details only when the search proposal has the shortened signature. A previously stored full proposal is also protected from being overwritten by its shorter search prefix.

The production audit found 43,320 likely shortened proposals before repairing `26/1595`, leaving 43,319 historical candidates. Fetching every detail page in one run would impose an unnecessary per-record workload on the council service. Historical repair is instead bounded, delayed between requests and resumable by reference:

```sh
npm run planning:cork:proposals:backfill
npm run planning:cork:proposals:backfill -- --proposal-after=LAST_REFERENCE
```

Each default run processes at most 50 candidates and prints the cursor for the next run. `--proposal-limit` may be set up to a hard limit of 250.

The Cork API's date values are council calendar dates, for example `2026-06-15T00:00:00`, without an offset. Passing that value through JavaScript's local-time parser and then UTC serialization moved summer dates back one day. Cork ingestion now validates and retains the leading `YYYY-MM-DD` value without timezone conversion for all eight date fields.

The initial production comparison found 41,032 affected applications: 3,936 registration dates, 29,640 validity dates, 22,185 decision dates, 18,352 final-grant dates, 879 appeal-lodged dates, 824 appeal-decision dates, no dispatch dates and 861 appeal-notification dates. Most were one day early; 86 previously empty dates had also become available in the current source. The bounded repair was applied, followed by a two-row delta for grant dates published while the audit was running. A final source-to-production audit reported zero mismatches across all eight fields.

The audit and idempotent date repair can be re-run with:

```sh
npm run planning:cork:source:audit
npm run planning:cork:dates:repair
```

## Backfill and reporting

The migration exposes a bounded batch function and a report function. Run them with:

```sh
npm run planning:timeline:backfill
npm run planning:timeline:report
```

The backfill normalizes status values and inserts only source-backed events in bounded application batches. It does not update application timestamps or trigger route regeneration. It is safe to retry because event keys are unique.

## Refresh and revalidation boundary

Normalized terminal states are excluded from historical polling, while decided and appealed applications remain eligible when a later grant or appeal outcome is still possible. `scripts/planning-upsert.mjs` returns the authority/reference pairs that actually changed after each committed batch. Issue #4 can use that bounded result as the `revalidatePath` queue; the historical event backfill deliberately bypasses it so hundreds of thousands of existing pages are not regenerated.
