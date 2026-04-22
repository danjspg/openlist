"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import {
  euroDisplay,
  numberDisplay,
  signedPercent,
  type PprComparisonRow,
} from "@/lib/ppr-analytics"

type SortKey =
  | "label"
  | "medianPrice"
  | "yoyChangePct"
  | "salesVolume"
  | "newBuildMedian"
  | "secondHandMedian"
  | "distanceFromDublinKm"

const SORT_LABELS: Record<Exclude<SortKey, "distanceFromDublinKm">, string> = {
  label: "Location",
  medianPrice: "Median price",
  yoyChangePct: "Year-on-year change",
  salesVolume: "Sales volume",
  newBuildMedian: "New build median",
  secondHandMedian: "Second-hand median",
}

function toneClass(value?: number) {
  if (value === undefined) return "text-stone-500"
  if (value > 0) return "text-emerald-700"
  if (value < 0) return "text-rose-700"
  return "text-stone-700"
}

function compareNullableNumber(left?: number, right?: number) {
  if (left === undefined && right === undefined) return 0
  if (left === undefined) return 1
  if (right === undefined) return -1
  return left - right
}

export default function PprComparisonTable({
  rows,
  defaultSort = "medianPrice",
  defaultDirection = "desc",
  extraColumn,
}: {
  rows: PprComparisonRow[]
  defaultSort?: SortKey
  defaultDirection?: "asc" | "desc"
  extraColumn?: {
    key: "distanceFromDublinKm"
    label: string
    mobileLabel: string
    format: "km"
  }
}) {
  const [sortKey, setSortKey] = useState<SortKey>(defaultSort)
  const [direction, setDirection] = useState<"asc" | "desc">(defaultDirection)

  const sortedRows = useMemo(() => {
    const next = [...rows].sort((left, right) => {
      switch (sortKey) {
        case "label":
          return left.label.localeCompare(right.label)
        case "medianPrice":
          return left.medianPrice - right.medianPrice
        case "yoyChangePct":
          return compareNullableNumber(left.yoyChangePct, right.yoyChangePct)
        case "salesVolume":
          return left.salesVolume - right.salesVolume
        case "newBuildMedian":
          return compareNullableNumber(left.newBuildMedian, right.newBuildMedian)
        case "secondHandMedian":
          return compareNullableNumber(left.secondHandMedian, right.secondHandMedian)
        case "distanceFromDublinKm":
          return compareNullableNumber(left.distanceFromDublinKm, right.distanceFromDublinKm)
      }
    })

    return direction === "desc" ? next.reverse() : next
  }, [direction, rows, sortKey])

  function setSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setDirection(direction === "desc" ? "asc" : "desc")
      return
    }

    setSortKey(nextKey)
    setDirection(nextKey === "label" ? "asc" : "desc")
  }

  const headerButtonClass =
    "inline-flex items-center gap-2 text-left text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 transition hover:text-stone-800"

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return null
    return <span className="text-[11px] text-stone-400">{direction === "desc" ? "↓" : "↑"}</span>
  }

  function formatExtraValue(value?: number) {
    if (!extraColumn) return "—"
    if (value === undefined) return "—"

    if (extraColumn.format === "km") {
      return `${numberDisplay(value)} km`
    }

    return String(value)
  }

  const sortOptions: Array<{ value: SortKey; label: string }> = [
    { value: "medianPrice", label: SORT_LABELS.medianPrice },
    { value: "yoyChangePct", label: SORT_LABELS.yoyChangePct },
    { value: "salesVolume", label: SORT_LABELS.salesVolume },
    { value: "newBuildMedian", label: SORT_LABELS.newBuildMedian },
    { value: "secondHandMedian", label: SORT_LABELS.secondHandMedian },
    { value: "label", label: SORT_LABELS.label },
  ]

  if (extraColumn) {
    sortOptions.splice(3, 0, { value: extraColumn.key, label: extraColumn.label })
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-[28px] border border-stone-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-semibold tracking-tight text-stone-900">
          No comparable markets available
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600">
          This comparison is only shown where enough recorded sales are available to make the data
          useful. Try another market view or check back when more register entries are available.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-[28px] border border-stone-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-stone-200 px-4 py-4 sm:flex-row sm:items-end sm:justify-between sm:px-5">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-stone-500">
            Sort rows
          </p>
          <p className="mt-1 text-sm text-stone-600">
            Change the order of markets in the table below.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
              Sort by
            </span>
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              className="h-11 min-w-[220px] rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-900 outline-none transition focus:border-stone-500"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setDirection(direction === "desc" ? "asc" : "desc")}
            className="inline-flex h-11 items-center justify-center rounded-full border border-stone-300 px-4 text-sm font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900"
          >
            {direction === "desc" ? "Highest first" : "Lowest first"}
          </button>
        </div>
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <table className="min-w-full divide-y divide-stone-200">
          <thead className="bg-stone-50">
            <tr>
              <th className="px-5 py-4">
                <button type="button" onClick={() => setSort("label")} className={headerButtonClass}>
                  <span>Location</span>
                  {sortIndicator("label")}
                </button>
              </th>
              <th className="px-5 py-4">
                <button
                  type="button"
                  onClick={() => setSort("medianPrice")}
                  className={headerButtonClass}
                >
                  <span>Median</span>
                  {sortIndicator("medianPrice")}
                </button>
              </th>
              <th className="px-5 py-4">
                <button
                  type="button"
                  onClick={() => setSort("yoyChangePct")}
                  className={headerButtonClass}
                >
                  <span>YoY</span>
                  {sortIndicator("yoyChangePct")}
                </button>
              </th>
              <th className="px-5 py-4">
                <button
                  type="button"
                  onClick={() => setSort("salesVolume")}
                  className={headerButtonClass}
                >
                  <span>Sales</span>
                  {sortIndicator("salesVolume")}
                </button>
              </th>
              {extraColumn && (
                <th className="px-5 py-4">
                  <button
                    type="button"
                    onClick={() => setSort(extraColumn.key)}
                    className={headerButtonClass}
                  >
                    <span>{extraColumn.label}</span>
                    {sortIndicator(extraColumn.key)}
                  </button>
                </th>
              )}
              <th className="px-5 py-4">
                <button
                  type="button"
                  onClick={() => setSort("newBuildMedian")}
                  className={headerButtonClass}
                >
                  <span>New build</span>
                  {sortIndicator("newBuildMedian")}
                </button>
              </th>
              <th className="px-5 py-4">
                <button
                  type="button"
                  onClick={() => setSort("secondHandMedian")}
                  className={headerButtonClass}
                >
                  <span>Second-hand</span>
                  {sortIndicator("secondHandMedian")}
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {sortedRows.map((row) => (
              <tr key={row.slug} className="align-top">
                <td className="px-5 py-4">
                  <Link href={row.href} className="font-semibold text-stone-900 hover:text-stone-700">
                    {row.label}
                  </Link>
                </td>
                <td className="px-5 py-4 font-medium text-stone-900">
                  {euroDisplay(row.medianPrice)}
                </td>
                <td className={`px-5 py-4 font-medium ${toneClass(row.yoyChangePct)}`}>
                  {signedPercent(row.yoyChangePct)}
                </td>
                <td className="px-5 py-4 text-stone-700">{numberDisplay(row.salesVolume)}</td>
                {extraColumn && (
                  <td className="px-5 py-4 text-stone-700">
                    {formatExtraValue(row[extraColumn.key])}
                  </td>
                )}
                <td className="px-5 py-4 text-stone-700">{euroDisplay(row.newBuildMedian)}</td>
                <td className="px-5 py-4 text-stone-700">{euroDisplay(row.secondHandMedian)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 p-4 lg:hidden">
        {sortedRows.map((row) => (
          <article key={row.slug} className="rounded-3xl border border-stone-200 bg-stone-50 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Link href={row.href} className="text-lg font-semibold text-stone-900">
                  {row.label}
                </Link>
                <p className="mt-1 text-sm text-stone-500">
                  {numberDisplay(row.salesVolume)} sales in the last 12 months
                </p>
              </div>
              <p className="text-lg font-semibold text-stone-900">{euroDisplay(row.medianPrice)}</p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl border border-stone-200 bg-white px-3 py-2">
                <p className="text-xs uppercase tracking-[0.18em] text-stone-500">YoY</p>
                <p className={`mt-1 font-semibold ${toneClass(row.yoyChangePct)}`}>
                  {signedPercent(row.yoyChangePct)}
                </p>
              </div>
              {extraColumn && (
                <div className="rounded-2xl border border-stone-200 bg-white px-3 py-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                    {extraColumn.mobileLabel}
                  </p>
                  <p className="mt-1 font-semibold text-stone-900">
                    {formatExtraValue(row[extraColumn.key])}
                  </p>
                </div>
              )}
              <div className="rounded-2xl border border-stone-200 bg-white px-3 py-2">
                <p className="text-xs uppercase tracking-[0.18em] text-stone-500">New build</p>
                <p className="mt-1 font-semibold text-stone-900">{euroDisplay(row.newBuildMedian)}</p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-white px-3 py-2">
                <p className="text-xs uppercase tracking-[0.18em] text-stone-500">Second-hand</p>
                <p className="mt-1 font-semibold text-stone-900">
                  {euroDisplay(row.secondHandMedian)}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
