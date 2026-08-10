"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

type AuthState = {
  isAuthenticated: boolean
  isResolved: boolean
}

const AuthStateContext = createContext<AuthState>({
  isAuthenticated: false,
  isResolved: false,
})

export default function AuthStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isResolved: false,
  })

  useEffect(() => {
    const controller = new AbortController()

    async function resolveAuthState() {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        })
        const payload = response.ok
          ? ((await response.json()) as { authenticated?: boolean })
          : null

        setState({
          isAuthenticated: Boolean(payload?.authenticated),
          isResolved: true,
        })
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return
        setState({ isAuthenticated: false, isResolved: true })
      }
    }

    void resolveAuthState()
    return () => controller.abort()
  }, [])

  const value = useMemo(() => state, [state])

  return (
    <AuthStateContext.Provider value={value}>
      {children}
    </AuthStateContext.Provider>
  )
}

export function useAuthState() {
  return useContext(AuthStateContext)
}
