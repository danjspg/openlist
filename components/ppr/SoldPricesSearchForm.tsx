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
  }
  compact?: boolean
}

export default function SoldPricesSearchForm({
  action = "/sold-prices/search",
  defaults = {},
  compact = false,
}: Props) {
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
            defaultValue={defaults.county || ""}
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
            defaultValue={defaults.area || ""}
            placeholder="Ranelagh, Kinsale, Salthill..."
            className="h-11 w-full rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-stone-700">
            Min price
          </label>
          <input
            name="minPrice"
            inputMode="numeric"
            defaultValue={defaults.minPrice || ""}
            placeholder="€250,000"
            className="h-11 w-full rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-stone-700">
            Max price
          </label>
          <input
            name="maxPrice"
            inputMode="numeric"
            defaultValue={defaults.maxPrice || ""}
            placeholder="€750,000"
            className="h-11 w-full rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-500"
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[150px_150px_auto] md:items-end">
        <div>
          <label className="mb-2 block text-sm font-medium text-stone-700">
            From
          </label>
          <input
            type="date"
            name="dateFrom"
            defaultValue={defaults.dateFrom || ""}
            className="h-11 w-full rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-900 outline-none transition focus:border-stone-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-stone-700">
            To
          </label>
          <input
            type="date"
            name="dateTo"
            defaultValue={defaults.dateTo || ""}
            className="h-11 w-full rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-900 outline-none transition focus:border-stone-500"
          />
        </div>

        <button
          type="submit"
          className="h-11 rounded-full bg-stone-900 px-6 text-sm font-medium text-white transition hover:bg-stone-700"
        >
          Search sold prices
        </button>
      </div>
    </form>
  )
}
