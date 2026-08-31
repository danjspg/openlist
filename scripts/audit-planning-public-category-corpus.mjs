import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import pg from "pg"
import {
  classifyPlanningNotability,
  PUBLIC_PLANNING_CATEGORY_SLUGS,
} from "../lib/planning-notable-classifier.mjs"

const ZERO_UUID = "00000000-0000-0000-0000-000000000000"
const BATCH_SIZE = 1_000
const INTER_BATCH_DELAY_MS = 20

function argument(name, fallback = "") {
  const prefix = `--${name}=`
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || fallback
}

export function emptyPublicCategoryAuditCounts() {
  return Object.fromEntries(PUBLIC_PLANNING_CATEGORY_SLUGS.map((slug) => [slug, {
    qualifying: 0,
    represented: 0,
    exactMembership: 0,
    missing: 0,
    membershipRepairNeeded: 0,
  }]))
}

export function addPublicCategoryAuditRow(counts, application, activeMembership) {
  const classification = classifyPlanningNotability(application)
  for (const slug of classification.publicCategories) {
    const count = counts[slug]
    count.qualifying += 1
    if (activeMembership) count.represented += 1
    if (activeMembership?.includes(slug)) count.exactMembership += 1
  }
}

export function finalisePublicCategoryAuditCounts(counts) {
  for (const count of Object.values(counts)) {
    count.missing = count.qualifying - count.represented
    count.membershipRepairNeeded = count.qualifying - count.exactMembership
  }
  return counts
}

async function main() {
  if (!process.env.SUPABASE_DB_URL) throw new Error("SUPABASE_DB_URL is required")
  const output = argument("output", "artifacts/planning-public-category-audit.json")
  const client = new pg.Client({
    connectionString: process.env.SUPABASE_DB_URL,
    application_name: "openlist-public-category-readonly-audit",
  })
  const counts = emptyPublicCategoryAuditCounts()
  let cursor = ZERO_UUID
  let scanned = 0
  let batches = 0

  await client.connect()
  try {
    await client.query("set statement_timeout = '8s'")
    await client.query("set lock_timeout = '2s'")
    const notableResult = await client.query(
      "select application_id::text, notable_categories from public.planning_seo_notable where active"
    )
    const activeMembership = new Map(notableResult.rows.map((row) => [
      row.application_id,
      Array.isArray(row.notable_categories) ? row.notable_categories : [],
    ]))

    // UUID keyset pagination keeps every individual read bounded and avoids a
    // long-lived transaction/snapshot. The pause deliberately caps pressure.
    for (;;) {
      const result = await client.query(`
        select p.id, p.proposal, p.applicant_name, p.application_type
        from public.planning_applications p
        where p.id > $1::uuid
        order by p.id
        limit ${BATCH_SIZE}
      `, [cursor])
      if (!result.rowCount) break
      for (const application of result.rows) {
        addPublicCategoryAuditRow(counts, application, activeMembership.get(String(application.id)))
      }
      scanned += result.rowCount
      batches += 1
      cursor = String(result.rows.at(-1).id)
      if (batches % 50 === 0) {
        console.error(`Read-only category audit: ${scanned} rows scanned (${batches} batches)`)
      }
      if (result.rowCount < BATCH_SIZE) break
      await delay(INTER_BATCH_DELAY_MS)
    }

    const report = {
      generatedAt: new Date().toISOString(),
      mode: "read-only",
      batchSize: BATCH_SIZE,
      interBatchDelayMs: INTER_BATCH_DELAY_MS,
      scanned,
      batches,
      activeNotableRows: activeMembership.size,
      categories: finalisePublicCategoryAuditCounts(counts),
    }
    await mkdir(dirname(output), { recursive: true })
    await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8")
    console.log(JSON.stringify(report, null, 2))
  } finally {
    await client.end()
  }
}

if (process.argv[1]?.endsWith("audit-planning-public-category-corpus.mjs")) {
  await main()
}
