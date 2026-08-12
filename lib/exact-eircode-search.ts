import { normaliseEircode } from "@/lib/eircode.mjs"
import type { PlanningApplication } from "@/lib/planning"
import type { PprSale, PprSearchAreaOption } from "@/lib/ppr"

export type ExactEircodeSearchDependencies = {
  findPprSales: (eircode: string) => Promise<PprSale[]>
  findPlanningApplications: (eircode: string) => Promise<PlanningApplication[]>
}

export type ExactEircodeSearchResults = {
  places: PprSearchAreaOption[]
  addresses: PprSale[]
  planningApplications: PlanningApplication[]
  intent: "eircode" | "invalid-eircode"
  eircode: string | null
}

export async function searchExactEircode(
  input: string,
  dependencies: ExactEircodeSearchDependencies
): Promise<ExactEircodeSearchResults> {
  const eircode = normaliseEircode(input)
  if (!eircode) {
    return {
      places: [],
      addresses: [],
      planningApplications: [],
      intent: "invalid-eircode",
      eircode: null,
    }
  }

  return searchCanonicalEircode(eircode, dependencies)
}

export async function searchCanonicalEircode(
  eircode: string,
  dependencies: ExactEircodeSearchDependencies
): Promise<ExactEircodeSearchResults> {
  const [addresses, planningApplications] = await Promise.all([
    dependencies.findPprSales(eircode),
    dependencies.findPlanningApplications(eircode),
  ])

  return {
    places: [],
    addresses: [...addresses].sort((a, b) =>
      b.date_of_sale.localeCompare(a.date_of_sale)
    ),
    planningApplications: [...planningApplications].sort((a, b) =>
      String(b.registration_date ?? "").localeCompare(
        String(a.registration_date ?? "")
      )
    ),
    intent: "eircode",
    eircode,
  }
}
