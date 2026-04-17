"use server"

import { randomUUID } from "crypto"
import { redirect } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { buildSlug } from "@/lib/listings"

async function makeUniqueSlug(baseSlug: string) {
  let slug = baseSlug
  let count = 2

  while (true) {
    const { data, error } = await supabase
      .from("listings")
      .select("slug")
      .eq("slug", slug)
      .maybeSingle()

    if (error) {
      throw new Error(error.message)
    }

    if (!data) {
      return slug
    }

    slug = `${baseSlug}-${count}`
    count += 1
  }
}

function getFileExtension(filename: string) {
  const parts = filename.split(".")
  return parts.length > 1 ? parts.pop()?.toLowerCase() || "jpg" : "jpg"
}

async function uploadImageFile(file: File, slug: string) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Uploaded files must be images.")
  }

  const maxBytes = 6 * 1024 * 1024
  if (file.size > maxBytes) {
    throw new Error("Please upload images smaller than 6MB.")
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const ext = getFileExtension(file.name)
  const path = `${slug}/${randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from("listing-images")
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    throw new Error(uploadError.message)
  }

  const { data: publicUrlData } = supabase.storage
    .from("listing-images")
    .getPublicUrl(path)

  return publicUrlData.publicUrl
}

export async function createListing(formData: FormData) {
  const sellerEmail = String(formData.get("sellerEmail") ?? "").trim()
  const title = String(formData.get("title") ?? "").trim()
  const county = String(formData.get("county") ?? "").trim()
  const price = String(formData.get("price") ?? "").trim()
  const beds = Number(formData.get("beds") ?? 0)
  const baths = Number(formData.get("baths") ?? 0)
  const sqft = Number(formData.get("sqft") ?? 0)
  const excerpt = String(formData.get("excerpt") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const status = String(formData.get("status") ?? "For Sale").trim()
  const type = String(formData.get("type") ?? "House").trim()
  const planningRaw = String(formData.get("planning") ?? "").trim()
  const viewingRaw = String(formData.get("viewing") ?? "").trim()
  const imageUrlFallback = String(formData.get("imageUrl") ?? "").trim()

  if (!sellerEmail || !title || !county || !price || !description) {
    throw new Error("Seller email, title, county, price and description are required.")
  }

  const baseSlug = buildSlug(title)
  const slug = await makeUniqueSlug(baseSlug)

  const imageFiles = formData
    .getAll("imageFiles")
    .filter((value): value is File => value instanceof File && value.size > 0)

  let uploadedImages: string[] = []

  if (imageFiles.length > 0) {
    uploadedImages = await Promise.all(
      imageFiles.map((file) => uploadImageFile(file, slug))
    )
  } else if (imageUrlFallback) {
    uploadedImages = [imageUrlFallback]
  } else {
    uploadedImages = [
      "https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=1600&q=80",
    ]
  }

  const mainImage = uploadedImages[0]

  const { error } = await supabase.from("listings").insert({
    slug,
    seller_email: sellerEmail,
    title,
    county,
    price,
    beds,
    baths,
    sqft,
    image: mainImage,
    images: uploadedImages,
    excerpt: excerpt || description.slice(0, 100),
    description,
    status: status || "For Sale",
    type: type || "House",
    planning: planningRaw || null,
    viewing: viewingRaw || null,
  })

  if (error) {
    throw new Error(error.message)
  }

  redirect(
    `/listings/${slug}?created=1&email=${encodeURIComponent(sellerEmail)}`
  )
}