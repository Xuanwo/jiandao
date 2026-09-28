import type { Theme } from "@/utils/theme"
import { useLayoutEffect, useSyncExternalStore } from "react"
import { applyTheme, getSystemTheme } from "@/utils/theme"

const DARK_QUERY = "(prefers-color-scheme: dark)"

function subscribeToSystemTheme(onChange: () => void) {
  const query = window?.matchMedia?.(DARK_QUERY)
  if (!query)
    return () => {}
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

/** Applies the system appearance to the document, or to a shadow root container, and follows its changes. */
export function ThemeProvider({
  children,
  container,
}: {
  children: React.ReactNode
  container?: HTMLElement
}) {
  const theme: Theme = useSyncExternalStore(subscribeToSystemTheme, getSystemTheme)

  useLayoutEffect(() => {
    applyTheme(container ?? document.documentElement, theme)
  }, [theme, container])

  return children
}
