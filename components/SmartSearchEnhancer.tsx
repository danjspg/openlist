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

  const anchorRef = useRef<Anchor | null>(null)
  const suggestionsRef = useRef<SmartSearchSuggestion[]>([])
  const activeIndexRef = useRef(-1)
  const requestRef = useRef<AbortController | null>(null)
  const timerRef = useRef<number | null>(null)
  const routerRef = useRef(router)

  useEffect(() => {
    routerRef.current = router
  }, [router])

  useEffect(() => {
    anchorRef.current = anchor
  }, [anchor])

  useEffect(() => {
    suggestionsRef.current = suggestions
  }, [suggestions])

  useEffect(() => {
    activeIndexRef.current = activeIndex
  }, [activeIndex])

  useEffect(() => {
    function resolveInput(target: EventTarget | null): Anchor | null {
      if (!(target instanceof HTMLInputElement)) return null
      if (target.id === "planning-search") return { input: target, scope: "planning" }
      if (target.name !== "q" || !target.form) return null

      const rawAction = target.form.getAttribute("action") || target.form.action
      let actionPath = rawAction
      try {
        actionPath = new URL(rawAction, window.location.href).pathname
      } catch {
        // Keep the raw action if it is not a valid URL.
      }
      if (actionPath === "/search") return { input: target, scope: "unified" }
      if (actionPath === "/planning" || actionPath.startsWith("/planning/")) return { input: target, scope: "planning" }
      return null
    }

    function updatePosition(input: HTMLInputElement) {
      const rect = input.getBoundingClientRect()
      setPosition({ left: rect.left, top: rect.bottom + 6, width: rect.width })
    }

    function setCurrentAnchor(nextAnchor: Anchor) {
      const current = anchorRef.current
      if (current?.input === nextAnchor.input && current.scope === nextAnchor.scope) return
      anchorRef.current = nextAnchor
      setAnchor(nextAnchor)
    }

    function setCurrentSuggestions(next: SmartSearchSuggestion[]) {
      suggestionsRef.current = next
      activeIndexRef.current = -1
      setSuggestions(next)
      setActiveIndex(-1)
    }

    async function load(nextAnchor: Anchor) {
      const query = nextAnchor.input.value.trim()
      if (query.length < 2) {
        setCurrentSuggestions([])
        return
      }

      requestRef.current?.abort()
      const controller = new AbortController()
      requestRef.current = controller
      try {
        const response = await fetch(`/api/search/suggestions?q=${encodeURIComponent(query)}&scope=${nextAnchor.scope}`, {
          signal: controller.signal,
          headers: { accept: "application/json" },
        })
        if (!response.ok) {
          setCurrentSuggestions([])
          return
        }
        const payload = (await response.json()) as { suggestions?: SmartSearchSuggestion[] }
        if (controller.signal.aborted || anchorRef.current?.input !== nextAnchor.input) return
        setCurrentSuggestions(payload.suggestions ?? [])
        updatePosition(nextAnchor.input)
      } catch (error) {
        if ((error as Error).name !== "AbortError") setCurrentSuggestions([])
      }
    }

    function choose(suggestion: SmartSearchSuggestion) {
      setCurrentSuggestions([])
      routerRef.current.push(suggestion.href)
    }

    function onFocus(event: FocusEvent) {
      const resolved = resolveInput(event.target)
      if (!resolved) return
      setCurrentAnchor(resolved)
      updatePosition(resolved.input)
      void load(resolved)
    }

    function onInput(event: Event) {
      const resolved = resolveInput(event.target)
      if (!resolved) return
      setCurrentAnchor(resolved)
      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => void load(resolved), 140)
    }

    function onKeyDown(event: KeyboardEvent) {
      const resolved = resolveInput(event.target)
      const currentSuggestions = suggestionsRef.current
      if (!resolved || !currentSuggestions.length) return

      if (event.key === "ArrowDown") {
        event.preventDefault()
        const next = Math.min(activeIndexRef.current + 1, currentSuggestions.length - 1)
        activeIndexRef.current = next
        setActiveIndex(next)
      } else if (event.key === "ArrowUp") {
        event.preventDefault()
        const next = Math.max(activeIndexRef.current - 1, 0)
        activeIndexRef.current = next
        setActiveIndex(next)
      } else if (event.key === "Enter" && activeIndexRef.current >= 0) {
        event.preventDefault()
        choose(currentSuggestions[activeIndexRef.current])
      } else if (event.key === "Escape") {
        setCurrentSuggestions([])
      }
    }

    function onSubmit(event: SubmitEvent) {
      const form = event.target
      const currentAnchor = anchorRef.current
      if (!(form instanceof HTMLFormElement) || !currentAnchor || currentAnchor.input.form !== form) return
      const queryKey = normalise(currentAnchor.input.value)
      const exact = suggestionsRef.current.find((item) => item.exact && normalise(item.label.replace(/ sold prices$/i, "")) === queryKey)
      if (!exact) return
      event.preventDefault()
      choose(exact)
    }

    function onScrollOrResize() {
      const currentAnchor = anchorRef.current
      if (currentAnchor) updatePosition(currentAnchor.input)
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
  }, [])

  function choose(suggestion: SmartSearchSuggestion) {
    suggestionsRef.current = []
    activeIndexRef.current = -1
    setSuggestions([])
    setActiveIndex(-1)
    router.push(suggestion.href)
  }

  if (!anchor || !suggestions.length || typeof document === "undefined") return null

  return createPortal(
    <div role="listbox" aria-label="Search suggestions" className="fixed z-[100] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl" style={{ left: position.left, top: position.top, width: position.width }}>
      <div className="border-b border-stone-100 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">Go straight to</div>
      {suggestions.map((suggestion, index) => (
        <button key={suggestion.id} type="button" role="option" aria-selected={index === activeIndex} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => { activeIndexRef.current = index; setActiveIndex(index) }} onClick={() => choose(suggestion)} className={`flex w-full items-center justify-between gap-4 border-b border-stone-100 px-4 py-3 text-left last:border-b-0 ${index === activeIndex ? "bg-emerald-50" : "bg-white hover:bg-stone-50"}`}>
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
