"use client"

import { useEffect, useMemo, useState } from "react"
import SellerEmailField from "@/components/SellerEmailField"
import {
  IRISH_COUNTIES,
  PROPERTY_TYPES,
  SALE_METHODS,
  STATUS_OPTIONS,
  generateListingTitle,
  getAreaUnitOptions,
  getSubtypeOptions,
} from "@/lib/property"
import { generateListingCopy } from "@/app/sell/ai-actions"

type InitialData = {
  slug?: string
  sellerEmail?: string
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

export default function SellerListingV2Form({
  mode,
  submitAction,
  initialData,
}: Props) {
  const [type, setType] = useState(initialData?.type || "House")
  const [subtype, setSubtype] = useState(
    initialData?.subtype || getSubtypeOptions(initialData?.type || "House")[0] || ""
  )
  const [saleMethod, setSaleMethod] = useState(initialData?.saleMethod || "Private Sale")
  const [county, setCounty] = useState(initialData?.county || "Cork")
  const [addressLine2, setAddressLine2] = useState(initialData?.addressLine2 || "")
  const [eircode, setEircode] = useState(initialData?.eircode || "")
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
        saleMethod,
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

  return (
    <form action={submitAction} className="space-y-10">
      {mode === "edit" && initialData?.slug && (
        <input type="hidden" name="slug" value={initialData.slug} />
      )}

      <input type="hidden" name="generatedTitle" value={generatedTitle} />
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

      <section className="rounded-[28px] border border-stone-200 bg-stone-50 p-6 shadow-sm">
        <div className="mb-6 border-b border-stone-200 pb-5">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-stone-500">
            Seller details
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
            Who should receive enquiries
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            This email is used to receive enquiries and can be pre-filled across the site on this device.
          </p>
        </div>

        <SellerEmailField
          id="sellerEmail"
          name="sellerEmail"
          label="Your email"
          required
          defaultValue={initialData?.sellerEmail || ""}
          helperText=""
          className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-500"
        />

        <div className="mt-5 rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm leading-6 text-stone-600">
          This private email is not shown publicly. Buyer enquiries are sent directly to you.
        </div>
      </section>

      <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-6 border-b border-stone-200 pb-5">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-stone-500">
            Property details
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
            Build the core of your listing
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            Add the main details buyers expect first — type, location, pricing, and size.
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
              Sale method
            </label>
            <select
              name="saleMethod"
              value={saleMethod}
              onChange={(e) => setSaleMethod(e.target.value)}
              className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-stone-500"
            >
              {SALE_METHODS.map((option) => (
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
              Generated title
            </label>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-stone-900">
              {generatedTitle || "Title will be generated from subtype, local area and county."}
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
              Status
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
            Positioning and copy
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
            Shape how the property is presented
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            Add key selling points, then use AI to generate cleaner draft copy you can refine.
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
            placeholder="Quiet setting, strong natural light, close to beach, large site, modern finish..."
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-stone-500"
          />
        </div>

        <div className="mt-6 rounded-[24px] border border-stone-200 bg-stone-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold tracking-tight text-stone-700">
                AI writing assistant
              </p>
              <p className="mt-2 text-sm text-stone-500">
                Generate a polished summary, description and feature highlights. Review before publishing.
              </p>
            </div>

            <button
              type="button"
              onClick={handleGenerateAI}
              disabled={isGenerating}
              className="inline-flex items-center rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGenerating ? "Generating..." : "Generate with AI"}
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

        <div className="mt-6">
          <label className="mb-2 block text-sm font-medium text-stone-700">
            Listing card summary
          </label>
          <input
            name="excerpt"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            placeholder="Shown on listing cards and previews before a buyer opens the full listing."
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-stone-500"
          />
          <p className="mt-2 text-xs text-stone-500">
            A short summary used on listing cards and previews. The full description appears on the main listing page.
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
            placeholder="Describe the property, setting, layout and key selling points."
            required
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-stone-500"
          />
        </div>
      </section>

      <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-6 border-b border-stone-200 pb-5">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-stone-500">
            Photography
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">
            Add imagery that sells the property
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            Upload multiple images and drag them into your preferred order. The first image becomes the main photo.
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
              This form preserves existing photos. New uploads are appended after them.
            </p>
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
            Max 6MB per image. Keep total upload size under 20MB.
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
            placeholder="https://images.unsplash.com/..."
            className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-stone-900 outline-none transition focus:border-stone-500"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-stone-50 px-5 py-4">
        <p className="text-sm leading-6 text-stone-600">
          By submitting this listing, you confirm that the information provided is accurate
          to the best of your knowledge and that you have the right to market the property.
        </p>
      </section>

      <div className="flex flex-col items-start gap-3 border-t border-stone-200 pt-8">
        <button
          type="submit"
          className="inline-flex items-center rounded-full bg-stone-900 px-7 py-3.5 text-base font-medium text-white shadow-sm transition hover:bg-stone-700"
        >
          {mode === "create" ? "Create listing" : "Save changes"}
        </button>

        <p className="text-sm text-stone-500">
          You can edit your listing and add more photos later.
        </p>
      </div>
    </form>
  )
}