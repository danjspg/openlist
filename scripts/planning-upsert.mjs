import { classifyAndPersistPlanningApplications } from "../lib/planning-notable-persistence.mjs"

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

function retryDelayMs(attempt) {
  return Math.min(15000, attempt * attempt * 1500)
}

async function enqueuePlanningRevalidation(supabase, rows, label, attempt = 1) {
  if (rows.length === 0) return []

  const requestedAt = new Date().toISOString()
  const queueRows = rows.map((row) => ({
    application_id: row.id,
    requested_at: requestedAt,
  }))

  const { error } = await supabase
    .from("planning_revalidation_queue")
    .upsert(queueRows, { onConflict: "application_id" })

  if (!error) {
    return rows.map((row) => ({
      localAuthorityCode: row.local_authority_code,
      reference: row.reference,
    }))
  }

  if (isRetryablePlanningUpsertError(error) && attempt < 5) {
    const delayMs = retryDelayMs(attempt)
    console.warn(
      `${label}: transient Planning revalidation enqueue failure; retrying ${rows.length} rows in ${delayMs}ms (attempt ${attempt}/4).`
    )
    await sleep(delayMs)
    return enqueuePlanningRevalidation(supabase, rows, label, attempt + 1)
  }

  throw error
}

export async function upsertPlanningBatch(
  supabase,
  batch,
  label,
  attempt = 1
) {
  const { data, error } = await supabase
    .from("planning_applications")
    .upsert(batch, { onConflict: "local_authority_code,reference" })
    .select("id,local_authority_code,reference,proposal,applicant_name,application_type,status,normalized_status,decision_date,final_grant_date,withdrawal_date,appeal_decision_date")

  if (!error) {
    try {
      await classifyAndPersistPlanningApplications(supabase, data || [], {
        // Every successful ingestion row is queued immediately below, so a
        // second queue write for the deterministic state change is redundant.
        enqueue: false,
      })
    } catch (classificationError) {
      // Classification is additive indexing metadata. Preserve ingestion
      // availability; bounded active/recent reconciliation repairs missed rows.
      console.warn(
        `${label}: Planning notability classification failed for ${(data || []).length} rows; continuing ingestion.`,
        classificationError
      )
    }
    // Normal ingestion writes the durable exact-path queue directly. The
    // legacy revalidation_pending flag remains readable for compatibility but
    // no longer needs to be flipped on the large planning_applications table.
    return enqueuePlanningRevalidation(supabase, data || [], label)
  }

  // Statement timeouts are often caused by a temporarily busy table or an
  // expensive row-level trigger/index update. Split all the way down to single
  // rows so one slow record cannot discard the rest of a successfully fetched
  // authority batch. The upsert is idempotent on authority/reference.
  if (error.code === "57014" && batch.length > 1) {
    const middle = Math.ceil(batch.length / 2)
    console.warn(
      `${label}: ${batch.length}-row upsert reached the statement timeout; retrying as ${middle} and ${batch.length - middle} rows.`
    )
    const first = await upsertPlanningBatch(supabase, batch.slice(0, middle), label)
    const second = await upsertPlanningBatch(supabase, batch.slice(middle), label)
    return [...first, ...second]
  }

  // A single row cannot be split further, so give transient pressure more time
  // to clear before failing the workflow. This also covers connection errors.
  if (isRetryablePlanningUpsertError(error) && attempt < 5) {
    const delayMs = retryDelayMs(attempt)
    console.warn(
      `${label}: transient upsert failure; retrying ${batch.length} rows in ${delayMs}ms (attempt ${attempt}/4).`
    )
    await sleep(delayMs)
    return upsertPlanningBatch(supabase, batch, label, attempt + 1)
  }

  throw error
}
