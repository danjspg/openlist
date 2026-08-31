import { NextResponse } from "next/server"
import { getPlanningLocalityDirectory } from "@/lib/locality-seo"
import { getPprAreaSuggestions } from "@/lib/ppr"
import { PLANNING_AUTHORITIES, getPlanningAuthorityByCode } from "@/lib/planning-authorities"
import { PLANNING_PUBLIC_CATEGORIES } from "@/lib/planning-public-categories"
import { rankPlaceSuggestions } from "@/lib/place-search"

export const dynamic = "force-dynamic"

type Suggestion = {
  id: string
  label: string
  detail: string
  href: string
  kind: "place" | "authority" | "category" | "activity" | "sold-prices"
  exact?: boolean
  score: number
}

const activitySuggestions = [
  { terms: ["construction", "commenced", "started", "building"], label: "Construction started", detail: "Planning applications with verified commencement records", href: "/planning?construction=commenced" },
  { terms: ["decision", "decisions", "decided", "outcome"], label: "Recent planning decisions", detail: "Browse applications at decision stage", href: "/planning?status=decision_made" },
  { terms: ["further information", "further info", "fi"], label: "Further information requested", detail: "Applications where more information has been requested", href: "/planning?status=further_information_requested" },
  { terms: ["appeal", "appealed", "under appeal", "appeals"], label: "Under appeal", detail: "Applications with an appeal lodged", href: "/planning?status=appealed" },
  { terms: ["appeal decided", "appeal decision", "appeals decided"], label: "Appeal decided", detail: "Applications with a recorded appeal outcome", href: "/planning?status=appeal_decided" },
]

export async function GET(request: Request) {
  const url = new URL(request.url)
  const query = clean(url.searchParams.get("q") || "")
  const scope = url.searchParams.get("scope") === "planning" ? "planning" : "unified"
  if (query.length < 2) return NextResponse.json({ suggestions: [] })

  const [localities, pprPlaces] = await Promise.all([
    getPlanningLocalityDirectory().catch(() => []),
    scope === "unified" ? getPprAreaSuggestions(query).catch(() => []) : Promise.resolve([]),
  ])
  const queryKey = normalise(query)
  const suggestions: Suggestion[] = []

  const localityMatches = localities
    .map((entry) => {
      const labelKey = normalise(entry.locality_label)
      const slugKey = normalise(entry.locality_slug)
      const exact = labelKey === queryKey || slugKey === queryKey
      const prefix = labelKey.startsWith(queryKey)
      const contains = labelKey.includes(queryKey)
      if (!exact && !prefix && !contains) return null
      const authority = entry.authority_code ? getPlanningAuthorityByCode(entry.authority_code) : null
      const score = (exact ? 5000 : prefix ? 3000 : 1200) + Math.log10(entry.activeCount + 1) * 80
      return {
        id: `planning-place:${entry.canonical_path}`,
        label: entry.locality_label,
        detail: `${authority?.shortName ?? entry.county ?? "Planning area"} · ${entry.activeCount.toLocaleString("en-IE")} active planning records`,
        href: entry.canonical_path,
        kind: "place" as const,
        exact,
        score,
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, scope === "planning" ? 6 : 4)

  suggestions.push(...localityMatches)

  for (const authority of PLANNING_AUTHORITIES) {
    const labels = [authority.name, authority.shortName, authority.slug]
    const exact = labels.some((value) => normalise(value) === queryKey)
    const prefix = labels.some((value) => normalise(value).startsWith(queryKey))
    if (!exact && !prefix) continue
    suggestions.push({ id: `authority:${authority.code}`, label: authority.shortName, detail: "Local authority planning overview", href: `/planning/${authority.slug}`, kind: "authority", exact, score: exact ? 4300 : 2200 })
  }

  for (const category of PLANNING_PUBLIC_CATEGORIES) {
    const labels = [category.shortLabel, category.label, category.slug]
    const exact = labels.some((value) => normalise(value) === queryKey)
    const prefix = labels.some((value) => normalise(value).startsWith(queryKey))
    const contains = labels.some((value) => normalise(value).includes(queryKey))
    if (!exact && !prefix && !contains) continue
    suggestions.push({ id: `category:${category.slug}`, label: category.shortLabel, detail: "Notable planning development category", href: `/planning/categories/${category.slug}`, kind: "category", exact, score: exact ? 4200 : prefix ? 2100 : 900 })
  }

  for (const activity of activitySuggestions) {
    const exact = activity.terms.some((term) => normalise(term) === queryKey)
    const prefix = activity.terms.some((term) => normalise(term).startsWith(queryKey) || queryKey.startsWith(normalise(term)))
    if (!exact && !prefix) continue
    suggestions.push({ id: `activity:${activity.href}`, label: activity.label, detail: activity.detail, href: activity.href, kind: "activity", exact, score: exact ? 4100 : 2000 })
  }

  if (scope === "unified" && pprPlaces.length > 0) {
    const ranked = rankPlaceSuggestions(query, pprPlaces, 4)
    for (const place of ranked) {
      const exact = normalise(place.areaLabel) === queryKey || normalise(place.areaSlug) === queryKey
      suggestions.push({ id: `sold-prices:${place.county}:${place.areaSlug}`, label: `${place.areaLabel} sold prices`, detail: `${place.county} · ${place.salesCount.toLocaleString("en-IE")} recorded sales`, href: `/sold-prices/${place.county.toLowerCase()}/${place.areaSlug}`, kind: "sold-prices", exact, score: exact ? 3800 : 1500 + Math.log10(place.salesCount + 1) * 50 })
    }
  }

  const ranked = Array.from(new Map(suggestions.map((item) => [item.href, item])).values())
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "en-IE", { sensitivity: "base" }))
    .slice(0, 7)
  const bestExactIndex = ranked.findIndex((item) => item.exact)
  const deduped = ranked.map((item, index) => ({
    id: item.id,
    label: item.label,
    detail: item.detail,
    href: item.href,
    kind: item.kind,
    exact: index === bestExactIndex && item.exact,
  }))

  return NextResponse.json({ suggestions: deduped }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } })
}

function clean(value: string) { return value.replace(/\s+/g, " ").trim().slice(0, 80) }
function normalise(value: string) { return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ") }
