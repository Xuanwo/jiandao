export type Theme = "light" | "dark"

/** Jiandao's own pages always follow the system appearance; there is no preference to store. */
export function getSystemTheme(): Theme {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light"
}

export function applyTheme(target: HTMLElement, theme: Theme) {
  target.classList.remove("light", "dark")
  target.classList.add(theme)
  target.style.colorScheme = theme
}
