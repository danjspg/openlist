import type { Metadata } from "next"
import ListingsPageClient from "./ListingsPageClient"

export const metadata: Metadata = {
  title: "Property Listings Ireland | Homes for Sale",
  description:
    "Browse private property listings across Ireland, with homes and sites listed directly by sellers on OpenList.",
  alternates: {
    canonical: "/listings",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function ListingsPage() {
  return <ListingsPageClient />
}
