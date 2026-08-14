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

export async function upsertPlanningBatch(
  supabase,
  batch,
  label,
  attempt = 1
) {
  const { error } = await supabase
    .from("planning_applications")
    .upsert(batch, { onConflict: "local_authority_code,reference" })

  if (!error) return

  if (error.code === "57014" && batch.length > 10) {
    const middle = Math.ceil(batch.length / 2)
    console.warn(
      `${label}: ${batch.length}-row upsert reached the statement timeout; retrying as ${middle} and ${batch.length - middle} rows.`
    )
    await upsertPlanningBatch(supabase, batch.slice(0, middle), label)
    await upsertPlanningBatch(supabase, batch.slice(middle), label)
    return
  }

  if (isRetryablePlanningUpsertError(error) && attempt < 4) {
    const delayMs = attempt * 1500
    console.warn(
      `${label}: transient upsert failure; retrying ${batch.length} rows in ${delayMs}ms (attempt ${attempt}/3).`
    )
    await sleep(delayMs)
    await upsertPlanningBatch(supabase, batch, label, attempt + 1)
    return
  }

  throw error
}
