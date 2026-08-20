import { NextResponse } from "next/server"
import { getServerSupabase } from "@/lib/supabase"

export const revalidate = 21600

export async function GET() {
  const supabase = getServerSupabase()

  const [planningResult, soldPricesResult] = await Promise.all([
    supabase
      .from("planning_applications")
      .select("registration_date")
      .not("registration_date", "is", null)
      .order("registration_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("ppr_sales")
      .select("date_of_sale")
      .not("date_of_sale", "is", null)
      .order("date_of_sale", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (planningResult.error) {
    console.warn("Could not load planning data freshness", planningResult.error)
  }
  if (soldPricesResult.error) {
    console.warn("Could not load sold-price data freshness", soldPricesResult.error)
  }

  return NextResponse.json(
    {
      planning: planningResult.data?.registration_date ?? null,
      soldPrices: soldPricesResult.data?.date_of_sale ?? null,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400",
      },
    }
  )
}
