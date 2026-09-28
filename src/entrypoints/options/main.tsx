import "@/utils/zod-config"
import type { Config } from "@/types/config/config"
import type { ThemeMode } from "@/types/config/theme"
import { Provider as JotaiProvider } from "jotai"
import { useHydrateAtoms } from "jotai/utils"
import * as React from "react"
import { ThemeProvider } from "@/components/providers/theme-provider"
import { RecoveryBoundary } from "@/components/recovery/recovery-boundary"
import { Toasts } from "@/components/toast"
import { configAtom } from "@/utils/atoms/config"
import { baseThemeModeAtom } from "@/utils/atoms/theme"
import { getLocalConfig } from "@/utils/config/storage"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { renderPersistentReactRoot } from "@/utils/react-root"
import { applyTheme, getLocalThemeMode, isDarkMode } from "@/utils/theme"
import App from "./app"
import "@/assets/styles/theme.css"
import "./style.css"

function HydrateAtoms({
  initialValues,
  children,
}: {
  initialValues: [
    [typeof configAtom, Config],
    [typeof baseThemeModeAtom, ThemeMode],
  ]
  children: React.ReactNode
}) {
  useHydrateAtoms(initialValues)
  return children
}

async function initApp() {
  const root = document.getElementById("root")!
  root.className = "antialiased bg-background text-foreground"

  const [configValue, themeMode] = await Promise.all([
    getLocalConfig(),
    getLocalThemeMode(),
  ])
  const config = configValue ?? DEFAULT_CONFIG

  applyTheme(document.documentElement, isDarkMode(themeMode) ? "dark" : "light")

  renderPersistentReactRoot(root, (
    <React.StrictMode>
      <JotaiProvider>
        <HydrateAtoms initialValues={[[configAtom, config], [baseThemeModeAtom, themeMode]]}>
          <ThemeProvider>
            <Toasts />
            <RecoveryBoundary>
              <App />
            </RecoveryBoundary>
          </ThemeProvider>
        </HydrateAtoms>
      </JotaiProvider>
    </React.StrictMode>
  ))
}

void initApp()
