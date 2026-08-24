const endpoint = process.env.PLANNING_REVALIDATION_URL?.replace(/\/+$/, "")
const secret = process.env.PLANNING_REVALIDATION_SECRET
const queue = process.env.PLANNING_REVALIDATION_QUEUE
const maxBatches = 20
const maxConsecutiveFailedBatches = 3

if (!endpoint || !secret) {
  throw new Error("PLANNING_REVALIDATION_URL and PLANNING_REVALIDATION_SECRET are required")
}

let consecutiveFailedBatches = 0
for (let batch = 1; batch <= maxBatches; batch += 1) {
  const query = queue ? `?queue=${encodeURIComponent(queue)}` : ""
  const response = await fetch(`${endpoint}/api/internal/planning-revalidate${query}`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  })
  if (!response.ok) {
    throw new Error(`Planning revalidation request failed (${response.status}): ${await response.text()}`)
  }
  const result = await response.json()
  console.log(`Planning revalidation batch ${batch}: ${JSON.stringify(result)}`)
  if (result.failures > 0) {
    consecutiveFailedBatches += 1
    if (consecutiveFailedBatches >= maxConsecutiveFailedBatches) {
      throw new Error("Planning revalidation repeatedly left failed records pending")
    }
  } else {
    consecutiveFailedBatches = 0
  }
  if (result.remaining === 0) process.exit(0)
}

throw new Error(`Planning revalidation exceeded ${maxBatches} bounded batches`)
