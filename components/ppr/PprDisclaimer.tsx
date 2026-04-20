export default function PprDisclaimer({
  compact = false,
}: {
  compact?: boolean
}) {
  return (
    <div className="rounded-[24px] border border-stone-200 bg-stone-50 p-5 text-sm leading-6 text-stone-600">
      <p className="font-medium text-stone-800">
        Public sales register data
      </p>
      <p className={compact ? "mt-2" : "mt-3"}>
        Sold prices are based on public Irish Residential Property Price Register
        data. They are useful context for recent transactions, but they are not a
        formal valuation, an official price index, or advice on what a property
        should sell for.
      </p>
    </div>
  )
}
