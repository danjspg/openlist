"use client"

import { useEffect, useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"

export type SmartSearchSuggestion = {
  id: string
  label: string
  detail: string
  href: string
  kind: "place" | "authority" | "category" | "activity" | "sold-prices"
  exact?: boolean
}

type Props = {
  name?: string
  defaultValue?: string
  placeholder: string
  ariaLabel: string
  scope?: "unified" | "planning"
  autoFocus?: boolean
  className?: string
  id?: string
}

export default function SmartSearchInput({
  name = "q",
  defaultValue = "",
  placeholder,
  ariaLabel,
  scope = "unified",
  autoFocus = false,
  className = "",
  id,
}: Props) {
  const router = useRouter()
  const generatedId = useId()
  const inputId = id || generatedId
  const listId = `${inputId}-suggestions`
  const [value, setValue] = useState(defaultValue)
  const [suggestions, setSuggestions] = useState<SmartSearchSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const requestRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const query = value.trim()
    if (query.length < 2) {
      setSuggestions([])
      setOpen(false)
      setActiveIndex(-1)
      return
    }

    const timer = window.setTimeout(async () => {
      requestRef.current?.abort()
      const controller = new AbortController()
      requestRef.current = controller
      try {
        const response = await fetch(`/api/search/suggestions?q=${encodeURIComponent(query)}&scope=${scope}`, {
          signal: controller.signal,
          headers: { accept: "application/json" },
        })
        if (!response.ok) return
        const payload = (await response.json()) as { suggestions?: SmartSearchSuggestion[] }
        const next = payload.suggestions ?? []
        setSuggestions(next)
        setOpen(next.length > 0)
        setActiveIndex(-1)
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setSuggestions([])
          setOpen(false)
        }
      }
    }, 140)

    return () => window.clearTimeout(timer)
  }, [scope, value])

  function choose(suggestion: SmartSearchSuggestion) {
    setOpen(false)
    setValue(suggestion.label)
    router.push(suggestion.href)
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input
        id={inputId}
        name={name}
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(event) => {
          if (!open || suggestions.length === 0) return
          if (event.key === "ArrowDown") {
            event.preventDefault()
            setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1))
          } else if (event.key === "ArrowUp") {
            event.preventDefault()
            setActiveIndex((current) => Math.max(current - 1, 0))
          } else if (event.key === "Enter" && activeIndex >= 0) {
            event.preventDefault()
            choose(suggestions[activeIndex])
          } else if (event.key === "Escape") {
            setOpen(false)
          }
        }}
        autoFocus={autoFocus}
        autoComplete="off"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open}
        placeholder={placeholder}
        className={className}
      />
      {open ? (
        <div id={listId} role="listbox" className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl">
          <div className="border-b border-stone-100 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">
            Go straight to
          </div>
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(suggestion)}
              className={`flex w-full items-center justify-between gap-4 border-b border-stone-100 px-4 py-3 text-left last:border-b-0 ${index === activeIndex ? "bg-emerald-50" : "bg-white hover:bg-stone-50"}`}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-stone-900">{suggestion.label}</span>
                <span className="mt-0.5 block truncate text-xs text-stone-500">{suggestion.detail}</span>
              </span>
              <span className="shrink-0 text-xs font-semibold text-emerald-800">{suggestion.exact ? "Best match" : "Open"} →</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
