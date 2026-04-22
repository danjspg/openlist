import Link from "next/link"
import { PPR_DATE_RANGE_OPTIONS, type PprDateRangeValue } from "@/lib/ppr"

export default function PprTimeRangeSelector({
  currentRange,
  buildHref,
}: {
  currentRange: PprDateRangeValue
  buildHref: (range: PprDateRangeValue) => string
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-2 sm:flex-nowrap">
        {PPR_DATE_RANGE_OPTIONS.map((option) => {
          const active = currentRange === option.value

          return (
            <Link
              key={option.value}
              href={buildHref(option.value)}
              title={
                option.value === "all" ? "Based on all available records" : undefined
              }
              className={`inline-flex min-w-0 items-center justify-center rounded-full border px-4 py-2 text-sm font-medium transition sm:flex-1 ${
                active
                  ? "border-stone-900 bg-stone-900 text-white"
                  : "border-stone-300 bg-white text-stone-700 hover:border-stone-900 hover:text-stone-900"
              }`}
            >
              {option.label}
            </Link>
          )
        })}
      </div>
      {currentRange === "all" && (
        <p className="mt-2 text-xs leading-5 text-stone-500">Based on all available records.</p>
      )}
    </div>
  )
}
