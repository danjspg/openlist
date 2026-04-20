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
      <div className="mb-6 overflow-hidden rounded-[28px] border border-stone-200 bg-stone-100 shadow-sm sm:mb-8">
        <div className="flex aspect-[4/3] w-full items-center justify-center text-stone-400 md:aspect-[3/2]">
          No images available
        </div>
      </div>
    )
  }

  const safeIndex = Math.min(activeIndex, images.length - 1)
  const activeImage = images[safeIndex]

  function goPrev() {
    setActiveIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1))
  }

  function goNext() {
    setActiveIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1))
  }

  return (
    <div className="mb-6 sm:mb-8">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[28px] border border-stone-200 bg-stone-100 shadow-sm md:aspect-[3/2]">
        <img
          src={activeImage}
          alt={`${title} image ${safeIndex + 1}`}
          className="absolute inset-0 h-full w-full object-cover"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-black/5 to-transparent" />

        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={goPrev}
              className="absolute left-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-stone-900 shadow-lg backdrop-blur transition hover:bg-white sm:left-3 sm:h-11 sm:w-11"
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
              className="absolute right-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-stone-900 shadow-lg backdrop-blur transition hover:bg-white sm:right-3 sm:h-11 sm:w-11"
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

            <div className="absolute bottom-3 right-3 z-20 rounded-full bg-black/70 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
              {safeIndex + 1} / {images.length}
            </div>
          </>
        )}
      </div>

      {images.length > 1 && (
        <div className="relative mt-3 sm:mt-4">
          <div className="flex gap-2.5 overflow-x-auto pb-2 sm:gap-3">
            {images.map((image, index) => {
              const isActive = index === safeIndex

              return (
                <button
                  key={`${image}-${index}`}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`shrink-0 overflow-hidden rounded-xl border bg-white shadow-sm transition ${
                    isActive
                      ? "border-stone-900"
                      : "border-stone-200 hover:border-stone-300"
                  }`}
                  aria-label={`Show image ${index + 1}`}
                >
                  <div className="relative h-16 w-24 bg-stone-100 sm:h-20 sm:w-28 md:h-24 md:w-36">
                    <img
                      src={image}
                      alt={`${title} thumbnail ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                    {isActive && (
                      <div className="absolute inset-0 ring-2 ring-inset ring-stone-900" />
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-white via-white/90 to-transparent" />
        </div>
      )}
    </div>
  )
}