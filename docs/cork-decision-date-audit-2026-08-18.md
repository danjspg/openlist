# Cork `decisionDate` semantics: 26/1644

The Cork AgileApplications detail API distinguishes the fields:

- `decisionDate` is the actual decision date when the detail record reports
  `statusDescription: "Decision Issued"` and a non-empty `decisionText`.
- `decisionDueDate` is the expected decision date. It is a separate field and
  can differ from `decisionDate`.

For 26/1644, both dates happen to be 2026-08-13. The detail record is
`Decision Issued` with `decisionText: "Refused"`; the historical Decision made
event is therefore source-backed and correct. The stale OpenList status is not
evidence that `decisionDate` is a due date.

Two rows stored as `New Application` were also checked: 26/1786 and 26/1757.
Their details both report `Decision Issued`, an actual decision on 2026-08-13
and 2026-08-14 respectively, and later, distinct `decisionDueDate` values of
2026-08-26 and 2026-08-24. This confirms source-status staleness in OpenList,
not an overloaded API date field.

## Thursday repair

Do not move `planning_applications.decision_date` to `decision_due_date` and do
not remove historical Decision made events. First run a bounded Cork status
reconciliation for rows with a non-null `decision_date` and a non-terminal
stored status (40 rows observed on 2026-08-18), using the current Cork search
feed and, where needed, the existing detail endpoint to obtain authoritative
status and decision text. Update only changed source fields through the normal
planning upsert/change-detection path.

For each corrected status, preserve the already valid immutable Decision made
event. If any event must be corrected after a contradictory authoritative
detail response, create a correction/provenance record through the existing
event architecture rather than deleting history; use the deterministic source
event identity so retries are idempotent. Do not run a broad historical repair
until the bounded result is reviewed.

The search feed does not expose `decisionDueDate` in the inspected rows. A
future Cork decision-due enrichment should read that field only from the detail
endpoint and remain separately bounded/rate-limited; it is not required to
correct 26/1644.
