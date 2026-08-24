const dataset = process.argv[2]
const endpoint = process.env.PLANNING_REVALIDATION_URL?.replace(/\/+$/, "")
const secret = process.env.PLANNING_REVALIDATION_SECRET

if (!endpoint || !secret) {
  throw new Error("PLANNING_REVALIDATION_URL and PLANNING_REVALIDATION_SECRET are required")
}

if (dataset !== "planning" && dataset !== "ppr") {
  throw new Error("Usage: node scripts/revalidate-dataset-caches.mjs <planning|ppr>")
}

const response = await fetch(
  `${endpoint}/api/internal/dataset-cache-revalidate?dataset=${encodeURIComponent(dataset)}`,
  {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(30_000),
  }
)

if (!response.ok) {
  throw new Error(`Dataset cache revalidation failed (${response.status}): ${await response.text()}`)
}

console.log(`Dataset cache revalidated: ${JSON.stringify(await response.json())}`)
