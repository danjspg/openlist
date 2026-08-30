import { PlanningApplicationsView, metadata, revalidate } from "@/app/planning/applications/PlanningApplicationsPage"
import type { PlanningSearchParams } from "@/lib/planning"

export { metadata, revalidate }

type Props = { searchParams: Promise<PlanningSearchParams> }

export default async function PlanningPage({ searchParams }: Props) {
  return <PlanningApplicationsView searchParams={searchParams} showNationalLanding />
}
