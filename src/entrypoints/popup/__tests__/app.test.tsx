// @vitest-environment jsdom
import type { Config } from "@/types/config/config"
import { QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ThemeProvider } from "@/components/providers/theme-provider"
import { TooltipProvider } from "@/components/ui/base-ui/tooltip"
import { configAtom } from "@/utils/atoms/config"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { queryClient } from "@/utils/tanstack-query"
import App from "../app"
import { activeTabAtom, pageTranslationEnabledAtom, translationProgressAtom } from "../atoms"

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
    <QueryClientProvider client={queryClient}>
      <Provider store={store}>
        <ThemeProvider>
          <TooltipProvider>
            <App />
          </TooltipProvider>
        </ThemeProvider>
      </Provider>
    </QueryClientProvider>,
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

  it("shows the agent setup card when the active service has no key", () => {
    renderPopup()

    expect(screen.getByText("popup.setup.title")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "popup.setup.copyInstructions" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "popup.setup.apply" })).toBeDisabled()
    expect(screen.queryByRole("button", { name: /popup\.translate$/ })).toBeNull()
  })

  it("enables applying once a pasted configuration is valid and carries a key", () => {
    renderPopup()
    const textarea = screen.getByLabelText("popup.setup.pasteLabel")

    fireEvent.change(textarea, { target: { value: "not json" } })
    expect(screen.getByText(/Not valid JSON/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "popup.setup.apply" })).toBeDisabled()

    fireEvent.change(textarea, { target: { value: JSON.stringify({ plainly: 1, provider: { type: "openai", apiKey: "sk-…a9f2" } }) } })
    expect(screen.getByText(/popup\.setup\.keyMissing/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "popup.setup.apply" })).toBeDisabled()

    fireEvent.change(textarea, { target: { value: JSON.stringify({ plainly: 1, provider: { type: "openai", apiKey: "sk-real-key", model: "gpt-6-luna" } }) } })
    expect(screen.getByText("OpenAI · gpt-6-luna · api.openai.com")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "popup.setup.apply" })).toBeEnabled()
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
})
