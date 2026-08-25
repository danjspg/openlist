# OpenList direct planning source licensing audit

Reviewed: 25 August 2026

This is an operational compliance record, not legal advice. It records the planning sources OpenList actually calls directly, the material reused, the public reuse terms located, and the controls OpenList should maintain.

## Scope and principles

OpenList should distinguish between:

1. **Planning-register metadata** published by a public authority, such as reference, proposal, site address, status, dates and decision outcome.
2. **Applicant or third-party documents** made available only for statutory public inspection, such as drawings, plans, reports, photographs, maps and submissions.
3. **Personal data** appearing in a statutory register.

The direct-source integrations currently ingest planning-register metadata. They do not copy applicant-uploaded planning documents, maps, drawings or photographs into OpenList. That boundary is important because many council PSI policies expressly exclude material posted for public inspection, maps, third-party copyright material and personal data from their general reuse permission.

OpenList should continue to:

- identify the relevant local authority as the source of its planning-register data;
- identify LGMA/ePlan where that service is used;
- link back to the official record where practical;
- avoid reproducing applicant-uploaded documents, maps, drawings, photographs or submissions unless a separate licence has been verified;
- treat names and other personal data under the Privacy Notice / legitimate-interests assessment rather than assuming PSI or open-data licensing alone authorises every use;
- never use planning-register personal data for direct marketing;
- preserve source facts and clearly distinguish OpenList normalisation or derived presentation;
- comply with a more specific source licence where one is published.

## Direct source inventory

### 1. LGMA ePlan public planning register

**OpenList integration:** `lib/eplan-planning-source.mjs`

**Endpoint family:** `https://www.eplanning.ie/<authority>/AppFileRefDetails/<reference>/0`

**Authorities currently configured:**

- Carlow County Council
- Cavan County Council
- Clare County Council
- Donegal County Council
- Galway County Council
- Galway City Council
- Kildare County Council
- Kilkenny County Council
- Kerry County Council
- Laois County Council
- Limerick City and County Council
- Leitrim County Council
- Longford County Council
- Louth County Council
- Mayo County Council
- Meath County Council
- Monaghan County Council
- Waterford City and County Council
- Offaly County Council
- Roscommon County Council
- Sligo County Council
- Tipperary County Council
- Westmeath County Council
- Wicklow County Council

**Fields OpenList reads:** planning status and source-backed lifecycle fields including further-information dates, decision due date, decision date/outcome, final grant date, withdrawal date and appeal dates.

**Observed publisher/service terms:** ePlan states that it is provided by the Local Government Management Agency (LGMA) on behalf of local authorities. ePlan also warns that planning information may contain inaccuracies and that users of personal data for direct marketing must satisfy themselves that such use is lawful. LGMA publishes a PSI policy stating that information posted on its website may generally be downloaded and reused free of charge, subject to the current PSI licence, while excluding maps, third-party IP and personal data.

A sample of participating councils also publishes substantially similar PSI policies. For example, Cavan and Clare expressly allow reuse of public-sector information posted on their websites subject to the current PSI licence, while excluding planning documents/plans/maps/drawings posted for public inspection, maps, third-party material and personal data. Longford and Louth likewise state that public-sector information published on their websites may be reused subject to the current PSI licence.

**Assessment:** **Reasonable for register-metadata reuse with attribution and the exclusions above.** The safest basis is not to imply that every item visible inside an ePlan file is open licensed. OpenList should describe the reused material narrowly as public planning-register information and should not mirror linked documents, maps or submissions under the general PSI permission.

**Required public attribution:** relevant local authority; ePlan service provided by LGMA. Consolidated attribution on OpenList's Data Sources & Licensing page is reasonable, supplemented by the council name and official-record link on individual records.

**Operational risk:** low to moderate. Main risk is scope creep into uploaded documents, mapping or personal-data reuse rather than the current metadata integration.

### 2. Kildare County Council public planning enquiry endpoint

**OpenList integration:** `scripts/ingest-kildare-planning-applications.mjs`

**Public search page:** `https://webgeo.kildarecoco.ie/planningenquiry`

**Direct endpoint:** `https://webgeo.kildarecoco.ie/planningenquiry/Public/GetPlanningFileNameAddressResult`

**Fields OpenList reads:** file number, application type, development description/address, applicant name, application status, decision, received/decision/due/grant/further-information dates.

**Observed terms:** Kildare County Council publishes a PSI policy permitting reuse of information posted on its website subject to the current PSI licence, with exceptions including documents/plans/maps/drawings posted for public inspection, maps, third-party IP and personal data. Kildare also publishes planning-application open data on Ireland's Open Data Portal with CC BY 4.0 rights notes.

**Assessment:** **Strong reuse basis for planning-register data.** The direct endpoint is an official council public-planning endpoint. The open-data publication materially strengthens the reuse position for the same class of planning-register information, although OpenList should not imply that applicant-uploaded documents are covered by CC BY 4.0.

**Required public attribution:** Kildare County Council; where applicable, Irish Public Sector Information / CC BY 4.0.

**Operational risk:** low if restricted to register metadata.

### 3. Cork County Council Citizens Portal / Agile Applications

**OpenList integration:** `lib/cork-agile-authorities.mjs`, Cork ingestion and active-detail refresh scripts.

**Portal family:** `https://planning.agileapplications.ie/corkcoco/...`

**Publisher:** Cork County Council. Agile Applications Limited is the technology supplier, not the public authority whose planning register OpenList is attributing.

**Observed evidence:** Cork County Council has publicly documented procurement and rollout of an Integrated Planning Solution supplied by Agile Applications Limited as part of ePlanning. Cork County's public ePlan service also identifies LGMA as the ePlan provider on behalf of local authorities and carries the standard accuracy/direct-marketing disclaimer.

**Assessment:** **Reasonable for public planning-register metadata, but use conservative wording.** No standalone Agile portal licence was located in this audit. OpenList should attribute the underlying planning information to Cork County Council rather than implying that Agile Applications licenses the data. The general Irish public-sector reuse framework and council publication context support reuse, but OpenList should continue to exclude uploaded planning documents, maps and third-party material unless separately licensed.

**Required public attribution:** Cork County Council. Do not present Agile Applications as the data owner.

**Operational risk:** moderate only because a portal-specific licence was not located, rather than because any prohibition was found.

### 4. Cork City Council Citizens Portal / Agile Applications

**OpenList integration:** `lib/cork-agile-authorities.mjs` for Cork City records from the council's Agile migration date.

**Portal family:** `https://planning.agileapplications.ie/corkcity/...`

**Publisher:** Cork City Council.

**Observed terms:** Cork City Council states that public-sector information posted on its website may generally be downloaded and reused free of charge subject to the current PSI licence, with exclusions for planning documents/plans/maps/drawings posted for public inspection, maps, third-party IP and personal data. The Council publicly announced the Citizens Portal / Agile Planning system as its official planning search for new applications.

**Assessment:** **Reasonable for register metadata with explicit Cork City attribution and exclusions.**

**Required public attribution:** Cork City Council.

**Operational risk:** low to moderate.

### 5. Wexford County Council Citizens Portal / Agile Applications

**OpenList integration:** `lib/cork-agile-authorities.mjs` for Wexford records from 1 June 2026 onward.

**Portal family:** `https://planning.agileapplications.ie/wexford/...`

**Publisher:** Wexford County Council.

**Observed terms:** Wexford County Council publishes a PSI policy permitting free reuse of public-sector information posted on its website subject to the current PSI licence, while excluding planning documents/plans/maps/drawings posted for public inspection, maps, third-party material and personal data. The Council identifies its Citizen Portal as the official planning-application search.

**Assessment:** **Reasonable for register metadata with explicit Wexford attribution and exclusions.**

**Required public attribution:** Wexford County Council.

**Operational risk:** low to moderate.

## Consolidated compliance position

The direct integrations are materially safer than a broad web-scraping model because they target public planning registers and structured lifecycle metadata, identify themselves with an OpenList user agent, operate on scheduled/bounded refreshes rather than user-triggered scraping, and preserve links to official records.

The most important compliance boundary is **metadata versus public-inspection material**. OpenList should not treat the existence of a public planning file as permission to republish every document in that file. The current product does not do that.

A consolidated Data Sources & Licensing page is appropriate because OpenList uses many participating local authorities, but individual application pages should continue naming the council and linking to its official record. The consolidated page should expressly name the ePlan/LGMA relationship and the Cork City, Cork County, Wexford and Kildare direct-source families.

## Review trigger

Repeat this audit when any of the following happens:

- a new direct planning authority or portal is added;
- OpenList begins storing or displaying source documents, plans, drawings, maps, photographs or submissions;
- a source introduces authentication, API keys, explicit API terms, robots restrictions or rate limits materially different from today;
- a council or LGMA publishes source-specific reuse terms;
- OpenList materially changes its use of applicant names or other personal data;
- the Irish PSI/Open Data licence framework changes.
