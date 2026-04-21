"use client"

import { useState } from "react"
import {
  formatPprDateInput,
  getDefaultPprDateRange,
} from "@/lib/ppr"
import { IRISH_COUNTIES } from "@/lib/property"

type Props = {
  action?: string
  defaults?: {
    county?: string
    area?: string
    minPrice?: string
    maxPrice?: string
    dateFrom?: string
    dateTo?: string
    dateRange?: string
    sort?: string
    newBuild?: string
    propertyStyle?: string
  }
  compact?: boolean
}

const propertyStyleFilters = [
  { value: "detached", label: "Detached" },
  { value: "semi-detached", label: "Semi-detached" },
  { value: "apartment", label: "Apartment" },
]

function normalisePriceInput(value: string) {
  return value.replace(/[^0-9]/g, "")
}

function formatPriceDisplay(value: string) {
  const digits = normalisePriceInput(value)
  if (!digits) return ""

  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number(digits))
}

function yearsAgo(years: number) {
  const date = new Date()
  date.setFullYear(date.getFullYear() - years)
  return formatPprDateInput(date)
}

function durationHref(
  defaults: NonNullable<Props["defaults"]>,
  years: number
) {
  const params = new URLSearchParams()
  const today = formatPprDateInput(new Date())

  for (const [key, value] of Object.entries(defaults)) {
    if (value && key !== "page" && key !== "dateFrom" && key !== "dateTo") {
      params.set(key, value)
    }
  }

  params.set("dateFrom", yearsAgo(years))
  params.set("dateTo", today)
  params.set("dateRange", years === 1 ? "last-year" : "last-3-years")

  return `/sold-prices/search?${params.toString()}`
}

function clearDatesHref(defaults: NonNullable<Props["defaults"]>) {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(defaults)) {
    if (
      value &&
      key !== "page" &&
      key !== "dateFrom" &&
      key !== "dateTo" &&
      key !== "dateRange"
    ) {
      params.set(key, value)
    }
  }

  params.set("dateRange", "all")
  const query = params.toString()
  return query ? `/sold-prices/search?${query}` : "/sold-prices/search"
}

function filterHref(
  defaults: NonNullable<Props["defaults"]>,
  nextFilters: Record<string, string>
) {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(defaults)) {
    if (value && key !== "page") params.set(key, value)
  }

  for (const [key, value] of Object.entries(nextFilters)) {
    if (value) params.set(key, value)
    else params.delete(key)
  }

  return `/sold-prices/search?${params.toString()}`
}

function DateRangeInput({
  label,
  name,
  value,
}: {
  label: string
  name: string
  value?: string
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-stone-700">
        {label}
      </span>
      <span className="flex h-14 items-center gap-3 rounded-lg border border-stone-300 bg-white px-4 transition focus-within:border-stone-700 focus-within:ring-2 focus-within:ring-stone-200">
        <svg
          aria-hidden="true"
          className="h-5 w-5 shrink-0 text-stone-400"
          viewBox="0 0 24 24"
          fill="none"
        >
          <path
            d="M7 3v3M17 3v3M4.5 9.5h15M6 5h12a2 2 0 0 1 2 2v11.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
        <input
          type="date"
          name={name}
          defaultValue={value || ""}
          className="h-full min-w-0 flex-1 bg-transparent text-base font-medium text-stone-900 outline-none [color-scheme:light]"
        />
      </span>
    </label>
  )
}

export default function SoldPricesSearchForm({
  action = "/sold-prices/search",
  defaults = {},
  compact = false,
}: Props) {
  const defaultDates = getDefaultPprDateRange()
  const resolvedDefaults =
    defaults.dateFrom || defaults.dateTo || defaults.dateRange === "all"
      ? { sort: "newest", ...defaults }
      : { sort: "newest", ...defaults, ...defaultDates }
  const isLastYear =
    resolvedDefaults.dateRange === "last-year" ||
    (resolvedDefaults.dateFrom === defaultDates.dateFrom &&
      resolvedDefaults.dateTo === defaultDates.dateTo)
  const isLastThreeYears = resolvedDefaults.dateRange === "last-3-years"
  const [minPrice, setMinPrice] = useState(
    normalisePriceInput(resolvedDefaults.minPrice || "")
  )
  const [maxPrice, setMaxPrice] = useState(
    normalisePriceInput(resolvedDefaults.maxPrice || "")
  )

  return (
    <form
      action={action}
      className={`rounded-[28px] border border-stone-200 bg-white shadow-sm ${
        compact ? "p-4" : "p-5 sm:p-6"
      }`}
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_150px_150px]">
        <div>
          <label className="mb-2 block text-sm font-medium text-stone-700">
            County
          </label>
          <select
            name="county"
            defaultValue={resolvedDefaults.county || ""}
            className="h-11 w-full rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-900 outline-none transition focus:border-stone-500"
          >
            <option value="">Any county</option>
            {IRISH_COUNTIES.map((county) => (
              <option key={county} value={county}>
                {county}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-stone-700">
            Area or address
          </label>
          <input
            name="area"
            defaultValue={resolvedDefaults.area || ""}
            placeholder="Search town, area or address"
            className="h-11 w-full rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-stone-700">
            Min price
          </label>
          <input type="hidden" name="minPrice" value={minPrice} />
          <input
            aria-label="Min price"
            type="text"
            inputMode="numeric"
            value={formatPriceDisplay(minPrice)}
            onChange={(event) => setMinPrice(normalisePriceInput(event.target.value))}
            placeholder="€250,000"
            className="h-11 w-full rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-stone-700">
            Max price
          </label>
          <input type="hidden" name="maxPrice" value={maxPrice} />
          <input
            aria-label="Max price"
            type="text"
            inputMode="numeric"
            value={formatPriceDisplay(maxPrice)}
            onChange={(event) => setMaxPrice(normalisePriceInput(event.target.value))}
            placeholder="€750,000"
            className="h-11 w-full rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-500"
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px_auto] md:items-end">
        <DateRangeInput
          label="From date"
          name="dateFrom"
          value={resolvedDefaults.dateFrom}
        />
        <DateRangeInput
          label="To date"
          name="dateTo"
          value={resolvedDefaults.dateTo}
        />
        <div>
          <label className="mb-2 block text-sm font-medium text-stone-700">
            Sort
          </label>
          <select
            name="sort"
            defaultValue={resolvedDefaults.sort || "newest"}
            className="h-11 w-full rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-900 outline-none transition focus:border-stone-500"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="price-high">Price high to low</option>
            <option value="price-low">Price low to high</option>
          </select>
        </div>

        <button
          type="submit"
          className="h-11 rounded-full bg-stone-900 px-6 text-sm font-medium text-white transition hover:bg-stone-700"
        >
          View sold prices
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="mr-1 text-stone-500">Quick dates</span>
        <a
          href={durationHref(resolvedDefaults, 1)}
          className={`rounded-full border px-4 py-2 font-medium transition ${
            isLastYear
              ? "border-stone-900 bg-stone-900 text-white"
              : "border-stone-300 bg-white text-stone-700 hover:border-stone-900 hover:text-stone-900"
          }`}
        >
          Last year
        </a>
        <a
          href={durationHref(resolvedDefaults, 3)}
          className={`rounded-full border px-4 py-2 font-medium transition ${
            isLastThreeYears
              ? "border-stone-900 bg-stone-900 text-white"
              : "border-stone-300 bg-white text-stone-700 hover:border-stone-900 hover:text-stone-900"
          }`}
        >
          Last 3 years
        </a>
        {resolvedDefaults.dateRange !== "all" && (
          <a
            href={clearDatesHref(resolvedDefaults)}
            className="rounded-full px-4 py-2 font-medium text-stone-500 transition hover:text-stone-900"
          >
            Clear dates
          </a>
        )}
      </div>

      <div className="mt-5 border-t border-stone-200 pt-5">
        <p className="mb-3 text-sm font-medium text-stone-700">
          Property filters
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {propertyStyleFilters.map((filter) => {
            const isSelected = resolvedDefaults.propertyStyle === filter.value

            return (
              <a
                key={filter.value}
                href={filterHref(resolvedDefaults, {
                  propertyStyle: isSelected ? "" : filter.value,
                })}
                title="Property type is only available where it can be identified from public PPR text."
                className={`h-10 rounded-full border px-4 py-2 text-sm font-medium transition ${
                  isSelected
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-300 bg-white text-stone-700 hover:border-stone-900 hover:text-stone-900"
                }`}
              >
                {filter.label}
              </a>
            )
          })}

          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900">
            <input
              type="checkbox"
              name="newBuild"
              value="true"
              defaultChecked={resolvedDefaults.newBuild === "true"}
              className="h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-500"
            />
            New build only
          </label>
        </div>
        <p className="mt-3 text-xs leading-5 text-stone-500">
          Property type is matched only where it can be identified from public
          register text. Bedrooms and bathrooms are not included in PPR records.
        </p>
      </div>
    </form>
  )
}
