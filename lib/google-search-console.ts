import { GoogleAuth } from "google-auth-library"

const SEARCH_CONSOLE_SCOPE =
  "https://www.googleapis.com/auth/webmasters.readonly"

export type SearchAnalyticsRow = {
  keys?: string[]
  clicks?: number
  impressions?: number
  ctr?: number
  position?: number
}

export type SearchAnalyticsResponse = {
  rows?: SearchAnalyticsRow[]
}

export type SearchConsoleSitemap = {
  path?: string
  lastSubmitted?: string
  isPending?: boolean
  isSitemapsIndex?: boolean
  lastDownloaded?: string
  warnings?: string
  errors?: string
  contents?: Array<{
    type?: string
    submitted?: string
    indexed?: string
  }>
}

export type SearchConsoleSitemapsResponse = {
  sitemap?: SearchConsoleSitemap[]
}

export type GoogleSearchConsoleConfig = {
  siteUrl: string
  credentials: Record<string, unknown>
}

export function readGoogleSearchConsoleConfig(
  env: NodeJS.ProcessEnv = process.env
): GoogleSearchConsoleConfig {
  const siteUrl = env.GOOGLE_SEARCH_CONSOLE_SITE_URL?.trim()
  if (!siteUrl) {
    throw new Error("Missing GOOGLE_SEARCH_CONSOLE_SITE_URL")
  }

  const encoded = env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON_BASE64?.trim()
  const raw = env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON?.trim()
  if (!encoded && !raw) {
    throw new Error(
      "Missing GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON_BASE64 or GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON"
    )
  }

  try {
    return {
      siteUrl,
      credentials: JSON.parse(
        encoded ? Buffer.from(encoded, "base64").toString("utf8") : raw!
      ) as Record<string, unknown>,
    }
  } catch {
    throw new Error("Search Console service-account credentials are not valid JSON")
  }
}

export function createGoogleSearchConsoleClient(
  config: GoogleSearchConsoleConfig
) {
  const auth = new GoogleAuth({
    credentials: config.credentials,
    scopes: [SEARCH_CONSOLE_SCOPE],
  })
  const encodedSiteUrl = encodeURIComponent(config.siteUrl)

  async function queryPathPerformance(
    startDate: string,
    endDate: string,
    pathContains: string
  ) {
    const rows: SearchAnalyticsRow[] = []
    const rowLimit = 25_000

    // Search Console caps page/date exports at 50,000 rows per search type.
    for (const startRow of [0, rowLimit]) {
      const client = await auth.getClient()
      const response = await client.request<SearchAnalyticsResponse>({
        url: `https://www.googleapis.com/webmasters/v3/sites/${encodedSiteUrl}/searchAnalytics/query`,
        method: "POST",
        data: {
          startDate,
          endDate,
          dimensions: ["date", "page"],
          dimensionFilterGroups: [
            {
              filters: [
                {
                  dimension: "page",
                  operator: "contains",
                  expression: pathContains,
                },
              ],
            },
          ],
          type: "web",
          dataState: "final",
          aggregationType: "byPage",
          rowLimit,
          startRow,
        },
      })
      const page = response.data.rows || []
      rows.push(...page)
      if (page.length < rowLimit) break
    }

    return rows
  }

  return {
    async listSitemaps() {
      const client = await auth.getClient()
      const response = await client.request<SearchConsoleSitemapsResponse>({
        url: `https://www.googleapis.com/webmasters/v3/sites/${encodedSiteUrl}/sitemaps`,
      })
      return response.data.sitemap || []
    },

    queryPathPerformance,

    async queryPlanningPerformance(dataDate: string) {
      return queryPathPerformance(dataDate, dataDate, "/planning/")
    },

    async querySoldPricesPerformance(startDate: string, endDate: string) {
      return queryPathPerformance(startDate, endDate, "/sold-prices/")
    },

    async inspectUrl<T = unknown>(inspectionUrl: string) {
      const client = await auth.getClient()
      const response = await client.request<T>({
        url: "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
        method: "POST",
        data: {
          inspectionUrl,
          siteUrl: config.siteUrl,
          languageCode: "en-US",
        },
      })
      return response.data
    },
  }
}
