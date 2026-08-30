import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.openlist.ie"

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/enquiries",
        "/listings",
        "/listings/",
        "/my-listings",
        "/sell",
        "/auth/",
        "/sign-in",
      ],
    },
    sitemap: [
      `${baseUrl}/sitemap.xml`,
      `${baseUrl}/sitemaps/planning-notable.xml`,
      `${baseUrl}/sitemaps/sold-prices-localities.xml`,
      `${baseUrl}/sitemaps/planning-localities.xml`,
      `${baseUrl}/sitemaps/planning-localities-expanded.xml`,
    ],
    host: baseUrl,
  }
}
