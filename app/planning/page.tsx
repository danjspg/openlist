import { PlanningApplicationsView, metadata, revalidate } from "@/app/planning/applications/PlanningApplicationsPage"

export { metadata, revalidate }

export default async function PlanningPage() {
  return <PlanningApplicationsView showCategoryLinks />
}
