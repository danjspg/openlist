import type { ReactNode } from "react"
import { PrivatePlanningAreaAlertEntry } from "@/components/planning/PrivatePlanningAreaAlertEntry"

export default function PlanningLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <PrivatePlanningAreaAlertEntry />
    </>
  )
}
