import { PLANNING_PUBLIC_CATEGORIES } from "@/lib/planning-public-category-definitions"

export const PLANNING_AREA_ALERT_RADII = [500, 1000, 2000, 5000, 10000, 20000, 50000] as const
export type PlanningAreaAlertRadius = typeof PLANNING_AREA_ALERT_RADII[number]

export const PLANNING_AREA_ALERT_TRIGGERS = [
  { value: "new", label: "A new application is submitted" },
  { value: "approved", label: "An application is approved" },
  { value: "appealed", label: "An appeal is lodged" },
  { value: "construction", label: "Construction starts" },
] as const
export type PlanningAreaAlertTrigger = typeof PLANNING_AREA_ALERT_TRIGGERS[number]["value"]

const selectedCategorySlugs = new Set([
  "residential-development",
  "large-residential",
  "wind-farms",
  "solar-energy",
  "battery-storage",
  "retail",
  "hotels-restaurants",
  "student-accommodation",
  "data-centres",
  "infrastructure",
  "transport",
  "industrial-logistics",
  "waste-recycling",
  "quarrying",
])

export const PLANNING_AREA_ALERT_CATEGORIES = [
  {
    value: "all",
    label: "Any planning application",
    description: "Every mapped planning application, regardless of development type.",
  },
  {
    value: "residential-development",
    label: "Residential development (10+ homes)",
    description: "Housing and apartment schemes of 10 or more homes, including large residential developments.",
  },
  ...PLANNING_PUBLIC_CATEGORIES
    .filter((category) => selectedCategorySlugs.has(category.slug) && category.slug !== "residential-development")
    .map((category) => ({
      value: category.slug,
      label: category.shortLabel,
      description: category.description,
    })),
] as const

export type PlanningAreaAlertCategory = typeof PLANNING_AREA_ALERT_CATEGORIES[number]["value"]

export type PlanningAreaAlertSubscription = {
  id: string
  user_id: string
  source_application_id: string | null
  label: string
  center_lat: number
  center_lng: number
  radius_m: number
  category: PlanningAreaAlertCategory
  event_trigger: PlanningAreaAlertTrigger
  enabled: boolean
  created_at: string
  updated_at: string
}

export function planningAreaAlertCategoryLabel(category: string) {
  return PLANNING_AREA_ALERT_CATEGORIES.find((item) => item.value === category)?.label ?? category
}

export function planningAreaAlertTriggerLabel(trigger: string) {
  return PLANNING_AREA_ALERT_TRIGGERS.find((item) => item.value === trigger)?.label ?? trigger
}

export function planningAreaAlertRadiusLabel(radiusM: number) {
  return radiusM < 1000 ? `${radiusM} m` : `${radiusM / 1000} km`
}

export function isPlanningAreaAlertCategory(value: string): value is PlanningAreaAlertCategory {
  return PLANNING_AREA_ALERT_CATEGORIES.some((item) => item.value === value)
}

export function isPlanningAreaAlertTrigger(value: string): value is PlanningAreaAlertTrigger {
  return PLANNING_AREA_ALERT_TRIGGERS.some((item) => item.value === value)
}

export function isPlanningAreaAlertRadius(value: number): value is PlanningAreaAlertRadius {
  return PLANNING_AREA_ALERT_RADII.includes(value as PlanningAreaAlertRadius)
}

export function notableCategoriesMatchAreaAlert(category: string, notableCategories: string[] | null | undefined) {
  if (category === "all") return true
  const categories = new Set(notableCategories ?? [])
  if (category === "residential-development") {
    return categories.has("residential-development") || categories.has("large-residential")
  }
  return categories.has(category)
}
