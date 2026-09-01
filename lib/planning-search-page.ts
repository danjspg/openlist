import { getPlanningAuthorityBySlug, PLANNING_AUTHORITIES } from "@/lib/planning-authorities"
import { planningApplicationTypeValues } from "@/lib/planning-application-type"
import { normalisePlanningStatus } from "@/lib/planning-status"
import { getServerSupabase } from "@/lib/supabase"
import { PLANNING_APPLICATION_SELECT, type PlanningApplication } from "@/lib/planning"

export type PlanningPageSearch = {
  q?: string
  area?: string
  council?: string
  status?: string
  type?: string
  construction?: string
  sort?: string
  authority?: string
  offset?: number
  limit?: number
}

export async function getPlanningSearchPage(input: PlanningPageSearch) {
  const limit = Math.min(Math.max(Number(input.limit) || 25, 1), 50)
  const offset = Math.max(Number(input.offset) || 0, 0)
  const authority = input.authority ? getPlanningAuthorityBySlug(clean(input.authority)) : null
  const councilCode = authority?.code ?? councilCodeForLabel(clean(input.council))
  const q = clean(input.q)
  const area = clean(input.area)
  const status = clean(input.status)
  const type = clean(input.type)
  const construction = input.construction === "commenced" ? "commenced" : ""
  const ascending = input.sort === "oldest"

  let query = getServerSupabase()
    .from("planning_applications")
    .select(PLANNING_APPLICATION_SELECT)

  if (councilCode) query = query.eq("local_authority_code", councilCode)

  if (q) {
    const term = escapeLike(q)
    query = query.or([
      `reference.ilike.%${term}%`,
      `proposal.ilike.%${term}%`,
      `location.ilike.%${term}%`,
      `applicant_name.ilike.%${term}%`,
    ].join(","))
  }

  if (area) {
    const variants = areaVariants(area)
    query = variants.length === 1
      ? query.ilike("location", `%${escapeLike(variants[0])}%`)
      : query.or(variants.map((variant) => `location.ilike.%${escapeLike(variant)}%`).join(","))
  }

  if (status) query = query.eq("normalized_status", normalisePlanningStatus(status))

  if (type) {
    const values = planningApplicationTypeValues(type)
    if (values.length === 1) query = query.eq("application_type", values[0])
    else if (values.length > 1) query = query.in("application_type", values)
  }

  if (construction) query = query.eq("construction_status", "commenced")

  // Interactive browse/search should never depend on an exact COUNT(*) over a
  // broad cohort. Fetch one sentinel row beyond the requested page instead.
  // This keeps status-only views such as decision_made fast and still gives the
  // client an exact hasMore signal for progressive loading.
  const { data, error } = await query
    .order("registration_date", { ascending, nullsFirst: false })
    .order("reference", { ascending })
    .range(offset, offset + limit)

  if (error) {
    throw new Error(`Planning search unavailable: ${error.message}`)
  }

  const rows = (data ?? []) as PlanningApplication[]
  const hasMore = rows.length > limit
  const results = hasMore ? rows.slice(0, limit) : rows

  return {
    results,
    count: offset + results.length + (hasMore ? 1 : 0),
    offset,
    limit,
    hasMore,
  }
}

export function canonicalPlanningAreaOptions(options: string[]) {
  const byKey = new Map<string, string>()
  for (const raw of options) {
    const value = clean(raw)
    if (!value) continue
    const key = areaKey(value)
    const current = byKey.get(key)
    if (!current || areaDisplayScore(value) > areaDisplayScore(current)) byKey.set(key, value)
  }
  return [...byKey.values()].map((value) => ({ value, label: canonicalAreaLabel(value) }))
}

function councilCodeForLabel(label: string) {
  if (!label) return null
  return PLANNING_AUTHORITIES.find((authority) =>
    authority.shortName === label || authority.name === label || authority.code === label
  )?.code ?? null
}

function areaVariants(value: string) {
  const spaced = value.replace(/-/g, " ").replace(/\s+/g, " ").trim()
  const hyphenated = spaced.replace(/\s+/g, "-")
  return [...new Set([value, spaced, hyphenated])]
}

function areaKey(value: string) {
  return value.toLocaleLowerCase("en-IE").replace(/[-\s]+/g, " ").trim()
}

function canonicalAreaLabel(value: string) {
  return value
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("en-IE"))
}

function areaDisplayScore(value: string) {
  let score = 0
  if (!value.includes("-")) score += 2
  if (value === canonicalAreaLabel(value)) score += 1
  return score
}

function clean(value: string | undefined) {
  return (value ?? "").trim().slice(0, 120)
}

function escapeLike(value: string) {
  return value.replace(/[,%]/g, " ").replace(/\s+/g, " ").trim()
}
