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
            grid-template-columns: minmax(0, 1fr);
          }

          .planning-application-layout > main > section:first-of-type > div > div:last-child > div:last-child {
            display: grid;
            grid-template-columns: minmax(0, 1.15fr) minmax(0, 1.05fr) minmax(15rem, 0.9fr);
            grid-auto-flow: row;
            column-gap: 2rem;
            row-gap: 0.35rem;
            align-items: start;
          }

          .planning-application-layout > main > section:first-of-type > div > div:last-child > div:last-child > p:nth-child(1) {
            grid-column: 1;
            grid-row: 1;
          }

          .planning-application-layout > main > section:first-of-type > div > div:last-child > div:last-child > p:nth-child(2) {
            grid-column: 1;
            grid-row: 2;
          }

          .planning-application-layout > main > section:first-of-type > div > div:last-child > div:last-child > p:nth-child(3) {
            grid-column: 1;
            grid-row: 3;
          }

          .planning-application-layout > main > section:first-of-type > div > div:last-child > div:last-child > div {
            grid-column: 2;
            grid-row: 1 / span 4;
            align-self: stretch;
            margin-top: 0 !important;
            border-top: 0 !important;
            border-left: 1px solid rgb(231 229 228);
            padding-top: 0 !important;
            padding-left: 2rem;
          }

          .planning-application-layout > main > section:first-of-type > div > div:last-child > div:last-child > a {
            grid-column: 3;
            grid-row: 1 / span 4;
            align-self: center;
            margin-top: 0 !important;
          }
        }
      `}</style>
    </div>
  )
}
