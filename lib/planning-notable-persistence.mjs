import {
  classifyPlanningNotability,
  DETERMINISTIC_NOTABLE_CATEGORIES,
} from "./planning-notable-classifier.mjs"
import { evaluatePlanningNotableEligibility } from "./planning-notable-eligibility.mjs"

const DETERMINISTIC_SOURCE = "deterministic"
const PRESS_SOURCE = "press"
const PRESS_CATEGORY = "press"

const asObject = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {}
const uniqueSorted = (values) => [...new Set((values || []).map(String).filter(Boolean))].sort()

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
}

function sameJson(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right))
}

export function notableSources(existing) {
  if (Array.isArray(existing?.classification_sources)) {
    return uniqueSorted(existing.classification_sources)
  }
  return existing?.source ? [String(existing.source)] : []
}

export function buildDeterministicNotableMutation(
  application,
  existing,
  classification,
  eligibilityOptions = {}
) {
  const result = classification || classifyPlanningNotability(application)
  const sources = new Set(notableSources(existing))
  sources.delete(DETERMINISTIC_SOURCE)
  if (result.notable) sources.add(DETERMINISTIC_SOURCE)

  const categories = new Set(Array.isArray(existing?.notable_categories) ? existing.notable_categories : [])
  for (const category of DETERMINISTIC_NOTABLE_CATEGORIES) categories.delete(category)
  for (const category of result.categories) categories.add(category)

  const reasons = { ...asObject(existing?.classification_reasons) }
  if (result.notable) {
    reasons.deterministic = {
      classifierVersion: result.signals.classifierVersion,
      categories: result.categories,
      reasons: result.reasons,
      signals: result.signals,
    }
  } else {
    delete reasons.deterministic
  }

  const classificationSources = uniqueSorted([...sources])
  const notableCategories = uniqueSorted([...categories])
  const active = classificationSources.length > 0
  const eligibility = evaluatePlanningNotableEligibility(application, existing, {
    ...eligibilityOptions,
    structurallyNotable: result.notable,
  })
  if (!existing && !result.notable) return { changed: false, row: null, classification: result }

  const row = {
    application_id: application.id,
    source: existing?.source || DETERMINISTIC_SOURCE,
    reason: existing?.reason || result.reasons.join("; ") || "Deterministic Planning notability classification.",
    evidence: asObject(existing?.evidence),
    active,
    priority_eligible: eligibility.priorityEligible,
    display_name: existing?.display_name || null,
    search_aliases: Array.isArray(existing?.search_aliases) ? existing.search_aliases : [],
    notable_categories: notableCategories,
    classification_reasons: reasons,
    classification_sources: classificationSources,
  }

  const changed = !existing
    || Boolean(existing.active) !== active
    || Boolean(existing.priority_eligible) !== eligibility.priorityEligible
    || !sameJson(uniqueSorted(existing.notable_categories), notableCategories)
    || !sameJson(uniqueSorted(existing.classification_sources), classificationSources)
    || !sameJson(asObject(existing.classification_reasons), reasons)

  return { changed, row, classification: result, eligibility }
}

export function mergePressNotableMetadata(existing, enrichment) {
  const sources = new Set(notableSources(existing))
  sources.add(PRESS_SOURCE)
  const categories = new Set(Array.isArray(existing?.notable_categories) ? existing.notable_categories : [])
  categories.add(PRESS_CATEGORY)
  const reasons = {
    ...asObject(existing?.classification_reasons),
    press: { reasons: ["Matched to Irish press coverage"] },
  }

  return {
    application_id: enrichment.applicationId,
    source: PRESS_SOURCE,
    reason: "Notable Planning application identified from Irish press coverage.",
    evidence: { ...asObject(existing?.evidence), ...asObject(enrichment.evidence) },
    active: true,
    priority_eligible: true,
    display_name: existing?.display_name || enrichment.displayName || null,
    search_aliases: [...new Set([
      ...(Array.isArray(existing?.search_aliases) ? existing.search_aliases : []),
      ...(enrichment.searchAliases || []),
    ].filter(Boolean))].slice(0, 50),
    notable_categories: uniqueSorted([...categories]),
    classification_reasons: reasons,
    classification_sources: uniqueSorted([...sources]),
  }
}

const NOTABLE_SELECT = "application_id,source,reason,evidence,active,priority_eligible,display_name,search_aliases,notable_categories,classification_reasons,classification_sources"

export async function classifyAndPersistPlanningApplications(
  supabase,
  applications,
  {
    dryRun = false,
    enqueue = true,
    now = () => new Date().toISOString(),
    retentionMonths,
  } = {}
) {
  const rows = applications.filter((application) => application?.id)
  if (!rows.length) return { scanned: 0, notable: 0, changed: 0, created: 0, updated: 0, changedIds: [], results: [] }

  const ids = rows.map((row) => row.id)
  const { data: existingRows, error: existingError } = await supabase
    .from("planning_seo_notable")
    .select(NOTABLE_SELECT)
    .in("application_id", ids)
  if (existingError) throw existingError
  const existingById = new Map((existingRows || []).map((row) => [row.application_id, row]))
  const changedAt = now()

  const results = rows.map((application) => {
    const existing = existingById.get(application.id) || null
    return {
      application,
      existing,
      ...buildDeterministicNotableMutation(application, existing, undefined, {
        asOf: changedAt,
        retentionMonths,
      }),
    }
  })
  const changed = results.filter((result) => result.changed && result.row)

  if (!dryRun && changed.length) {
    const { error } = await supabase.from("planning_seo_notable").upsert(
      changed.map((item) => ({ ...item.row, updated_at: changedAt })),
      { onConflict: "application_id" }
    )
    if (error) throw error

    if (enqueue) {
      const { error: queueError } = await supabase.from("planning_revalidation_queue").upsert(
        changed.map((item) => ({ application_id: item.application.id, requested_at: changedAt })),
        { onConflict: "application_id" }
      )
      if (queueError) throw queueError
    }
  }

  return {
    scanned: rows.length,
    notable: results.filter((result) => result.classification.notable).length,
    changed: changed.length,
    created: changed.filter((result) => !result.existing).length,
    updated: changed.filter((result) => result.existing).length,
    changedIds: changed.map((result) => result.application.id),
    results,
  }
}
