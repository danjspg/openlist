import NextLink from "next/link"
import type { ComponentProps } from "react"

/**
 * Internal navigation whose destination renders runtime/public dataset data.
 *
 * Next's viewport/hover prefetch is valuable for static editorial pages, but a
 * large directory of database-backed destinations can otherwise turn one page
 * view into many speculative server renders. Keep the opt-out at the boundary
 * so new links in these route families inherit the safe behaviour.
 */
export default function RuntimeDataLink(props: ComponentProps<typeof NextLink>) {
  return <NextLink {...props} prefetch={false} />
}
