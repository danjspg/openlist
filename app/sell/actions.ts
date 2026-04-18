"use server"

import { randomUUID } from "crypto"
import { redirect } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { buildSlug } from "@/lib/listings"
import {
  generateListingTitle,
  getLegacySqftValue,
} from "@/lib/property"

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

function getOrderedFiles(formData: FormData) {
  const files = formData
    .getAll("imageFiles")
    .filter((value): value is File => value instanceof File && value.size > 0)

  const rawOrder = String(formData.get("imageOrder") ?? "[]")

  let fileNameOrder: string[] = []

  try {
    const parsed = JSON.parse(rawOrder)
    if (Array.isArray(parsed)) {
      fileNameOrder = parsed.map((item) => String(item))
    }
  } catch {
    fileNameOrder = []
  }

  if (fileNameOrder.length === 0) {
    return files
  }

  const used = new Set<number>()
  const ordered: File[] = []

  for (const targetName of fileNameOrder) {
    const index = files.findIndex(
      (file, idx) => !used.has(idx) && file.name === targetName
    )
    if (index !== -1) {
      ordered.push(files[index])
      used.add(index)
    }
  }

  files.forEach((file, idx) => {
    if (!used.has(idx)) {
      ordered.push(file)
    }
  })

  return ordered
}

function getSharedValues(formData: FormData) {
  const sellerEmail = String(formData.get("sellerEmail") ?? "").trim()
  const type = String(formData.get("type") ?? "House").trim()
  const subtype = String(formData.get("subtype") ?? "").trim()
  const saleMethod = String(formData.get("saleMethod") ?? "Private Sale").trim()
  const county = String(formData.get("county") ?? "").trim()
  const addressLine2 = String(formData.get("addressLine2") ?? "").trim()
  const eircode = String(formData.get("eircode") ?? "").trim()
  const price = String(formData.get("price") ?? "").trim()
  const beds = Number(formData.get("beds") ?? 0)
  const baths = Number(formData.get("baths") ?? 0)
  const areaValue = Number(formData.get("areaValue") ?? 0)
  const areaUnit = String(formData.get("areaUnit") ?? "").trim()
  const viewing = String(formData.get("viewing") ?? "").trim()
  const excerpt = String(formData.get("excerpt") ?? "").trim()
  const description = String(formData.get("description") ?? "").trim()
  const status = String(formData.get("status") ?? "For Sale").trim()
  const imageUrlFallback = String(formData.get("imageUrl") ?? "").trim()
  const highlights = formData
    .getAll("highlights")
    .map((value) => String(value))
    .filter(Boolean)

  const title = generateListingTitle({
    type,
    subtype,
    addressLine2,
    county,
  })

  const legacySqft =
    areaValue && areaUnit
      ? getLegacySqftValue(type, areaValue, areaUnit)
      : 0

  return {
    sellerEmail,
    type,
    subtype,
    saleMethod,
    county,
    addressLine2,
    eircode,
    price,
    beds,
    baths,
    areaValue,
    areaUnit,
    viewing,
    excerpt,
    description,
    status,
    imageUrlFallback,
    highlights,
    title,
    legacySqft,
  }
}

export async function createListing(formData: FormData) {
  const values = getSharedValues(formData)

  const missing: string[] = []

  if (!values.sellerEmail) missing.push("email")
  if (!values.type) missing.push("property type")
  if (!values.county) missing.push("county")
  if (!values.addressLine2) missing.push("town / local area")
  if (!values.price) missing.push("price")
  if (!values.description) missing.push("description")

  if (missing.length > 0) {
    throw new Error(`Please complete: ${missing.join(", ")}.`)
  }

  const baseSlug = buildSlug(values.title)
  const slug = await makeUniqueSlug(baseSlug)

  const imageFiles = getOrderedFiles(formData)

  let uploadedImages: string[] = []

  if (imageFiles.length > 0) {
    uploadedImages = await Promise.all(
      imageFiles.map((file) => uploadImageFile(file, slug))
    )
  } else if (values.imageUrlFallback) {
    uploadedImages = [values.imageUrlFallback]
  } else {
    uploadedImages = [
      "https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=1600&q=80",
    ]
  }

  const mainImage = uploadedImages[0]

  const { error } = await supabase.from("listings").insert({
    slug,
    seller_email: values.sellerEmail,
    title: values.title,
    type: values.type,
    subtype: values.subtype || null,
    sale_method: values.saleMethod || "Private Sale",
    county: values.county,
    address_line_2: values.addressLine2 || null,
    eircode: values.eircode || null,
    price: values.price,
    beds: values.beds || 0,
    baths: values.baths || 0,
    area_value: values.areaValue || null,
    area_unit: values.areaUnit || null,
    sqft: values.legacySqft || 0,
    viewing: values.viewing || null,
    image: mainImage,
    images: uploadedImages,
    excerpt: values.excerpt || values.description.slice(0, 110),
    description: values.description,
    highlights: values.highlights.length > 0 ? values.highlights : null,
    status: values.status || "For Sale",
  })

  if (error) {
    throw new Error(error.message)
  }

  redirect(`/listings/${slug}?created=1&email=${encodeURIComponent(values.sellerEmail)}`)
}

export async function updateListing(formData: FormData) {
  const slug = String(formData.get("slug") ?? "").trim()
  const values = getSharedValues(formData)

  if (!slug) {
    throw new Error("Missing slug.")
  }

  const missing: string[] = []

  if (!values.type) missing.push("property type")
  if (!values.county) missing.push("county")
  if (!values.addressLine2) missing.push("town / local area")
  if (!values.price) missing.push("price")
  if (!values.description) missing.push("description")

  if (missing.length > 0) {
    throw new Error(`Please complete: ${missing.join(", ")}.`)
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

  const imageFiles = getOrderedFiles(formData)

  if (imageFiles.length > 0) {
    const uploaded = await Promise.all(
      imageFiles.map((file) => uploadImageFile(file, slug))
    )
    images = [...images, ...uploaded]
  }

  const mainImage = images[0] ?? null

  const { error } = await supabase
    .from("listings")
    .update({
      title: values.title,
      type: values.type,
      subtype: values.subtype || null,
      sale_method: values.saleMethod || "Private Sale",
      county: values.county,
      address_line_2: values.addressLine2 || null,
      eircode: values.eircode || null,
      price: values.price,
      beds: values.beds || 0,
      baths: values.baths || 0,
      area_value: values.areaValue || null,
      area_unit: values.areaUnit || null,
      sqft: values.legacySqft || 0,
      viewing: values.viewing || null,
      excerpt: values.excerpt || values.description.slice(0, 110),
      description: values.description,
      highlights: values.highlights.length > 0 ? values.highlights : null,
      status: values.status || "For Sale",
      image: mainImage,
      images,
    })
    .eq("slug", slug)

  if (error) {
    throw new Error(error.message)
  }

  redirect(`/listings/${slug}?updated=1`)
}