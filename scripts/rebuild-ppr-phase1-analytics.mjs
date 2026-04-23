import { fileURLToPath } from "url"
import { createClient } from "@supabase/supabase-js"
import {
  BASE_PPR_MARKETS,
  COMPARISON_PAGE_MARKET_SLUGS,
  COMMUTER_TOWN_DISTANCE_KM,
  COMMUTER_TOWN_MARKET_SLUGS,
  PPR_MARKET_OVERRIDES,
  SUPPLEMENTAL_PPR_MARKET_SLUGS,
} from "../lib/ppr-data.mjs"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

const PPR_ANALYTICS_THRESHOLDS = {
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
  commuterAffordableMedianCap: 450_000,
  affordableMarketMedianCap: 300_000,
  highValueMarketMedianFloor: 500_000,
}

const MOMENTUM_LOOKBACK_YEARS = 5
const LAST_YEAR_RANGE = { value: "last-year", months: 12, label: "last 12 months" }

function formatSupplementalMarketName(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part, index) => {
      const lower = part.toLowerCase()
      if (lower === "rd") return "Rd"
      if (lower === "st") return "St"
      if (["on", "of"].includes(lower) && index > 0) return lower
      if (lower === "the") return index === 0 ? "The" : "the"
      if (/^\d+$/.test(part)) return part
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(" ")
}

function areaNameFromSlug(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase()
      if (lower === "rd") return "Rd"
      if (lower === "st") return "St"
      if (/^\d+$/.test(part)) return part
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(" ")
}

const PPR_MARKETS = [
  ...BASE_PPR_MARKETS.map((market) => ({
    ...market,
    ...(PPR_MARKET_OVERRIDES[market.slug] || {}),
  })),
  ...SUPPLEMENTAL_PPR_MARKET_SLUGS.map((slug) => ({
    name: formatSupplementalMarketName(slug),
    slug,
    marketType: "town_suburb",
    ...(PPR_MARKET_OVERRIDES[slug] || {}),
  })),
]

function pprMarketLabel(market) {
  return market.displayName || market.name
}

function dublinDistrictPrefix(market) {
  const district = market.name.replace(/^Dublin\s+/i, "").toUpperCase()
  return district === "6W" ? "D6W" : `D${district.padStart(2, "0")}`
}

function numericPrice(value) {
  const numeric =
    typeof value === "number" ? value : Number(String(value ?? "").replace(/[^0-9.]/g, ""))
  return Number.isFinite(numeric) ? numeric : NaN
}

function average(values) {
  if (values.length === 0) return undefined
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function round(value, digits = 0) {
  const power = 10 ** digits
  return Math.round(value * power) / power
}

function median(values) {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const midpoint = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[midpoint - 1] + sorted[midpoint]) / 2
    : sorted[midpoint]
}

function percentile(values, fraction) {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const index = (sorted.length - 1) * fraction
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  const weight = index - lower
  if (lower === upper) return sorted[lower]
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

function percentChange(current, previous) {
  if (!current || !previous || previous <= 0) return undefined
  return ((current - previous) / previous) * 100
}

function toIsoDate(value) {
  return value.toISOString().slice(0, 10)
}

function shiftMonths(value, months) {
  const next = new Date(value)
  next.setMonth(next.getMonth() + months)
  return next
}

function startOfYear(year) {
  return `${year}-01-01`
}

function endOfYear(year) {
  return `${year}-12-31`
}

function rollingWindow(now, months, offsetMonths = 0) {
  const end = shiftMonths(now, -offsetMonths)
  const start = shiftMonths(end, -months)
  start.setDate(start.getDate() + 1)
  return { start: toIsoDate(start), end: toIsoDate(end) }
}

function withinWindow(sale, window) {
  return sale.date_of_sale >= window.start && sale.date_of_sale <= window.end
}

function pricesForSales(sales) {
  return sales.map((sale) => numericPrice(sale.price_eur)).filter(Number.isFinite)
}

function getPeriodSummary(sales, window) {
  const periodSales = sales.filter((sale) => withinWindow(sale, window))
  return { median: median(pricesForSales(periodSales)), count: periodSales.length }
}

function rollingTwelveMonthWindows(now) {
  const current = rollingWindow(now, 12)
  const previous = rollingWindow(now, 12, 12)
  return {
    current,
    previous,
    currentLabel: "Last 12 months",
    previousLabel: "Previous 12 months",
  }
}

function computeMomentumStats(sales, now) {
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
  return {
    currentLabel: windows.currentLabel,
    currentMedian: current.median,
    currentCount: current.count,
    previousLabel: windows.previousLabel,
    previousMedian: previous.median,
    previousCount: previous.count,
    yoyChangePct: percentChange(current.median, previous.median) ?? 0,
    threeYearChangePct:
      threeYearBaseline.count >= PPR_ANALYTICS_THRESHOLDS.minPriceComparisonSales
        ? percentChange(current.median, threeYearBaseline.median)
        : undefined,
  }
}

function averageDaysBetweenSales(sales) {
  const sorted = [...sales].sort((a, b) => a.date_of_sale.localeCompare(b.date_of_sale))
  if (sorted.length < PPR_ANALYTICS_THRESHOLDS.minDaysBetweenSales) return undefined
  const gaps = []
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = new Date(sorted[index - 1].date_of_sale)
    const current = new Date(sorted[index].date_of_sale)
    gaps.push((current.getTime() - previous.getTime()) / (1000 * 60 * 60 * 24))
  }
  const avgGap = average(gaps)
  return avgGap ? Math.max(1, round(avgGap)) : undefined
}

function computePeakMonthName(sales) {
  const years = Array.from(new Set(sales.map((sale) => new Date(sale.date_of_sale).getFullYear())))
    .sort((a, b) => a - b)
  const votes = new Map()
  let contributingYears = 0
  let totalSales = 0

  for (const year of years) {
    const inYear = sales.filter(
      (sale) => sale.date_of_sale >= startOfYear(year) && sale.date_of_sale <= endOfYear(year)
    )
    totalSales += inYear.length
    if (inYear.length === 0) continue
    const counts = new Map()
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

function computeActivityStats(sales, now) {
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

function computeDistributionStats(sales) {
  if (sales.length < PPR_ANALYTICS_THRESHOLDS.minDistributionSales) return undefined
  const prices = pricesForSales(sales)
  const p25 = percentile(prices, 0.25)
  const p75 = percentile(prices, 0.75)
  if (!p25 || !p75) return undefined
  return { p25, p75 }
}

function computeBuildSplitStats(sales) {
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

function buildLocationInsights(sales, now) {
  const filteredSales = sales.filter((sale) => withinWindow(sale, rollingWindow(now, LAST_YEAR_RANGE.months)))
  const prices = pricesForSales(filteredSales)
  return {
    totalSalesCount: filteredSales.length,
    medianAllTime: median(prices),
    averageAllTime: average(prices),
    lastSaleDate: filteredSales[0]?.date_of_sale ?? null,
    momentum: computeMomentumStats(sales, now),
    activity: computeActivityStats(sales, now),
    distribution: computeDistributionStats(filteredSales),
    buildSplit:
      filteredSales.length >= PPR_ANALYTICS_THRESHOLDS.minSplitSales * 2
        ? computeBuildSplitStats(filteredSales)
        : undefined,
  }
}

function getAnalyticsRange(range) {
  switch (range) {
    case "last-3-years":
      return { value: range, months: 36, label: "last 3 years" }
    case "last-5-years":
      return { value: range, months: 60, label: "last 5 years" }
    case "all":
      return { value: range, months: null, label: "all available records" }
    default:
      return LAST_YEAR_RANGE
  }
}

function marketScopeKey(market) {
  if (market.marketType === "county") return `county:${market.name}`
  if (market.marketType === "dublin_district") return `district:${dublinDistrictPrefix(market)}`
  return `area:${market.county || "*"}:${market.areaSlug ?? market.slug}`
}

function saleMatchesMarket(sale, market) {
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

function buildMarketBucketsFromSales(sales, markets) {
  const buckets = new Map()
  for (const market of markets) buckets.set(marketScopeKey(market), [])
  for (const sale of sales) {
    for (const market of markets) {
      if (saleMatchesMarket(sale, market)) {
        buckets.get(marketScopeKey(market)).push(sale)
      }
    }
  }
  return buckets
}

function buildComparisonRow(market, sales, nationalMedian, now) {
  const currentWindow = rollingWindow(now, LAST_YEAR_RANGE.months)
  const current = sales.filter((sale) => withinWindow(sale, currentWindow))
  if (current.length < PPR_ANALYTICS_THRESHOLDS.minComparisonSales) return undefined

  const currentMedian = median(pricesForSales(current))
  if (!currentMedian) return undefined

  const previous = sales.filter((sale) =>
    withinWindow(sale, rollingWindow(now, LAST_YEAR_RANGE.months, LAST_YEAR_RANGE.months))
  )
  const previousMedian =
    previous.length >= PPR_ANALYTICS_THRESHOLDS.minPriceComparisonSales
      ? median(pricesForSales(previous))
      : undefined
  const split = computeBuildSplitStats(current)

  return {
    market_slug: market.slug,
    label: pprMarketLabel(market),
    href: `/sold-prices/${market.slug}`,
    county: market.county || null,
    sales_volume: current.length,
    median_price_eur: currentMedian,
    yoy_change_pct: percentChange(currentMedian, previousMedian),
    new_build_median_eur: split?.newBuildMedian ?? null,
    second_hand_median_eur: split?.secondHandMedian ?? null,
    vs_national_median_pct: percentChange(currentMedian, nationalMedian),
    distance_from_dublin_km: COMMUTER_TOWN_DISTANCE_KM[market.slug] ?? null,
  }
}

function describeError(error) {
  if (!error) return "Unknown error"
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  if (typeof error.message === "string") return error.message
  return JSON.stringify(error)
}

async function withRetry(label, fn) {
  let lastError = null
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt < 3) {
        const delayMs = attempt * 1500
        console.log(`${label}: ${describeError(error)}; retrying in ${delayMs}ms`)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
  }
  throw lastError
}

function parseYear(value) {
  return Number(String(value).slice(0, 4))
}

async function fetchSales(select, startDate) {
  const rows = []
  const pageSize = 1000
  const currentYear = new Date().getUTCFullYear()
  const startYear = startDate ? parseYear(startDate) : 2010

  for (let year = startYear; year <= currentYear; year += 1) {
    let from = 0

    while (true) {
      const { data, error } = await withRetry(`fetch sales ${year} ${from}`, () => {
        let query = supabase.from("ppr_sales").select(select).order("date_of_sale", { ascending: false })
        query = query.gte("date_of_sale", `${year}-01-01`).lt("date_of_sale", `${year + 1}-01-01`)
        if (startDate && year === startYear) query = query.gte("date_of_sale", startDate)
        return query.range(from, from + pageSize - 1)
      })

      if (error) throw error
      if (!data || data.length === 0) break

      rows.push(...data)
      if (data.length < pageSize) break
      from += pageSize
    }
  }

  return rows
}

function assignGroupRows(groupKey, rows, sortFn) {
  return [...rows].sort(sortFn).map((row, index) => ({
    ...row,
    group_key: groupKey,
    sort_rank: index + 1,
  }))
}

async function rebuildPprPhase1Analytics() {
  const now = new Date()
  const allSales = await fetchSales("date_of_sale,price_eur,county", undefined)
  console.log(`Loaded ${allSales.length} sales for national snapshots`)

  const rangeKeys = ["last-year", "last-3-years", "last-5-years", "all"]
  const nationalSnapshots = rangeKeys.map((rangeKey) => {
    const analyticsRange = getAnalyticsRange(rangeKey)
    const comparison = rollingTwelveMonthWindows(now)
    const scopedSales =
      analyticsRange.months === null
        ? allSales
        : allSales.filter((sale) => withinWindow(sale, rollingWindow(now, analyticsRange.months)))
    const prices = pricesForSales(scopedSales)
    const comparisonSales = allSales.filter(
      (sale) => sale.date_of_sale >= comparison.previous.start
    )
    const currentComparisonSales = comparisonSales.filter((sale) =>
      withinWindow(sale, comparison.current)
    )
    const previousComparisonSales = comparisonSales.filter((sale) =>
      withinWindow(sale, comparison.previous)
    )
    const currentCount = currentComparisonSales.length
    const previousCount = previousComparisonSales.length
    const hasReliableActivity =
      currentCount >= PPR_ANALYTICS_THRESHOLDS.minActivityComparisonSales &&
      previousCount >= PPR_ANALYTICS_THRESHOLDS.minActivityComparisonSales
    const hasReliablePriceChange =
      currentComparisonSales.length >= PPR_ANALYTICS_THRESHOLDS.minPriceComparisonSales &&
      previousComparisonSales.length >= PPR_ANALYTICS_THRESHOLDS.minPriceComparisonSales

    const countyCurrentPrices = new Map()
    const countyPriorPrices = new Map()
    for (const sale of currentComparisonSales) {
      if (!sale.county) continue
      const price = numericPrice(sale.price_eur)
      if (!Number.isFinite(price)) continue
      const pricesForCounty = countyCurrentPrices.get(sale.county) || []
      pricesForCounty.push(price)
      countyCurrentPrices.set(sale.county, pricesForCounty)
    }
    for (const sale of previousComparisonSales) {
      if (!sale.county) continue
      const price = numericPrice(sale.price_eur)
      if (!Number.isFinite(price)) continue
      const pricesForCounty = countyPriorPrices.get(sale.county) || []
      pricesForCounty.push(price)
      countyPriorPrices.set(sale.county, pricesForCounty)
    }

    const strongestCounty = [...countyCurrentPrices.entries()]
      .map(([county, currentPrices]) => {
        const priorPrices = countyPriorPrices.get(county) || []
        if (
          currentPrices.length < PPR_ANALYTICS_THRESHOLDS.minPriceComparisonSales ||
          priorPrices.length < PPR_ANALYTICS_THRESHOLDS.minPriceComparisonSales
        ) {
          return undefined
        }
        const currentMedian = median(currentPrices)
        const previousMedian = median(priorPrices)
        const yoy = percentChange(currentMedian, previousMedian)
        return currentMedian && previousMedian && yoy !== undefined
          ? { county, yoy }
          : undefined
      })
      .filter(Boolean)
      .sort((left, right) => right.yoy - left.yoy)[0]

    return {
      range_key: rangeKey,
      label: analyticsRange.label,
      sales_count: scopedSales.length,
      median_price_eur: median(prices) ?? null,
      avg_price_eur: average(prices) ?? null,
      p25_price_eur:
        scopedSales.length >= PPR_ANALYTICS_THRESHOLDS.minDistributionSales
          ? percentile(prices, 0.25) ?? null
          : null,
      p75_price_eur:
        scopedSales.length >= PPR_ANALYTICS_THRESHOLDS.minDistributionSales
          ? percentile(prices, 0.75) ?? null
          : null,
      current_period_label: comparison.currentLabel,
      previous_period_label: comparison.previousLabel,
      current_period_count: currentCount,
      previous_period_count: previousCount,
      activity_change_pct: hasReliableActivity ? percentChange(currentCount, previousCount) ?? null : null,
      yoy_change_pct:
        hasReliablePriceChange
          ? percentChange(
              median(pricesForSales(currentComparisonSales)),
              median(pricesForSales(previousComparisonSales))
            ) ?? null
          : null,
      latest_sale_date: allSales[0]?.date_of_sale ?? null,
      strongest_county: strongestCounty?.county ?? null,
      strongest_county_yoy_change_pct: strongestCounty?.yoy ?? null,
      updated_at: new Date().toISOString(),
    }
  })

  const comparisonStartDate = rollingWindow(now, 24).start
  const comparisonSales = await fetchSales(
    "date_of_sale,price_eur,is_new_dwelling,county,area_slug,eircode_prefix",
    comparisonStartDate
  )
  console.log(`Loaded ${comparisonSales.length} sales for comparison rows`)

  const trackedMarkets = PPR_MARKETS.filter((market) => market.marketType !== "county")
  const comparisonBuckets = buildMarketBucketsFromSales(comparisonSales, trackedMarkets)
  const nationalMedian = nationalSnapshots.find((row) => row.range_key === "last-year")?.median_price_eur
  const allTrackedRows = trackedMarkets
    .map((market) =>
      buildComparisonRow(market, comparisonBuckets.get(marketScopeKey(market)) || [], nationalMedian, now)
    )
    .filter(Boolean)

  const dublinComparedRows = allTrackedRows.filter((row) => {
    const market = trackedMarkets.find((candidate) => candidate.slug === row.market_slug)
    return market
      ? market.marketType === "dublin_district" ||
          (market.marketType === "town_suburb" && market.county === "Dublin")
      : false
  })

  const pickBySlugs = (slugs) => allTrackedRows.filter((row) => slugs.includes(row.market_slug))

  const comparisonRows = [
    ...assignGroupRows("all-tracked", allTrackedRows, (left, right) => left.label.localeCompare(right.label)),
    ...assignGroupRows("dublin-compared", dublinComparedRows, (left, right) => right.median_price_eur - left.median_price_eur),
    ...assignGroupRows("cork-compared", pickBySlugs(COMPARISON_PAGE_MARKET_SLUGS.corkCompared), (left, right) => right.median_price_eur - left.median_price_eur),
    ...assignGroupRows("limerick-compared", pickBySlugs(COMPARISON_PAGE_MARKET_SLUGS.limerickCompared), (left, right) => right.median_price_eur - left.median_price_eur),
    ...assignGroupRows("galway-compared", pickBySlugs(COMPARISON_PAGE_MARKET_SLUGS.galwayCompared), (left, right) => right.median_price_eur - left.median_price_eur),
    ...assignGroupRows("waterford-compared", pickBySlugs(COMPARISON_PAGE_MARKET_SLUGS.waterfordCompared), (left, right) => right.median_price_eur - left.median_price_eur),
    ...assignGroupRows(
      "commuter-towns",
      pickBySlugs(COMMUTER_TOWN_MARKET_SLUGS),
      (left, right) => left.median_price_eur - right.median_price_eur
    ),
    ...assignGroupRows(
      "affordable-markets",
      allTrackedRows.filter(
        (row) =>
          row.sales_volume >= PPR_ANALYTICS_THRESHOLDS.minAffordableMarketSales &&
          row.median_price_eur <= PPR_ANALYTICS_THRESHOLDS.affordableMarketMedianCap
      ),
      (left, right) =>
        left.median_price_eur - right.median_price_eur || right.sales_volume - left.sales_volume
    ),
    ...assignGroupRows(
      "high-value-markets",
      allTrackedRows.filter(
        (row) =>
          row.sales_volume >= PPR_ANALYTICS_THRESHOLDS.minAffordableMarketSales &&
          row.median_price_eur >= PPR_ANALYTICS_THRESHOLDS.highValueMarketMedianFloor
      ),
      (left, right) =>
        right.median_price_eur - left.median_price_eur || right.sales_volume - left.sales_volume
    ),
    ...assignGroupRows(
      "rising-markets",
      allTrackedRows
        .filter(
          (row) =>
            row.sales_volume >= PPR_ANALYTICS_THRESHOLDS.minRisingMarketSales &&
            row.yoy_change_pct !== undefined &&
            row.yoy_change_pct !== null
        )
        .sort((left, right) => (right.yoy_change_pct || 0) - (left.yoy_change_pct || 0))
        .slice(0, 20),
      (left, right) => (right.yoy_change_pct || 0) - (left.yoy_change_pct || 0)
    ),
    ...assignGroupRows(
      "falling-markets",
      allTrackedRows
        .filter(
          (row) =>
            row.sales_volume >= PPR_ANALYTICS_THRESHOLDS.minRisingMarketSales &&
            row.yoy_change_pct !== undefined &&
            row.yoy_change_pct !== null &&
            row.yoy_change_pct < 0
        )
        .sort((left, right) => (left.yoy_change_pct || 0) - (right.yoy_change_pct || 0))
        .slice(0, 20),
      (left, right) => (left.yoy_change_pct || 0) - (right.yoy_change_pct || 0)
    ),
  ].map((row) => ({
    range_key: "last-year",
    ...row,
    updated_at: new Date().toISOString(),
  }))

  const countyStartDate = [rollingWindow(now, 12).start, startOfYear(now.getFullYear() - 3)]
    .sort()[0] || startOfYear(now.getFullYear() - MOMENTUM_LOOKBACK_YEARS)
  const countySales = await fetchSales(
    "date_of_sale,price_eur,is_new_dwelling,county",
    countyStartDate
  )
  console.log(`Loaded ${countySales.length} sales for county market insights`)

  const countyGroups = new Map()
  for (const sale of countySales) {
    const key = String(sale.county || "").toLowerCase()
    if (!key) continue
    const bucket = countyGroups.get(key) || []
    bucket.push(sale)
    countyGroups.set(key, bucket)
  }

  const marketInsightsRows = PPR_MARKETS.filter((market) => market.marketType === "county").map((market) => {
    const sales = countyGroups.get(market.name.toLowerCase()) || []
    const insights = buildLocationInsights(sales, now)
    return {
      range_key: "last-year",
      market_slug: market.slug,
      market_label: pprMarketLabel(market),
      market_type: market.marketType,
      county: market.name,
      total_sales_count: insights.totalSalesCount,
      median_all_time_eur: insights.medianAllTime ?? null,
      average_all_time_eur: insights.averageAllTime ?? null,
      last_sale_date: insights.lastSaleDate ?? null,
      momentum_current_label: insights.momentum?.currentLabel ?? null,
      momentum_current_median_eur: insights.momentum?.currentMedian ?? null,
      momentum_current_count: insights.momentum?.currentCount ?? null,
      momentum_previous_label: insights.momentum?.previousLabel ?? null,
      momentum_previous_median_eur: insights.momentum?.previousMedian ?? null,
      momentum_previous_count: insights.momentum?.previousCount ?? null,
      momentum_yoy_change_pct: insights.momentum?.yoyChangePct ?? null,
      momentum_three_year_change_pct: insights.momentum?.threeYearChangePct ?? null,
      activity_current_period_label: insights.activity?.currentPeriodLabel ?? null,
      activity_current_period_count: insights.activity?.currentPeriodCount ?? null,
      activity_previous_period_label: insights.activity?.previousPeriodLabel ?? null,
      activity_previous_period_count: insights.activity?.previousPeriodCount ?? null,
      activity_change_pct: insights.activity?.changePct ?? null,
      activity_has_reliable_change: insights.activity?.hasReliableChange ?? false,
      average_days_between_sales: insights.activity?.averageDaysBetweenSales ?? null,
      peak_month_name: insights.activity?.peakMonthName ?? null,
      peak_month_evidence_years: insights.activity?.peakMonthEvidenceYears ?? null,
      distribution_p25_eur: insights.distribution?.p25 ?? null,
      distribution_p75_eur: insights.distribution?.p75 ?? null,
      build_new_median_eur: insights.buildSplit?.newBuildMedian ?? null,
      build_new_count: insights.buildSplit?.newBuildCount ?? null,
      build_second_hand_median_eur: insights.buildSplit?.secondHandMedian ?? null,
      build_second_hand_count: insights.buildSplit?.secondHandCount ?? null,
      build_premium_amount_eur: insights.buildSplit?.premiumAmount ?? null,
      build_premium_pct: insights.buildSplit?.premiumPct ?? null,
      updated_at: new Date().toISOString(),
    }
  })

  const areaInsightsStartDate = [rollingWindow(now, 12).start, startOfYear(now.getFullYear() - 3)]
    .sort()[0] || startOfYear(now.getFullYear() - MOMENTUM_LOOKBACK_YEARS)
  const areaSales = await fetchSales(
    "date_of_sale,price_eur,is_new_dwelling,county,area_slug",
    areaInsightsStartDate
  )
  console.log(`Loaded ${areaSales.length} sales for area insights`)

  const areaGroups = new Map()
  for (const sale of areaSales) {
    if (!sale.county || !sale.area_slug) continue
    const key = `${sale.county}::${sale.area_slug}`
    const bucket = areaGroups.get(key) || []
    bucket.push(sale)
    areaGroups.set(key, bucket)
  }

  const areaInsightsRows = [...areaGroups.entries()].map(([key, sales]) => {
    const [county, areaSlug] = key.split("::")
    const insights = buildLocationInsights(sales, now)

    return {
      range_key: "last-year",
      county,
      area_slug: areaSlug,
      area_label: areaNameFromSlug(areaSlug),
      total_sales_count: insights.totalSalesCount,
      median_all_time_eur: insights.medianAllTime ?? null,
      average_all_time_eur: insights.averageAllTime ?? null,
      last_sale_date: insights.lastSaleDate ?? null,
      current_period_label: insights.momentum?.currentLabel ?? null,
      previous_period_label: insights.momentum?.previousLabel ?? null,
      current_median_eur: insights.momentum?.currentMedian ?? null,
      previous_median_eur: insights.momentum?.previousMedian ?? null,
      momentum_yoy_change_pct: insights.momentum?.yoyChangePct ?? null,
      three_year_change_pct: insights.momentum?.threeYearChangePct ?? null,
      current_period_count: insights.activity?.currentPeriodCount ?? null,
      previous_period_count: insights.activity?.previousPeriodCount ?? null,
      activity_change_pct: insights.activity?.changePct ?? null,
      average_days_between_sales: insights.activity?.averageDaysBetweenSales ?? null,
      peak_month_name: insights.activity?.peakMonthName ?? null,
      peak_month_evidence_years: insights.activity?.peakMonthEvidenceYears ?? null,
      p25_price_eur: insights.distribution?.p25 ?? null,
      p75_price_eur: insights.distribution?.p75 ?? null,
      new_build_count: insights.buildSplit?.newBuildCount ?? null,
      new_build_median_eur: insights.buildSplit?.newBuildMedian ?? null,
      second_hand_count: insights.buildSplit?.secondHandCount ?? null,
      second_hand_median_eur: insights.buildSplit?.secondHandMedian ?? null,
      premium_amount_eur: insights.buildSplit?.premiumAmount ?? null,
      premium_pct: insights.buildSplit?.premiumPct ?? null,
      updated_at: new Date().toISOString(),
    }
  })

  for (const [table, rows] of [
    ["ppr_national_snapshots", nationalSnapshots],
    ["ppr_comparison_rows", comparisonRows],
    ["ppr_market_insights", marketInsightsRows],
    ["ppr_area_insights", areaInsightsRows],
  ]) {
    const { error: deleteError } = await withRetry(`delete ${table}`, () =>
      supabase.from(table).delete().not("id", "is", null)
    )
    if (deleteError) throw deleteError

    for (let index = 0; index < rows.length; index += 500) {
      const batch = rows.slice(index, index + 500)
      const { error: insertError } = await withRetry(`insert ${table}`, () =>
        supabase.from(table).insert(batch)
      )
      if (insertError) throw insertError
    }
  }

  console.log(
    `PPR analytics rebuilt. ${nationalSnapshots.length} national rows, ${comparisonRows.length} comparison rows, ${marketInsightsRows.length} market insight rows, ${areaInsightsRows.length} area insight rows.`
  )
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isDirectRun) {
  rebuildPprPhase1Analytics().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}

export { rebuildPprPhase1Analytics }
