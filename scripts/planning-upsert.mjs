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
    .upsert(
      batch.map((record) => ({ ...record, revalidation_pending: true })),
      { onConflict: "local_authority_code,reference" }
    )

  if (!error) {
    // Issue #4 can enqueue these exact authority/reference pairs for
    // revalidatePath immediately after this committed batch. Historical event
    // backfills deliberately bypass this ingestion path.
    return batch.map((record) => ({
      localAuthorityCode: record.local_authority_code,
      reference: record.reference,
    }))
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
