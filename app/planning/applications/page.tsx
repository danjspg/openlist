import { redirect } from "next/navigation"

export default async function PlanningApplicationsRedirect({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await (searchParams || Promise.resolve({}))
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item)
    } else if (typeof value === "string" && value) {
      query.set(key, value)
    }
  }

  redirect(`/planning${query.toString() ? `?${query.toString()}` : ""}`)
}
