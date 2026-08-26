# Planning source authority and canonical lifecycle

OpenList deliberately retains source facts even when more than one public dataset describes the same real-world planning milestone. Source precedence is applied when those facts are resolved into the canonical OpenList lifecycle. Raw source records are not destructively overwritten merely to make the UI simpler.

## Layers

1. **Source facts**
   - Council/direct planning sources and ePlan
   - National Planning Application Database
   - An Coimisiún Pleanála (ACP) appeal cases
   - National Building Control Office / BCMS building-control records
   - Other domain-specific datasets such as PSRA remain outside the planning lifecycle stream

2. **Raw timeline**
   - `planning_application_events` is the durable source/provenance event store.
   - Multiple source representations may exist for the same real-world milestone.
   - Raw events are retained for audit, correction handling and source disagreement QA.

3. **Canonical lifecycle**
   - `planning_canonical_events` resolves which raw events are eligible to represent the OpenList lifecycle.
   - Event-specific authority matters more than a single global source ranking.

4. **Products above the lifecycle**
   - Public timeline/presentation
   - Search and derived lifecycle presentation
   - Planning alerts
   - Future APIs/exports

Alert eligibility must sit above canonical resolution. A lower-authority source event should never independently create a user notification for a milestone that a stronger source supersedes.

## Current authority matrix

| Domain / fact | Primary authority | Fallback |
| --- | --- | --- |
| Local planning application lifecycle (registration, validation, FI, council decision, final grant, withdrawal) | Direct council register / ePlan where provenance is known | National Planning Application Database |
| Appeal lodged, appeal case status, appeal decision and outcome | An Coimisiún Pleanála | Direct council/ePlan, then national planning dataset |
| Works commencement | NBCO/BCMS | None currently |
| Completion certificate | NBCO/BCMS | None currently |
| Residential sold price | PSRA | None currently; outside `planning_application_events` |

## Implemented canonical rules

- Linked ACP `appeal_lodged` and `appeal_decided` events supersede lower-authority appeal events for the same application and event type.
- Building-control events are canonical only when projected from `nbco_bcms_open_data`.
- Lower-authority/raw events remain in `planning_application_events`.
- `openlist_enqueue_planning_alert_deliveries` joins `planning_canonical_events`, so alert delivery cannot bypass source authority resolution.
- Alert batching/ranking still applies after canonical resolution. Canonicalisation answers *which source event is eligible*; batching answers *which meaningful change should result in one email*.

## Important provenance limitation

The current `planning_applications` row is an integrated application record, not a field-observation ledger. Existing event triggers can identify some direct sources from their application/source context, but ePlan and some direct lifecycle enrichments do not yet carry robust per-field provenance. Therefore the direct-council-over-national rule cannot safely be applied as a blanket destructive rule to every historical local-planning event yet.

Do not solve that by deleting national events or guessing source identity. The next provenance step, if needed, is to record source identity per lifecycle field/observation at ingestion time, then extend canonical resolution using that explicit provenance.

## Design rule for new sources

When adding a lifecycle source:

1. Store the source record separately where practical.
2. Preserve its source identifier and source timestamps.
3. Link it to a planning application using an explicit, auditable match method.
4. Project source-backed events into `planning_application_events` with stable event keys and truthful `event_source` values.
5. Add field/event-specific authority rules to the canonical layer.
6. Make presentation and alerting consume the canonical result, not independent raw-source changes.
7. Treat source disagreements as QA signals rather than silently overwriting the weaker source record.
