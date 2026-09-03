const endpoint = process.env.PLANNING_REVALIDATION_URL?.replace(/\/+$/, "")
const secret = process.env.PLANNING_REVALIDATION_SECRET
const maxBatches = Math.max(1, Number(process.env.PLANNING_REVALIDATION_MAX_BATCHES || 20))
const maxConsecutiveFailedBatches = 3
const maxConsecutiveStalledBatches = 2
const maxAgeMinutes = Math.max(1, Number(process.env.PLANNING_REVALIDATION_MAX_AGE_MINUTES || 1440))

if (!endpoint || !secret) {
  throw new Error("PLANNING_REVALIDATION_URL and PLANNING_REVALIDATION_SECRET are required")
}

let consecutiveFailedBatches = 0
let consecutiveStalledBatches = 0
let totalInvalidated = 0
let finalResult = null

for (let batch = 1; batch <= maxBatches; batch += 1) {
  const response = await fetch(`${endpoint}/api/internal/planning-revalidate`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  })
  if (!response.ok) {
    throw new Error(`Planning revalidation request failed (${response.status}): ${await response.text()}`)
  }

  const result = await response.json()
  finalResult = result
  totalInvalidated += Number(result.invalidated || 0)
  console.log(`Planning revalidation batch ${batch}: ${JSON.stringify(result)}`)

  if (result.failures > 0) {
    consecutiveFailedBatches += 1
    if (consecutiveFailedBatches >= maxConsecutiveFailedBatches) {
      throw new Error("Planning revalidation repeatedly left failed records pending")
    }
  } else {
    consecutiveFailedBatches = 0
  }

  if (result.selected > 0 && result.invalidated === 0) {
    consecutiveStalledBatches += 1
    if (consecutiveStalledBatches >= maxConsecutiveStalledBatches) {
      throw new Error("Planning revalidation queue stalled without making progress")
    }
  } else {
    consecutiveStalledBatches = 0
  }

  if (result.remaining === 0) {
    console.log(`Planning revalidation queue drained; invalidated ${totalInvalidated} page(s) this run.`)
    process.exit(0)
  }
}

if (!finalResult) process.exit(0)

const oldestRequestedAt = finalResult.oldestRequestedAt
if (oldestRequestedAt) {
  const oldestAgeMinutes = (Date.now() - Date.parse(oldestRequestedAt)) / 60000
  if (Number.isFinite(oldestAgeMinutes) && oldestAgeMinutes > maxAgeMinutes) {
    throw new Error(
      `Planning revalidation backlog is aged: oldest request is ${Math.round(oldestAgeMinutes)} minutes old with ${finalResult.remaining} remaining`
    )
  }
}

console.log(
  `Planning revalidation bounded run complete; invalidated ${totalInvalidated} page(s), ${finalResult.remaining} remain for the next scheduled run.`
)
