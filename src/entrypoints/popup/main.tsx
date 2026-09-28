import "@/utils/zod-config"
import type { ActiveTabInfo } from "./atoms"
import type { Config } from "@/types/config/config"
import type { TranslationProgress } from "@/types/translation-progress"
import { Provider as JotaiProvider } from "jotai"
import { useHydrateAtoms } from "jotai/utils"
import * as React from "react"
import { browser } from "#imports"
import { ThemeProvider } from "@/components/providers/theme-provider"
import { RecoveryBoundary } from "@/components/recovery/recovery-boundary"
import { Toasts } from "@/components/toast"
import { configAtom } from "@/utils/atoms/config"
import { getLocalConfig } from "@/utils/config/storage"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { sendMessage } from "@/utils/message"
import { renderPersistentReactRoot } from "@/utils/react-root"
import App from "./app"
import { activeTabAtom, isTranslatableUrl, pageTranslationEnabledAtom, translationProgressAtom } from "./atoms"
import "@/assets/styles/text-small.css"
import "@/assets/styles/theme.css"

function HydrateAtoms({
  initialValues,
  children,
}: {
  initialValues: [
    [typeof configAtom, Config],
    [typeof activeTabAtom, ActiveTabInfo],
    [typeof pageTranslationEnabledAtom, boolean],
    [typeof translationProgressAtom, TranslationProgress | null],
  ]
  children: React.ReactNode
}) {
  useHydrateAtoms(initialValues)
  return children
}

async function initApp() {
  const root = document.getElementById("root")!
  root.className = "text-base antialiased w-[320px] bg-background text-foreground"

  const [configValue, [activeTab]] = await Promise.all([
    getLocalConfig(),
    browser.tabs.query({ active: true, currentWindow: true }),
  ])
  const config = configValue ?? DEFAULT_CONFIG

  const tabId = activeTab?.id ?? null
  const tabInfo: ActiveTabInfo = {
    id: tabId,
    url: activeTab?.url ?? "",
    translatable: isTranslatableUrl(activeTab?.url),
  }

  let enabled = false
  let progress: TranslationProgress | null = null
  if (tabId !== null) {
    const [enabledResult, progressResult] = await Promise.all([
      sendMessage("getEnablePageTranslationByTabId", { tabId }).catch(() => false),
      sendMessage("getTranslationProgressByTabId", { tabId }).catch(() => null),
    ])
    enabled = enabledResult ?? false
    progress = progressResult ?? null
  }

  renderPersistentReactRoot(root, (
    <React.StrictMode>
      <JotaiProvider>
        <HydrateAtoms
          initialValues={[
            [configAtom, config],
            [activeTabAtom, tabInfo],
            [pageTranslationEnabledAtom, enabled],
            [translationProgressAtom, progress],
          ]}
        >
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
