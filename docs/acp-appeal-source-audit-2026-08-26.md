# An Coimisiún Pleanála appeal source audit

Reviewed: 26 August 2026

This is an operational compliance and integration record, not legal advice.

## Source

OpenList uses the official **Cases (2016 onwards) received or decided by An Coimisiún Pleanála on or after 1 January 2016** dataset published by An Coimisiún Pleanála on Ireland's Open Data Portal.

- Publisher: An Coimisiún Pleanála
- Licence: Creative Commons Attribution 4.0 International (CC BY 4.0)
- Published frequency: weekly
- Structured source: official ArcGIS FeatureServer
- Official case detail: `https://www.pleanala.ie/en-ie/case/<case-number>`

The structured layer provides case number, development description/address, received date, decision status, decision date, planning authority, category, source update timestamp and an official case link.

## Matching boundary

The ArcGIS layer does not expose the local planning-authority application reference needed for a safe deterministic join to OpenList. The official An Coimisiún Pleanála case page does expose a **Planning Authority Case Reference** and **Case Type**.

OpenList therefore uses a two-stage process:

1. ingest the official structured case dataset without guessing a local planning reference;
2. for a bounded set of official case pages, read the Planning Authority Case Reference and Case Type;
3. link only cases whose case type identifies an appeal and whose planning-authority reference matches exactly and uniquely within the stated planning authority.

Address-only or fuzzy-text matching is not used to create an authoritative appeal link.

## Presentation and provenance

Appeal milestones sourced from An Coimisiún Pleanála are stored separately from the council planning record and identified with `event_source = an_coimisiun_pleanala_open_data`. Where the council record and An Coimisiún Pleanála contain the same appeal milestone on the same date, the public timeline prefers the An Coimisiún Pleanála milestone while preserving the underlying source records.

Initial historical enrichment is recorded as reconstructed history and is not treated as a newly observed alert event.

## Source limitations

The publisher states that the open dataset is not exhaustive. Invalid and withdrawn cases may be omitted, cases may appear after a delay, and the An Coimisiún Pleanála website should be consulted for the most current case information. OpenList therefore must not interpret absence from the dataset as proof that no appeal exists.

## Compliance assessment

**Assessment: strong reuse basis for the published structured data, with conservative matching controls.** The dataset is explicitly published under CC BY 4.0. Public attribution should identify An Coimisiún Pleanála and link to the official dataset/case where practical.

OpenList should not imply that the Commission endorses OpenList, and should distinguish source facts from OpenList's derived case-to-planning matching.

## Review triggers

Repeat this audit if:

- the ArcGIS schema or case-page structure materially changes;
- the published licence or update frequency changes;
- OpenList adds fuzzy appeal matching;
- OpenList begins ingesting appeal documents rather than case metadata;
- alert delivery is extended to changes detected directly from the An Coimisiún Pleanála source.
