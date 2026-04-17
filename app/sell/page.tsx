"use client"

import { useEffect, useState } from "react"
import { createListing } from "./actions"
import SellerEmailField from "@/components/SellerEmailField"

export default function SellPage() {
  const [type, setType] = useState("House")
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [selectedFileNames, setSelectedFileNames] = useState<string[]>([])

  const isSite = type === "Site"

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [previewUrls])

  function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    previewUrls.forEach((url) => URL.revokeObjectURL(url))

    const files = Array.from(event.target.files ?? [])

    if (files.length === 0) {
      setPreviewUrls([])
      setSelectedFileNames([])
      return
    }

    const urls = files.map((file) => URL.createObjectURL(file))
    const names = files.map((file) => file.name)

    setPreviewUrls(urls)
    setSelectedFileNames(names)
  }

  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-10">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">
            OpenList
          </p>

          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">
            Sell your property professionally
          </h1>

          <p className="mt-3 max-w-2xl text-lg text-slate-600">
            Create a polished property listing, share it instantly, and receive
            enquiries directly.
          </p>

          <p className="mt-3 text-sm text-slate-500">
            No agents. No commissions. Just a simple, modern way to sell.
          </p>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-8">
          <h2 className="text-2xl font-semibold text-slate-900">
            How it works
          </h2>

          <div className="mt-6 grid gap-6 md:grid-cols-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                1. Create your listing
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Add the property details, upload photos, and publish a clean,
                professional listing in minutes.
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-900">
                2. Receive enquiries
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Buyers contact you directly by email, so you stay in control of
                conversations and viewings.
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-900">
                3. Manage everything
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Edit your listing, update status, change the main photo, and add
                or remove images whenever you need to.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 space-y-4">
          <h2 className="text-2xl font-semibold text-slate-900">
            Frequently asked questions
          </h2>

          <div className="rounded-2xl border border-slate-200 p-5">
            <p className="font-medium text-slate-900">
              Do I need an estate agent?
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              No. OpenList is designed to let you create and manage the listing
              yourself, while buyers contact you directly.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <p className="font-medium text-slate-900">
              How do buyers contact me?
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Enquiries are sent straight to the seller email you enter below,
              so you can respond directly.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <p className="font-medium text-slate-900">
              Can I edit my listing later?
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Yes. You can update the description, change status, add or remove
              photos, and choose a new main image at any time.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <p className="font-medium text-slate-900">
              Is OpenList free?
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Yes. Early access is currently free while the platform is being
              developed and refined.
            </p>
          </div>
        </div>

        <div className="mt-10 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">
            A professional private sale experience
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            OpenList helps you present your property professionally while dealing
            directly with buyers. Viewings, negotiation, and legal conveyancing
            remain entirely in your control and can be handled through your own
            solicitor.
          </p>
        </div>

        <form action={createListing} className="mt-10 space-y-8">
          <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-6">
            <p className="text-sm font-semibold tracking-tight text-slate-700">
              Seller details
            </p>
            <p className="mt-2 text-sm text-slate-500">
              This email is used to receive buyer enquiries and pre-fills across
              the site on this device.
            </p>

            <div className="mt-5">
              <SellerEmailField
                id="sellerEmail"
                name="sellerEmail"
                label="Your email"
                required
                helperText=""
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
              />
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label
                htmlFor="title"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Title
              </label>
              <input
                id="title"
                name="title"
                type="text"
                required
                placeholder="Coastal Site, Myrtleville West"
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
              />
            </div>

            <div>
              <label
                htmlFor="county"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                County
              </label>
              <input
                id="county"
                name="county"
                type="text"
                required
                placeholder="Cork"
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
              />
            </div>

            <div>
              <label
                htmlFor="price"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Price
              </label>
              <input
                id="price"
                name="price"
                type="text"
                required
                placeholder="€550,000"
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
              />
            </div>

            <div>
              <label
                htmlFor="type"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Type
              </label>
              <select
                id="type"
                name="type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
              >
                <option>House</option>
                <option>Site</option>
                <option>Apartment</option>
                <option>Commercial</option>
              </select>
            </div>

            {!isSite && (
              <>
                <div>
                  <label
                    htmlFor="beds"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Beds
                  </label>
                  <input
                    id="beds"
                    name="beds"
                    type="number"
                    min="0"
                    defaultValue="4"
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="baths"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    Baths
                  </label>
                  <input
                    id="baths"
                    name="baths"
                    type="number"
                    min="0"
                    defaultValue="3"
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
                  />
                </div>
              </>
            )}

            <div>
              <label
                htmlFor="sqft"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                {isSite ? "Site Area" : "Sq Ft"}
              </label>
              <input
                id="sqft"
                name="sqft"
                type="number"
                min="0"
                defaultValue="2750"
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
              />
            </div>

            <div>
              <label
                htmlFor="status"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Status
              </label>
              <select
                id="status"
                name="status"
                defaultValue="For Sale"
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
              >
                <option>For Sale</option>
                <option>Sale Agreed</option>
                <option>Sold</option>
                <option>To Let</option>
              </select>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-6">
            <p className="text-sm font-semibold tracking-tight text-slate-700">
              Listing photos
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Upload multiple photos. The first image will be used as the main
              image.
            </p>

            <div className="mt-5">
              <label
                htmlFor="imageFiles"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
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

            {selectedFileNames.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-slate-700">
                  Selected files
                </p>
                <ul className="mt-2 space-y-1 text-sm text-slate-500">
                  {selectedFileNames.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              </div>
            )}

            {previewUrls.length > 0 && (
              <div className="mt-5">
                <p className="mb-3 text-sm font-medium text-slate-700">
                  Preview
                </p>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                  {previewUrls.map((url, index) => (
                    <div
                      key={url}
                      className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm"
                    >
                      <div className="aspect-[3/2] w-full bg-slate-100">
                        <img
                          src={url}
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
              <label
                htmlFor="imageUrl"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Or use one fallback image URL
              </label>
              <input
                id="imageUrl"
                name="imageUrl"
                type="url"
                placeholder="https://images.unsplash.com/..."
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="excerpt"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Short excerpt
            </label>
            <input
              id="excerpt"
              name="excerpt"
              type="text"
              placeholder="Planning-approved coastal site with stunning sea views."
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
            />
          </div>

          <div>
            <label
              htmlFor="description"
              className="mb-2 block text-sm font-medium text-slate-700"
            >
              Description
            </label>
            <textarea
              id="description"
              name="description"
              required
              rows={6}
              placeholder="Describe the property..."
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
            />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {isSite && (
              <div>
                <label
                  htmlFor="planning"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Planning
                </label>
                <input
                  id="planning"
                  name="planning"
                  type="text"
                  placeholder="Approved"
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="viewing"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Viewing
              </label>
              <input
                id="viewing"
                name="viewing"
                type="text"
                placeholder="By appointment"
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="inline-flex items-center rounded-full bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Create listing
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}