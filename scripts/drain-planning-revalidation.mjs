const endpoint = process.env.PLANNING_REVALIDATION_URL?.replace(/\/+$/, "")
const secret = process.env.PLANNING_REVALIDATION_SECRET
const maxBatches = 20

if (!endpoint || !secret) {
  throw new Error("PLANNING_REVALIDATION_URL and PLANNING_REVALIDATION_SECRET are required")
}

for (let batch = 1; batch <= maxBatches; batch += 1) {
  const response = await fetch(`${endpoint}/api/internal/planning-revalidate`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  })
  if (!response.ok) {
    throw new Error(`Planning revalidation request failed (${response.status}): ${await response.text()}`)
  }
  const result = await response.json()
  console.log(`Planning revalidation batch ${batch}: ${JSON.stringify(result)}`)
  if (result.failures > 0) {
    throw new Error("Planning revalidation left failed records pending for retry")
  }
  if (result.remaining === 0) process.exit(0)
}

throw new Error(`Planning revalidation exceeded ${maxBatches} bounded batches`)
