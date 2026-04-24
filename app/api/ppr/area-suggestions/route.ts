import { NextResponse } from "next/server"
import { getPprAreaSuggestions } from "@/lib/ppr"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get("q") || ""

  if (query.trim().length < 2) {
    return NextResponse.json({ suggestions: [] })
  }

  const suggestions = await getPprAreaSuggestions(query)
  return NextResponse.json({ suggestions })
}
