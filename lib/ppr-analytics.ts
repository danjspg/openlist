import { unstable_cache } from "next/cache"
import { cache } from "react"
import {
  COMPARISON_PAGE_MARKET_SLUGS,
  COMMUTER_TOWN_DISTANCE_KM,
  COMMUTER_TOWN_MARKET_SLUGS,
} from "@/lib/ppr-data.mjs"
import { supabase } from "@/lib/supabase"
import {
  dublinDistrictPrefix,
  getPprMarket,
  pprMarketLabel,
  PPR_MARKETS,
  type PprMarket,
} from "@/lib/ppr-markets"
import {
  areaNameFromSlug,
  areaFilterExpressions,
  broadAreaFilterExpression,
  getPprDateRangePreset,
  isStatementTimeoutError,
  type PprAreaStats,
  type PprDateRangeValue,
  type PprSale,
} from "@/lib/ppr"

type AnalyticsSale = Pick<
  PprSale,
  | "date_of_sale"
  | "price_eur"
  | "is_new_dwelling"
  | "county"
  | "area_slug"
  | "eircode_prefix"
>

const ANALYTICS_SALE_SELECT =
  "date_of_sale,price_eur,is_new_dwelling,county,area_slug,eircode_prefix"

const ANALYTICS_CARD_SALE_SELECT =
  "id,date_of_sale,address_raw,locality,price_eur,property_description_raw,vat_exclusive,is_new_dwelling,county,area_slug,eircode_prefix"

export const PPR_ANALYTICS_THRESHOLDS = {
  minPriceComparisonSales: 24,
  minActivityComparisonSales: 24,
  minSplitSales: 8,
  minDistributionSales: 12,
  minThresholdSummarySales: 18,
  minDaysBetweenSales: 6,
  minPeakMonthYears: 4,
  minPeakMonthSales: 24,
  minComparisonSales: 24,
  minRisingMarketSales: 50,
  minHomepageRisingSales: 50,
  minAffordableMarketSales: 24,
  minRelativeActivityMarketSales: 12,
  commuterAffordableMedianCap: 450_000,
  affordableMarketMedianCap: 300_000,
  highValueMarketMedianFloor: 500_000,
  thresholdBands: [300_000, 400_000, 500_000] as const,
} as const

const MOMENTUM_LOOKBACK_YEARS = 5
const PPR_ANALYTICS_REVALIDATE_SECONDS = 60 * 60 * 6
const PPR_COMPARISON_CACHE_VERSION = "v10"
const PPR_INSIGHTS_CACHE_VERSION = "v7"
const PPR_HOMEPAGE_STATS_CACHE_VERSION = "v4"
const PPR_NATIONAL_SNAPSHOT_CACHE_VERSION = "v3"
const PPR_NON_LOCATION_COMPARISON_PAGE_LIMIT = 30

export type PprMomentumStats = {
  currentLabel: string
  currentMedian: number
  currentCount: number
  previousLabel: string
  previousMedian: number
  previousCount: number
  yoyChangePct: number
  threeYearChangePct?: number
}

export type PprActivityStats = {
  currentPeriodLabel: string
  currentPeriodCount: number
  previousPeriodLabel: string
  previousPeriodCount: number
  changePct?: number
  hasReliableChange: boolean
  averageDaysBetweenSales?: number
  peakMonthName?: string
  peakMonthEvidenceYears?: number
}

export type PprThresholdShare = {
  threshold: number
  sharePct: number
  count: number
}

export type PprDistributionStats = {
  p25: number
  p75: number
  thresholdShares: PprThresholdShare[]
}

export type PprBuildSplitStats = {
  newBuildMedian: number
  newBuildCount: number
  secondHandMedian: number
  secondHandCount: number
  premiumAmount: number
  premiumPct?: number
}

export type PprLocationInsights = {
  totalSalesCount: number
  medianAllTime?: number
  averageAllTime?: number
  lastSaleDate?: string | null
  momentum?: PprMomentumStats
  activity?: PprActivityStats
  distribution?: PprDistributionStats
  buildSplit?: PprBuildSplitStats
}

export type PprComparisonRow = {
  rank?: number
  slug: string
  label: string
  href: string
  county?: string
  medianPrice: number
  salesVolume: number
  currentPeriodCount?: number
  previousPeriodCount?: number
  activityChangePct?: number
  yoyChangePct?: number
  newBuildMedian?: number
  secondHandMedian?: number
  vsNationalMedianPct?: number
  distanceFromDublinKm?: number
}

function compareNumbers(left: number, right: number, direction: "asc" | "desc") {
  return direction === "asc" ? left - right : right - left
}

function compareStrings(left: string, right: string) {
  return left.localeCompare(right)
}

function pickComparisonRowByMetric(
  rows: PprComparisonRow[],
  getMetric: (row: PprComparisonRow) => number | undefined,
  direction: "asc" | "desc"
) {
  return rows
    .filter((row) => getMetric(row) !== undefined)
    .sort((left, right) => {
      const leftMetric = getMetric(left)
      const rightMetric = getMetric(right)
      if (leftMetric === undefined || rightMetric === undefined) return 0
      const metricOrder = compareNumbers(leftMetric, rightMetric, direction)
      if (metricOrder !== 0) return metricOrder
      const volumeOrder = compareNumbers(left.salesVolume, right.salesVolume, "desc")
      if (volumeOrder !== 0) return volumeOrder
      return compareStrings(left.label, right.label)
    })[0]
}

export function getLowestMedianComparisonRow(rows: PprComparisonRow[]) {
  return pickComparisonRowByMetric(rows, (row) => row.medianPrice, "asc")
}

export function getHighestMedianComparisonRow(rows: PprComparisonRow[]) {
  return pickComparisonRowByMetric(rows, (row) => row.medianPrice, "desc")
}

export function getMostActiveComparisonRow(rows: PprComparisonRow[]) {
  return pickComparisonRowByMetric(rows, (row) => row.salesVolume, "desc")
}

export function getLeastActiveComparisonRow(rows: PprComparisonRow[]) {
  return pickComparisonRowByMetric(rows, (row) => row.salesVolume, "asc")
}

export function getHighestActivityChangeComparisonRow(rows: PprComparisonRow[]) {
  return pickComparisonRowByMetric(rows, (row) => row.activityChangePct, "desc")
}

export function getLowestActivityChangeComparisonRow(rows: PprComparisonRow[]) {
  return pickComparisonRowByMetric(rows, (row) => row.activityChangePct, "asc")
}

export function getHighestYoYComparisonRow(rows: PprComparisonRow[]) {
  return pickComparisonRowByMetric(rows, (row) => row.yoyChangePct, "desc")
}

export function getLowestYoYComparisonRow(rows: PprComparisonRow[]) {
  return pickComparisonRowByMetric(rows, (row) => row.yoyChangePct, "asc")
}

export function getClosestToNationalMedianComparisonRow(rows: PprComparisonRow[]) {
  return rows
    .filter((row) => row.vsNationalMedianPct !== undefined)
    .sort((left, right) => {
      const distanceOrder = compareNumbers(
        Math.abs(left.vsNationalMedianPct ?? 0),
        Math.abs(right.vsNationalMedianPct ?? 0),
        "asc"
      )
      if (distanceOrder !== 0) return distanceOrder
      const volumeOrder = compareNumbers(left.salesVolume, right.salesVolume, "desc")
      if (volumeOrder !== 0) return volumeOrder
      return compareStrings(left.label, right.label)
    })[0]
}

export type PprHomepageStat = {
  eyebrow: string
  title: string
  value: string
  detail: string
  href?: string
}

export type PprNationalOverviewSnapshot = {
  medianPrice?: number
  p25?: number
  p75?: number
  salesCount: number
  yoyChangePct?: number
  latestSaleDate?: string | null
}

export type PprNationalActivitySnapshot = {
  currentPeriodLabel: string
  previousPeriodLabel: string
  currentCount: number
  previousCount: number
  yoyChangePct?: number
  hasReliableChange: boolean
}

export type PprNationalActivityLeader = {
  county: string
  salesCount: number
}

export type PprAnalyticsRange = {
  value: PprDateRangeValue
  months: number | null
  label: string
  helperText?: string
}

type PprNationalSnapshotRow = {
  range_key: string
  label: string
  sales_count: number
  median_price_eur: number | null
  avg_price_eur: number | null
  p25_price_eur: number | null
  p75_price_eur: number | null
  current_period_label: string | null
  previous_period_label: string | null
  current_period_count: number | null
  previous_period_count: number | null
  activity_change_pct: number | null
  yoy_change_pct: number | null
  latest_sale_date: string | null
  strongest_county: string | null
  strongest_county_yoy_change_pct: number | null
}

type PprComparisonRowRecord = {
  range_key: string
  group_key: string
  market_slug: string
  label: string
  href: string
  county: string | null
  sales_volume: number
  current_period_count: number | null
  previous_period_count: number | null
  activity_change_pct: number | null
  median_price_eur: number
  yoy_change_pct: number | null
  new_build_median_eur: number | null
  second_hand_median_eur: number | null
  vs_national_median_pct: number | null
  distance_from_dublin_km: number | null
  sort_rank: number | null
}

type PprMarketInsightsRowRecord = {
  range_key: string
  market_slug: string
  market_label: string
  market_type: string
  county: string | null
  total_sales_count: number
  median_all_time_eur: number | null
  average_all_time_eur: number | null
  last_sale_date: string | null
  momentum_current_label: string | null
  momentum_current_median_eur: number | null
  momentum_current_count: number | null
  momentum_previous_label: string | null
  momentum_previous_median_eur: number | null
  momentum_previous_count: number | null
  momentum_yoy_change_pct: number | null
  momentum_three_year_change_pct: number | null
  activity_current_period_label: string | null
  activity_current_period_count: number | null
  activity_previous_period_label: string | null
  activity_previous_period_count: number | null
  activity_change_pct: number | null
  activity_has_reliable_change: boolean
  average_days_between_sales: number | null
  peak_month_name: string | null
  peak_month_evidence_years: number | null
  distribution_p25_eur: number | null
  distribution_p75_eur: number | null
  build_new_median_eur: number | null
  build_new_count: number | null
  build_second_hand_median_eur: number | null
  build_second_hand_count: number | null
  build_premium_amount_eur: number | null
  build_premium_pct: number | null
}

type PprAreaInsightsRowRecord = {
  range_key: string
  county: string
  area_slug: string
  area_label: string
  total_sales_count: number
  median_all_time_eur: number | null
  average_all_time_eur: number | null
  last_sale_date: string | null
  current_period_label: string | null
  previous_period_label: string | null
  current_median_eur: number | null
  previous_median_eur: number | null
  momentum_yoy_change_pct: number | null
  three_year_change_pct: number | null
  current_period_count: number | null
  previous_period_count: number | null
  activity_change_pct: number | null
  average_days_between_sales: number | null
  peak_month_name: string | null
  peak_month_evidence_years: number | null
  p25_price_eur: number | null
  p75_price_eur: number | null
  new_build_count: number | null
  new_build_median_eur: number | null
  second_hand_count: number | null
  second_hand_median_eur: number | null
  premium_amount_eur: number | null
  premium_pct: number | null
}

type DateWindow = {
  start: string
  end: string
}

function numericPrice(value: number | string | null | undefined) {
  const numeric =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").replace(/[^0-9.]/g, ""))

  return Number.isFinite(numeric) ? numeric : NaN
}

export function getAnalyticsRange(range: PprDateRangeValue = "last-year"): PprAnalyticsRange {
  switch (range) {
    case "last-3-years":
      return { value: range, months: 36, label: "last 3 years" }
    case "last-5-years":
      return { value: range, months: 60, label: "last 5 years" }
    case "all":
      return {
        value: range,
        months: null,
        label: "all available records",
        helperText: "Based on all available records.",
      }
    default:
      return { value: "last-year", months: 12, label: "last 12 months" }
  }
}

function average(values: number[]) {
  if (values.length === 0) return undefined
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function median(values: number[]) {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((left, right) => left - right)
  const midpoint = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 0) {
    return (sorted[midpoint - 1] + sorted[midpoint]) / 2
  }

  return sorted[midpoint]
}

export function percentile(values: number[], fraction: number) {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((left, right) => left - right)
  const index = (sorted.length - 1) * fraction
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  const weight = index - lower

  if (lower === upper) return sorted[lower]

  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

export function percentChange(current?: number, previous?: number) {
  if (!current || !previous || previous <= 0) return undefined
  return ((current - previous) / previous) * 100
}

function round(value: number, digits = 0) {
  const power = 10 ** digits
  return Math.round(value * power) / power
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10)
}

function shiftMonths(value: Date, months: number) {
  const next = new Date(value)
  next.setMonth(next.getMonth() + months)
  return next
}

function startOfYear(year: number) {
  return `${year}-01-01`
}

function endOfYear(year: number) {
  return `${year}-12-31`
}

function rollingWindow(now: Date, months: number, offsetMonths = 0): DateWindow {
  const end = shiftMonths(now, -offsetMonths)
  const start = shiftMonths(end, -months)
  start.setDate(start.getDate() + 1)

  return {
    start: toIsoDate(start),
    end: toIsoDate(end),
  }
}

function withinWindow(sale: AnalyticsSale, window: DateWindow) {
  return sale.date_of_sale >= window.start && sale.date_of_sale <= window.end
}

function pricesForSales(sales: AnalyticsSale[]) {
  return sales.map((sale) => numericPrice(sale.price_eur)).filter(Number.isFinite)
}

function getPeriodSummary(
  sales: AnalyticsSale[],
  window: DateWindow
): { median?: number; count: number } {
  const periodSales = sales.filter((sale) => withinWindow(sale, window))
  return {
    median: median(pricesForSales(periodSales)),
    count: periodSales.length,
  }
}

function rollingTwelveMonthWindows(now: Date) {
  const current = rollingWindow(now, 12)
  const previous = rollingWindow(now, 12, 12)

  return {
    current,
    previous,
    currentLabel: "Last 12 months",
    previousLabel: "Previous 12 months",
  }
}

function computeMomentumStats(sales: AnalyticsSale[], now: Date): PprMomentumStats | undefined {
  const windows = rollingTwelveMonthWindows(now)
  const current = getPeriodSummary(sales, windows.current)
  const previous = getPeriodSummary(sales, windows.previous)

  if (
    current.count < PPR_ANALYTICS_THRESHOLDS.minPriceComparisonSales ||
    previous.count < PPR_ANALYTICS_THRESHOLDS.minPriceComparisonSales ||
    !current.median ||
    !previous.median
  ) {
    return undefined
  }

  const threeYearBaseline = getPeriodSummary(sales, rollingWindow(now, 12, 36))
  const threeYearChange =
    threeYearBaseline.count >= PPR_ANALYTICS_THRESHOLDS.minPriceComparisonSales
      ? percentChange(current.median, threeYearBaseline.median)
      : undefined

  return {
    currentLabel: windows.currentLabel,
    currentMedian: current.median,
    currentCount: current.count,
    previousLabel: windows.previousLabel,
    previousMedian: previous.median,
    previousCount: previous.count,
    yoyChangePct: percentChange(current.median, previous.median) ?? 0,
    threeYearChangePct: threeYearChange,
  }
}

function averageDaysBetweenSales(sales: AnalyticsSale[]) {
  const sortedSales = [...sales].sort((left, right) => left.date_of_sale.localeCompare(right.date_of_sale))

  if (sortedSales.length < PPR_ANALYTICS_THRESHOLDS.minDaysBetweenSales) return undefined

  const gaps: number[] = []

  for (let index = 1; index < sortedSales.length; index += 1) {
    const previous = new Date(sortedSales[index - 1].date_of_sale)
    const current = new Date(sortedSales[index].date_of_sale)
    const difference = current.getTime() - previous.getTime()
    gaps.push(difference / (1000 * 60 * 60 * 24))
  }

  const avgGap = average(gaps)
  if (!avgGap) return undefined
  return Math.max(1, round(avgGap))
}

function computePeakMonthName(sales: AnalyticsSale[]) {
  const years = Array.from(
    new Set(sales.map((sale) => new Date(sale.date_of_sale).getFullYear()))
  ).sort((left, right) => left - right)
  const votes = new Map<number, number>()
  let contributingYears = 0
  let totalSales = 0

  for (const year of years) {
    const inYear = sales.filter(
      (sale) => sale.date_of_sale >= startOfYear(year) && sale.date_of_sale <= endOfYear(year)
    )

    totalSales += inYear.length
    if (inYear.length === 0) continue

    const counts = new Map<number, number>()
    for (const sale of inYear) {
      const monthIndex = new Date(sale.date_of_sale).getMonth()
      counts.set(monthIndex, (counts.get(monthIndex) || 0) + 1)
    }

    const maxCount = Math.max(...counts.values())
    if (!Number.isFinite(maxCount) || maxCount <= 0) continue

    contributingYears += 1
    for (const [monthIndex, count] of counts.entries()) {
      if (count === maxCount) {
        votes.set(monthIndex, (votes.get(monthIndex) || 0) + 1)
      }
    }
  }

  if (
    contributingYears < PPR_ANALYTICS_THRESHOLDS.minPeakMonthYears ||
    totalSales < PPR_ANALYTICS_THRESHOLDS.minPeakMonthSales ||
    votes.size === 0
  ) {
    return undefined
  }

  const [winningMonth] = [...votes.entries()].sort((left, right) => {
    if (right[1] !== left[1]) return right[1] - left[1]
    return left[0] - right[0]
  })[0]

  return {
    peakMonthName: new Intl.DateTimeFormat("en-IE", { month: "long" }).format(
      new Date(Date.UTC(2024, winningMonth, 1))
    ),
    peakMonthEvidenceYears: contributingYears,
  }
}

function computeActivityStats(
  sales: AnalyticsSale[],
  now: Date
): PprActivityStats | undefined {
  const windows = rollingTwelveMonthWindows(now)
  const currentPeriodCount = sales.filter((sale) => withinWindow(sale, windows.current)).length
  const previousPeriodCount = sales.filter((sale) => withinWindow(sale, windows.previous)).length
  const peakMonth = computePeakMonthName(sales)
  const hasReliableChange =
    currentPeriodCount >= PPR_ANALYTICS_THRESHOLDS.minActivityComparisonSales &&
    previousPeriodCount >= PPR_ANALYTICS_THRESHOLDS.minActivityComparisonSales

  return {
    currentPeriodLabel: windows.currentLabel,
    currentPeriodCount,
    previousPeriodLabel: windows.previousLabel,
    previousPeriodCount,
    changePct: hasReliableChange ? percentChange(currentPeriodCount, previousPeriodCount) : undefined,
    hasReliableChange,
    averageDaysBetweenSales: averageDaysBetweenSales(sales),
    peakMonthName: peakMonth?.peakMonthName,
    peakMonthEvidenceYears: peakMonth?.peakMonthEvidenceYears,
  }
}

function computeDistributionStats(sales: AnalyticsSale[]): PprDistributionStats | undefined {
  if (sales.length < PPR_ANALYTICS_THRESHOLDS.minDistributionSales) return undefined

  const prices = pricesForSales(sales)
  const p25 = percentile(prices, 0.25)
  const p75 = percentile(prices, 0.75)

  if (!p25 || !p75) return undefined

  const thresholdShares =
    sales.length >= PPR_ANALYTICS_THRESHOLDS.minThresholdSummarySales
      ? PPR_ANALYTICS_THRESHOLDS.thresholdBands
          .map((threshold) => {
            const count = sales.filter((sale) => numericPrice(sale.price_eur) > threshold).length
            const sharePct = round((count / sales.length) * 100)
            return { threshold, sharePct, count }
          })
          .filter((item) => item.sharePct >= 10 && item.sharePct <= 90)
      : []

  return {
    p25,
    p75,
    thresholdShares,
  }
}

function computeBuildSplitStats(sales: AnalyticsSale[]): PprBuildSplitStats | undefined {
  const newBuildSales = sales.filter((sale) => sale.is_new_dwelling === true)
  const secondHandSales = sales.filter((sale) => sale.is_new_dwelling === false)

  if (
    newBuildSales.length < PPR_ANALYTICS_THRESHOLDS.minSplitSales ||
    secondHandSales.length < PPR_ANALYTICS_THRESHOLDS.minSplitSales
  ) {
    return undefined
  }

  const newBuildMedian = median(pricesForSales(newBuildSales))
  const secondHandMedian = median(pricesForSales(secondHandSales))

  if (!newBuildMedian || !secondHandMedian) return undefined

  return {
    newBuildMedian,
    newBuildCount: newBuildSales.length,
    secondHandMedian,
    secondHandCount: secondHandSales.length,
    premiumAmount: newBuildMedian - secondHandMedian,
    premiumPct: percentChange(newBuildMedian, secondHandMedian),
  }
}

export function buildLocationInsights(
  sales: AnalyticsSale[],
  options?: {
    now?: Date
    range?: PprDateRangeValue
    lastSaleDate?: string | null
  }
): PprLocationInsights {
  const now = options?.now || new Date()
  const analyticsRange = getAnalyticsRange(options?.range)
  const rangeMonths = analyticsRange.months
  const filteredSales =
    rangeMonths === null
      ? sales
      : sales.filter((sale) => withinWindow(sale, rollingWindow(now, rangeMonths)))
  const prices = pricesForSales(filteredSales)

  return {
    totalSalesCount: filteredSales.length,
    medianAllTime: median(prices),
    averageAllTime: average(prices),
    lastSaleDate:
      options?.lastSaleDate ??
      [...filteredSales]
        .sort((left, right) => right.date_of_sale.localeCompare(left.date_of_sale))[0]
        ?.date_of_sale,
    momentum: computeMomentumStats(sales, now),
    activity: computeActivityStats(sales, now),
    distribution:
      filteredSales.length >= PPR_ANALYTICS_THRESHOLDS.minDistributionSales
        ? computeDistributionStats(filteredSales)
        : undefined,
    buildSplit:
      filteredSales.length >= PPR_ANALYTICS_THRESHOLDS.minSplitSales * 2
        ? computeBuildSplitStats(filteredSales)
        : undefined,
  }
}

function marketScopeKey(market: PprMarket) {
  if (market.marketType === "county") return `county:${market.name}`
  if (market.marketType === "dublin_district") return `district:${dublinDistrictPrefix(market)}`
  return `area:${market.county || "*"}:${market.areaSlug ?? market.slug}`
}

function saleMatchesMarket(sale: AnalyticsSale, market: PprMarket) {
  if (market.marketType === "county") {
    return sale.county?.toLowerCase() === market.name.toLowerCase()
  }

  if (market.marketType === "dublin_district") {
    return sale.eircode_prefix?.toUpperCase() === dublinDistrictPrefix(market)
  }

  const areaSlug = market.areaSlug ?? market.slug
  if (sale.area_slug !== areaSlug) return false
  if (market.county && sale.county?.toLowerCase() !== market.county.toLowerCase()) return false
  return true
}

function inferComparisonRowCounty(sales: AnalyticsSale[], fallbackCounty?: string) {
  if (fallbackCounty) return fallbackCounty

  const counts = new Map<string, number>()
  for (const sale of sales) {
    const county = sale.county?.trim()
    if (!county) continue
    counts.set(county, (counts.get(county) ?? 0) + 1)
  }

  const leaders = [...counts.entries()].sort((left, right) => right[1] - left[1])
  if (leaders.length === 0) return undefined
  if (leaders.length === 1) return leaders[0][0]
  if (leaders[0][1] === leaders[1][1]) return undefined
  return leaders[0][0]
}

function mapComparisonRowRecord(record: PprComparisonRowRecord): PprComparisonRow {
  return {
    rank: record.sort_rank ?? undefined,
    slug: record.market_slug,
    label: record.label,
    href: record.href,
    county: record.county ?? getPprMarket(record.market_slug)?.county ?? undefined,
    medianPrice: record.median_price_eur,
    salesVolume: record.sales_volume,
    currentPeriodCount: record.current_period_count ?? undefined,
    previousPeriodCount: record.previous_period_count ?? undefined,
    activityChangePct: record.activity_change_pct ?? undefined,
    yoyChangePct: record.yoy_change_pct ?? undefined,
    newBuildMedian: record.new_build_median_eur ?? undefined,
    secondHandMedian: record.second_hand_median_eur ?? undefined,
    vsNationalMedianPct: record.vs_national_median_pct ?? undefined,
    distanceFromDublinKm: record.distance_from_dublin_km ?? undefined,
  }
}

function sortComparisonRowsBySalesVolume(
  rows: PprComparisonRow[],
  direction: "asc" | "desc"
) {
  return [...rows]
    .filter((row) => Number.isFinite(row.salesVolume) && row.salesVolume > 0)
    .sort((left, right) => {
      const volumeOrder = compareNumbers(left.salesVolume, right.salesVolume, direction)
      if (volumeOrder !== 0) return volumeOrder
      const medianOrder = compareNumbers(left.medianPrice, right.medianPrice, "desc")
      if (medianOrder !== 0) return medianOrder
      return compareStrings(left.label, right.label)
    })
}

function sortHottestComparisonRows(rows: PprComparisonRow[]) {
  return [...rows]
    .filter(
      (row) =>
        (row.currentPeriodCount ?? 0) >= PPR_ANALYTICS_THRESHOLDS.minRelativeActivityMarketSales &&
        (row.previousPeriodCount ?? 0) >= PPR_ANALYTICS_THRESHOLDS.minRelativeActivityMarketSales &&
        row.activityChangePct !== undefined &&
        row.activityChangePct > 0 &&
        row.yoyChangePct !== undefined &&
        row.yoyChangePct > 0
    )
    .sort((left, right) => {
      const activityOrder = compareNumbers(
        left.activityChangePct ?? 0,
        right.activityChangePct ?? 0,
        "desc"
      )
      if (activityOrder !== 0) return activityOrder
      const priceOrder = compareNumbers(left.yoyChangePct ?? 0, right.yoyChangePct ?? 0, "desc")
      if (priceOrder !== 0) return priceOrder
      const volumeOrder = compareNumbers(left.salesVolume, right.salesVolume, "desc")
      if (volumeOrder !== 0) return volumeOrder
      return compareStrings(left.label, right.label)
    })
}

function sortCoolestComparisonRows(rows: PprComparisonRow[]) {
  return [...rows]
    .filter(
      (row) =>
        (row.currentPeriodCount ?? 0) >= PPR_ANALYTICS_THRESHOLDS.minRelativeActivityMarketSales &&
        (row.previousPeriodCount ?? 0) >= PPR_ANALYTICS_THRESHOLDS.minRelativeActivityMarketSales &&
        row.activityChangePct !== undefined &&
        row.activityChangePct < 0 &&
        row.yoyChangePct !== undefined &&
        row.yoyChangePct <= 0
    )
    .sort((left, right) => {
      const activityOrder = compareNumbers(
        left.activityChangePct ?? 0,
        right.activityChangePct ?? 0,
        "asc"
      )
      if (activityOrder !== 0) return activityOrder
      const priceOrder = compareNumbers(left.yoyChangePct ?? 0, right.yoyChangePct ?? 0, "asc")
      if (priceOrder !== 0) return priceOrder
      const volumeOrder = compareNumbers(left.salesVolume, right.salesVolume, "asc")
      if (volumeOrder !== 0) return volumeOrder
      return compareStrings(left.label, right.label)
    })
}

function withComparisonDisplayRanks(rows: PprComparisonRow[]) {
  return rows.map((row, index) => ({
    ...row,
    rank: row.rank ?? index + 1,
  }))
}

function mapMarketInsightsRowRecord(record: PprMarketInsightsRowRecord): PprLocationInsights {
  return {
    totalSalesCount: record.total_sales_count,
    medianAllTime: record.median_all_time_eur ?? undefined,
    averageAllTime: record.average_all_time_eur ?? undefined,
    lastSaleDate: record.last_sale_date,
    momentum:
      record.momentum_current_label &&
      record.momentum_current_median_eur &&
      record.momentum_current_count !== null &&
      record.momentum_previous_label &&
      record.momentum_previous_median_eur &&
      record.momentum_previous_count !== null &&
      record.momentum_yoy_change_pct !== null
        ? {
            currentLabel: record.momentum_current_label,
            currentMedian: record.momentum_current_median_eur,
            currentCount: record.momentum_current_count,
            previousLabel: record.momentum_previous_label,
            previousMedian: record.momentum_previous_median_eur,
            previousCount: record.momentum_previous_count,
            yoyChangePct: record.momentum_yoy_change_pct,
            threeYearChangePct: record.momentum_three_year_change_pct ?? undefined,
          }
        : undefined,
    activity:
      record.activity_current_period_label &&
      record.activity_current_period_count !== null &&
      record.activity_previous_period_label &&
      record.activity_previous_period_count !== null
        ? {
            currentPeriodLabel: record.activity_current_period_label,
            currentPeriodCount: record.activity_current_period_count,
            previousPeriodLabel: record.activity_previous_period_label,
            previousPeriodCount: record.activity_previous_period_count,
            changePct: record.activity_change_pct ?? undefined,
            hasReliableChange: record.activity_has_reliable_change,
            averageDaysBetweenSales: record.average_days_between_sales ?? undefined,
            peakMonthName: record.peak_month_name ?? undefined,
            peakMonthEvidenceYears: record.peak_month_evidence_years ?? undefined,
          }
        : undefined,
    distribution:
      record.distribution_p25_eur !== null && record.distribution_p75_eur !== null
        ? {
            p25: record.distribution_p25_eur,
            p75: record.distribution_p75_eur,
            thresholdShares: [],
          }
        : undefined,
    buildSplit:
      record.build_new_median_eur !== null &&
      record.build_new_count !== null &&
      record.build_second_hand_median_eur !== null &&
      record.build_second_hand_count !== null &&
      record.build_premium_amount_eur !== null
        ? {
            newBuildMedian: record.build_new_median_eur,
            newBuildCount: record.build_new_count,
            secondHandMedian: record.build_second_hand_median_eur,
            secondHandCount: record.build_second_hand_count,
            premiumAmount: record.build_premium_amount_eur,
            premiumPct: record.build_premium_pct ?? undefined,
          }
        : undefined,
  }
}

function mapAreaInsightsRowRecord(record: PprAreaInsightsRowRecord): PprLocationInsights {
  return {
    totalSalesCount: record.total_sales_count,
    medianAllTime: record.median_all_time_eur ?? undefined,
    averageAllTime: record.average_all_time_eur ?? undefined,
    lastSaleDate: record.last_sale_date,
    momentum:
      record.current_period_label &&
      record.current_median_eur &&
      record.previous_period_label &&
      record.previous_median_eur &&
      record.current_period_count !== null &&
      record.previous_period_count !== null &&
      record.momentum_yoy_change_pct !== null
        ? {
            currentLabel: record.current_period_label,
            currentMedian: record.current_median_eur,
            currentCount: record.current_period_count,
            previousLabel: record.previous_period_label,
            previousMedian: record.previous_median_eur,
            previousCount: record.previous_period_count,
            yoyChangePct: record.momentum_yoy_change_pct,
            threeYearChangePct: record.three_year_change_pct ?? undefined,
          }
        : undefined,
    activity:
      record.current_period_label &&
      record.current_period_count !== null &&
      record.previous_period_label &&
      record.previous_period_count !== null
        ? {
            currentPeriodLabel: record.current_period_label,
            currentPeriodCount: record.current_period_count,
            previousPeriodLabel: record.previous_period_label,
            previousPeriodCount: record.previous_period_count,
            changePct: record.activity_change_pct ?? undefined,
            hasReliableChange: record.activity_change_pct !== null,
            averageDaysBetweenSales: record.average_days_between_sales ?? undefined,
            peakMonthName: record.peak_month_name ?? undefined,
            peakMonthEvidenceYears: record.peak_month_evidence_years ?? undefined,
          }
        : undefined,
    distribution:
      record.p25_price_eur !== null && record.p75_price_eur !== null
        ? {
            p25: record.p25_price_eur,
            p75: record.p75_price_eur,
            thresholdShares: [],
          }
        : undefined,
    buildSplit:
      record.new_build_count !== null &&
      record.new_build_median_eur !== null &&
      record.second_hand_count !== null &&
      record.second_hand_median_eur !== null &&
      record.premium_amount_eur !== null
        ? {
            newBuildCount: record.new_build_count,
            newBuildMedian: record.new_build_median_eur,
            secondHandCount: record.second_hand_count,
            secondHandMedian: record.second_hand_median_eur,
            premiumAmount: record.premium_amount_eur,
            premiumPct: record.premium_pct ?? undefined,
          }
        : undefined,
  }
}

async function loadNationalSnapshotRow(range: PprDateRangeValue) {
  const { data, error } = await supabase
    .from("ppr_national_snapshots")
    .select("*")
    .eq("range_key", range)
    .maybeSingle()

  if (error || !data) return null
  return data as PprNationalSnapshotRow
}

async function loadComparisonRowsFromTable(groupKey: string, range: PprDateRangeValue = "last-year") {
  const { data, error } = await supabase
    .from("ppr_comparison_rows")
    .select("*")
    .eq("group_key", groupKey)
    .eq("range_key", range)
    .order("sort_rank", { ascending: true })
    .order("label", { ascending: true })

  if (error || !data || data.length === 0) return null
  return (data as PprComparisonRowRecord[]).map(mapComparisonRowRecord)
}

async function loadMarketInsightsFromTable(marketSlug: string, range: PprDateRangeValue = "last-year") {
  const { data, error } = await supabase
    .from("ppr_market_insights")
    .select("*")
    .eq("market_slug", marketSlug)
    .eq("range_key", range)
    .maybeSingle()

  if (error || !data) return null
  return data as PprMarketInsightsRowRecord
}

async function loadAreaInsightsFromTable(
  county: string,
  areaSlug: string,
  range: PprDateRangeValue = "last-year"
) {
  const { data, error } = await supabase
    .from("ppr_area_insights")
    .select("*")
    .ilike("county", county)
    .eq("area_slug", areaSlug)
    .eq("range_key", range)
    .maybeSingle()

  if (error || !data) return null
  return data as PprAreaInsightsRowRecord
}

async function getRecentMarketSales(
  market: PprMarket,
  range: PprDateRangeValue = "last-year"
) {
  let query = supabase
    .from("ppr_sales")
    .select(ANALYTICS_CARD_SALE_SELECT)
    .order("date_of_sale", { ascending: false })
    .limit(12)

  query = applyMarketFilters(query, market)

  const analyticsRange = getAnalyticsRange(range)
  const startDate =
    analyticsRange.months === null
      ? undefined
      : getPprDateRangePreset(range).dateFrom || rollingWindow(new Date(), analyticsRange.months).start
  if (startDate) query = query.gte("date_of_sale", startDate)

  const { data, error } = await query
  if (error || !data) return []
  return data as PprSale[]
}

async function getRecentAreaSales(
  county: string,
  areaSlug: string,
  range: PprDateRangeValue = "last-year"
) {
  const analyticsRange = getAnalyticsRange(range)
  const startDate =
    analyticsRange.months === null
      ? undefined
      : getPprDateRangePreset(range).dateFrom || rollingWindow(new Date(), analyticsRange.months).start

  let query = supabase
    .from("ppr_sales")
    .select(ANALYTICS_CARD_SALE_SELECT)
    .ilike("county", county)
    .eq("area_slug", areaSlug)
    .order("date_of_sale", { ascending: false })
    .limit(8)

  if (startDate) query = query.gte("date_of_sale", startDate)

  const { data, error } = await query
  if (error || !data) return []
  return data as PprSale[]
}

async function fetchSalesBatch(
  select: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  applyFilters: (query: any) => any
) {
  const rows: AnalyticsSale[] = []
  const pageSize = 1000

  for (let offset = 0; ; offset += pageSize) {
    let query = supabase.from("ppr_sales").select(select).order("date_of_sale", { ascending: false })
    query = applyFilters(query)
    query = query.range(offset, offset + pageSize - 1)

    const { data, error } = await query

    if (error) {
      throw new Error(error.message)
    }

    const batch = (data ?? []) as unknown as AnalyticsSale[]
    rows.push(...batch)

    if (batch.length < pageSize) break
  }

  return rows
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyMarketFilters(query: any, market: PprMarket) {
  if (market.marketType === "county") {
    return query.ilike("county", market.name)
  }

  if (market.marketType === "dublin_district") {
    return query.eq("eircode_prefix", dublinDistrictPrefix(market))
  }

  const scopedAreaSlug = market.areaSlug ?? market.slug
  if (market.county) {
    return query
      .ilike("county", market.county)
      .eq("area_slug", scopedAreaSlug)
  }

  if (market.areaSlug) {
    return query.eq("area_slug", scopedAreaSlug)
  }

  const areaLabel = market.areaSlug ? areaNameFromSlug(market.areaSlug) : market.name
  const expression = broadAreaFilterExpression(scopedAreaSlug, areaLabel)
  return query.or(expression)
}

async function getMarketSalesRows(market: PprMarket, startDate?: string) {
  return fetchSalesBatch(
    ANALYTICS_CARD_SALE_SELECT,
    (query) => {
      const scoped = applyMarketFilters(query, market)
      return startDate ? scoped.gte("date_of_sale", startDate) : scoped
    }
  )
}

async function getCountySalesRows(county: string, startDate?: string) {
  return fetchSalesBatch(
    ANALYTICS_SALE_SELECT,
    (query) => {
      const scoped = query.ilike("county", county)
      return startDate ? scoped.gte("date_of_sale", startDate) : scoped
    }
  )
}

async function getAreaSalesRows(county: string, areaSlug: string, startDate?: string) {
  const expressions = areaFilterExpressions(areaNameFromSlug(areaSlug), false)

  try {
    return await fetchSalesBatch(
      ANALYTICS_CARD_SALE_SELECT,
      (query) => {
        const scoped = query
          .ilike("county", county)
          .or(expressions.broad || broadAreaFilterExpression(areaSlug, areaNameFromSlug(areaSlug)))
        return startDate ? scoped.gte("date_of_sale", startDate) : scoped
      }
    )
  } catch (error) {
    if (!(error instanceof Error) || !isStatementTimeoutError(error)) {
      throw error
    }

    if (!expressions.fallback || expressions.fallback === expressions.broad) {
      throw error
    }

    return fetchSalesBatch(
      ANALYTICS_CARD_SALE_SELECT,
      (query) => {
        const scoped = query
          .ilike("county", county)
          .or(expressions.fallback)
        return startDate ? scoped.gte("date_of_sale", startDate) : scoped
      }
    )
  }
}

const getMarketInsightsUncached = async (
  market: PprMarket,
  range: PprDateRangeValue = "last-year"
) => {
  const analyticsRange = getAnalyticsRange(range)
  const momentumStartDate = startOfYear(new Date().getFullYear() - 3)
  const historyStartDate =
    analyticsRange.months === null
      ? undefined
      : [getPprDateRangePreset(range).dateFrom, momentumStartDate]
          .filter(Boolean)
          .sort()[0] || startOfYear(new Date().getFullYear() - MOMENTUM_LOOKBACK_YEARS)
  const sales = await getMarketSalesRows(market, historyStartDate)
  const currentWindow =
    analyticsRange.months === null ? undefined : rollingWindow(new Date(), analyticsRange.months)
  const rangeMonths = analyticsRange.months
  const displaySales =
    rangeMonths === null
      ? sales.slice(0, 12)
      : sales.filter((sale) => currentWindow && withinWindow(sale, currentWindow)).slice(0, 12)

  const insights = buildLocationInsights(sales, {
      range,
      lastSaleDate: sales[0]?.date_of_sale ?? null,
    })

  return {
    insights,
    recentSales: displaySales as PprSale[],
  }
}

const getMarketInsightsCached = unstable_cache(
  async (marketSlug: string, range: PprDateRangeValue = "last-year") => {
    const market = getPprMarket(marketSlug)
    if (!market) throw new Error(`Unknown PPR market: ${marketSlug}`)
    const snapshot = await loadMarketInsightsFromTable(market.slug, range)
    if (snapshot) {
      return {
        insights: mapMarketInsightsRowRecord(snapshot),
        recentSales: await getRecentMarketSales(market, range),
      }
    }
    return getMarketInsightsUncached(market, range)
  },
  ["ppr-market-insights", PPR_INSIGHTS_CACHE_VERSION],
  { revalidate: PPR_ANALYTICS_REVALIDATE_SECONDS }
)

export async function getMarketInsights(
  market: PprMarket,
  range: PprDateRangeValue = "last-year"
) {
  return getMarketInsightsCached(market.slug, range)
}

const getAreaInsightsUncached = async (
  county: string,
  areaSlug: string,
  range: PprDateRangeValue = "last-year"
) => {
  const analyticsRange = getAnalyticsRange(range)
  const momentumStartDate = startOfYear(new Date().getFullYear() - 3)
  const historyStartDate =
    analyticsRange.months === null
      ? undefined
      : [getPprDateRangePreset(range).dateFrom, momentumStartDate].filter(Boolean).sort()[0]
  const [sales, areaStats] = await Promise.all([
    getAreaSalesRows(county, areaSlug, historyStartDate),
    supabase
      .from("ppr_area_stats")
      .select("*")
      .ilike("county", county)
      .eq("area_slug", areaSlug)
      .order("period_end", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const summary = areaStats.data as PprAreaStats | null
  const currentWindow =
    analyticsRange.months === null ? undefined : rollingWindow(new Date(), analyticsRange.months)
  const insights = buildLocationInsights(sales, {
    range,
    lastSaleDate: sales[0]?.date_of_sale ?? null,
  })

  return {
    insights,
    recentSales:
      analyticsRange.months === null
        ? (sales.slice(0, 8) as PprSale[])
        : (sales.filter((sale) => currentWindow && withinWindow(sale, currentWindow)).slice(0, 8) as PprSale[]),
    stats: summary,
  }
}

const getAreaInsightsCached = unstable_cache(
  async (county: string, areaSlug: string, range: PprDateRangeValue = "last-year") => {
    const snapshot = await loadAreaInsightsFromTable(county, areaSlug, range)
    if (snapshot) {
      return {
        insights: mapAreaInsightsRowRecord(snapshot),
        recentSales: await getRecentAreaSales(county, areaSlug, range),
      }
    }

    return getAreaInsightsUncached(county, areaSlug, range)
  },
  ["ppr-area-insights", PPR_INSIGHTS_CACHE_VERSION],
  { revalidate: PPR_ANALYTICS_REVALIDATE_SECONDS }
)

export async function getAreaInsights(
  county: string,
  areaSlug: string,
  range: PprDateRangeValue = "last-year"
) {
  return getAreaInsightsCached(county, areaSlug, range)
}

const getNationalWindowSales = cache(async (range: PprDateRangeValue = "last-year") => {
  const analyticsRange = getAnalyticsRange(range)
  const rangeMonths = analyticsRange.months
  const startDate =
    rangeMonths === null
      ? undefined
      : getPprDateRangePreset(range).dateFrom || rollingWindow(new Date(), rangeMonths).start
  return fetchSalesBatch(
    ANALYTICS_SALE_SELECT,
    (query) => (startDate ? query.gte("date_of_sale", startDate) : query)
  )
})

function comparisonHistoryStartDate(range: PprDateRangeValue) {
  const analyticsRange = getAnalyticsRange(range)
  const rangeMonths = analyticsRange.months

  if (rangeMonths === null) return undefined

  return rollingWindow(new Date(), rangeMonths * 2).start
}

function buildMarketBucketsFromSales(sales: AnalyticsSale[], markets: PprMarket[]) {
  const buckets = new Map<string, AnalyticsSale[]>()
  for (const market of markets) {
    buckets.set(marketScopeKey(market), [])
  }

  for (const sale of sales) {
    for (const market of markets) {
      if (saleMatchesMarket(sale, market)) {
        buckets.get(marketScopeKey(market))?.push(sale)
      }
    }
  }

  return buckets
}

function trackedTownSuburbMarketsForCounty(county: string, sales: AnalyticsSale[]) {
  const countyLower = county.toLowerCase()
  const availableAreaSlugs = new Set(
    sales
      .map((sale) => sale.area_slug)
      .filter((areaSlug): areaSlug is string => Boolean(areaSlug))
  )

  return PPR_MARKETS.filter((market) => {
    if (market.marketType !== "town_suburb") return false
    if (market.county) return market.county.toLowerCase() === countyLower
    return availableAreaSlugs.has(market.areaSlug ?? market.slug)
  })
}

function curatedMarketsBySlug(slugs: readonly string[]) {
  return slugs
    .map((slug) => getPprMarket(slug))
    .filter((market): market is PprMarket => Boolean(market))
}

function buildComparisonRow(
  market: PprMarket,
  sales: AnalyticsSale[],
  nationalMedian?: number,
  range: PprDateRangeValue = "last-year"
): PprComparisonRow | undefined {
  const now = new Date()
  const analyticsRange = getAnalyticsRange(range)
  const rangeMonths = analyticsRange.months
  const current =
    rangeMonths === null
      ? sales
      : sales.filter((sale) => withinWindow(sale, rollingWindow(now, rangeMonths)))
  if (current.length < PPR_ANALYTICS_THRESHOLDS.minComparisonSales) return undefined

  const currentMedian = median(pricesForSales(current))
  if (!currentMedian) return undefined

  const previous =
    rangeMonths !== null
      ? sales.filter((sale) =>
          withinWindow(sale, rollingWindow(now, rangeMonths, rangeMonths))
        )
      : []
  const hasReliableActivity =
    current.length >= PPR_ANALYTICS_THRESHOLDS.minActivityComparisonSales &&
    previous.length >= PPR_ANALYTICS_THRESHOLDS.minActivityComparisonSales
  const previousMedian =
    previous.length >= PPR_ANALYTICS_THRESHOLDS.minPriceComparisonSales
      ? median(pricesForSales(previous))
      : undefined

  const split = computeBuildSplitStats(current)

  return {
    slug: market.slug,
    label: pprMarketLabel(market),
    href: `/sold-prices/${market.slug}`,
    county: inferComparisonRowCounty(current, market.county),
    medianPrice: currentMedian,
    salesVolume: current.length,
    currentPeriodCount: current.length,
    previousPeriodCount: previous.length,
    activityChangePct: hasReliableActivity ? percentChange(current.length, previous.length) : undefined,
    yoyChangePct: percentChange(currentMedian, previousMedian),
    newBuildMedian: split?.newBuildMedian,
    secondHandMedian: split?.secondHandMedian,
    vsNationalMedianPct: percentChange(currentMedian, nationalMedian),
  }
}

const getTrackedLocationComparisonRowsUncached = async (
  range: PprDateRangeValue = "last-year"
) => {
  const historyStartDate = comparisonHistoryStartDate(range)
  const sales = await fetchSalesBatch(
    ANALYTICS_SALE_SELECT,
    (query) => (historyStartDate ? query.gte("date_of_sale", historyStartDate) : query)
  )
  const markets = PPR_MARKETS.filter((market) => market.marketType !== "county")
  const buckets = buildMarketBucketsFromSales(sales, markets)
  const analyticsRange = getAnalyticsRange(range)
  const rangeMonths = analyticsRange.months
  const currentSales =
    rangeMonths === null
      ? sales
      : sales.filter((sale) => withinWindow(sale, rollingWindow(new Date(), rangeMonths)))
  const nationalMedian = median(pricesForSales(currentSales))

  return markets
    .map((market) =>
      buildComparisonRow(market, buckets.get(marketScopeKey(market)) || [], nationalMedian, range)
    )
    .filter((row): row is PprComparisonRow => Boolean(row))
}

const getTrackedLocationComparisonRowsCached = unstable_cache(
  async (range: PprDateRangeValue = "last-year") =>
    (await loadComparisonRowsFromTable("all-tracked", range)) ||
    getTrackedLocationComparisonRowsUncached(range),
  ["ppr-tracked-comparison-rows", PPR_COMPARISON_CACHE_VERSION],
  { revalidate: PPR_ANALYTICS_REVALIDATE_SECONDS }
)

export async function getTrackedLocationComparisonRows(
  range: PprDateRangeValue = "last-year"
) {
  return getTrackedLocationComparisonRowsCached(range)
}

const getHomepageSoldPriceStatsUncached = async () => {
  const sales = await getNationalWindowSales()
  const currentWindow = rollingWindow(new Date(), 12)
  const priorWindow = rollingWindow(new Date(), 12, 12)

  const currentSales = sales.filter((sale) => withinWindow(sale, currentWindow))
  const priorSales = sales.filter((sale) => withinWindow(sale, priorWindow))
  const nationalMedian = median(pricesForSales(currentSales))
  const priorNationalMedian =
    currentSales.length >= PPR_ANALYTICS_THRESHOLDS.minPriceComparisonSales &&
    priorSales.length >= PPR_ANALYTICS_THRESHOLDS.minPriceComparisonSales
      ? median(pricesForSales(priorSales))
      : undefined

  const countyCurrentPrices = new Map<string, number[]>()
  const countyPriorPrices = new Map<string, number[]>()
  for (const sale of currentSales) {
    const county = sale.county?.trim()
    if (!county) continue
    const price = numericPrice(sale.price_eur)
    if (!Number.isFinite(price)) continue
    const currentPricesForCounty = countyCurrentPrices.get(county) || []
    currentPricesForCounty.push(price)
    countyCurrentPrices.set(county, currentPricesForCounty)
  }

  for (const sale of priorSales) {
    const county = sale.county?.trim()
    if (!county) continue
    const price = numericPrice(sale.price_eur)
    if (!Number.isFinite(price)) continue
    const priorPricesForCounty = countyPriorPrices.get(county) || []
    priorPricesForCounty.push(price)
    countyPriorPrices.set(county, priorPricesForCounty)
  }

  const strongestCountyPriceIncrease = [...countyCurrentPrices.entries()]
    .map(([county, currentPrices]) => {
      const priorPrices = countyPriorPrices.get(county) || []
      if (
        currentPrices.length < PPR_ANALYTICS_THRESHOLDS.minPriceComparisonSales ||
        priorPrices.length < PPR_ANALYTICS_THRESHOLDS.minPriceComparisonSales
      ) {
        return undefined
      }

      const currentMedianForCounty = median(currentPrices)
      const priorMedianForCounty = median(priorPrices)
      const yoyChangePct = percentChange(currentMedianForCounty, priorMedianForCounty)

      if (!currentMedianForCounty || !priorMedianForCounty || yoyChangePct === undefined) {
        return undefined
      }

      return {
        county,
        yoyChangePct,
      }
    })
    .filter((entry): entry is { county: string; yoyChangePct: number } => Boolean(entry))
    .sort((left, right) => right.yoyChangePct - left.yoyChangePct)[0]

  const trackedRows = await getTrackedLocationComparisonRows()
  const risingMarket = trackedRows
    .filter(
      (row) =>
        row.yoyChangePct !== undefined &&
        row.salesVolume >= PPR_ANALYTICS_THRESHOLDS.minHomepageRisingSales
    )
    .sort((left, right) => (right.yoyChangePct || 0) - (left.yoyChangePct || 0))[0]

  const commuterRows = trackedRows
    .filter((row) => COMMUTER_TOWN_MARKET_SLUGS.includes(row.slug as (typeof COMMUTER_TOWN_MARKET_SLUGS)[number]))
    .filter(
      (row) =>
        row.salesVolume >= PPR_ANALYTICS_THRESHOLDS.minAffordableMarketSales &&
        row.medianPrice <= PPR_ANALYTICS_THRESHOLDS.commuterAffordableMedianCap
    )
    .sort((left, right) => left.medianPrice - right.medianPrice)

  const stats: PprHomepageStat[] = []

  if (nationalMedian) {
    stats.push({
      eyebrow: "National median",
      title: "Recorded sale prices",
      value: euroDisplay(nationalMedian),
      detail: "Last 12 months across Ireland",
      href: "/sold-prices",
    })
  } else {
    stats.push({
      eyebrow: "National median",
      title: "Recorded sale prices",
      value: "Limited data",
      detail: "Shown when enough recent sales are available across Ireland",
      href: "/sold-prices",
    })
  }

  if (nationalMedian && priorNationalMedian) {
    const yoy = percentChange(nationalMedian, priorNationalMedian)
    if (yoy !== undefined) {
      stats.push({
        eyebrow: "National change",
        title: "Year on year",
        value: signedPercent(yoy),
        detail: "Median sale price versus the previous 12 months",
        href: "/sold-prices/rising-markets",
      })
    } else {
      stats.push({
        eyebrow: "National change",
        title: "Year on year",
        value: "Limited data",
        detail: "Shown when both 12-month periods have enough sales",
        href: "/sold-prices/rising-markets",
      })
    }
  } else {
    stats.push({
      eyebrow: "National change",
      title: "Year on year",
      value: "Limited data",
      detail: "Shown when both 12-month periods have enough sales",
      href: "/sold-prices/rising-markets",
    })
  }

  if (strongestCountyPriceIncrease) {
    stats.push({
      eyebrow: "County highest YoY price increase",
      title: strongestCountyPriceIncrease.county,
      value: signedPercent(strongestCountyPriceIncrease.yoyChangePct),
      detail: "Median sale price versus the previous 12 months",
      href: `/sold-prices/${strongestCountyPriceIncrease.county.toLowerCase()}`,
    })
  } else {
    stats.push({
      eyebrow: "County market watch",
      title: "County price movement",
      value: "Limited data",
      detail: "Shown when a county has enough recent sales for a reliable comparison",
      href: "/sold-prices",
    })
  }

  if (risingMarket) {
    stats.push({
      eyebrow: "Fastest-rising tracked market",
      title: risingMarket.label,
      value: signedPercent(risingMarket.yoyChangePct || 0),
      detail: "Year-on-year median change with a 50-sale minimum",
      href: "/sold-prices/rising-markets",
    })
  } else {
    stats.push({
      eyebrow: "Fastest-rising tracked market",
      title: "Tracked market watch",
      value: "Limited data",
      detail: "Shown when a tracked market clears the recent-sales threshold",
      href: "/sold-prices/rising-markets",
    })
  }

  if (commuterRows[0]) {
    stats.push({
      eyebrow: "Commuter town watch",
      title: commuterRows[0].label,
      value: euroDisplay(commuterRows[0].medianPrice),
      detail: "Lowest median in our commuter-town set with a 24-sale minimum",
      href: "/sold-prices/commuter-towns",
    })
  } else {
    stats.push({
      eyebrow: "Commuter town watch",
      title: "Commuter-town pricing",
      value: "Limited data",
      detail: "Shown when a commuter town has enough recent sales for comparison",
      href: "/sold-prices/commuter-towns",
    })
  }

  return stats.slice(0, 5)
}

const getHomepageSoldPriceStatsCached = unstable_cache(
  async () => {
    const [nationalSnapshot, risingRows, commuterRows] = await Promise.all([
      loadNationalSnapshotRow("last-year"),
      loadComparisonRowsFromTable("rising-markets", "last-year"),
      loadComparisonRowsFromTable("commuter-towns", "last-year"),
    ])

    if (!nationalSnapshot) {
      return getHomepageSoldPriceStatsUncached()
    }

    const stats: PprHomepageStat[] = [
      {
        eyebrow: "National median",
        title: "Recorded sale prices",
        value: nationalSnapshot.median_price_eur
          ? euroDisplay(nationalSnapshot.median_price_eur)
          : "Limited data",
        detail: nationalSnapshot.median_price_eur
          ? "Last 12 months across Ireland"
          : "Shown when enough recent sales are available across Ireland",
        href: "/sold-prices",
      },
      {
        eyebrow: "National change",
        title: "Year on year",
        value:
          nationalSnapshot.yoy_change_pct !== null
            ? signedPercent(nationalSnapshot.yoy_change_pct)
            : "Limited data",
        detail:
          nationalSnapshot.yoy_change_pct !== null
            ? "Median sale price versus the previous 12 months"
            : "Shown when both 12-month periods have enough sales",
        href: "/sold-prices/rising-markets",
      },
      nationalSnapshot.strongest_county && nationalSnapshot.strongest_county_yoy_change_pct !== null
        ? {
            eyebrow: "County highest YoY price increase",
            title: nationalSnapshot.strongest_county,
            value: signedPercent(nationalSnapshot.strongest_county_yoy_change_pct),
            detail: "Median sale price versus the previous 12 months",
            href: `/sold-prices/${nationalSnapshot.strongest_county.toLowerCase()}`,
          }
        : {
            eyebrow: "County market watch",
            title: "County price movement",
            value: "Limited data",
            detail: "Shown when a county has enough recent sales for a reliable comparison",
            href: "/sold-prices",
          },
      risingRows?.[0]
        ? {
            eyebrow: "Fastest-rising tracked market",
            title: risingRows[0].label,
            value: signedPercent(risingRows[0].yoyChangePct || 0),
            detail: "Year-on-year median change with a 50-sale minimum",
            href: "/sold-prices/rising-markets",
          }
        : {
            eyebrow: "Fastest-rising tracked market",
            title: "Tracked market watch",
            value: "Limited data",
            detail: "Shown when a tracked market clears the recent-sales threshold",
            href: "/sold-prices/rising-markets",
          },
      commuterRows?.[0]
        ? {
            eyebrow: "Commuter town watch",
            title: commuterRows[0].label,
            value: euroDisplay(commuterRows[0].medianPrice),
            detail: "Lowest median in our commuter-town set with a 24-sale minimum",
            href: "/sold-prices/commuter-towns",
          }
        : {
            eyebrow: "Commuter town watch",
            title: "Commuter-town pricing",
            value: "Limited data",
            detail: "Shown when a commuter town has enough recent sales for comparison",
            href: "/sold-prices/commuter-towns",
          },
    ]

    return stats
  },
  ["ppr-homepage-sold-price-stats", PPR_HOMEPAGE_STATS_CACHE_VERSION],
  { revalidate: PPR_ANALYTICS_REVALIDATE_SECONDS }
)

export async function getHomepageSoldPriceStats() {
  return getHomepageSoldPriceStatsCached()
}

const getNationalOverviewSnapshotUncached = async (
  range: PprDateRangeValue = "last-year"
): Promise<PprNationalOverviewSnapshot> => {
  const analyticsRange = getAnalyticsRange(range)
  const now = new Date()
  const rollingComparison = rollingTwelveMonthWindows(now)

  if (analyticsRange.months === null) {
    const sales = await getNationalWindowSales("all")
    const prices = pricesForSales(sales)
    const comparisonSales = await fetchSalesBatch(
      ANALYTICS_SALE_SELECT,
      (query) => query.gte("date_of_sale", rollingComparison.previous.start)
    )
    const currentRollingPrices = pricesForSales(
      comparisonSales.filter((sale) => withinWindow(sale, rollingComparison.current))
    )
    const previousRollingPrices = pricesForSales(
      comparisonSales.filter((sale) => withinWindow(sale, rollingComparison.previous))
    )
    const hasReliablePriceChange =
      currentRollingPrices.length >= PPR_ANALYTICS_THRESHOLDS.minPriceComparisonSales &&
      previousRollingPrices.length >= PPR_ANALYTICS_THRESHOLDS.minPriceComparisonSales

    return {
      medianPrice: median(prices),
      p25: percentile(prices, 0.25),
      p75: percentile(prices, 0.75),
      salesCount: sales.length,
      yoyChangePct: hasReliablePriceChange
        ? percentChange(median(currentRollingPrices), median(previousRollingPrices))
        : undefined,
    }
  }

  const extendedMonths = analyticsRange.months * 2
  const startDate = rollingWindow(now, extendedMonths).start
  const sales = await fetchSalesBatch(
    ANALYTICS_SALE_SELECT,
    (query) => query.gte("date_of_sale", startDate)
  )
  const rollingComparisonSales = await fetchSalesBatch(
    ANALYTICS_SALE_SELECT,
    (query) => query.gte("date_of_sale", rollingComparison.previous.start)
  )

  const currentSales = sales.filter((sale) =>
    withinWindow(sale, rollingWindow(now, analyticsRange.months || 12))
  )
  const currentComparisonSales = rollingComparisonSales.filter((sale) =>
    withinWindow(sale, rollingComparison.current)
  )
  const previousComparisonSales = rollingComparisonSales.filter((sale) =>
    withinWindow(sale, rollingComparison.previous)
  )

  const currentPrices = pricesForSales(currentSales)
  const previousMedian =
    previousComparisonSales.length >= PPR_ANALYTICS_THRESHOLDS.minPriceComparisonSales
      ? median(pricesForSales(previousComparisonSales))
      : undefined

  return {
    medianPrice: median(currentPrices),
    p25: currentSales.length >= PPR_ANALYTICS_THRESHOLDS.minDistributionSales
      ? percentile(currentPrices, 0.25)
      : undefined,
    p75: currentSales.length >= PPR_ANALYTICS_THRESHOLDS.minDistributionSales
      ? percentile(currentPrices, 0.75)
      : undefined,
    salesCount: currentSales.length,
    yoyChangePct:
      currentComparisonSales.length >= PPR_ANALYTICS_THRESHOLDS.minPriceComparisonSales
        ? percentChange(median(pricesForSales(currentComparisonSales)), previousMedian)
        : undefined,
  }
}

const getNationalOverviewSnapshotCached = unstable_cache(
  async (range: PprDateRangeValue = "last-year") => {
    const row = await loadNationalSnapshotRow(range)
    if (row) {
      return {
        medianPrice: row.median_price_eur ?? undefined,
        p25: row.p25_price_eur ?? undefined,
        p75: row.p75_price_eur ?? undefined,
        salesCount: row.sales_count,
        yoyChangePct: row.yoy_change_pct ?? undefined,
        latestSaleDate: row.latest_sale_date,
      }
    }
    return getNationalOverviewSnapshotUncached(range)
  },
  ["ppr-national-overview-snapshot", PPR_NATIONAL_SNAPSHOT_CACHE_VERSION],
  { revalidate: PPR_ANALYTICS_REVALIDATE_SECONDS }
)

export async function getNationalOverviewSnapshot(range: PprDateRangeValue = "last-year") {
  return getNationalOverviewSnapshotCached(range)
}

const getNationalActivitySnapshotUncached = async (): Promise<PprNationalActivitySnapshot> => {
  const now = new Date()
  const windows = rollingTwelveMonthWindows(now)
  const startDate = windows.previous.start
  const sales = await fetchSalesBatch(
    ANALYTICS_SALE_SELECT,
    (query) => query.gte("date_of_sale", startDate)
  )

  const currentCount = sales.filter((sale) => withinWindow(sale, windows.current)).length
  const previousCount = sales.filter((sale) => withinWindow(sale, windows.previous)).length
  const hasReliableChange =
    currentCount >= PPR_ANALYTICS_THRESHOLDS.minActivityComparisonSales &&
    previousCount >= PPR_ANALYTICS_THRESHOLDS.minActivityComparisonSales

  return {
    currentPeriodLabel: windows.currentLabel,
    previousPeriodLabel: windows.previousLabel,
    currentCount,
    previousCount,
    yoyChangePct: hasReliableChange ? percentChange(currentCount, previousCount) : undefined,
    hasReliableChange,
  }
}

const getNationalActivitySnapshotCached = unstable_cache(
  async () => {
    const row = await loadNationalSnapshotRow("last-year")
    if (row) {
      return {
        currentPeriodLabel: row.current_period_label || "Last 12 months",
        previousPeriodLabel: row.previous_period_label || "Previous 12 months",
        currentCount: row.current_period_count || 0,
        previousCount: row.previous_period_count || 0,
        yoyChangePct: row.activity_change_pct ?? undefined,
        hasReliableChange: row.activity_change_pct !== null,
      }
    }
    return getNationalActivitySnapshotUncached()
  },
  ["ppr-national-activity-snapshot", PPR_NATIONAL_SNAPSHOT_CACHE_VERSION],
  { revalidate: PPR_ANALYTICS_REVALIDATE_SECONDS }
)

export async function getNationalActivitySnapshot() {
  return getNationalActivitySnapshotCached()
}

const getNationalActivityLeaderUncached = async (): Promise<PprNationalActivityLeader | undefined> => {
  const sales = await getNationalWindowSales("last-year")
  const countyVolumes = new Map<string, number>()

  for (const sale of sales) {
    const county = sale.county?.trim()
    if (!county) continue
    countyVolumes.set(county, (countyVolumes.get(county) || 0) + 1)
  }

  const leader = [...countyVolumes.entries()].sort((left, right) => right[1] - left[1])[0]
  if (!leader) return undefined

  return {
    county: leader[0],
    salesCount: leader[1],
  }
}

const getNationalActivityLeaderCached = unstable_cache(
  async () => {
    const row = await loadNationalSnapshotRow("last-year")
    if (row?.strongest_county) {
      return {
        county: row.strongest_county,
        salesCount: row.current_period_count || 0,
      }
    }
    return getNationalActivityLeaderUncached()
  },
  ["ppr-national-activity-leader"],
  { revalidate: PPR_ANALYTICS_REVALIDATE_SECONDS }
)

export async function getNationalActivityLeader() {
  return getNationalActivityLeaderCached()
}

const getDublinComparisonRowsUncached = async (range: PprDateRangeValue = "last-year") => {
  const currentWindowStart = comparisonHistoryStartDate(range)
  const sales = await fetchSalesBatch(
    ANALYTICS_SALE_SELECT,
    (query) =>
      currentWindowStart
        ? query.ilike("county", "Dublin").gte("date_of_sale", currentWindowStart)
        : query.ilike("county", "Dublin")
  )
  const dublinMarkets = [
    ...PPR_MARKETS.filter((market) => market.marketType === "dublin_district"),
    ...trackedTownSuburbMarketsForCounty("Dublin", sales),
  ]
  const buckets = buildMarketBucketsFromSales(sales, dublinMarkets)
  const nationalMedian = median(pricesForSales(await getNationalWindowSales(range)))

  return dublinMarkets
    .map((market) =>
      buildComparisonRow(market, buckets.get(marketScopeKey(market)) || [], nationalMedian, range)
    )
    .filter((row): row is PprComparisonRow => Boolean(row))
}

const getDublinComparisonRowsCached = unstable_cache(
  async (range: PprDateRangeValue = "last-year") =>
    (await loadComparisonRowsFromTable("dublin-compared", range)) ||
    getDublinComparisonRowsUncached(range),
  ["ppr-dublin-comparison-rows", PPR_COMPARISON_CACHE_VERSION],
  { revalidate: PPR_ANALYTICS_REVALIDATE_SECONDS }
)

export async function getDublinComparisonRows(range: PprDateRangeValue = "last-year") {
  return getDublinComparisonRowsCached(range)
}

const getCorkComparisonRowsCached = unstable_cache(
  async (range: PprDateRangeValue = "last-year") =>
    (await loadComparisonRowsFromTable("cork-compared", range)) ||
    getCuratedCountyComparisonRows(COMPARISON_PAGE_MARKET_SLUGS.corkCompared, range),
  ["ppr-cork-comparison-rows", PPR_COMPARISON_CACHE_VERSION],
  { revalidate: PPR_ANALYTICS_REVALIDATE_SECONDS }
)

export async function getCorkComparisonRows(range: PprDateRangeValue = "last-year") {
  return getCorkComparisonRowsCached(range)
}

async function getCuratedCountyComparisonRows(
  marketSlugs: readonly string[],
  range: PprDateRangeValue = "last-year"
) {
  const historyStartDate = comparisonHistoryStartDate(range)
  const markets = curatedMarketsBySlug(marketSlugs)
  const nationalMedian = median(pricesForSales(await getNationalWindowSales(range)))
  const countySales = new Map<string, AnalyticsSale[]>()

  await Promise.all(
    Array.from(
      new Set(
        markets
          .map((market) => market.county)
          .filter((county): county is string => Boolean(county))
      )
    ).map(async (county) => {
      countySales.set(county, await getCountySalesRows(county, historyStartDate))
    })
  )

  const rows = markets.map((market) => {
    const sales = market.county
      ? countySales.get(market.county)?.filter((sale) => saleMatchesMarket(sale, market)) || []
      : []

    return buildComparisonRow(market, sales, nationalMedian, range)
  })

  return rows.filter((row): row is PprComparisonRow => Boolean(row))
}

const getLimerickComparisonRowsCached = unstable_cache(
  async (range: PprDateRangeValue = "last-year") =>
    (await loadComparisonRowsFromTable("limerick-compared", range)) ||
    getCuratedCountyComparisonRows(COMPARISON_PAGE_MARKET_SLUGS.limerickCompared, range),
  ["ppr-limerick-comparison-rows", PPR_COMPARISON_CACHE_VERSION],
  { revalidate: PPR_ANALYTICS_REVALIDATE_SECONDS }
)

export async function getLimerickComparisonRows(range: PprDateRangeValue = "last-year") {
  return getLimerickComparisonRowsCached(range)
}

const getGalwayComparisonRowsCached = unstable_cache(
  async (range: PprDateRangeValue = "last-year") =>
    (await loadComparisonRowsFromTable("galway-compared", range)) ||
    getCuratedCountyComparisonRows(COMPARISON_PAGE_MARKET_SLUGS.galwayCompared, range),
  ["ppr-galway-comparison-rows", PPR_COMPARISON_CACHE_VERSION],
  { revalidate: PPR_ANALYTICS_REVALIDATE_SECONDS }
)

export async function getGalwayComparisonRows(range: PprDateRangeValue = "last-year") {
  return getGalwayComparisonRowsCached(range)
}

const getWaterfordComparisonRowsCached = unstable_cache(
  async (range: PprDateRangeValue = "last-year") =>
    (await loadComparisonRowsFromTable("waterford-compared", range)) ||
    getCuratedCountyComparisonRows(COMPARISON_PAGE_MARKET_SLUGS.waterfordCompared, range),
  ["ppr-waterford-comparison-rows", PPR_COMPARISON_CACHE_VERSION],
  { revalidate: PPR_ANALYTICS_REVALIDATE_SECONDS }
)

export async function getWaterfordComparisonRows(range: PprDateRangeValue = "last-year") {
  return getWaterfordComparisonRowsCached(range)
}

const getCountiesComparedRowsUncached = async (range: PprDateRangeValue = "last-year") => {
  const historyStartDate = comparisonHistoryStartDate(range)
  const countyMarkets = PPR_MARKETS.filter((market) => market.marketType === "county")
  const nationalMedian = median(pricesForSales(await getNationalWindowSales(range)))
  const countySales = new Map<string, AnalyticsSale[]>()

  await Promise.all(
    countyMarkets.map(async (market) => {
      countySales.set(market.name, await getCountySalesRows(market.name, historyStartDate))
    })
  )

  return countyMarkets
    .map((market) =>
      buildComparisonRow(market, countySales.get(market.name) || [], nationalMedian, range)
    )
    .filter((row): row is PprComparisonRow => Boolean(row))
}

const getCountiesComparedRowsCached = unstable_cache(
  async (range: PprDateRangeValue = "last-year") =>
    (await loadComparisonRowsFromTable("counties-compared", range)) ||
    getCountiesComparedRowsUncached(range),
  ["ppr-counties-compared-rows", PPR_COMPARISON_CACHE_VERSION],
  { revalidate: PPR_ANALYTICS_REVALIDATE_SECONDS }
)

export async function getCountiesComparedRows(range: PprDateRangeValue = "last-year") {
  return getCountiesComparedRowsCached(range)
}

const getCommuterTownRowsUncached = async (range: PprDateRangeValue = "last-year") => {
  const rows = await getTrackedLocationComparisonRows(range)
  return withComparisonDisplayRanks(
    rows
    .filter((row) =>
      COMMUTER_TOWN_MARKET_SLUGS.includes(row.slug as (typeof COMMUTER_TOWN_MARKET_SLUGS)[number])
    )
    .sort((left, right) => left.medianPrice - right.medianPrice)
    .slice(0, PPR_NON_LOCATION_COMPARISON_PAGE_LIMIT)
  )
}

const getCommuterTownRowsCached = unstable_cache(
  async (range: PprDateRangeValue = "last-year") =>
    (await loadComparisonRowsFromTable("commuter-towns", range)) ||
    getCommuterTownRowsUncached(range),
  ["ppr-commuter-town-rows", PPR_COMPARISON_CACHE_VERSION],
  { revalidate: PPR_ANALYTICS_REVALIDATE_SECONDS }
)

export async function getCommuterTownRows(range: PprDateRangeValue = "last-year") {
  const rows = await getCommuterTownRowsCached(range)
  const commuterDistanceKm = COMMUTER_TOWN_DISTANCE_KM as Record<string, number>

  return rows.map((row, index) => ({
    ...row,
    rank: row.rank ?? index + 1,
    distanceFromDublinKm: commuterDistanceKm[row.slug],
  }))
}

const getAffordableMarketRowsUncached = async (range: PprDateRangeValue = "last-year") => {
  const rows = await getTrackedLocationComparisonRows(range)
  return withComparisonDisplayRanks(
    rows
    .filter(
      (row) =>
        row.salesVolume >= PPR_ANALYTICS_THRESHOLDS.minAffordableMarketSales &&
        row.medianPrice <= PPR_ANALYTICS_THRESHOLDS.affordableMarketMedianCap
    )
    .sort((left, right) => {
      if (left.medianPrice !== right.medianPrice) return left.medianPrice - right.medianPrice
      return right.salesVolume - left.salesVolume
    })
    .slice(0, PPR_NON_LOCATION_COMPARISON_PAGE_LIMIT)
  )
}

const getAffordableMarketRowsCached = unstable_cache(
  async (range: PprDateRangeValue = "last-year") =>
    (await loadComparisonRowsFromTable("affordable-markets", range)) ||
    getAffordableMarketRowsUncached(range),
  ["ppr-affordable-market-rows", PPR_COMPARISON_CACHE_VERSION],
  { revalidate: PPR_ANALYTICS_REVALIDATE_SECONDS }
)

export async function getAffordableMarketRows(range: PprDateRangeValue = "last-year") {
  return withComparisonDisplayRanks(await getAffordableMarketRowsCached(range))
}

const getHighValueMarketRowsUncached = async (range: PprDateRangeValue = "last-year") => {
  const rows = await getTrackedLocationComparisonRows(range)
  return withComparisonDisplayRanks(
    rows
    .filter(
      (row) =>
        row.salesVolume >= PPR_ANALYTICS_THRESHOLDS.minAffordableMarketSales &&
        row.medianPrice >= PPR_ANALYTICS_THRESHOLDS.highValueMarketMedianFloor
    )
    .sort((left, right) => {
      if (left.medianPrice !== right.medianPrice) return right.medianPrice - left.medianPrice
      return right.salesVolume - left.salesVolume
    })
    .slice(0, PPR_NON_LOCATION_COMPARISON_PAGE_LIMIT)
  )
}

const getHighValueMarketRowsCached = unstable_cache(
  async (range: PprDateRangeValue = "last-year") =>
    (await loadComparisonRowsFromTable("high-value-markets", range)) ||
    getHighValueMarketRowsUncached(range),
  ["ppr-high-value-market-rows", PPR_COMPARISON_CACHE_VERSION],
  { revalidate: PPR_ANALYTICS_REVALIDATE_SECONDS }
)

export async function getHighValueMarketRows(range: PprDateRangeValue = "last-year") {
  return withComparisonDisplayRanks(await getHighValueMarketRowsCached(range))
}

const getMostActiveMarketRowsUncached = async (range: PprDateRangeValue = "last-year") => {
  const rows = await getTrackedLocationComparisonRows(range)
  return withComparisonDisplayRanks(
    sortComparisonRowsBySalesVolume(rows, "desc").slice(0, PPR_NON_LOCATION_COMPARISON_PAGE_LIMIT)
  )
}

const getMostActiveMarketRowsCached = unstable_cache(
  async (range: PprDateRangeValue = "last-year") =>
    (await loadComparisonRowsFromTable("most-active-markets", range)) ||
    getMostActiveMarketRowsUncached(range),
  ["ppr-most-active-market-rows", PPR_COMPARISON_CACHE_VERSION],
  { revalidate: PPR_ANALYTICS_REVALIDATE_SECONDS }
)

export async function getMostActiveMarketRows(range: PprDateRangeValue = "last-year") {
  return withComparisonDisplayRanks(await getMostActiveMarketRowsCached(range))
}

const getLeastActiveMarketRowsUncached = async (range: PprDateRangeValue = "last-year") => {
  const rows = await getTrackedLocationComparisonRows(range)
  return withComparisonDisplayRanks(
    sortComparisonRowsBySalesVolume(rows, "asc").slice(0, PPR_NON_LOCATION_COMPARISON_PAGE_LIMIT)
  )
}

const getLeastActiveMarketRowsCached = unstable_cache(
  async (range: PprDateRangeValue = "last-year") =>
    (await loadComparisonRowsFromTable("least-active-markets", range)) ||
    getLeastActiveMarketRowsUncached(range),
  ["ppr-least-active-market-rows", PPR_COMPARISON_CACHE_VERSION],
  { revalidate: PPR_ANALYTICS_REVALIDATE_SECONDS }
)

export async function getLeastActiveMarketRows(range: PprDateRangeValue = "last-year") {
  return withComparisonDisplayRanks(await getLeastActiveMarketRowsCached(range))
}

const getHottestMarketRowsUncached = async (range: PprDateRangeValue = "last-year") => {
  const rows = await getTrackedLocationComparisonRowsUncached(range)
  return withComparisonDisplayRanks(
    sortHottestComparisonRows(rows).slice(0, PPR_NON_LOCATION_COMPARISON_PAGE_LIMIT)
  )
}

const getHottestMarketRowsCached = unstable_cache(
  async (range: PprDateRangeValue = "last-year") =>
    (await loadComparisonRowsFromTable("hottest-markets", range)) ||
    getHottestMarketRowsUncached(range),
  ["ppr-hottest-market-rows", PPR_COMPARISON_CACHE_VERSION],
  { revalidate: PPR_ANALYTICS_REVALIDATE_SECONDS }
)

export async function getHottestMarketRows(range: PprDateRangeValue = "last-year") {
  return withComparisonDisplayRanks(await getHottestMarketRowsCached(range))
}

const getCoolestMarketRowsUncached = async (range: PprDateRangeValue = "last-year") => {
  const rows = await getTrackedLocationComparisonRowsUncached(range)
  return withComparisonDisplayRanks(
    sortCoolestComparisonRows(rows).slice(0, PPR_NON_LOCATION_COMPARISON_PAGE_LIMIT)
  )
}

const getCoolestMarketRowsCached = unstable_cache(
  async (range: PprDateRangeValue = "last-year") =>
    (await loadComparisonRowsFromTable("coolest-markets", range)) ||
    getCoolestMarketRowsUncached(range),
  ["ppr-coolest-market-rows", PPR_COMPARISON_CACHE_VERSION],
  { revalidate: PPR_ANALYTICS_REVALIDATE_SECONDS }
)

export async function getCoolestMarketRows(range: PprDateRangeValue = "last-year") {
  return withComparisonDisplayRanks(await getCoolestMarketRowsCached(range))
}

const getRisingMarketRowsUncached = async (range: PprDateRangeValue = "last-year") => {
  const rows = await getTrackedLocationComparisonRows(range)
  return withComparisonDisplayRanks(
    rows
    .filter(
      (row) =>
        row.salesVolume >= PPR_ANALYTICS_THRESHOLDS.minRisingMarketSales &&
        row.yoyChangePct !== undefined
    )
    .sort((left, right) => (right.yoyChangePct || 0) - (left.yoyChangePct || 0))
    .slice(0, PPR_NON_LOCATION_COMPARISON_PAGE_LIMIT)
  )
}

const getRisingMarketRowsCached = unstable_cache(
  async (range: PprDateRangeValue = "last-year") =>
    (await loadComparisonRowsFromTable("rising-markets", range)) ||
    getRisingMarketRowsUncached(range),
  ["ppr-rising-market-rows", PPR_COMPARISON_CACHE_VERSION],
  { revalidate: PPR_ANALYTICS_REVALIDATE_SECONDS }
)

export async function getRisingMarketRows(range: PprDateRangeValue = "last-year") {
  return withComparisonDisplayRanks(await getRisingMarketRowsCached(range))
}

const getFallingMarketRowsUncached = async (range: PprDateRangeValue = "last-year") => {
  const rows = await getTrackedLocationComparisonRows(range)
  return withComparisonDisplayRanks(
    rows
    .filter(
      (row) =>
        row.salesVolume >= PPR_ANALYTICS_THRESHOLDS.minRisingMarketSales &&
        row.yoyChangePct !== undefined &&
        row.yoyChangePct < 0
      )
      .sort((left, right) => (left.yoyChangePct || 0) - (right.yoyChangePct || 0))
      .slice(0, PPR_NON_LOCATION_COMPARISON_PAGE_LIMIT)
  )
}

const getFallingMarketRowsCached = unstable_cache(
  async (range: PprDateRangeValue = "last-year") =>
    (await loadComparisonRowsFromTable("falling-markets", range)) ||
    getFallingMarketRowsUncached(range),
  ["ppr-falling-market-rows", PPR_COMPARISON_CACHE_VERSION],
  { revalidate: PPR_ANALYTICS_REVALIDATE_SECONDS }
)

export async function getFallingMarketRows(range: PprDateRangeValue = "last-year") {
  return withComparisonDisplayRanks(await getFallingMarketRowsCached(range))
}

export function numberDisplay(value: number) {
  return new Intl.NumberFormat("en-IE").format(Math.round(value))
}

export function euroDisplay(value?: number) {
  if (!value || !Number.isFinite(value)) return "—"
  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value)
}

export function signedPercent(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "—"
  const rounded = round(value)
  return `${rounded > 0 ? "+" : ""}${rounded}%`
}

export function formatAreaLabel(area: Pick<PprAreaStats, "area_slug" | "county">) {
  const areaName = areaNameFromSlug(area.area_slug || "")
  if (!area.county) return areaName
  return `${areaName}, ${area.county}`
}
