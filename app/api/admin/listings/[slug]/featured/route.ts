import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { supabase } from "@/lib/supabase"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 })
  }

  const { slug } = await params

  if (!slug.trim()) {
    return NextResponse.json({ error: "Listing slug is required" }, { status: 400 })
  }

  let featured: boolean

  try {
    const body = await request.json()
    featured = Boolean(body?.featured)
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const { error } = await supabase
    .from("listings")
    .update({ featured })
    .eq("slug", slug)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  revalidatePath("/")
  revalidatePath("/listings")
  revalidatePath("/my-listings")
  revalidatePath(`/listings/${slug}`)

  return NextResponse.json({ ok: true, featured })
}
