import type { ReactNode } from "react"

// Locality pages expose query-driven presentation toggles. Keep the route
// dynamic so reading searchParams never collides with ISR/static rendering;
// the underlying locality page-model loader remains shared and cached.
export const dynamic = "force-dynamic"

type Props = {
  children: ReactNode
}

export default function PlanningLocalityLayout({ children }: Props) {
  return children
}
