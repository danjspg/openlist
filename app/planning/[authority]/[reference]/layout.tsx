import type { ReactNode } from "react"

export default function PlanningApplicationLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <div className="planning-application-layout">
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
