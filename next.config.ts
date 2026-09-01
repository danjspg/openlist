import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  staticPageGenerationTimeout: 180,
  images: {
    qualities: [75, 90],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  experimental: {
    // Keep build-time ISR priming gentle on the shared data APIs. Public routes
    // still prerender, but only two data-backed pages are generated at once.
    staticGenerationMaxConcurrency: 2,
    staticGenerationMinPagesPerWorker: 1,
    staticGenerationRetryCount: 2,
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  async redirects() {
    return [
      // Legacy public URLs observed in production logs. Keep these explicit so
      // stale bookmarks/search results land on the current canonical routes.
      {
        source: "/planning/categories/residential",
        destination: "/planning/categories/residential-development",
        permanent: true,
      },
      {
        source: "/sold-prices/ballinrobe",
        destination: "/sold-prices/mayo/ballinrobe",
        permanent: true,
      },
      {
        source: "/sold-prices/bailieborough",
        destination: "/sold-prices/cavan/bailieborough",
        permanent: true,
      },
      // Dublin postal districts have first-class market pages. Do not also expose
      // locality pages such as /sold-prices/dublin/dublin-8, which only match
      // records whose locality text happens to say "Dublin 8" and therefore
      // materially undercount the district market.
      {
        source: "/sold-prices/dublin/dublin-:district(1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|18|22|24)",
        destination: "/sold-prices/dublin-:district",
        permanent: true,
      },
      {
        source: "/sold-prices/dublin/dublin-6w",
        destination: "/sold-prices/dublin-6w",
        permanent: true,
      },
      {
        source: "/sold-prices/blackrock",
        destination: "/sold-prices/blackrock-dublin",
        permanent: true,
      },
      {
        source: "/sold-prices/monkstown",
        destination: "/sold-prices/monkstown-dublin",
        permanent: true,
      },
      {
        source: "/sold-prices/newcastle",
        destination: "/sold-prices/newcastle-galway",
        permanent: true,
      },
      {
        source: "/sold-prices/johnstown",
        destination: "/sold-prices/johnstown-meath",
        permanent: true,
      },
      {
        source: "/sold-prices/springfield",
        destination: "/sold-prices/springfield-dublin",
        permanent: true,
      },
      {
        source: "/sold-prices/beaumont",
        destination: "/sold-prices/beaumont-dublin",
        permanent: true,
      },
      {
        source: "/sold-prices/wilton",
        destination: "/sold-prices/wilton-cork",
        permanent: true,
      },
    ]
  },
}

export default nextConfig
