import Link from "next/link"
import type { ReactNode } from "react"
import { getPlanningLocalityDirectory } from "@/lib/locality-seo"
import { getPlanningAuthorityBySlug } from "@/lib/planning-authorities"

export const dynamic = "force-dynamic"

type Props = {
  children: ReactNode
  params: Promise<{ authority: string; areaSlug: string }>
}

export default async function PlanningLocalityLayout({ children, params }: Props) {
  const { authority: authoritySlug, areaSlug } = await params
  const authority = getPlanningAuthorityBySlug(authoritySlug)

  if (!authority) return children

  const currentKey = normaliseLabel(areaSlug)
  const related = (await getPlanningLocalityDirectory())
    .filter((entry) => entry.authority_code === authority.code)
    .filter((entry) => normaliseLabel(entry.locality_slug) !== currentKey)
    .filter((entry) => isRelatedLocality(currentKey, normaliseLabel(entry.locality_label)))
    .sort((a, b) => b.activeCount - a.activeCount)
    .slice(0, 8)

  if (related.length === 0) return children

  return (
    <div className="bg-stone-50">
      <div className="border-b border-stone-200 bg-white">
        <nav
          className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6"
          aria-label="Similar planning areas"
        >
          <span className="mr-1 text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">
            Nearby areas
          </span>
          {related.map((entry) => (
            <Link
              key={entry.canonical_path}
              href={entry.canonical_path}
              className="inline-flex min-h-9 items-center rounded-full border border-stone-200 bg-stone-50 px-3 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:bg-white hover:text-stone-950"
            >
              {entry.locality_label}
              {entry.activeCount > 0 ? (
                <span className="ml-2 font-normal text-stone-400">{entry.activeCount.toLocaleString("en-IE")}</span>
              ) : null}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  )
}

function normaliseLabel(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

function isRelatedLocality(current: string, candidate: string) {
  if (!current || !candidate) return false
  if (candidate.startsWith(`${current} `) || candidate.endsWith(` ${current}`)) return true
  if (current.startsWith(`${candidate} `) || current.endsWith(` ${candidate}`)) return true

  const currentTokens = current.split(" ").filter((token) => token.length >= 5)
  const candidateTokens = new Set(candidate.split(" "))
  return currentTokens.some((token) => candidateTokens.has(token))
}
