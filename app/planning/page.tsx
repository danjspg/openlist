import { PlanningApplicationsView, metadata, revalidate } from "@/app/planning/applications/PlanningApplicationsPage"
import { PlanningCategoryLinks } from "@/components/planning/PlanningCategoryLinks"

export { metadata, revalidate }

export default async function PlanningPage() {
  return (
    <>
      <PlanningCategoryLinks />
      <PlanningApplicationsView />
    </>
  )
}
