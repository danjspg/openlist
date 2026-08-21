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
          .planning-application-layout > main > section:first-of-type > div > div:last-child {
            grid-template-columns: minmax(0, 42rem);
          }
        }
      `}</style>
    </div>
  )
}
