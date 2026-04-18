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
  viewing?: string
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
  const [subtype, setSubtype] = useState(initialData?.subtype || getSubtypeOptions(initialData?.type || "House")[0] || "")
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
  const [viewing, setViewing] = useState(initialData?.viewing || "")
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

    const files = Array.from(event.target.files ?? [])
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
        viewing,
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
    <form action={submitAction} className="space-y-8">
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

      <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-6">
        <p className="text-sm font-semibold tracking-tight text-slate-700">
          Seller details
        </p>
        <p className="mt-2 text-sm text-slate-500">
          This email is used to receive enquiries and pre-fills across the site on this device.
        </p>

        <div className="mt-5">
          <SellerEmailField
            id="sellerEmail"
            name="sellerEmail"
            label="Your email"
            required
            defaultValue={initialData?.sellerEmail || ""}
            helperText=""
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
          />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Property type
          </label>
          <select
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
          >
            {PROPERTY_TYPES.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Subtype
          </label>
          <select
            name="subtype"
            value={subtype}
            onChange={(e) => setSubtype(e.target.value)}
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
          >
            {subtypeOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Sale method
          </label>
          <select
            name="saleMethod"
            value={saleMethod}
            onChange={(e) => setSaleMethod(e.target.value)}
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
          >
            {SALE_METHODS.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            County
          </label>
          <select
            name="county"
            value={county}
            onChange={(e) => setCounty(e.target.value)}
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
          >
            {IRISH_COUNTIES.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Address line 2
          </label>
          <input
            name="addressLine2"
            value={addressLine2}
            onChange={(e) => setAddressLine2(e.target.value)}
            placeholder="Village, town or local area"
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Eircode
          </label>
          <input
            name="eircode"
            value={eircode}
            onChange={(e) => setEircode(e.target.value)}
            placeholder="A65 F4E2"
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
          />
          <p className="mt-2 text-xs text-slate-500">
            Stored for backend use only. Not displayed publicly.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Generated title
          </label>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-900">
            {generatedTitle || "Title will be generated from subtype, local area and county."}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Price
          </label>
          <input
            name="price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="€450,000"
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
          />
        </div>

        {isResidential && (
          <>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Beds
              </label>
              <input
                name="beds"
                type="number"
                min="0"
                value={beds}
                onChange={(e) => setBeds(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Baths
              </label>
              <input
                name="baths"
                type="number"
                min="0"
                value={baths}
                onChange={(e) => setBaths(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
              />
            </div>
          </>
        )}

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
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
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
            />
            <select
              name="areaUnit"
              value={areaUnit}
              onChange={(e) => setAreaUnit(e.target.value)}
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
            >
              {areaUnitOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Viewing
          </label>
          <input
            name="viewing"
            value={viewing}
            onChange={(e) => setViewing(e.target.value)}
            placeholder="By appointment"
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Status
          </label>
          <select
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Key features / notes
        </label>
        <textarea
          rows={4}
          value={features}
          onChange={(e) => setFeatures(e.target.value)}
          placeholder="Quiet setting, strong natural light, close to beach, large site, modern finish..."
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
        />
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-tight text-slate-700">
              AI writing assistant
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Generate a polished excerpt, description and feature highlights. Review before publishing.
            </p>
          </div>

          <button
            type="button"
            onClick={handleGenerateAI}
            disabled={isGenerating}
            className="inline-flex items-center rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isGenerating ? "Generating..." : "Generate with AI"}
          </button>
        </div>

        {aiError && <p className="mt-4 text-sm text-red-600">{aiError}</p>}
      </div>

      {suggestedHighlights.length > 0 && (
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold tracking-tight text-slate-700">
                Choose your highlights
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Select 3 to 6. These appear near the top of the listing.
              </p>
            </div>

            <div className="text-sm text-slate-500">
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
                      ? "bg-slate-900 text-white"
                      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {highlight}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Short excerpt
        </label>
        <input
          name="excerpt"
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          placeholder="A well-presented property in a convenient and established setting."
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Description
        </label>
        <textarea
          name="description"
          rows={7}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the property, setting, layout and key selling points."
          className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
        />
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-6">
        <p className="text-sm font-semibold tracking-tight text-slate-700">
          Listing photos
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Upload multiple photos. Drag preview cards to change the order. The first photo becomes the main image.
        </p>

        {mode === "edit" && initialData?.images && initialData.images.length > 0 && (
          <div className="mt-5">
            <p className="mb-3 text-sm font-medium text-slate-700">
              Existing photos
            </p>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {initialData.images.map((url, index) => (
                <div
                  key={`${url}-${index}`}
                  className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm"
                >
                  <div className="aspect-[3/2] w-full bg-slate-100">
                    <img
                      src={url}
                      alt={`Existing photo ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
                    {index === 0 ? "Current main photo" : `Photo ${index + 1}`}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              This v2 form preserves existing photos. New uploads are appended after them.
            </p>
          </div>
        )}

        <div className="mt-5">
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Upload photos
          </label>
          <input
            id="imageFiles"
            name="imageFiles"
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageChange}
            className="block w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 file:mr-4 file:rounded-full file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
          />
        </div>

        {previewImages.length > 0 && (
          <div className="mt-5">
            <p className="mb-3 text-sm font-medium text-slate-700">
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
                  className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm"
                >
                  <div className="aspect-[3/2] w-full bg-slate-100">
                    <img
                      src={img.previewUrl}
                      alt={`Preview ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="border-t border-slate-200 px-3 py-2 text-xs text-slate-500">
                    {index === 0 ? "Main photo" : `Photo ${index + 1}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5">
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Or use one fallback image URL
          </label>
          <input
            name="imageUrl"
            type="url"
            placeholder="https://images.unsplash.com/..."
            className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
          />
        </div>
      </div>

      <div className="pt-2">
        <button
          type="submit"
          className="inline-flex items-center rounded-full bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          {mode === "create" ? "Create listing" : "Save changes"}
        </button>
      </div>
    </form>
  )
}