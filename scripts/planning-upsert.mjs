function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryablePlanningUpsertError(error) {
  return (
    ["57014", "57P01", "08000", "08001", "08003", "08006", "53300"].includes(
      error?.code
    ) || /fetch failed|timeout|temporar|connection/i.test(error?.message || "")
  )
}

async function enqueuePlanningRevalidation(supabase, batch, label, attempt = 1) {
  if (batch.length === 0) return []

  const queuedAt = new Date().toISOString()
  const queueRows = batch.map((record) => ({
    local_authority_code: record.local_authority_code,
    reference: record.reference,
    created_at: queuedAt,
  }))

  const { error } = await supabase
    .from("planning_revalidation_queue")
    .upsert(queueRows, { onConflict: "local_authority_code,reference" })

  if (!error) {
    return batch.map((record) => ({
      localAuthorityCode: record.local_authority_code,
      reference: record.reference,
    }))
  }

  if (isRetryablePlanningUpsertError(error) && attempt < 4) {
    const delayMs = attempt * 1000
    console.warn(
      `${label}: transient Planning revalidation enqueue failure; retrying ${batch.length} rows in ${delayMs}ms (attempt ${attempt}/3).`
    )
    await sleep(delayMs)
    return enqueuePlanningRevalidation(supabase, batch, label, attempt + 1)
  }

  throw error
}

export async function upsertPlanningBatch(
  supabase,
  batch,
  label,
  attempt = 1
) {
  const { error } = await supabase
    .from("planning_applications")
    .upsert(batch, { onConflict: "local_authority_code,reference" })

  if (!error) {
    // Normal ingestion uses the exact authority/reference queue so revalidation
    // does not need to flip a marker on the large planning_applications table.
    // Historical event backfills deliberately bypass this ingestion path.
    return enqueuePlanningRevalidation(supabase, batch, label)
  }

  if (error.code === "57014" && batch.length > 10) {
    const middle = Math.ceil(batch.length / 2)
    console.warn(
      `${label}: ${batch.length}-row upsert reached the statement timeout; retrying as ${middle} and ${batch.length - middle} rows.`
    )
    const first = await upsertPlanningBatch(supabase, batch.slice(0, middle), label)
    const second = await upsertPlanningBatch(supabase, batch.slice(middle), label)
    return [...first, ...second]
  }

  if (isRetryablePlanningUpsertError(error) && attempt < 4) {
    const delayMs = attempt * 1500
    console.warn(
      `${label}: transient upsert failure; retrying ${batch.length} rows in ${delayMs}ms (attempt ${attempt}/3).`
    )
    await sleep(delayMs)
    return upsertPlanningBatch(supabase, batch, label, attempt + 1)
  }

  throw error
}
