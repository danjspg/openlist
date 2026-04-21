import { NextRequest, NextResponse } from "next/server"
import { clearSellerSessionCookies } from "@/lib/seller-auth"

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/", request.url))
  clearSellerSessionCookies(response)
  return response
}
