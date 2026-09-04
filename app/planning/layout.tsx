import type { ReactNode } from "react"
import { PrivatePlanningAreaAlertEntry } from "@/components/planning/PrivatePlanningAreaAlertEntry"
import { PrivatePlanningAlertDiscovery } from "@/components/planning/PrivatePlanningAlertDiscovery"

export default function PlanningLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <PrivatePlanningAreaAlertEntry />
      <PrivatePlanningAlertDiscovery />
    </>
  )
}
