import { NextRequest, NextResponse } from "next/server"
import { clearSellerSessionCookies } from "@/lib/seller-auth"

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/", request.url))
  clearSellerSessionCookies(response)
  return response
}

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/", request.url))
  clearSellerSessionCookies(response)
  return response
}
