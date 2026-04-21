"use server"

import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { buildSlug } from "@/lib/listings"
import {
  isMissingOwnerUserIdColumnError,
  LISTING_OWNERSHIP_MIGRATION_MESSAGE,
} from "@/lib/listing-ownership"
import { requireSellerUser } from "@/lib/seller-auth"
import { requireListingOwnerOrAdmin } from "@/lib/listing-permissions"
import {
  generateListingTitle,
  getLegacySqftValue,
} from "@/lib/property"
import { normalizeSaleStatus } from "@/lib/listing-status"

async function makeUniqueSlug(baseSlug: string) {
  let slug = baseSlug
  let count = 2

  while (true) {
    const { data, error } = await supabase
      .from("listings")
      .select("slug")
      .eq("slug", slug)
      .maybeSingle()

    if (error) throw new Error(error.message)
    if (!data) return slug

    slug = `${baseSlug}-${count}`
    count += 1
  }
}

function getFileExtension(filename: string) {
  const parts = filename.split(".")
  return parts.length > 1 ? parts.pop()?.toLowerCase() || "jpg" : "jpg"
}

function formatDescription(input: string) {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim()
}

function normaliseStoredImages(imagesValue: unknown, fallbackImage?: string | null) {
  if (Array.isArray(imagesValue)) {
    return imagesValue.filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0
    )
  }

  if (typeof imagesValue === "string" && imagesValue.trim().length > 0) {
    try {
      const parsed = JSON.parse(imagesValue)
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0
        )
      }
    } catch {
      // ignore JSON parse failure and fall back below
    }

    return [imagesValue]
  }

  if (fallbackImage && fallbackImage.trim().length > 0) return [fallbackImage]
  return []
}

async function uploadImageFile(file: File, slug: string) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Uploaded files must be images.")
  }

  const maxBytes = 6 * 1024 * 1024
  if (file.size > maxBytes) {
    throw new Error("Please upload images smaller than 6MB.")
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext = getFileExtension(file.name)
  const path = `${slug}/${randomUUID()}.${ext}`

  const { error } = await supabase.storage
    .from("listing-images")
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    })

  if (error) throw new Error(error.message)

  const { data } = supabase.storage
    .from("listing-images")
    .getPublicUrl(path)

  return data.publicUrl
}

function getOrderedFiles(formData: FormData) {
  return formData
    .getAll("imageFiles")
    .filter((v): v is File => v instanceof File && v.size > 0)
}

function getImageUrlValues(formData: FormData, fieldName: string) {
  return formData
    .getAll(fieldName)
    .map((value) => String(value).trim())
    .filter(Boolean)
}

function getSharedValues(formData: FormData) {
  const sellerName = String(formData.get("sellerName") ?? "").trim()
  const sellerEmail = String(formData.get("sellerEmail") ?? "").trim()
  const sellerPhone = String(formData.get("sellerPhone") ?? "").trim()
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
  const publicTitle = String(formData.get("publicTitle") ?? "").trim()
  const planning = String(formData.get("planning") ?? "").trim()
  const viewing = String(formData.get("viewing") ?? "").trim()
  const excerpt = String(formData.get("excerpt") ?? "").trim()
  const description = formatDescription(String(formData.get("description") ?? ""))
  const status = normalizeSaleStatus(formData.get("status"))
  const highlights = formData.getAll("highlights").map(String).filter(Boolean)

  return {
    sellerEmail,
    sellerName,
    sellerPhone,
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
    publicTitle,
    planning,
    viewing,
    excerpt,
    description,
    status,
    highlights,
  }
}

export async function createListing(formData: FormData) {
  const currentUser = await requireSellerUser()
  const values = getSharedValues(formData)
  const termsAccepted = String(formData.get("termsAccepted") ?? "").trim()

  if (!values.sellerName || !values.sellerEmail || !values.addressLine2 || !values.price || !values.description) {
    throw new Error("Missing required fields.")
  }

  if (termsAccepted !== "yes") {
    throw new Error("You must agree to the Terms of Service.")
  }

  const slug = await makeUniqueSlug(
    buildSlug(
      generateListingTitle({
        type: values.type,
        subtype: values.subtype,
        addressLine2: values.addressLine2,
        county: values.county,
      })
    )
  )

  const files = getOrderedFiles(formData)
  const clonedImages = getImageUrlValues(formData, "clonedImageUrls")
  const fallbackImageUrl = String(formData.get("imageUrl") ?? "").trim()

  let images: string[] = []

  if (files.length > 0) {
    images = await Promise.all(files.map((f) => uploadImageFile(f, slug)))
  }

  images = [...images, ...clonedImages]

  if (images.length === 0 && fallbackImageUrl) {
    images = [fallbackImageUrl]
  }

  if (images.length === 0) {
    images = ["https://images.unsplash.com/photo-1568605114967-8130f3a36994"]
  }

  const legacySqft =
    values.areaValue && values.areaUnit
      ? getLegacySqftValue(values.type, values.areaValue, values.areaUnit)
      : 0

  const title = generateListingTitle({
    type: values.type,
    subtype: values.subtype,
    addressLine2: values.addressLine2,
    county: values.county,
  })

  const { error } = await supabase.from("listings").insert({
    slug,
    owner_user_id: currentUser.id,
    seller_name: values.sellerName,
    seller_email: values.sellerEmail,
    seller_phone: values.sellerPhone || null,
    title,
    type: values.type,
    subtype: values.subtype || null,
    sale_method: values.saleMethod || "Private Sale",
    county: values.county,
    address_line_2: values.addressLine2,
    eircode: values.eircode || null,
    price: values.price,
    beds: values.beds || 0,
    baths: values.baths || 0,
    area_value: values.areaValue || null,
    area_unit: values.areaUnit || null,
    public_title: values.publicTitle || null,
    planning: values.planning || null,
    viewing: values.viewing || null,
    sqft: legacySqft || 0,
    excerpt: values.excerpt || values.description.slice(0, 110),
    description: values.description,
    highlights: values.highlights.length > 0 ? values.highlights : null,
    status: normalizeSaleStatus(values.status),
    image: images[0],
    images,
  })

  if (error) {
    if (isMissingOwnerUserIdColumnError(error)) {
      throw new Error(LISTING_OWNERSHIP_MIGRATION_MESSAGE)
    }

    throw new Error(error.message)
  }

  revalidatePath("/listings")
  revalidatePath("/my-listings")
  revalidatePath(`/listings/${slug}`)

  redirect(`/listings/${slug}`)
}

export async function updateListing(formData: FormData) {
  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase()

  await requireListingOwnerOrAdmin(slug)

  const values = getSharedValues(formData)

  if (!slug) {
    throw new Error("Missing slug.")
  }

  const { data: existing, error: existingError } = await supabase
    .from("listings")
    .select("slug,images,image")
    .eq("slug", slug)
    .single()

  if (existingError) {
    throw new Error(existingError.message)
  }

  const existingImages = normaliseStoredImages(existing?.images, existing?.image)
  const files = getOrderedFiles(formData)

  let uploaded: string[] = []

  if (files.length > 0) {
    uploaded = await Promise.all(files.map((f) => uploadImageFile(f, slug)))
  }

  const finalImages = [...existingImages, ...uploaded]

  const legacySqft =
    values.areaValue && values.areaUnit
      ? getLegacySqftValue(values.type, values.areaValue, values.areaUnit)
      : 0

  const title = generateListingTitle({
    type: values.type,
    subtype: values.subtype,
    addressLine2: values.addressLine2,
    county: values.county,
  })

  const { error: updateError } = await supabase
    .from("listings")
    .update({
      title,
      seller_name: values.sellerName,
      public_title: values.publicTitle || null,
      seller_phone: values.sellerPhone || null,
      type: values.type,
      subtype: values.subtype || null,
      sale_method: values.saleMethod || "Private Sale",
      county: values.county,
      address_line_2: values.addressLine2,
      eircode: values.eircode || null,
      price: values.price,
      beds: values.beds || 0,
      baths: values.baths || 0,
      area_value: values.areaValue || null,
      area_unit: values.areaUnit || null,
      sqft: legacySqft || 0,
      planning: values.planning || null,
      viewing: values.viewing || null,
      excerpt: values.excerpt || values.description.slice(0, 110),
      description: values.description,
      highlights: values.highlights.length > 0 ? values.highlights : null,
      status: normalizeSaleStatus(values.status),
      image: finalImages[0] ?? null,
      images: finalImages,
    })
    .eq("slug", slug)

  if (updateError) {
    throw new Error(updateError.message)
  }

  revalidatePath("/listings")
  revalidatePath("/my-listings")
  revalidatePath(`/listings/${slug}`)
  revalidatePath(`/listings/${slug}/edit`)

  redirect(`/listings/${slug}?updated=1`)
}

export async function archiveListing(formData: FormData) {
  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase()

  await requireListingOwnerOrAdmin(slug)

  if (!slug) {
    throw new Error("Missing slug.")
  }

  const { error } = await supabase
    .from("listings")
    .update({
      status: "Archived",
    })
    .eq("slug", slug)

  if (error) {
    throw new Error(error.message)
  }

  revalidatePath("/listings")
  revalidatePath("/my-listings")
  revalidatePath(`/listings/${slug}`)
  revalidatePath(`/listings/${slug}/edit`)

  redirect("/my-listings?archived=1")
}
