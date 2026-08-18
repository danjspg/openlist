import { createClient } from "@supabase/supabase-js"
import { writeFile } from "node:fs/promises"

import {
  AUTHORITY_PROPOSAL_CEILINGS,
  cleanNationalPlanningText,
  parseNationalArcgisDate,
} from "../lib/national-planning-source.mjs"
import { normalisePlanningStatus } from "../lib/planning-status.mjs"
import { AUTHORITIES } from "./ingest-national-planning-applications.mjs"

const FEATURE_LAYER_URL =
  "https://services.arcgis.com/NzlPQPKn5QF9v2US/ArcGIS/rest/services/IrishPlanningApplications/FeatureServer/0/query"
const SAMPLE_CODES = ["DLR", "FINGAL", "WEXFORD", "KILDARE", "DUBLINCITY", "WICKLOW"]
const COMPARED_FIELDS = {
  proposal: "DevelopmentDescription",
  status: "ApplicationStatus",
  registration_date: "ReceivedDate",
  decision_date: "DecisionDate",
  final_grant_date: "GrantDate",
  appeal_lodged_date: "AppealSubmittedDate",
  appeal_decision_date: "AppealDecisionDate",
  location: "DevelopmentAddress",
  applicant_name: null,
}
const DATE_SOURCE_FIELDS = new Set([
  "ReceivedDate",
  "DecisionDate",
  "GrantDate",
  "AppealSubmittedDate",
  "AppealDecisionDate",
])

function parseArgs(argv) {
  const options = { authorities: [], samplePerAuthority: 4, output: null, summaryOnly: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--authority") options.authorities.push(argv[++index])
    else if (arg === "--sample-per-authority") options.samplePerAuthority = Number(argv[++index])
    else if (arg === "--output") options.output = argv[++index]
    else if (arg === "--summary-only") options.summaryOnly = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  if (!Number.isInteger(options.samplePerAuthority) || options.samplePerAuthority < 2) {
    throw new Error("--sample-per-authority must be an integer of at least 2")
  }
  return options
}

function sqlString(value) {
  return String(value).replaceAll("'", "''")
}

async function arcgisQuery(parameters) {
  const params = new URLSearchParams({ returnGeometry: "false", f: "json", ...parameters })
  const response = await fetch(`${FEATURE_LAYER_URL}?${params.toString()}`, {
    headers: { "User-Agent": "OpenList national planning source audit" },
  })
  if (!response.ok) throw new Error(`ArcGIS audit query failed: HTTP ${response.status}`)
  const data = await response.json()
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
  return data
}

async function exactSourceCount(authority, length) {
  const data = await arcgisQuery({
    where: `PlanningAuthority = '${sqlString(authority.sourceName)}' AND CHAR_LENGTH(DevelopmentDescription) = ${length}`,
    returnCountOnly: "true",
  })
  return Number(data.count || 0)
}

async function sourceCount(authority) {
  const data = await arcgisQuery({
    where: `PlanningAuthority = '${sqlString(authority.sourceName)}'`,
    returnCountOnly: "true",
  })
  return Number(data.count || 0)
}

async function sourceFieldCoverage(field, { nonEmpty = false } = {}) {
  const condition = nonEmpty
    ? `${field} IS NOT NULL AND ${field} <> ''`
    : `${field} IS NOT NULL`
  const data = await arcgisQuery({
    where: `PlanningAuthority <> 'Cork County Council' AND ${condition}`,
    returnCountOnly: "true",
  })
  return Number(data.count || 0)
}

async function sourceSamples(authority, count) {
  const eachDirection = Math.ceil(count / 2)
  const outFields = [
    "ApplicationNumber",
    "DevelopmentDescription",
    "DevelopmentAddress",
    "ApplicantForename",
    "ApplicantSurname",
    "ApplicationStatus",
    "ReceivedDate",
    "DecisionDate",
    "GrantDate",
    "AppealSubmittedDate",
    "AppealDecisionDate",
    "LinkAppDetails",
  ].join(",")
  const where = `PlanningAuthority = '${sqlString(authority.sourceName)}'`
  const [recent, historical] = await Promise.all([
    arcgisQuery({
      where,
      outFields,
      orderByFields: "ReceivedDate DESC, ApplicationNumber DESC",
      resultRecordCount: String(eachDirection),
    }),
    arcgisQuery({
      where,
      outFields,
      orderByFields: "ReceivedDate ASC, ApplicationNumber ASC",
      resultRecordCount: String(eachDirection),
    }),
  ])
  const rows = [...(recent.features || []), ...(historical.features || [])].map(
    (feature) => feature.attributes || {}
  )
  return [...new Map(rows.map((row) => [cleanNationalPlanningText(row.ApplicationNumber), row])).values()].slice(0, count)
}

function sourceValue(row, sourceField) {
  if (!sourceField) {
    return [row.ApplicantForename, row.ApplicantSurname]
      .map(cleanNationalPlanningText)
      .filter(Boolean)
      .join(" ") || null
  }
  if (DATE_SOURCE_FIELDS.has(sourceField)) return parseNationalArcgisDate(row[sourceField])
  return cleanNationalPlanningText(row[sourceField])
}

function compareValue(field, source, stored) {
  if (source === null && stored === null) return "exact_match"
  if (source === null) return "source_missing"
  if (stored === null || stored === undefined || stored === "") return "openlist_missing"
  if (source === stored) return "exact_match"
  if (field === "status" && normalisePlanningStatus(source) === normalisePlanningStatus(stored)) {
    return "normalized_equivalent"
  }
  if (
    typeof source === "string" &&
    typeof stored === "string" &&
    source.replace(/\s+/g, " ").trim() === stored.replace(/\s+/g, " ").trim()
  ) {
    return "normalized_equivalent"
  }
  return "mismatch"
}

async function countProduction(query) {
  const { count, error } = await query
  if (error) throw error
  return Number(count || 0)
}

async function audit(options) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const requestedCodes = options.authorities.length > 0 ? options.authorities : SAMPLE_CODES
  const authorities = requestedCodes.map((requested) => {
    const authority = AUTHORITIES.find(
      (candidate) => candidate.code.toLowerCase() === requested.toLowerCase()
    )
    if (!authority || authority.code === "CORKCOCO") {
      throw new Error(`Unknown or excluded national authority: ${requested}`)
    }
    return authority
  })

  const metadataResponse = await fetch(FEATURE_LAYER_URL.replace(/\/query$/, "?f=pjson"))
  const metadata = await metadataResponse.json()
  const statusData = await arcgisQuery({
    where: "PlanningAuthority <> 'Cork County Council'",
    outStatistics:
      '[{"statisticType":"count","onStatisticField":"OBJECTID","outStatisticFieldName":"row_count"}]',
    groupByFieldsForStatistics: "PlanningAuthority,ApplicationStatus",
    orderByFields: "PlanningAuthority,row_count DESC",
  })
  const statusCounts = new Map()
  for (const { attributes } of statusData.features || []) {
    const raw = cleanNationalPlanningText(attributes.ApplicationStatus) || ""
    statusCounts.set(raw, (statusCounts.get(raw) || 0) + Number(attributes.row_count || 0))
  }
  const statuses = [...statusCounts].map(([raw, count]) => {
    return {
      raw,
      count,
      normalized: normalisePlanningStatus(raw),
    }
  }).sort((left, right) => right.count - left.count)
  const lifecycleFields = [
    ["withdrawal", "WithdrawnDate"],
    ["furtherInformationRequested", "FIRequestDate"],
    ["furtherInformationReceived", "FIRecDate"],
    ["appealLodged", "AppealSubmittedDate"],
    ["appealDecision", "AppealDecisionDate"],
    ["finalGrant", "GrantDate"],
    ["decisionDue", "DecisionDueDate"],
    ["permissionExpiry", "ExpiryDate"],
  ]
  const lifecycleCoverage = Object.fromEntries(
    await Promise.all(
      lifecycleFields.map(async ([name, field]) => [
        name,
        { sourceField: field, rows: await sourceFieldCoverage(field) },
      ])
    )
  )
  lifecycleCoverage.appealReference = {
    sourceField: "AppealRefNumber",
    rows: await sourceFieldCoverage("AppealRefNumber", { nonEmpty: true }),
  }
  lifecycleCoverage.appealStatus = {
    sourceField: "AppealStatus",
    rows: await sourceFieldCoverage("AppealStatus", { nonEmpty: true }),
  }
  lifecycleCoverage.appealOutcomeText = {
    sourceField: "AppealDecision",
    rows: await sourceFieldCoverage("AppealDecision", { nonEmpty: true }),
  }

  const totalProduction = await countProduction(
    supabase
      .from("planning_applications")
      .select("id", { count: "exact", head: true })
      .neq("local_authority_code", "CORKCOCO")
  )
  const authorityReports = []
  const comparisonTotals = Object.fromEntries(
    Object.keys(COMPARED_FIELDS).map((field) => [
      field,
      { exact_match: 0, normalized_equivalent: 0, mismatch: 0, source_missing: 0, openlist_missing: 0 },
    ])
  )

  for (const authority of authorities) {
    const rows = await sourceSamples(authority, options.samplePerAuthority)
    const references = rows.map((row) => cleanNationalPlanningText(row.ApplicationNumber)).filter(Boolean)
    const { data: storedRows, error } = await supabase
      .from("planning_applications")
      .select(
        "reference,proposal,status,registration_date,decision_date,final_grant_date,appeal_lodged_date,appeal_decision_date,location,applicant_name,source_url"
      )
      .eq("local_authority_code", authority.code)
      .in("reference", references)
    if (error) throw error
    const storedByReference = new Map((storedRows || []).map((row) => [row.reference, row]))
    const comparisons = rows.map((row) => {
      const reference = cleanNationalPlanningText(row.ApplicationNumber)
      const stored = storedByReference.get(reference) || {}
      const fields = {}
      for (const [field, sourceField] of Object.entries(COMPARED_FIELDS)) {
        const result = compareValue(field, sourceValue(row, sourceField), stored[field] ?? null)
        fields[field] = result
        comparisonTotals[field][result] += 1
      }
      return { reference, presentInOpenList: storedByReference.has(reference), fields }
    })
    const sourceRows = await sourceCount(authority)
    const productionRows = await countProduction(
      supabase
        .from("planning_applications")
        .select("id", { count: "exact", head: true })
        .eq("local_authority_code", authority.code)
    )
    const ceiling = AUTHORITY_PROPOSAL_CEILINGS.get(authority.code) || null
    const proposalCeiling = ceiling
      ? {
          length: ceiling,
          sourceRows: await exactSourceCount(authority, ceiling),
          productionRows: await countProduction(
            supabase
              .from("planning_applications")
              .select("id", { count: "exact", head: true })
              .eq("local_authority_code", authority.code)
              .like("proposal", "_".repeat(ceiling))
          ),
        }
      : null
    authorityReports.push({
      code: authority.code,
      authority: authority.name,
      sourceRows,
      productionRows,
      proposalCeiling,
      comparisons,
    })
  }

  const totalSource = statuses.reduce((sum, status) => sum + status.count, 0)
  const report = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    source: {
      url: FEATURE_LAYER_URL,
      totalRowsExcludingCorkCounty: totalSource,
      dateFieldsTimeReference: metadata.dateFieldsTimeReference || null,
      developmentDescriptionLength:
        metadata.fields?.find((field) => field.name === "DevelopmentDescription")?.length || null,
      lifecycleCoverage,
    },
    production: { totalRowsExcludingCorkCounty: totalProduction },
    statuses: {
      vocabularySize: statuses.length,
      unknownRows: statuses
        .filter((status) => status.normalized === "unknown")
        .reduce((sum, status) => sum + status.count, 0),
      values: statuses,
    },
    comparedFields: comparisonTotals,
    authorities: authorityReports,
  }
  return report
}

function printSummary(report) {
  const ceilingRows = report.authorities.reduce(
    (sum, authority) => sum + (authority.proposalCeiling?.productionRows || 0),
    0
  )
  const dateMismatches = [
    "registration_date",
    "decision_date",
    "final_grant_date",
    "appeal_lodged_date",
    "appeal_decision_date",
  ].reduce((sum, field) => sum + report.comparedFields[field].mismatch, 0)
  console.error("NATIONAL SOURCE FIDELITY AUDIT (read-only)")
  console.error(
    `Source rows: ${report.source.totalRowsExcludingCorkCounty.toLocaleString("en-IE")}; production rows: ${report.production.totalRowsExcludingCorkCounty.toLocaleString("en-IE")}`
  )
  console.error(`Production rows at proven proposal ceilings: ${ceilingRows.toLocaleString("en-IE")}`)
  console.error(`Sampled lifecycle date mismatches: ${dateMismatches}`)
  console.error(
    `Raw status values: ${report.statuses.vocabularySize}; rows normalized as unknown: ${report.statuses.unknownRows.toLocaleString("en-IE")}`
  )
}

const isDirectRun = import.meta.url === `file://${process.argv[1]}`
if (isDirectRun) {
  const options = parseArgs(process.argv.slice(2))
  audit(options)
    .then(async (report) => {
      printSummary(report)
      const json = `${JSON.stringify(report, null, 2)}\n`
      if (options.output) await writeFile(options.output, json, "utf8")
      if (!options.summaryOnly) process.stdout.write(json)
    })
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
}

export { audit, compareValue, parseArgs }
