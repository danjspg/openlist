import SourceNote from "@/components/SourceNote"

export default function PprDisclaimer({
  compact = false,
}: {
  compact?: boolean
}) {
  return (
    <SourceNote compact={compact}>
      Sold prices are based on the public Irish Residential Property Price Register and are shown as market context only. They are not a formal valuation, official price index, pricing advice, legal advice or investment advice.
    </SourceNote>
  )
}
