import type { ReactNode } from "react"

// Sold-price pages and their generateMetadata functions are database-backed.
// Keep the whole segment out of build-time static generation.
export const dynamic = "force-dynamic"

export default function SoldPricesLayout({ children }: { children: ReactNode }) {
  return children
}
