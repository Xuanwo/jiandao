// @vitest-environment jsdom
import type { Config } from "@/types/config/config"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, describe, expect, it, vi } from "vitest"
import { storage } from "#imports"
import { ThemeProvider } from "@/components/providers/theme-provider"
import { configAtom } from "@/utils/atoms/config"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { sendMessage } from "@/utils/message"
import { openOptionsPage } from "@/utils/navigation"
import App from "../app"
import { activeTabAtom, pageTranslationEnabledAtom, translationProgressAtom } from "../atoms"

vi.mock("@/utils/navigation", () => ({
  openOptionsPage: vi.fn(() => Promise.resolve()),
}))

vi.mock("@/utils/message", () => ({
  onMessage: vi.fn(() => vi.fn()),
  sendMessage: vi.fn(() => Promise.resolve(undefined)),
}))

function renderPopup({ config = DEFAULT_CONFIG, enabled = false, translatable = true }: { config?: Config, enabled?: boolean, translatable?: boolean } = {}) {
  const store = createStore()
  store.set(configAtom, config)
  store.set(activeTabAtom, { id: 1, url: translatable ? "https://example.com/" : "chrome://newtab/", translatable })
  store.set(pageTranslationEnabledAtom, enabled)
  store.set(translationProgressAtom, enabled ? { total: 20, done: 5, failed: 0 } : null)

  return render(
    <Provider store={store}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </Provider>,
  )
}

const configWithKey: Config = {
  ...DEFAULT_CONFIG,
  providersConfig: DEFAULT_CONFIG.providersConfig.map(provider =>
    provider.id === DEFAULT_CONFIG.translate.providerId ? { ...provider, apiKey: "sk-test" } : provider,
  ),
}

describe("popup app", () => {
  afterEach(() => {
    cleanup()
  })

  it("points to the settings page instead of configuring anything while the service has no key", () => {
    renderPopup()

    expect(screen.getByText("popup.setup.title")).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.queryByRole("button", { name: /popup\.translate$/ })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "popup.setup.openSettings" }))
    expect(openOptionsPage).toHaveBeenCalledWith({ section: "service" })
  })

  it("shows the translate action and display mode once a key is set", () => {
    renderPopup({ config: configWithKey })

    expect(screen.getByRole("button", { name: /popup\.translate/ })).toBeEnabled()
    expect(screen.getByRole("group", { name: "popup.displayMode" })).toBeInTheDocument()
    expect(screen.queryByText("popup.setup.title")).toBeNull()
  })

  it("offers to show the original and reports progress while translating", () => {
    renderPopup({ config: configWithKey, enabled: true })

    expect(screen.getByRole("button", { name: /popup\.showOriginal/ })).toBeInTheDocument()
    expect(screen.getByText("popup.translating")).toBeInTheDocument()
    expect(screen.getByText("5 / 20")).toBeInTheDocument()
  })

  it("disables translation on pages the content script cannot reach", () => {
    renderPopup({ config: configWithKey, translatable: false })

    expect(screen.getByRole("button", { name: /popup\.translate/ })).toBeDisabled()
    expect(screen.getByText("popup.notTranslatable")).toBeInTheDocument()
  })

  it("catches up with progress that finished while it was opening", async () => {
    // The last report reached the background after the popup read it and before the popup listened.
    vi.mocked(sendMessage).mockImplementation(((type: string) => Promise.resolve(
      type === "getTranslationProgressByTabId" ? { total: 20, done: 20, failed: 0 } : type === "getEnablePageTranslationByTabId" ? true : undefined,
    )) as typeof sendMessage)
    // The popup keeps its config in step with storage, so storage holds the same config.
    await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, configWithKey)
    renderPopup({ config: configWithKey, enabled: true })

    await waitFor(() => expect(screen.getByText("popup.translated")).toBeInTheDocument())
    vi.mocked(sendMessage).mockImplementation((() => Promise.resolve(undefined)) as typeof sendMessage)
  })
})
