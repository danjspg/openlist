/* eslint-disable @next/next/no-img-element */
"use client"

import { useEffect, useMemo, useState } from "react"
import SellerEmailField from "@/components/SellerEmailField"
import { supabase } from "@/lib/supabase"
import {
  IRISH_COUNTIES,
  PROPERTY_TYPES,
  STATUS_OPTIONS,
  generateListingTitle,
  getAreaDisplay,
  getAreaUnitOptions,
  getSubtypeOptions,
} from "@/lib/property"
import { generateListingCopy } from "@/app/sell/ai-actions"
import {
  getDisplayListingExcerpt,
  getDisplayListingHighlights,
  getDisplayListingTitle,
} from "@/lib/listings"

type InitialData = {
  slug?: string
  sellerEmail?: string
  publicTitle?: string
  type?: string
  subtype?: string
  saleMethod?: string
  county?: string
  addressLine2?: string
  eircode?: string
  price?: string
  beds?: number
  baths?: number
  areaValue?: number
  areaUnit?: string
  excerpt?: string
  description?: string
  status?: string
  highlights?: string[]
  images?: string[]
}

type Props = {
  mode: "create" | "edit"
  submitAction: (formData: FormData) => void | Promise<void>
  initialData?: InitialData
}

type PreviewImage = {
  id: string
  name: string
  previewUrl: string
}

type CloneListing = {
  slug: string
  title: string
  public_title?: string | null
  seller_email?: string | null
  type?: string | null
  subtype?: string | null
  sale_method?: string | null
  county?: string | null
  address_line_2?: string | null
  eircode?: string | null
  price?: string | null
  beds?: number | null
  baths?: number | null
  area_value?: number | null
  area_unit?: string | null
  excerpt?: string | null
  description?: string | null
  status?: string | null
  highlights?: string[] | null
  image?: string | null
  images?: string[] | null
  created_at?: string | null
}

function formatEuro(value: string) {
  const numeric = Number(value.replace(/[^0-9.]/g, ""))

  if (Number.isNaN(numeric)) {
    return value
  }

  return new Intl.NumberFormat("en-IE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(numeric)
}

function previewLocation(addressLine2: string, county: string) {
  return [addressLine2.trim(), county.trim()].filter(Boolean).join(", ")
}

export default function SellerListingV2Form({
  mode,
  submitAction,
  initialData,
}: Props) {
  const [sellerEmail, setSellerEmail] = useState(initialData?.sellerEmail || "")
  const [type, setType] = useState(initialData?.type || "House")
  const [subtype, setSubtype] = useState(
    initialData?.subtype || getSubtypeOptions(initialData?.type || "House")[0] || ""
  )
  const [county, setCounty] = useState(initialData?.county || "Cork")
  const [addressLine2, setAddressLine2] = useState(initialData?.addressLine2 || "")
  const [eircode, setEircode] = useState(initialData?.eircode || "")
  const [publicTitle, setPublicTitle] = useState(initialData?.publicTitle || "")
  const [price, setPrice] = useState(initialData?.price || "")
  const [beds, setBeds] = useState(String(initialData?.beds ?? 4))
  const [baths, setBaths] = useState(String(initialData?.baths ?? 3))
  const [areaValue, setAreaValue] = useState(
    initialData?.areaValue !== undefined && initialData?.areaValue !== null
      ? String(initialData.areaValue)
      : ""
  )
  const [areaUnit, setAreaUnit] = useState(
    initialData?.areaUnit || getAreaUnitOptions(initialData?.type || "House")[0] || "sqft"
  )
  const [features, setFeatures] = useState("")
  const [excerpt, setExcerpt] = useState(initialData?.excerpt || "")
  const [description, setDescription] = useState(initialData?.description || "")
  const [status, setStatus] = useState(initialData?.status || "For Sale")
  const [suggestedHighlights, setSuggestedHighlights] = useState<string[]>([])
  const [selectedHighlights, setSelectedHighlights] = useState<string[]>(
    initialData?.highlights || []
  )
  const [isGenerating, setIsGenerating] = useState(false)
  const [aiError, setAiError] = useState("")
  const [previewImages, setPreviewImages] = useState<PreviewImage[]>([])
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [imageError, setImageError] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [clonedImages, setClonedImages] = useState<string[]>(initialData?.images || [])
  const [cloneListings, setCloneListings] = useState<CloneListing[]>([])
  const [cloneStatus, setCloneStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [cloneError, setCloneError] = useState("")
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState("")

  const isSite = type === "Site"
  const isResidential = type === "House" || type === "Apartment"

  const subtypeOptions = useMemo(() => getSubtypeOptions(type), [type])
  const areaUnitOptions = useMemo(() => getAreaUnitOptions(type), [type])

  const generatedTitle = useMemo(
    () =>
      generateListingTitle({
        type,
        subtype,
        addressLine2,
        county,
      }),
    [type, subtype, addressLine2, county]
  )

  useEffect(() => {
    const nextSubtypeOptions = getSubtypeOptions(type)
    if (!nextSubtypeOptions.includes(subtype)) {
      setSubtype(nextSubtypeOptions[0] || "")
    }

    const nextAreaOptions = getAreaUnitOptions(type)
    if (!nextAreaOptions.includes(areaUnit)) {
      setAreaUnit(nextAreaOptions[0] || "sqm")
    }
  }, [type, subtype, areaUnit])

  useEffect(() => {
    return () => {
      previewImages.forEach((img) => URL.revokeObjectURL(img.previewUrl))
    }
  }, [previewImages])

  useEffect(() => {
    if (mode !== "create") return

    const trimmedEmail = sellerEmail.trim().toLowerCase()

    if (!trimmedEmail) {
      setCloneListings([])
      setCloneStatus("idle")
      setCloneError("")
      return
    }

    let cancelled = false

    async function loadCloneListings() {
      setCloneStatus("loading")
      setCloneError("")

      const { data, error } = await supabase
        .from("listings")
        .select(
          "slug,title,public_title,seller_email,type,subtype,sale_method,county,address_line_2,eircode,price,beds,baths,area_value,area_unit,excerpt,description,status,highlights,image,images,created_at"
        )
        .eq("seller_email", trimmedEmail)
        .order("created_at", { ascending: false })

      if (cancelled) return

      if (error) {
        setCloneListings([])
        setCloneStatus("error")
        setCloneError(error.message)
        return
      }

      setCloneListings((data ?? []) as CloneListing[])
      setCloneStatus("ready")
    }

    loadCloneListings()

    return () => {
      cancelled = true
    }
  }, [mode, sellerEmail])

  function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    previewImages.forEach((img) => URL.revokeObjectURL(img.previewUrl))
    setImageError("")

    const files = Array.from(event.target.files ?? [])

    const maxPerFileBytes = 6 * 1024 * 1024
    const maxTotalBytes = 20 * 1024 * 1024

    const oversizedFile = files.find((file) => file.size > maxPerFileBytes)
    if (oversizedFile) {
      event.target.value = ""
      setPreviewImages([])
      setImageError(`"${oversizedFile.name}" is larger than 6MB. Please choose a smaller image.`)
      return
    }

    const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
    if (totalBytes > maxTotalBytes) {
      event.target.value = ""
      setPreviewImages([])
      setImageError("Total upload size is too large. Please keep combined images under 20MB.")
      return
    }

    const next = files.map((file, index) => ({
      id: `${file.name}-${index}-${Date.now()}`,
      name: file.name,
      previewUrl: URL.createObjectURL(file),
    }))

    setPreviewImages(next)
  }

  function movePreviewImage(fromId: string, toId: string) {
    const fromIndex = previewImages.findIndex((img) => img.id === fromId)
    const toIndex = previewImages.findIndex((img) => img.id === toId)

    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
      return
    }

    const next = [...previewImages]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    setPreviewImages(next)
  }

  function toggleHighlight(highlight: string) {
    setSelectedHighlights((prev) => {
      if (prev.includes(highlight)) {
        return prev.filter((item) => item !== highlight)
      }

      if (prev.length >= 6) {
        return prev
      }

      return [...prev, highlight]
    })
  }

  async function handleGenerateAI() {
    setAiError("")

    try {
      setIsGenerating(true)

      const result = await generateListingCopy({
        type,
        subtype,
        saleMethod: "Private Sale",
        county,
        addressLine2,
        price,
        beds: isResidential ? Number(beds) || 0 : 0,
        baths: isResidential ? Number(baths) || 0 : 0,
        areaValue: Number(areaValue) || 0,
        areaUnit,
        features,
      })

      setExcerpt(result.excerpt)
      setDescription(result.description)
      setSuggestedHighlights(result.bullets)
      setSelectedHighlights(result.bullets.slice(0, Math.min(4, result.bullets.length)))
    } catch (error) {
      setAiError(
        error instanceof Error ? error.message : "Could not generate AI copy."
      )
    } finally {
      setIsGenerating(false)
    }
  }

  function normaliseImageList(listing: CloneListing) {
    if (listing.images && listing.images.length > 0) {
      return listing.images.filter(Boolean)
    }

    return listing.image ? [listing.image] : []
  }

  function applyClone(slug: string) {
    const listing = cloneListings.find((item) => item.slug === slug)
    if (!listing) return

    const nextType = listing.type || "House"
    const nextSubtype =
      listing.subtype || getSubtypeOptions(nextType)[0] || ""

    setType(nextType)
    setSubtype(nextSubtype)
    setCounty(listing.county || "Cork")
    setAddressLine2(listing.address_line_2 || "")
    setEircode(listing.eircode || "")
    setPublicTitle(listing.public_title || "")
    setPrice(listing.price || "")
    setBeds(String(listing.beds ?? 0))
    setBaths(String(listing.baths ?? 0))
    setAreaValue(
      listing.area_value !== undefined && listing.area_value !== null
        ? String(listing.area_value)
        : ""
    )
    setAreaUnit(
      listing.area_unit || getAreaUnitOptions(nextType)[0] || "sqft"
    )
    setExcerpt(listing.excerpt || "")
    setDescription(listing.description || "")
    setStatus("For Sale")
    setSuggestedHighlights(listing.highlights || [])
    setSelectedHighlights(listing.highlights || [])
    setClonedImages(normaliseImageList(listing))
    setImageUrl("")
    setIsPreviewing(false)
    setPreviewError("")
  }

  function handleSellerEmailChange(value: string) {
    if (
      sellerEmail.trim().toLowerCase() !== value.trim().toLowerCase() &&
      clonedImages.length > 0
    ) {
      setClonedImages([])
    }

    setSellerEmail(value)
  }

  function getPreviewImages() {
    if (previewImages.length > 0) {
      return [
        ...previewImages.map((image) => image.previewUrl),
        ...clonedImages,
      ]
    }

    if (clonedImages.length > 0) {
      return clonedImages
    }

    if (imageUrl.trim()) {
      return [imageUrl.trim()]
    }

    return []
  }

  function handlePreview() {
    const form = document.getElementById("seller-listing-form") as HTMLFormElement | null

    setPreviewError("")

    if (form && !form.reportValidity()) {
      setPreviewError("Please complete the required fields before previewing.")
      return
    }

    setIsPreviewing(true)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function focusListingTitleField() {
    const input = document.getElementById("publicTitle") as HTMLInputElement | null
    if (!input) return

    input.focus()
    input.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  const previewDisplayImages = getPreviewImages()
  const previewTitle = getDisplayListingTitle({
    title: generatedTitle,
    public_title: publicTitle,
    type,
    subtype,
    address_line_2: addressLine2,
    county,
    excerpt,
    description,
    highlights: selectedHighlights,
  })
  const previewArea = getAreaDisplay({
    type,
    areaValue: Number(areaValue) || null,
    areaUnit,
  })
  const previewHighlights = getDisplayListingHighlights(selectedHighlights)
  const previewPrice = formatEuro(price)
  const previewSummary = getDisplayListingExcerpt({
    title: previewTitle,
    excerpt,
  })
  const previewBody =
    description.trim() || "The full listing description will appear here as you edit."
  const previewCardLocation = previewLocation(addressLine2, county)

  const previewPanel = (
    <div className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm sm:p-6 lg:sticky lg:top-8">
      <div className="mb-4 border-b border-stone-200 pb-4">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-stone-500">
          Listing preview
        </p>
        <p className="mt-2 text-sm leading-6 text-stone-500">
          Preview of public listing
        </p>
      </div>

      <article className="overflow-hidden rounded-[30px] border border-stone-200 bg-white shadow-sm">
        <div className="relative overflow-hidden">
          <div className="aspect-[3/2] w-full bg-stone-100">
            {previewDisplayImages[0] ? (
              <img
                src={previewDisplayImages[0]}
                alt={previewTitle || "Listing preview"}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-stone-400">
                No image selected
              </div>
            )}
          </div>

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/12 via-transparent to-transparent" />

          <div className="absolute left-4 top-4 z-10 flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full bg-white/92 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-700 shadow-sm backdrop-blur">
              {status}
            </span>
          </div>

          {previewDisplayImages.length > 1 && (
            <div className="absolute right-4 top-4 z-10">
              <span className="inline-flex items-center rounded-full bg-white/92 px-3 py-1 text-[11px] font-semibold text-stone-700 shadow-sm backdrop-blur">
                {previewDisplayImages.length} photos
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500 sm:text-xs">
              {subtype || type}
            </span>
            <span className="text-right text-sm text-stone-500">
              {previewCardLocation || "Dublin 14"}
            </span>
          </div>

          <h2 className="mt-3 line-clamp-2 text-xl font-semibold leading-snug tracking-tight text-stone-900 sm:text-2xl">
            {previewTitle || "12 Willow Park, Dublin 14"}
          </h2>

          <button
            type="button"
            onClick={focusListingTitleField}
            className="mt-2 inline-flex items-center text-sm font-medium text-stone-500 transition hover:text-stone-900"
          >
            Edit title
          </button>

          {previewSummary ? (
            <p className="mt-3 line-clamp-2 text-sm leading-7 text-stone-600 sm:text-base">
              {previewSummary}
            </p>
          ) : (
            <p className="mt-3 text-sm leading-7 text-stone-400 sm:text-base">
              A short listing summary will appear here if it adds something beyond the title.
            </p>
          )}

          {previewHighlights.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {previewHighlights.slice(0, 3).map((highlight) => (
                <span
                  key={highlight}
                  className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs text-stone-700"
                >
                  {highlight}
                </span>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm text-stone-500">
            {isResidential && (
              <>
                <span>{beds || "0"} bed</span>
                <span>{baths || "0"} bath</span>
                <span>{previewArea}</span>
              </>
            )}
            {!isResidential && <span>{previewArea}</span>}
          </div>

          <div className="mt-auto pt-6">
            <div className="flex items-end justify-between gap-4 border-t border-stone-100 pt-5">
              <p className="text-2xl font-semibold tracking-tight text-stone-900">
                {price.trim() ? previewPrice : "Guide price"}
              </p>
              <span className="inline-flex items-center text-sm font-medium text-stone-600">
                View listing
              </span>
            </div>
          </div>
        </div>
      </article>

      <div className="mt-5 rounded-[24px] border border-stone-200 bg-stone-50 p-5">
        <p className="text-sm font-medium text-stone-700">Listing page preview</p>
        <p className="mt-3 text-sm leading-6 text-stone-600 line-clamp-6">
          {previewBody}
        </p>
      </div>
    </div>
  )

  return (
    <form id="seller-listing-form" action={submitAction} className="space-y-10">
      {mode === "edit" && initialData?.slug && (
        <input type="hidden" name="slug" value={initialData.slug} />
      )}

      <input type="hidden" name="generatedTitle" value={generatedTitle} />
      <input type="hidden" name="saleMethod" value="Private Sale" />
      <input
        type="hidden"
        name="imageOrder"
        value={JSON.stringify(previewImages.map((img) => img.name))}
      />

      {selectedHighlights.map((highlight) => (
        <input
          key={highlight}
          type="hidden"
          name="highlights"
          value={highlight}
        />
      ))}

      {clonedImages.map((image) => (
        <input
          key={image}
          type="hidden"
          name="clonedImageUrls"
          value={image}
        />
      ))}

      <div
        className={
          mode === "edit"
            ? "grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start"
            : ""
        }
      >
      <div className={isPreviewing ? "hidden" : "space-y-10"}>
      <section className="rounded-[28px] border border-stone-200 bg-stone-50 p-6 shadow-sm">
        <div className="mb-6 border-b border-stone-200 pb-5">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-stone-500">
            Seller details
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
            Where enquiries should go
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            This is the email address that will receive buyer enquiries. It can also be remembered on this device for future listings.
          </p>
        </div>

        <SellerEmailField
          id="sellerEmail"
          name="sellerEmail"
          label="Your email"
          required
          defaultValue={initialData?.sellerEmail || ""}
          helperText=""
          onValueChange={handleSellerEmailChange}
          className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-500"
        />

        {mode === "create" && (
          <div className="mt-5 rounded-[24px] border border-stone-200 bg-white p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-end">
              <div className="flex-1">
                <p className="text-sm font-semibold tracking-tight text-stone-700">
                  Clone one of your existing listings
                </p>
                <p className="mt-2 text-sm leading-6 text-stone-500">
                  Use a previous listing as a starting point, then adjust the details before previewing.
                </p>
              </div>

              <div className="w-full md:w-80">
                <label className="mb-2 block text-sm font-medium text-stone-700">
                  Existing listing
                </label>
                <select
                  value=""
                  onChange={(e) => applyClone(e.target.value)}
                  disabled={cloneStatus !== "ready" || cloneListings.length === 0}
                  className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-stone-500 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
                >
                  <option value="">
                    {cloneStatus === "loading"
                      ? "Loading listings..."
                      : cloneListings.length > 0
                        ? "Choose a listing to clone"
                        : "No listings found"}
                  </option>
                  {cloneListings.map((listing) => (
                    <option key={listing.slug} value={listing.slug}>
                      {listing.public_title?.trim() || listing.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {cloneError && (
              <p className="mt-3 text-sm text-red-600">
                Could not load your listings: {cloneError}
              </p>
            )}

            {clonedImages.length > 0 && (
              <p className="mt-3 text-sm text-stone-500">
                Cloned photos will be reused unless you upload new photos.
              </p>
            )}
          </div>
        )}

        <div className="mt-5 rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm leading-6 text-stone-600">
          This email is not shown publicly. Enquiries from buyers in Ireland are sent directly to you.
        </div>
      </section>

      <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-6 border-b border-stone-200 pb-5">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-stone-500">
            Property details
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
            Add the main details
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            Start with the basics buyers expect to see first — property type, location, price and size.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700">
              Property type
            </label>
            <select
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-stone-500"
            >
              {PROPERTY_TYPES.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700">
              Subtype
            </label>
            <select
              name="subtype"
              value={subtype}
              onChange={(e) => setSubtype(e.target.value)}
              className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-stone-500"
            >
              {subtypeOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700">
              County
            </label>
            <select
              name="county"
              value={county}
              onChange={(e) => setCounty(e.target.value)}
              className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-stone-500"
            >
              {IRISH_COUNTIES.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700">
              Town / area
            </label>
            <input
              name="addressLine2"
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
              placeholder="Village, town or local area"
              required
              className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-stone-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700">
              Eircode
            </label>
            <input
              name="eircode"
              value={eircode}
              onChange={(e) => setEircode(e.target.value)}
              placeholder="A65 F4E2"
              className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-stone-500"
            />
            <p className="mt-2 text-xs text-stone-500">
              Stored for backend use only. Not displayed publicly.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700">
              Listing title
            </label>
            <input
              id="publicTitle"
              name="publicTitle"
              value={publicTitle}
              onChange={(e) => setPublicTitle(e.target.value)}
              placeholder="12 Willow Park, Dublin 14"
              className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-stone-500"
            />
            <p className="mt-2 text-xs text-stone-500">
              This is the public title shown on your listing page. If left blank, OpenList will generate one automatically.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700">
              Generated title
            </label>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-stone-900">
              {generatedTitle || "The title will be generated from the property type, local area and county."}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700">
              Price
            </label>
            <input
              name="price"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="€450,000"
              required
              className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-stone-500"
            />
          </div>

          {isResidential && (
            <>
              <div>
                <label className="mb-2 block text-sm font-medium text-stone-700">
                  Beds
                </label>
                <input
                  name="beds"
                  type="number"
                  min="0"
                  value={beds}
                  onChange={(e) => setBeds(e.target.value)}
                  className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-stone-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-stone-700">
                  Baths
                </label>
                <input
                  name="baths"
                  type="number"
                  min="0"
                  value={baths}
                  onChange={(e) => setBaths(e.target.value)}
                  className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-stone-500"
                />
              </div>
            </>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700">
              {isSite ? "Site area" : "Internal area"}
            </label>
            <div className="grid grid-cols-[1fr_130px] gap-3">
              <input
                name="areaValue"
                type="number"
                step="0.01"
                min="0"
                value={areaValue}
                onChange={(e) => setAreaValue(e.target.value)}
                placeholder={isSite ? "0.33" : "1550"}
                className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-stone-500"
              />
              <select
                name="areaUnit"
                value={areaUnit}
                onChange={(e) => setAreaUnit(e.target.value)}
                className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-stone-500"
              >
                {areaUnitOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-stone-700">
              Sale status
            </label>
            <select
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-stone-500"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-6 border-b border-stone-200 pb-5">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-stone-500">
            Listing description
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
            Write your listing
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            Add the details buyers need to know. You can write this yourself, or use optional AI help to generate a first draft.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-stone-700">
            Key features / notes
          </label>
          <textarea
            name="features"
            rows={4}
            value={features}
            onChange={(e) => setFeatures(e.target.value)}
            placeholder="Quiet setting, strong natural light, close to the village, large site, modern finish..."
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-stone-500"
          />
          <p className="mt-2 text-xs text-stone-500">
            Add a few simple notes about the property, the setting, the finish or anything that stands out.
          </p>
        </div>

        <div className="mt-6">
          <label className="mb-2 block text-sm font-medium text-stone-700">
            Listing card summary
          </label>
          <input
            name="excerpt"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            placeholder="A short summary shown on listing cards before a buyer opens the full page."
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-stone-500"
          />
          <p className="mt-2 text-xs text-stone-500">
            This is the short summary shown on listing cards and previews. The full description appears on the main listing page.
          </p>
        </div>

        <div className="mt-6">
          <label className="mb-2 block text-sm font-medium text-stone-700">
            Description
          </label>
          <textarea
            name="description"
            rows={7}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the property, the layout, the setting and the main selling points."
            required
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-stone-500"
          />
        </div>

        <div className="mt-8 rounded-[24px] border border-stone-200 bg-stone-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold tracking-tight text-stone-700">
                Optional AI help
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-500">
                Need a starting point? Generate a draft summary and description from the details you have entered above. You can edit everything before publishing.
              </p>
              <p className="mt-2 text-xs leading-6 text-stone-500">
                This tool helps format listing text only. It does not provide valuation services, pricing advice, negotiation advice, legal advice, or transaction services.
              </p>
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-400">
                Optional · Nothing is published automatically
              </p>
            </div>

            <button
              type="button"
              onClick={handleGenerateAI}
              disabled={isGenerating}
              className="inline-flex items-center rounded-full border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating ? "Generating..." : "Generate draft with AI"}
            </button>
          </div>

          {aiError && <p className="mt-4 text-sm text-red-600">{aiError}</p>}
        </div>

        {suggestedHighlights.length > 0 && (
          <div className="mt-6 rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold tracking-tight text-stone-700">
                  Choose your highlights
                </p>
                <p className="mt-2 text-sm text-stone-500">
                  Select 3 to 6. These appear near the top of the listing.
                </p>
              </div>

              <div className="text-sm text-stone-500">
                {selectedHighlights.length} selected
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              {suggestedHighlights.map((highlight) => {
                const selected = selectedHighlights.includes(highlight)

                return (
                  <button
                    key={highlight}
                    type="button"
                    onClick={() => toggleHighlight(highlight)}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      selected
                        ? "bg-stone-900 text-white"
                        : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
                    }`}
                  >
                    {highlight}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-6 border-b border-stone-200 pb-5">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-stone-500">
            Photography
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
            Add photos of the property
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            Upload multiple images and drag them into your preferred order. The first image will be used as the main photo.
          </p>
        </div>

        {mode === "edit" && initialData?.images && initialData.images.length > 0 && (
          <div className="mb-6">
            <p className="mb-3 text-sm font-medium text-stone-700">
              Existing photos
            </p>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {initialData.images.map((url, index) => (
                <div
                  key={`${url}-${index}`}
                  className="overflow-hidden rounded-[20px] border border-stone-200 bg-white shadow-sm"
                >
                  <div className="aspect-[3/2] w-full bg-stone-100">
                    <img
                      src={url}
                      alt={`Existing photo ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="border-t border-stone-200 px-3 py-2 text-xs text-stone-500">
                    {index === 0 ? "Current main photo" : `Photo ${index + 1}`}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-stone-500">
              Existing photos are kept. Any new uploads are added after them.
            </p>
          </div>
        )}

        {mode === "create" && clonedImages.length > 0 && (
          <div className="mb-6">
            <p className="mb-3 text-sm font-medium text-stone-700">
              Cloned photos
            </p>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {clonedImages.map((url, index) => (
                <div
                  key={`${url}-${index}`}
                  className="overflow-hidden rounded-[20px] border border-stone-200 bg-white shadow-sm"
                >
                  <div className="aspect-[3/2] w-full bg-stone-100">
                    <img
                      src={url}
                      alt={`Cloned photo ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="border-t border-stone-200 px-3 py-2 text-xs text-stone-500">
                    {index === 0 ? "Main photo" : `Photo ${index + 1}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="mb-2 block text-sm font-medium text-stone-700">
            Upload photos
          </label>
          <input
            id="imageFiles"
            name="imageFiles"
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageChange}
            className="block w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-700 file:mr-4 file:rounded-full file:border-0 file:bg-stone-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-stone-700"
          />
          {imageError && (
            <p className="mt-3 text-sm text-red-600">{imageError}</p>
          )}
          <p className="mt-2 text-xs text-stone-500">
            Maximum 6MB per image. Keep the total upload size under 20MB.
          </p>
        </div>

        {previewImages.length > 0 && (
          <div className="mt-6">
            <p className="mb-3 text-sm font-medium text-stone-700">
              New upload preview
            </p>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {previewImages.map((img, index) => (
                <div
                  key={img.id}
                  draggable
                  onDragStart={() => setDraggingId(img.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (draggingId) {
                      movePreviewImage(draggingId, img.id)
                    }
                    setDraggingId(null)
                  }}
                  className="overflow-hidden rounded-[20px] border border-stone-200 bg-white shadow-sm"
                >
                  <div className="aspect-[3/2] w-full bg-stone-100">
                    <img
                      src={img.previewUrl}
                      alt={`Preview ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="border-t border-stone-200 px-3 py-2 text-xs text-stone-500">
                    {index === 0 ? "Main photo" : `Photo ${index + 1}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6">
          <label className="mb-2 block text-sm font-medium text-stone-700">
            Or use one fallback image URL
          </label>
          <input
            name="imageUrl"
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://images.unsplash.com/..."
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-stone-500"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-stone-50 px-5 py-4">
        <p className="text-sm leading-6 text-stone-600">
          By submitting this listing, you confirm that the information provided is accurate to the best of your knowledge and that you have the right to market the property.
        </p>
      </section>
      </div>

      {mode === "edit" && !isPreviewing && (
        <aside>
          {previewPanel}
        </aside>
      )}
      </div>

      {isPreviewing && (
        <section>{previewPanel}</section>
      )}

      <div className="flex flex-col items-start gap-3 border-t border-stone-200 pt-8">
        {mode === "create" && !isPreviewing ? (
          <button
            type="button"
            onClick={handlePreview}
            className="inline-flex items-center rounded-full bg-stone-900 px-7 py-3.5 text-base font-medium text-white shadow-sm transition hover:bg-stone-700"
          >
            Preview listing
          </button>
        ) : (
          <div className="flex flex-wrap gap-3">
            {mode === "create" && (
              <button
                type="button"
                onClick={() => {
                  setIsPreviewing(false)
                  window.scrollTo({ top: 0, behavior: "smooth" })
                }}
                className="inline-flex items-center rounded-full border border-stone-300 bg-white px-6 py-3 text-sm font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900"
              >
                Return to edit
              </button>
            )}

            <button
              type="submit"
              className="inline-flex items-center rounded-full bg-stone-900 px-7 py-3.5 text-base font-medium text-white shadow-sm transition hover:bg-stone-700"
            >
              {mode === "create" ? "Submit listing" : "Save changes"}
            </button>
          </div>
        )}

        {previewError && (
          <p className="text-sm text-red-600">{previewError}</p>
        )}

        <p className="text-sm text-stone-500">
          {mode === "create"
            ? "Preview your listing before submitting it."
            : "You can come back and edit the listing or add more photos later."}
        </p>
      </div>
    </form>
  )
}
