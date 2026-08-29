import Link from "next/link"
import { PlanningApplicationsView, metadata, revalidate } from "@/app/planning/applications/PlanningApplicationsPage"
import { getLocalitySitemap } from "@/lib/locality-seo"

export { metadata, revalidate }

function localityLabel(path: string) {
  const slug = path.split("/").at(-1) || ""
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export default async function PlanningPage() {
  const localities = (await getLocalitySitemap("planning")).slice(0, 12)

  return <>
    {localities.length ? (
      <nav className="mx-auto max-w-6xl px-4 pt-6 text-sm text-stone-600 sm:px-6" aria-label="Featured planning localities">
        <span className="mr-3 font-medium text-stone-800">Explore planning by area:</span>
        {localities.map((row) => (
          <Link
            key={row.canonical_path}
            className="mr-3 inline-block capitalize hover:text-stone-950 hover:underline"
            href={row.canonical_path}
          >
            {localityLabel(row.canonical_path)}
          </Link>
        ))}
      </nav>
    ) : null}
    <PlanningApplicationsView showCategoryLinks />
  </>
}
