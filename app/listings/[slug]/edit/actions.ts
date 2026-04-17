"use server"

import { supabase } from "@/lib/supabase"
import { randomUUID } from "crypto"
import { redirect } from "next/navigation"

function getFileExtension(filename: string) {
  const parts = filename.split(".")
  return parts.length > 1 ? parts.pop()?.toLowerCase() || "jpg" : "jpg"
}

async function uploadImage(file: File, slug: string) {
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

  const { error } = await supabase.storage
    .from("listing-images")
    .upload(path, buffer, {
      contentType: file.type,
    })

  if (error) throw new Error(error.message)

  const { data } = supabase.storage
    .from("listing-images")
    .getPublicUrl(path)

  return data.publicUrl
}

export async function updateListing(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim()

  const sellerEmail = String(formData.get("sellerEmail") ?? "").trim()
  const title = String(formData.get("title") ?? "").trim()
  const county = String(formData.get("county") ?? "").trim()
  const price = String(formData.get("price") ?? "").trim()
  const type = String(formData.get("type") ?? "").trim()
  const beds = Number(formData.get("beds") ?? 0)
  const baths = Number(formData.get("baths") ?? 0)
  const sqft = Number(formData.get("sqft") ?? 0)
  const excerpt = String(formData.get("excerpt") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const status = String(formData.get("status") ?? "").trim()
  const planning = String(formData.get("planning") ?? "").trim()
  const viewing = String(formData.get("viewing") ?? "").trim()
  const selectedMainImage = String(formData.get("mainImage") ?? "").trim()

  if (!slug || !sellerEmail || !title || !county || !price || !description) {
    throw new Error("Missing required fields.")
  }

  const { data: existing, error: existingError } = await supabase
    .from("listings")
    .select("images,image")
    .eq("slug", slug)
    .single()

  if (existingError) {
    throw new Error(existingError.message)
  }

  let images: string[] =
    existing?.images && existing.images.length > 0
      ? existing.images
      : existing?.image
        ? [existing.image]
        : []

  const removeImages = formData
    .getAll("removeImages")
    .map((value) => String(value))

  if (removeImages.length > 0) {
    images = images.filter((imageUrl) => !removeImages.includes(imageUrl))
  }

  const newFiles = formData
    .getAll("imageFiles")
    .filter((f): f is File => f instanceof File && f.size > 0)

  if (newFiles.length > 0) {
    const uploaded = await Promise.all(
      newFiles.map((file) => uploadImage(file, slug))
    )
    images = [...images, ...uploaded]
  }

  if (selectedMainImage && images.includes(selectedMainImage)) {
    images = [
      selectedMainImage,
      ...images.filter((imageUrl) => imageUrl !== selectedMainImage),
    ]
  }

  const mainImage = images[0] ?? null

  const { error } = await supabase
    .from("listings")
    .update({
      seller_email: sellerEmail,
      title,
      county,
      price,
      type,
      beds,
      baths,
      sqft,
      excerpt,
      description,
      status,
      planning: planning || null,
      viewing: viewing || null,
      images,
      image: mainImage,
    })
    .eq("slug", slug)

  if (error) {
    throw new Error(error.message)
  }

  redirect(`/listings/${slug}?updated=1`)
}