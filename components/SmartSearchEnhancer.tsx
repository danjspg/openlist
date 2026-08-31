"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"

type SmartSearchSuggestion = {
  id: string
  label: string
  detail: string
  href: string
  kind: "place" | "authority" | "category" | "activity" | "sold-prices"
  exact?: boolean
}

type Anchor = { input: HTMLInputElement; scope: "unified" | "planning" }

export default function SmartSearchEnhancer() {
  const router = useRouter()
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [suggestions, setSuggestions] = useState<SmartSearchSuggestion[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0 })
  const requestRef = useRef<AbortController | null>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    function resolveInput(target: EventTarget | null): Anchor | null {
      if (!(target instanceof HTMLInputElement)) return null
      if (target.id === "planning-search") return { input: target, scope: "planning" }
      const action = target.form?.getAttribute("action")
      if (target.name === "q" && action === "/search") return { input: target, scope: "unified" }
      return null
    }

    function updatePosition(input: HTMLInputElement) {
      const rect = input.getBoundingClientRect()
      setPosition({ left: rect.left, top: rect.bottom + 6, width: rect.width })
    }

    async function load(nextAnchor: Anchor) {
      const query = nextAnchor.input.value.trim()
      if (query.length < 2) {
        setSuggestions([])
        setActiveIndex(-1)
        return
      }
      requestRef.current?.abort()
      const controller = new AbortController()
      requestRef.current = controller
      try {
        const response = await fetch(`/api/search/suggestions?q=${encodeURIComponent(query)}&scope=${nextAnchor.scope}`, { signal: controller.signal, headers: { accept: "application/json" } })
        if (!response.ok) return
        const payload = (await response.json()) as { suggestions?: SmartSearchSuggestion[] }
        setSuggestions(payload.suggestions ?? [])
        setActiveIndex(-1)
        updatePosition(nextAnchor.input)
      } catch (error) {
        if ((error as Error).name !== "AbortError") setSuggestions([])
      }
    }

    function choose(suggestion: SmartSearchSuggestion, input: HTMLInputElement) {
      input.value = suggestion.label.replace(/ sold prices$/i, "")
      setSuggestions([])
      setActiveIndex(-1)
      router.push(suggestion.href)
    }

    function onFocus(event: FocusEvent) {
      const resolved = resolveInput(event.target)
      if (!resolved) return
      setAnchor(resolved)
      updatePosition(resolved.input)
      void load(resolved)
    }

    function onInput(event: Event) {
      const resolved = resolveInput(event.target)
      if (!resolved) return
      setAnchor(resolved)
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => void load(resolved), 140)
    }

    function onKeyDown(event: KeyboardEvent) {
      const resolved = resolveInput(event.target)
      if (!resolved || !suggestions.length) return
      if (event.key === "ArrowDown") {
        event.preventDefault()
        setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1))
      } else if (event.key === "ArrowUp") {
        event.preventDefault()
        setActiveIndex((current) => Math.max(current - 1, 0))
      } else if (event.key === "Enter" && activeIndex >= 0) {
        event.preventDefault()
        choose(suggestions[activeIndex], resolved.input)
      } else if (event.key === "Escape") {
        setSuggestions([])
      }
    }

    function onSubmit(event: SubmitEvent) {
      const form = event.target
      if (!(form instanceof HTMLFormElement) || !anchor || anchor.input.form !== form) return
      const queryKey = normalise(anchor.input.value)
      const exact = suggestions.find((item) => item.exact && normalise(item.label.replace(/ sold prices$/i, "")) === queryKey)
      if (!exact) return
      event.preventDefault()
      choose(exact, anchor.input)
    }

    function onScrollOrResize() {
      if (anchor) updatePosition(anchor.input)
    }

    document.addEventListener("focusin", onFocus)
    document.addEventListener("input", onInput)
    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("submit", onSubmit)
    window.addEventListener("resize", onScrollOrResize)
    window.addEventListener("scroll", onScrollOrResize, true)
    return () => {
      document.removeEventListener("focusin", onFocus)
      document.removeEventListener("input", onInput)
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("submit", onSubmit)
      window.removeEventListener("resize", onScrollOrResize)
      window.removeEventListener("scroll", onScrollOrResize, true)
      if (timerRef.current) window.clearTimeout(timerRef.current)
      requestRef.current?.abort()
    }
  }, [activeIndex, anchor, router, suggestions])

  function choose(suggestion: SmartSearchSuggestion) {
    if (!anchor) return
    anchor.input.value = suggestion.label.replace(/ sold prices$/i, "")
    setSuggestions([])
    setActiveIndex(-1)
    router.push(suggestion.href)
  }

  if (!anchor || !suggestions.length || typeof document === "undefined") return null

  return createPortal(
    <div role="listbox" aria-label="Search suggestions" className="fixed z-[100] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl" style={{ left: position.left, top: position.top, width: position.width }}>
      <div className="border-b border-stone-100 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">Go straight to</div>
      {suggestions.map((suggestion, index) => (
        <button key={suggestion.id} type="button" role="option" aria-selected={index === activeIndex} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(suggestion)} className={`flex w-full items-center justify-between gap-4 border-b border-stone-100 px-4 py-3 text-left last:border-b-0 ${index === activeIndex ? "bg-emerald-50" : "bg-white hover:bg-stone-50"}`}>
          <span className="min-w-0"><span className="block truncate text-sm font-semibold text-stone-900">{suggestion.label}</span><span className="mt-0.5 block truncate text-xs text-stone-500">{suggestion.detail}</span></span>
          <span className="shrink-0 text-xs font-semibold text-emerald-800">{suggestion.exact ? "Best match" : "Open"} →</span>
        </button>
      ))}
    </div>,
    document.body
  )
}

function normalise(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ")
}
