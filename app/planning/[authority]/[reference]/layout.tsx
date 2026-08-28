import type { ReactNode } from "react"
import { getPlanningApplication } from "@/lib/planning"
import { getPlanningAuthorityBySlug } from "@/lib/planning-authorities"
import { getPlanningNotableEnrichment } from "@/lib/planning-notable"

type Props = {
  children: ReactNode
  params: Promise<{ authority: string; reference: string }>
}

export default async function PlanningApplicationLayout({ children, params }: Props) {
  const resolved = await params
  const authority = getPlanningAuthorityBySlug(resolved.authority)
  const application = authority
    ? await getPlanningApplication(authority, resolved.reference)
    : null
  const notable = application
    ? await getPlanningNotableEnrichment(application.id)
    : null

  return (
    <div className="planning-application-layout">
      {notable?.displayName ? (
        <aside className="border-b border-amber-200 bg-amber-50" aria-label="Application context">
          <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
            <p className="text-sm leading-6 text-amber-950">
              <span className="font-semibold">Known as {notable.displayName}.</span>{" "}
              OpenList adds this contextual name from published reporting so the official planning record is easier to find. Council-supplied fields remain unchanged.
            </p>
          </div>
        </aside>
      ) : null}
      {children}
      <style>{`
        @media (min-width: 1024px) {
          .planning-application-layout [data-planning-detail-header] {
            grid-template-columns: minmax(0, 1fr);
          }

          .planning-application-layout [data-planning-lifecycle-card] {
            display: grid;
            grid-template-columns: minmax(0, 1.15fr) minmax(0, 1.05fr) minmax(15rem, 0.9fr);
            column-gap: 2rem;
            align-items: start;
          }

          .planning-application-layout [data-planning-lifecycle-status] {
            grid-column: 1;
          }

          .planning-application-layout [data-planning-lifecycle-decision] {
            grid-column: 2;
            align-self: stretch;
            border-left: 1px solid rgb(231 229 228);
            padding-left: 2rem;
          }

          .planning-application-layout [data-planning-lifecycle-decision-item] {
            margin-top: 0 !important;
            border-top: 0 !important;
            padding-top: 0 !important;
          }

          .planning-application-layout [data-planning-lifecycle-actions] {
            grid-column: 3;
            align-self: center;
            margin-top: 0 !important;
          }
        }
      `}</style>
    </div>
  )
}
