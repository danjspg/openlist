import { supabase } from "@/lib/supabase"
import { notFound } from "next/navigation"
import { updateListing } from "./actions"

export default async function EditListingPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const { data: listing, error } = await supabase
    .from("listings")
    .select("*")
    .eq("slug", slug)
    .maybeSingle()

  if (error) {
    return (
      <main className="min-h-screen bg-white p-10">
        <h1 className="text-2xl font-semibold text-slate-900">Error</h1>
        <p className="mt-3 text-slate-600">{error.message}</p>
      </main>
    )
  }

  if (!listing) {
    notFound()
  }

  const images =
    listing.images && listing.images.length > 0
      ? listing.images
      : listing.image
        ? [listing.image]
        : []

  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-10">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">
            OpenList
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">
            Edit listing
          </h1>
          <p className="mt-3 text-lg text-slate-600">
            Update details, change status, add photos, or remove existing ones.
          </p>
        </div>

        <form action={updateListing} className="space-y-8">
          <input type="hidden" name="slug" value={listing.slug} />

          <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-6">
            <p className="text-sm font-semibold tracking-tight text-slate-700">
              Seller details
            </p>

            <div className="mt-5">
              <label
                htmlFor="sellerEmail"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Seller email
              </label>
              <input
                id="sellerEmail"
                name="sellerEmail"
                type="email"
                required
                defaultValue={listing.seller_email ?? ""}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
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
                defaultValue={listing.title}
                required
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
                defaultValue={listing.county}
                required
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
                defaultValue={listing.price}
                required
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
                defaultValue={listing.type}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
              >
                <option>House</option>
                <option>Site</option>
                <option>Apartment</option>
                <option>Commercial</option>
              </select>
            </div>

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
                defaultValue={listing.beds ?? 0}
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
                defaultValue={listing.baths ?? 0}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
              />
            </div>

            <div>
              <label
                htmlFor="sqft"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Sq Ft / Site Area
              </label>
              <input
                id="sqft"
                name="sqft"
                type="number"
                min="0"
                defaultValue={listing.sqft ?? 0}
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
                defaultValue={listing.status}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
              >
                <option>For Sale</option>
                <option>Sale Agreed</option>
                <option>Sold</option>
                <option>To Let</option>
              </select>
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
              defaultValue={listing.excerpt ?? ""}
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
              rows={6}
              defaultValue={listing.description ?? ""}
              required
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
            />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
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
                defaultValue={listing.planning ?? ""}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
              />
            </div>

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
                defaultValue={listing.viewing ?? ""}
                className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 outline-none transition focus:border-slate-500"
              />
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-6">
            <p className="text-sm font-semibold tracking-tight text-slate-700">
              Existing photos
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Choose a new main photo or tick any photos you want to remove.
            </p>

            {images.length > 0 ? (
              <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3">
                {images.map((imageUrl: string, index: number) => (
                  <label
                    key={`${imageUrl}-${index}`}
                    className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm"
                  >
                    <div className="aspect-[3/2] w-full bg-slate-100">
                      <img
                        src={imageUrl}
                        alt={`Existing photo ${index + 1}`}
                        className="h-full w-full object-cover"
                      />
                    </div>

                    <div className="border-t border-slate-200 p-3 space-y-3">
                      <div className="text-xs text-slate-500">
                        {index === 0 ? "Current main photo" : `Photo ${index + 1}`}
                      </div>

                      <div className="flex flex-col gap-2 text-sm text-slate-700">
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="mainImage"
                            value={imageUrl}
                            defaultChecked={index === 0}
                            className="h-4 w-4"
                          />
                          Make main
                        </label>

                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            name="removeImages"
                            value={imageUrl}
                            className="h-4 w-4"
                          />
                          Remove
                        </label>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">No existing photos.</p>
            )}
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-6">
            <p className="text-sm font-semibold tracking-tight text-slate-700">
              Add more photos
            </p>

            <div className="mt-5">
              <label
                htmlFor="imageFiles"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Upload more photos
              </label>
              <input
                id="imageFiles"
                name="imageFiles"
                type="file"
                accept="image/*"
                multiple
                className="block w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 file:mr-4 file:rounded-full file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
              />
            </div>
          </div>

          <div className="pt-2">
            <button className="inline-flex items-center rounded-full bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-700">
              Save changes
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}