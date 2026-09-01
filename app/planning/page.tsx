import { PlanningApplicationsView, metadata } from "@/app/planning/applications/PlanningApplicationsPage"

export { metadata }
export const dynamic = "force-dynamic"

export default function PlanningPage() {
  return <PlanningApplicationsView showNationalLanding />
}
