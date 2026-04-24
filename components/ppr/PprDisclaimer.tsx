export default function PprDisclaimer({
  compact = false,
}: {
  compact?: boolean
}) {
  return (
    <div className="rounded-[24px] border border-stone-200 bg-stone-50/80 p-5 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-400">
        Information
      </p>
      <p className="mt-2 font-semibold tracking-[-0.01em] text-stone-800">
        Public sales register data
      </p>
      <div className="mt-3 h-px w-full bg-stone-200" />
      <p
        className={`${compact ? "mt-3" : "mt-4"} max-w-3xl text-sm leading-relaxed text-stone-600`}
      >
        Sold prices are based on public Irish Residential Property Price Register
        data. They are provided for general information only and as market
        context only. They are not a formal valuation, an official price index,
        pricing advice, legal advice, investment advice, or a recommendation
        about how any property should be marketed or sold.
      </p>
    </div>
  )
}
