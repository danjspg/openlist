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

type CountResponse = {
  data?: {
    pageviews?: number
    visitors?: number
  }
}

type AggregateResponse = {
  data?: Array<{
    requestPath?: string
    pageviews?: number
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
  endpoint: string,
  params: URLSearchParams
): Promise<T> {
  params.set("projectId", config.projectId)
  params.set("teamId", config.teamId)

  const response = await fetch(
    `https://api.vercel.com/v1/query/web-analytics/visits/${endpoint}?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${config.token}`,
      },
    }
  )

  if (!response.ok) {
    const body = await response.text()
    throw new Error(
      `Vercel Web Analytics ${endpoint} failed (${response.status}): ${body.slice(0, 300)}`
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
  const response = await queryVercelAnalytics<CountResponse>(config, "count", params)
  return {
    pageviews: Number(response.data?.pageviews || 0),
    visitors: Number(response.data?.visitors || 0),
  }
}

export async function topVercelPaths(
  config: VercelAnalyticsConfig,
  since: Date,
  until: Date,
  limit = 100,
  filter?: string
): Promise<VercelAnalyticsPathRow[]> {
  const params = new URLSearchParams({
    since: since.toISOString(),
    until: until.toISOString(),
    by: "requestPath",
    limit: String(Math.min(Math.max(limit, 1), 100)),
  })
  if (filter) params.set("filter", filter)
  const response = await queryVercelAnalytics<AggregateResponse>(
    config,
    "aggregate",
    params
  )

  return (response.data || []).flatMap((row) => {
    if (!row.requestPath) return []
    return [
      {
        requestPath: row.requestPath,
        pageviews: Number(row.pageviews || 0),
        visitors: Number(row.visitors || 0),
      },
    ]
  })
}
