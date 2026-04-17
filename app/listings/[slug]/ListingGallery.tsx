"use client"

import { useState } from "react"

export default function ListingGallery({
  images,
  title,
}: {
  images: string[]
  title: string
}) {
  const [activeIndex, setActiveIndex] = useState(0)

  if (!images || images.length === 0) {
    return (
      <div className="mb-10 overflow-hidden rounded-3xl bg-slate-100 shadow-sm">
        <div className="aspect-[16/10] w-full flex items-center justify-center text-slate-400">
          No images available
        </div>
      </div>
    )
  }

  const activeImage = images[activeIndex]

  function goPrev() {
    setActiveIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1))
  }

  function goNext() {
    setActiveIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1))
  }

  return (
    <div className="mb-10">
      <div className="relative aspect-[16/10] w-full overflow-hidden rounded-3xl bg-slate-100 shadow-sm">
        <img
          src={activeImage}
          alt={`${title} image ${activeIndex + 1}`}
          className="absolute inset-0 h-full w-full object-cover"
        />

        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              className="absolute left-5 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/65 text-white shadow-lg transition hover:bg-black/80"
              aria-label="Previous image"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>

            <button
              type="button"
              onClick={goNext}
              className="absolute right-5 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/65 text-white shadow-lg transition hover:bg-black/80"
              aria-label="Next image"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>

            <div className="absolute bottom-5 right-5 z-20 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white">
              {activeIndex + 1} / {images.length}
            </div>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
          {images.map((image, index) => {
            const isActive = index === activeIndex

            return (
              <button
                key={`${image}-${index}`}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={`overflow-hidden rounded-2xl border-2 transition ${
                  isActive
                    ? "border-slate-900"
                    : "border-slate-200 hover:border-slate-300"
                }`}
                aria-label={`Show image ${index + 1}`}
              >
                <div className="h-24 w-36 bg-slate-100">
                  <img
                    src={image}
                    alt={`${title} thumbnail ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}