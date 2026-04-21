"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { formatLocation, getAreaDisplay } from "@/lib/property"
import {
  PUBLIC_SALE_STATUSES,
  isPublicSaleStatus,
  normalizeListingStatus,
} from "@/lib/listing-status"

type Listing = {
  id?: number
  slug: string
  seller_email?: string | null
  title: string
  county: string
  address_line_2?: string | null
  price: string
  beds: number
  baths: number
  sqft: number
  image: string
  images?: string[] | null
  excerpt: string
  description: string
  status: string
  type: string
  subtype?: string | null
  sale_method?: string | null
  area_value?: number | null
  area_unit?: string | null
  viewing?: string | null
  created_at?: string
  highlights?: string[] | null
  featured?: boolean
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

export default function ListingsPage() {
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState("All")
  const [statusFilter, setStatusFilter] = useState("All")
  const [countyFilter, setCountyFilter] = useState("All")

  useEffect(() => {
    async function loadListings() {
      const { data, error } = await supabase
        .from("listings")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) {
        setError(error.message || "Unknown error")
        setLoading(false)
        return
      }

      const normalized = ((data ?? []) as Listing[])
        .map((listing) => normalizeListingStatus(listing))
        .filter((listing) => isPublicSaleStatus(listing.status))
        .sort((a, b) => Number(b.featured) - Number(a.featured))

      setListings(normalized)
      setLoading(false)
    }

    loadListings()
  }, [])

  const counties = useMemo(() => {
    const values = Array.from(new Set(listings.map((listing) => listing.county))).sort()
    return ["All", ...values]
  }, [listings])

  const types = useMemo(() => {
    const values = Array.from(new Set(listings.map((listing) => listing.type))).sort()
    return ["All", ...values]
  }, [listings])

  const statuses = useMemo(() => {
    const values = PUBLIC_SALE_STATUSES.filter((status) =>
      listings.some((listing) => listing.status === status)
    )
    return ["All", ...values]
  }, [listings])

  const filteredListings = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()

    return listings.filter((listing) => {
      const searchable = [
        listing.title,
        listing.county,
        listing.address_line_2 ?? "",
        listing.excerpt,
        listing.description,
        listing.type,
        listing.subtype ?? "",
        listing.status,
        ...(listing.highlights ?? []),
      ]
        .join(" ")
        .toLowerCase()

      const matchesSearch = q === "" || searchable.includes(q)
      const matchesType = typeFilter === "All" || listing.type === typeFilter
      const matchesStatus = statusFilter === "All" || listing.status === statusFilter
      const matchesCounty = countyFilter === "All" || listing.county === countyFilter

      return matchesSearch && matchesType && matchesStatus && matchesCounty
    })
  }, [listings, searchTerm, typeFilter, statusFilter, countyFilter])

  return (
    <main className="min-h-screen bg-stone-50">
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_360px]">
          <div className="overflow-hidden rounded-[32px] border border-stone-200 bg-white shadow-sm">
            <div className="bg-gradient-to-br from-stone-50 via-white to-stone-100 px-5 py-6 sm:px-6 md:px-8 md:py-8">
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-stone-500">
                OpenList
              </p>

              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl md:text-[2.7rem]">
                Listings
              </h1>

              <p className="mt-3 max-w-2xl text-base leading-7 text-stone-600 sm:text-lg sm:leading-8">
                Browse private sale property listings in Ireland, direct from
                sellers.
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/sell"
                  className="inline-flex items-center rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-stone-700"
                >
                  List privately
                </Link>

                <Link
                  href="/my-listings"
                  className="inline-flex items-center rounded-full border border-stone-300 bg-white px-5 py-2.5 text-sm font-medium text-stone-700 transition hover:border-stone-900 hover:text-stone-900"
                >
                  My listings
                </Link>
              </div>
            </div>
          </div>

          <div className="rounded-[32px] border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-stone-500">
              About OpenList
            </p>

            <div className="mt-3 h-px w-10 bg-stone-200" />

            <div className="mt-4 space-y-3 text-sm leading-6 text-stone-600">
              <p>
                OpenList is a private sale platform for homes and sites in Ireland.
              </p>
              <p>
                Listing information is provided by sellers and has not been independently verified.
              </p>
              <p>
                Interested parties should satisfy themselves as to accuracy.
              </p>
            </div>
          </div>
        </div>

        <div className="mb-8 rounded-[28px] border border-stone-200 bg-white p-4 shadow-sm sm:mb-10 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_180px_180px_180px]">
            <div>
              <label
                htmlFor="search"
                className="mb-2 block text-sm font-medium text-stone-700"
              >
                Search
              </label>
              <input
                id="search"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by title, county, local area or keyword"
                className="h-11 w-full rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-stone-500"
              />
            </div>

            <div>
              <label
                htmlFor="type"
                className="mb-2 block text-sm font-medium text-stone-700"
              >
                Type
              </label>
              <select
                id="type"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-11 w-full rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-900 outline-none transition focus:border-stone-500"
              >
                {types.map((type) => (
                  <option key={type} value={type}>
                    {type === "All" ? "Any type" : type}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="status"
                className="mb-2 block text-sm font-medium text-stone-700"
              >
                Sale status
              </label>
              <select
                id="status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-11 w-full rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-900 outline-none transition focus:border-stone-500"
              >
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {status === "All" ? "Any status" : status}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="county"
                className="mb-2 block text-sm font-medium text-stone-700"
              >
                County
              </label>
              <select
                id="county"
                value={countyFilter}
                onChange={(e) => setCountyFilter(e.target.value)}
                className="h-11 w-full rounded-full border border-stone-300 bg-white px-4 text-sm text-stone-900 outline-none transition focus:border-stone-500"
              >
                {counties.map((county) => (
                  <option key={county} value={county}>
                    {county === "All" ? "Any county" : county}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-stone-500">
              {loading
                ? "Loading listings..."
                : `${filteredListings.length} listing${
                    filteredListings.length === 1 ? "" : "s"
                  } found`}
            </p>

            <button
              type="button"
              onClick={() => {
                setSearchTerm("")
                setTypeFilter("All")
                setStatusFilter("All")
                setCountyFilter("All")
              }}
              className="w-full rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 hover:text-stone-900 sm:w-auto"
            >
              Reset filters
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
            Database error: {error}
          </div>
        ) : loading ? (
          <p className="text-stone-600">Loading listings...</p>
        ) : filteredListings.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-2 xl:grid-cols-3">
            {filteredListings.map((listing) => {
              const images =
                listing.images && listing.images.length > 0
                  ? listing.images
                  : listing.image
                    ? [listing.image]
                    : []

              const displayImage = images[0]
              const photoCount = images.length
              const areaDisplay = getAreaDisplay({
                type: listing.type,
                areaValue: listing.area_value,
                areaUnit: listing.area_unit,
              })
              const location = formatLocation(listing.address_line_2, listing.county)

              return (
                <Link
                  key={listing.slug}
                  href={`/listings/${listing.slug}`}
                  className="group block overflow-hidden rounded-[30px] border border-stone-200 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md"
                >
                  <article className="flex h-full flex-col">
                    <div className="relative overflow-hidden">
                      <div className="aspect-[3/2] w-full bg-stone-100">
                        {displayImage ? (
                          <img
                            src={displayImage}
                            alt={listing.title}
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm text-stone-400">
                            No image
                          </div>
                        )}
                      </div>

                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/12 via-transparent to-transparent" />

                      <div className="absolute left-4 top-4 z-10 flex flex-wrap gap-2">
                        <span className="inline-flex items-center rounded-full bg-white/92 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-700 shadow-sm backdrop-blur">
                          {listing.status}
                        </span>
                        {listing.featured && (
                          <span className="inline-flex items-center rounded-full bg-stone-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white shadow-sm backdrop-blur">
                            Featured
                          </span>
                        )}
                      </div>

                      {photoCount > 1 && (
                        <div className="absolute right-4 top-4 z-10">
                          <span className="inline-flex items-center rounded-full bg-white/92 px-3 py-1 text-[11px] font-semibold text-stone-700 shadow-sm backdrop-blur">
                            {photoCount} photos
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col p-5 sm:p-6">
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500 sm:text-xs">
                          {listing.subtype || listing.type}
                        </span>
                        <span className="text-sm text-right text-stone-500">
                          {location}
                        </span>
                      </div>

                      <h2 className="mt-3 line-clamp-2 text-xl font-semibold leading-snug tracking-tight text-stone-900 sm:text-2xl">
                        {listing.title}
                      </h2>

                      <p className="mt-3 line-clamp-2 text-sm leading-7 text-stone-600 sm:text-base">
                        {listing.excerpt}
                      </p>

                      {listing.highlights && listing.highlights.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {listing.highlights.slice(0, 3).map((highlight) => (
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
                        {(listing.type === "House" || listing.type === "Apartment") && (
                          <>
                            <span>{listing.beds || "—"} bed</span>
                            <span>{listing.baths || "—"} bath</span>
                            <span>{areaDisplay}</span>
                          </>
                        )}

                        {listing.type === "Site" && <span>{areaDisplay}</span>}
                        {listing.type === "Commercial" && <span>{areaDisplay}</span>}
                      </div>

                      <div className="mt-auto pt-6">
                        <div className="flex items-end justify-between gap-4 border-t border-stone-100 pt-5">
                          <p className="text-2xl font-semibold tracking-tight text-stone-900">
                            {formatEuro(listing.price)}
                          </p>

                          <span className="inline-flex items-center text-sm font-medium text-stone-600 transition group-hover:text-stone-900">
                            View listing
                            <svg
                              className="ml-2 h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M5 12h14" />
                              <path d="m12 5 7 7-7 7" />
                            </svg>
                          </span>
                        </div>
                      </div>
                    </div>
                  </article>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="rounded-[28px] border border-stone-200 bg-white p-10 text-center shadow-sm">
            <h2 className="text-2xl font-semibold text-stone-900">
              No listings match those filters
            </h2>
            <p className="mt-3 text-stone-600">
              Try widening your search or resetting the filters.
            </p>
          </div>
        )}
      </section>
    </main>
  )
}
