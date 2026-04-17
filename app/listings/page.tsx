"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"

type Listing = {
  id?: number
  slug: string
  seller_email?: string | null
  title: string
  county: string
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
  planning?: string | null
  viewing?: string | null
  created_at?: string
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

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—"
  }

  return new Intl.NumberFormat("en-IE").format(value)
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
        setError(error.message)
      } else {
        setListings((data ?? []) as Listing[])
      }

      setLoading(false)
    }

    loadListings()
  }, [])

  const counties = useMemo(() => {
    const values = Array.from(
      new Set(listings.map((listing) => listing.county))
    ).sort()
    return ["All", ...values]
  }, [listings])

  const types = useMemo(() => {
    const values = Array.from(
      new Set(listings.map((listing) => listing.type))
    ).sort()
    return ["All", ...values]
  }, [listings])

  const statuses = useMemo(() => {
    const values = Array.from(
      new Set(listings.map((listing) => listing.status))
    ).sort()
    return ["All", ...values]
  }, [listings])

  const filteredListings = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()

    return listings.filter((listing) => {
      const searchable = [
        listing.title,
        listing.county,
        listing.excerpt,
        listing.description,
        listing.type,
        listing.status,
        listing.planning ?? "",
      ]
        .join(" ")
        .toLowerCase()

      const matchesSearch = q === "" || searchable.includes(q)
      const matchesType = typeFilter === "All" || listing.type === typeFilter
      const matchesStatus =
        statusFilter === "All" || listing.status === statusFilter
      const matchesCounty =
        countyFilter === "All" || listing.county === countyFilter

      return matchesSearch && matchesType && matchesStatus && matchesCounty
    })
  }, [listings, searchTerm, typeFilter, statusFilter, countyFilter])

  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-slate-500">
            OpenList
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">
            Listings
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-slate-600">
            Beautifully presented homes and sites, designed to feel calm, clear,
            and premium.
          </p>
        </div>

        <div className="mb-10 rounded-[28px] border border-slate-200 bg-slate-50 p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_180px_180px_180px]">
            <div>
              <label
                htmlFor="search"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Search
              </label>
              <input
                id="search"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by title, county, keyword"
                className="h-11 w-full rounded-full border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
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
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-11 w-full rounded-full border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slate-500"
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
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Status
              </label>
              <select
                id="status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-11 w-full rounded-full border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slate-500"
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
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                County
              </label>
              <select
                id="county"
                value={countyFilter}
                onChange={(e) => setCountyFilter(e.target.value)}
                className="h-11 w-full rounded-full border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-slate-500"
              >
                {counties.map((county) => (
                  <option key={county} value={county}>
                    {county === "All" ? "Any county" : county}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
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
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
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
          <p className="text-slate-600">Loading listings...</p>
        ) : filteredListings.length > 0 ? (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 xl:grid-cols-3">
            {filteredListings.map((listing) => {
              const isSite = listing.type === "Site"
              const images =
                listing.images && listing.images.length > 0
                  ? listing.images
                  : listing.image
                    ? [listing.image]
                    : []

              const displayImage = images[0]
              const photoCount = images.length

              return (
                <Link
                  key={listing.slug}
                  href={`/listings/${listing.slug}`}
                  className="group block overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className="relative overflow-hidden">
                    <div className="aspect-[3/2] w-full bg-slate-100">
                      {displayImage ? (
                        <img
                          src={displayImage}
                          alt={listing.title}
                          className="h-full w-full object-cover scale-[1.02] transition duration-700 group-hover:scale-[1.06]"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
                          No image
                        </div>
                      )}
                    </div>

                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />

                    <div className="absolute top-4 left-4 z-10">
                      <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-900 shadow-sm">
                        {listing.status}
                      </span>
                    </div>

                    {photoCount > 1 && (
                      <div className="absolute top-4 right-4 z-10">
                        <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-slate-900 shadow-sm">
                          {photoCount} photos
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="p-6">
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                        {listing.type}
                      </p>
                      <p className="text-sm text-slate-500">{listing.county}</p>
                    </div>

                    <h2 className="mt-3 line-clamp-2 text-2xl font-semibold tracking-tight text-slate-900">
                      {listing.title}
                    </h2>

                    <p className="mt-4 line-clamp-2 text-slate-600">
                      {listing.excerpt}
                    </p>

                    <div className="mt-5 flex flex-wrap gap-4 text-sm text-slate-500">
                      {isSite ? (
                        <>
                          <span>Site Area: {formatNumber(listing.sqft)}</span>
                          {listing.planning && (
                            <span>Planning: {listing.planning}</span>
                          )}
                        </>
                      ) : (
                        <>
                          <span>{formatNumber(listing.beds)} bed</span>
                          <span>{formatNumber(listing.baths)} bath</span>
                          <span>{formatNumber(listing.sqft)} sq ft</span>
                        </>
                      )}
                    </div>

                    <div className="mt-6 flex items-end justify-between gap-4">
                      <p className="text-2xl font-semibold tracking-tight text-slate-900">
                        {formatEuro(listing.price)}
                      </p>

                      <span className="text-sm font-medium text-slate-900 transition group-hover:translate-x-0.5">
                        View details →
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-10 text-center">
            <h2 className="text-2xl font-semibold text-slate-900">
              No listings match those filters
            </h2>
            <p className="mt-3 text-slate-600">
              Try widening your search or resetting the filters.
            </p>
          </div>
        )}
      </section>
    </main>
  )
}