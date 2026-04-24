"use client"

import { useEffect, useState, type FormEvent } from "react"
import {
  getDefaultPprDateRange,
  getPprDateRangePreset,
  type PprDateRangeValue,
  type PprSearchAreaOption,
} from "@/lib/ppr"

const SEARCH_DATE_RANGE_OPTIONS = [
  { value: "last-year", label: "Last 12 months" },
  { value: "last-2-years", label: "Last 2 years" },
  { value: "last-5-years", label: "Last 5 years" },
] as const

type Props = {
  action?: string
  defaults?: {
    county?: string
    areaSlug?: string
    areaLabel?: string
    minPrice?: string
    maxPrice?: string
    dateFrom?: string
    dateTo?: string
    dateRange?: string
    sort?: string
    newBuild?: string
    page?: string
  }
  compact?: boolean
  showTimeRange?: boolean
  showSort?: boolean
  validationMessage?: string
}

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

function normaliseSearchLabel(value: string) {
  return value.trim().toLowerCase()
}

function durationHref(
  defaults: NonNullable<Props["defaults"]>,
  range: PprDateRangeValue
) {
  const params = new URLSearchParams()
  const preset = getPprDateRangePreset(range)

  for (const [key, value] of Object.entries(defaults)) {
    if (value && key !== "page" && key !== "dateFrom" && key !== "dateTo") {
      params.set(key, value)
    }
  }

  if (preset.dateFrom) params.set("dateFrom", preset.dateFrom)
  else params.delete("dateFrom")

  if (preset.dateTo) params.set("dateTo", preset.dateTo)
  else params.delete("dateTo")

  params.set("dateRange", range)

  return `/sold-prices/search?${params.toString()}`
}

function inferCurrentRange(
  defaults: NonNullable<Props["defaults"]>,
  defaultDates: ReturnType<typeof getDefaultPprDateRange>
): PprDateRangeValue {
  if (
    defaults.dateRange === "last-year" ||
    defaults.dateRange === "last-2-years" ||
    defaults.dateRange === "last-5-years"
  ) {
    return defaults.dateRange
  }

  if (
    defaults.dateFrom === defaultDates.dateFrom &&
    defaults.dateTo === defaultDates.dateTo
  ) {
    return "last-2-years"
  }

  for (const option of SEARCH_DATE_RANGE_OPTIONS) {
    const preset = getPprDateRangePreset(option.value)
    if (defaults.dateFrom === preset.dateFrom && defaults.dateTo === preset.dateTo) {
      return option.value
    }
  }

  return "last-2-years"
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
  showTimeRange = true,
  showSort = true,
  validationMessage,
}: Props) {
  const defaultDates = getDefaultPprDateRange()
  const resolvedDefaults =
    defaults.dateFrom || defaults.dateTo
      ? { sort: "newest", ...defaults }
      : { sort: "newest", ...defaults, ...defaultDates }
  const currentRange = inferCurrentRange(resolvedDefaults, defaultDates)
  const [minPrice, setMinPrice] = useState(
    normalisePriceInput(resolvedDefaults.minPrice || "")
  )
  const [maxPrice, setMaxPrice] = useState(
    normalisePriceInput(resolvedDefaults.maxPrice || "")
  )
  const [county, setCounty] = useState(resolvedDefaults.county || "")
  const [areaQuery, setAreaQuery] = useState(resolvedDefaults.areaLabel || "")
  const [areaSlug, setAreaSlug] = useState(resolvedDefaults.areaSlug || "")
  const [areaLabel, setAreaLabel] = useState(resolvedDefaults.areaLabel || "")
  const [suggestions, setSuggestions] = useState<PprSearchAreaOption[]>([])
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false)
  const [clientValidationMessage, setClientValidationMessage] = useState("")

  useEffect(() => {
    const query = areaQuery.trim()

    if (!query || query === areaLabel || query.length < 2) {
      setSuggestions([])
      setSuggestionsOpen(false)
      setIsLoadingSuggestions(false)
      return
    }

    const controller = new AbortController()
    setIsLoadingSuggestions(true)

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/ppr/area-suggestions?q=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        )

        if (!response.ok) {
          setSuggestions([])
          setSuggestionsOpen(false)
          return
        }

        const payload = (await response.json()) as { suggestions?: PprSearchAreaOption[] }
        const nextSuggestions = payload.suggestions || []
        setSuggestions(nextSuggestions)
        setSuggestionsOpen(nextSuggestions.length > 0)
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setSuggestions([])
          setSuggestionsOpen(false)
        }
      } finally {
        setIsLoadingSuggestions(false)
      }
    }, 200)

    return () => {
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [areaLabel, areaQuery])

  function handleAreaInput(nextValue: string) {
    setAreaQuery(nextValue)
    setCounty("")
    setAreaSlug("")
    setAreaLabel("")
    setSuggestionsOpen(nextValue.trim().length >= 2)
    setClientValidationMessage("")
  }

  function handleAreaSelect(option: PprSearchAreaOption) {
    setCounty(option.county)
    setAreaQuery(option.areaLabel)
    setAreaSlug(option.areaSlug)
    setAreaLabel(option.areaLabel)
    setSuggestions([])
    setSuggestionsOpen(false)
    setClientValidationMessage("")
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const hasStructuredSelection =
      Boolean(county && areaSlug && areaLabel) &&
      normaliseSearchLabel(areaQuery) === normaliseSearchLabel(areaLabel)

    if (!hasStructuredSelection) {
      event.preventDefault()
      setClientValidationMessage("Please choose an area from the list.")
      return
    }

    setClientValidationMessage("")
  }

  return (
    <form
      action={action}
      onSubmit={handleSubmit}
      className={`rounded-[28px] border border-stone-200 bg-white shadow-sm ${
        compact ? "p-4" : "p-5 sm:p-6"
      }`}
    >
      <div className="mb-5">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-stone-500">
          Find sales by area
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
          Choose an area to search recorded sale prices.
        </p>
        <p className="mt-2 text-xs leading-5 text-stone-500">
          Showing up to 100 recorded sales from the selected date range.
        </p>
      </div>

      <input type="hidden" name="county" value={county} />
      <input type="hidden" name="areaSlug" value={areaSlug} />

      <div className="grid gap-4 lg:grid-cols-[1.8fr_150px_150px]">
        <div className="relative">
          <label className="mb-2 block text-sm font-medium text-stone-700">
            Area
          </label>
          <input
            name="areaLabel"
            value={areaQuery}
            onChange={(event) => handleAreaInput(event.target.value)}
            placeholder="Type an area name"
            autoComplete="off"
            className="h-11 w-full rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-500"
          />
          {suggestionsOpen && (suggestions.length > 0 || isLoadingSuggestions) && (
            <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-10 max-h-72 overflow-y-auto rounded-[24px] border border-stone-200 bg-white p-2 shadow-xl">
              {isLoadingSuggestions ? (
                <div className="px-3 py-3 text-sm text-stone-500">Loading areas…</div>
              ) : (
                suggestions.map((option) => (
                  <button
                    key={`${option.county}-${option.areaSlug}`}
                    type="button"
                    onClick={() => handleAreaSelect(option)}
                    className="flex w-full items-center justify-between rounded-2xl px-3 py-3 text-left transition hover:bg-stone-50"
                  >
                    <span>
                      <span className="block text-sm font-medium text-stone-900">
                        {option.areaLabel}, {option.county}
                      </span>
                      <span className="block text-xs text-stone-500">
                        {new Intl.NumberFormat("en-IE").format(option.salesCount)} sales
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
          <p className="mt-2 text-xs leading-5 text-stone-500">
            Start typing an area, then choose it from the suggestions. County is filled automatically.
          </p>
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
            placeholder="EUR250,000"
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
            placeholder="EUR750,000"
            className="h-11 w-full rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-500"
          />
        </div>
      </div>

      {(clientValidationMessage || validationMessage) && (
        <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {clientValidationMessage || validationMessage}
        </p>
      )}

      <div
        className={`mt-4 grid gap-4 md:items-end ${
          showSort
            ? "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_180px_auto]"
            : "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
        }`}
      >
        <DateRangeInput
          key={`date-from-${currentRange}-${resolvedDefaults.dateFrom || ""}`}
          label="From date"
          name="dateFrom"
          value={resolvedDefaults.dateFrom}
        />
        <DateRangeInput
          key={`date-to-${currentRange}-${resolvedDefaults.dateTo || ""}`}
          label="To date"
          name="dateTo"
          value={resolvedDefaults.dateTo}
        />
        <input type="hidden" name="dateRange" value={currentRange} />
        {showSort && (
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
        )}
        {!showSort && <input type="hidden" name="sort" value={resolvedDefaults.sort || "newest"} />}

        <button
          type="submit"
          className="h-11 rounded-full bg-stone-900 px-6 text-sm font-medium text-white transition hover:bg-stone-700"
        >
          Search area sales
        </button>
      </div>

      <label className="mt-4 inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900">
        <input
          type="checkbox"
          name="newBuild"
          value="true"
          defaultChecked={resolvedDefaults.newBuild === "true"}
          className="h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-500"
        />
        New build only
      </label>

      {showTimeRange && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-stone-700">Time range</p>
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            {SEARCH_DATE_RANGE_OPTIONS.map((option) => {
              const active = currentRange === option.value

              return (
                <a
                  key={option.value}
                  href={durationHref(resolvedDefaults, option.value)}
                  className={`inline-flex min-w-0 items-center justify-center rounded-full border px-4 py-2 text-sm font-medium transition sm:flex-1 ${
                    active
                      ? "border-stone-900 bg-stone-900 text-white"
                      : "border-stone-300 bg-white text-stone-700 hover:border-stone-900 hover:text-stone-900"
                  }`}
                >
                  {option.label}
                </a>
              )
            })}
          </div>
        </div>
      )}
    </form>
  )
}
