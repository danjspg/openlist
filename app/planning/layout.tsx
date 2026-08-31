import type { ReactNode } from "react"

// Planning pages and their generateMetadata functions are database-backed.
// Keep the whole segment out of build-time static generation.
export const dynamic = "force-dynamic"

export default function PlanningLayout({ children }: { children: ReactNode }) {
  return children
}
