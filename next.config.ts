import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  async redirects() {
    return [
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
