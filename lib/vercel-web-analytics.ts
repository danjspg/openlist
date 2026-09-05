type VercelAnalyticsConfig = {
  token: string
  projectId: string
  teamId: string
}

export type VercelAnalyticsCount = {
  pageviews: number
  visitors: number
}

export type VercelAnalyticsPathRow = VercelAnalyticsCount & {
  requestPath: string
}

export type VercelAnalyticsDimension =
  | "requestPath"
  | "route"
  | "country"
  | "referrerHostname"
  | "deviceType"
  | "osName"
  | "browserName"
  | "utmSource"
  | "utmMedium"
  | "utmCampaign"
  | "utmContent"
  | "utmTerm"

export type VercelAnalyticsDimensionRow = VercelAnalyticsCount & {
  value: string
}

export type VercelAnalyticsEventRow = {
  eventName: string
  count: number
  visitors: number
}

type CountResponse = {
  data?: {
    pageviews?: number
    visitors?: number
  }
}

type AggregateResponse = {
  data?: Array<Record<string, unknown> & {
    pageviews?: number
    visitors?: number
  }>
}

type EventAggregateResponse = {
  data?: Array<Record<string, unknown> & {
    count?: number
    visitors?: number
  }>
}

export function readVercelAnalyticsConfig(): VercelAnalyticsConfig | null {
  const token = process.env.VERCEL_TOKEN?.trim()
  const projectId = process.env.VERCEL_PROJECT_ID?.trim()
  const teamId = process.env.VERCEL_TEAM_ID?.trim()
  if (!token || !projectId || !teamId) return null
  return { token, projectId, teamId }
}

async function queryVercelAnalytics<T>(
  config: VercelAnalyticsConfig,
  resource: "visits" | "events",
  endpoint: "count" | "aggregate",
  params: URLSearchParams
): Promise<T> {
  params.set("projectId", config.projectId)
  params.set("teamId", config.teamId)

  const response = await fetch(
    `https://api.vercel.com/v1/query/web-analytics/${resource}/${endpoint}?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${config.token}`,
      },
    }
  )

  if (!response.ok) {
    const body = await response.text()
    throw new Error(
      `Vercel Web Analytics ${resource}/${endpoint} failed (${response.status}): ${body.slice(0, 300)}`
    )
  }

  return (await response.json()) as T
}

export async function countVercelVisits(
  config: VercelAnalyticsConfig,
  since: Date,
  until: Date,
  filter?: string
): Promise<VercelAnalyticsCount> {
  const params = new URLSearchParams({
    since: since.toISOString(),
    until: until.toISOString(),
  })
  if (filter) params.set("filter", filter)
  const response = await queryVercelAnalytics<CountResponse>(config, "visits", "count", params)
  return {
    pageviews: Number(response.data?.pageviews || 0),
    visitors: Number(response.data?.visitors || 0),
  }
}

export async function topVercelDimension(
  config: VercelAnalyticsConfig,
  since: Date,
  until: Date,
  by: VercelAnalyticsDimension,
  limit = 10,
  filter?: string
): Promise<VercelAnalyticsDimensionRow[]> {
  const params = new URLSearchParams({
    since: since.toISOString(),
    until: until.toISOString(),
    by,
    limit: String(Math.min(Math.max(limit, 1), 100)),
  })
  if (filter) params.set("filter", filter)
  const response = await queryVercelAnalytics<AggregateResponse>(
    config,
    "visits",
    "aggregate",
    params
  )

  return (response.data || []).flatMap((row) => {
    const raw = row[by]
    if (typeof raw !== "string" || !raw) return []
    return [{
      value: raw,
      pageviews: Number(row.pageviews || 0),
      visitors: Number(row.visitors || 0),
    }]
  })
}

export async function topVercelPaths(
  config: VercelAnalyticsConfig,
  since: Date,
  until: Date,
  limit = 100,
  filter?: string
): Promise<VercelAnalyticsPathRow[]> {
  const rows = await topVercelDimension(config, since, until, "requestPath", limit, filter)
  return rows.map((row) => ({
    requestPath: row.value,
    pageviews: row.pageviews,
    visitors: row.visitors,
  }))
}

export async function topVercelEvents(
  config: VercelAnalyticsConfig,
  since: Date,
  until: Date,
  limit = 20
): Promise<VercelAnalyticsEventRow[]> {
  const params = new URLSearchParams({
    since: since.toISOString(),
    until: until.toISOString(),
    by: "eventName",
    limit: String(Math.min(Math.max(limit, 1), 100)),
  })
  const response = await queryVercelAnalytics<EventAggregateResponse>(
    config,
    "events",
    "aggregate",
    params
  )

  return (response.data || []).flatMap((row) => {
    const eventName = row.eventName
    if (typeof eventName !== "string" || !eventName) return []
    return [{
      eventName,
      count: Number(row.count || 0),
      visitors: Number(row.visitors || 0),
    }]
  })
}
