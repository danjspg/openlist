import Link from "next/link"
import { PlanningApplicationsView, metadata, revalidate } from "@/app/planning/applications/PlanningApplicationsPage"
import { getLocalitySitemap } from "@/lib/locality-seo"
import type { PlanningSearchParams } from "@/lib/planning"

export { metadata, revalidate }

function localityLabel(path: string) {
  const slug = path.split("/").at(-1) || ""
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

type Props = { searchParams: Promise<PlanningSearchParams> }

export default async function PlanningPage({ searchParams }: Props) {
  const localities = (await getLocalitySitemap("planning")).slice(0, 10)

  return <>
    {localities.length ? (
      <nav className="mx-auto max-w-6xl px-4 pt-6 text-sm text-stone-600 sm:px-6" aria-label="Popular planning areas">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <span className="font-medium text-stone-800">Popular planning areas:</span>
          {localities.map((row) => (
            <Link
              key={row.canonical_path}
              className="inline-block hover:text-stone-950 hover:underline"
              href={row.canonical_path}
            >
              {localityLabel(row.canonical_path)}
            </Link>
          ))}
          <Link className="font-semibold text-emerald-800 hover:text-emerald-950 hover:underline" href="/planning/areas">
            Browse all areas →
          </Link>
        </div>
      </nav>
    ) : null}
    <PlanningApplicationsView searchParams={searchParams} showCategoryLinks />
  </>
}
