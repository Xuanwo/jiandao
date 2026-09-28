// @vitest-environment jsdom
import type { Config } from "@/types/config/config"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import { storage } from "#imports"
import { ThemeProvider } from "@/components/providers/theme-provider"
import { configAtom } from "@/utils/atoms/config"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { DEFAULT_TRANSLATE_PROMPT } from "@/utils/constants/prompt"
import { checkConnection } from "@/utils/providers/test-connection"
import App from "../app"

vi.mock("@/utils/message", () => ({
  onMessage: vi.fn(() => vi.fn()),
  sendMessage: vi.fn(() => Promise.resolve(undefined)),
}))

vi.mock("@/components/ui/css-code-editor", () => ({
  CSSCodeEditor: () => <textarea aria-label="css-editor" readOnly />,
}))

vi.mock("@/utils/providers/test-connection", async importOriginal => ({
  ...await importOriginal<typeof import("@/utils/providers/test-connection")>(),
  checkConnection: vi.fn(),
}))

const configured: Config = {
  ...DEFAULT_CONFIG,
  providersConfig: DEFAULT_CONFIG.providersConfig.map(provider => ({
    ...provider,
    apiKey: "sk-abcdefghijkl",
    connectionCheck: { ok: true, checkedAt: Date.now() - 2 * 60 * 60 * 1000 },
  })),
}

async function renderSettings(config: Config = DEFAULT_CONFIG) {
  // The page writes through storage, so storage starts where the atom starts, as it does when the page loads.
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, config)
  const store = createStore()
  store.set(configAtom, config)
  const view = render(
    <Provider store={store}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </Provider>,
  )
  return { ...view, store }
}

const editor = () => screen.getByLabelText("options.service.editorLabel") as HTMLTextAreaElement
const applyButton = () => screen.getByRole("button", { name: "options.service.apply" })

describe("settings page", () => {
  beforeEach(() => {
    fakeBrowser.reset()
    vi.mocked(checkConnection).mockResolvedValue({ ok: true, checkedAt: 1_000 })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it("has three sections in usage order and no advanced or appearance settings", async () => {
    const { container } = await renderSettings(configured)

    expect([...container.querySelectorAll("section[id]")].map(section => section.id)).toEqual(["service", "reading", "quality"])
    expect(screen.queryByText(/options\.advanced|options\.appearance/)).toBeNull()
  })

  it("shows an empty editor right away when no service is configured", async () => {
    await renderSettings()

    expect(screen.getByText("options.service.empty.title")).toBeInTheDocument()
    expect(editor().value).toBe("")
    expect(applyButton()).toBeDisabled()
    expect(screen.queryByRole("button", { name: "options.service.cancel" })).toBeNull()
  })

  it("shows only a preview of a configured service, with its last check and no editor", async () => {
    await renderSettings(configured)

    expect(screen.getByText("OpenAI")).toBeInTheDocument()
    expect(screen.getByText("gpt-6-luna")).toBeInTheDocument()
    expect(screen.getByTestId("service-status")).toHaveTextContent("options.service.status.ok")
    expect(screen.queryByLabelText("options.service.editorLabel")).toBeNull()
  })

  it("opens the editor in place on the current service, masked and selected", async () => {
    await renderSettings(configured)
    fireEvent.click(screen.getByRole("button", { name: "options.service.edit" }))

    expect(JSON.parse(editor().value)).toEqual({ type: "openai", apiKey: "sk-…ijkl", model: "gpt-6-luna" })
    expect(editor().selectionStart).toBe(0)
    expect(editor().selectionEnd).toBe(editor().value.length)
    expect(screen.getByText("options.service.unchanged")).toBeInTheDocument()
    expect(applyButton()).toBeDisabled()

    fireEvent.click(screen.getByRole("button", { name: "options.service.cancel" }))
    expect(screen.queryByLabelText("options.service.editorLabel")).toBeNull()
  })

  it("previews what applying would change and reports invalid text", async () => {
    await renderSettings()

    fireEvent.change(editor(), { target: { value: "not json" } })
    expect(screen.getByText(/Not valid JSON/)).toBeInTheDocument()
    expect(applyButton()).toBeDisabled()

    fireEvent.change(editor(), { target: { value: JSON.stringify({ type: "deepseek", apiKey: "sk-test", model: "deepseek-flash", body: { thinking: { type: "disabled" } } }) } })
    expect(screen.getByText("DeepSeek")).toBeInTheDocument()
    expect(screen.getByText("deepseek-flash")).toBeInTheDocument()
    expect(screen.getByText(/options\.service\.newKey/)).toBeInTheDocument()
    expect(screen.getByText(/options\.service\.thinkingOff/)).toBeInTheDocument()
    expect(applyButton()).toBeEnabled()
  })

  it("checks the connection first and saves the service with the result only when it works", async () => {
    const { store } = await renderSettings()
    fireEvent.change(editor(), { target: { value: JSON.stringify({ type: "deepseek", apiKey: "sk-test", model: "deepseek-flash" }) } })

    await act(async () => {
      fireEvent.click(applyButton())
    })

    await waitFor(() => expect(screen.queryByLabelText("options.service.editorLabel")).toBeNull())
    const saved = store.get(configAtom)
    const service = saved.providersConfig.find(p => p.id === saved.translate.providerId)
    expect(service).toMatchObject({ provider: "deepseek", apiKey: "sk-test", connectionCheck: { ok: true, checkedAt: 1_000 } })
    expect(vi.mocked(checkConnection).mock.calls[0][0]).toMatchObject({ provider: "deepseek", apiKey: "sk-test" })
  })

  it("keeps the current service and stays in the editor when the check fails", async () => {
    vi.mocked(checkConnection).mockResolvedValue({ ok: false, checkedAt: 1_000, error: "401 invalid key" })
    const { store } = await renderSettings(configured)
    fireEvent.click(screen.getByRole("button", { name: "options.service.edit" }))
    fireEvent.change(editor(), { target: { value: JSON.stringify({ type: "deepseek", apiKey: "sk-bad", model: "deepseek-flash" }) } })

    await act(async () => {
      fireEvent.click(applyButton())
    })

    expect(await screen.findByText("options.service.failedNotSaved")).toBeInTheDocument()
    expect(screen.getByText("401 invalid key")).toBeInTheDocument()
    expect(store.get(configAtom)).toEqual(configured)
    expect(editor()).toBeInTheDocument()
  })

  it("stores the result of a separate connection test", async () => {
    vi.mocked(checkConnection).mockResolvedValue({ ok: false, checkedAt: Date.now(), error: "timeout" })
    const { store } = await renderSettings(configured)

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "options.service.test" }))
    })

    await waitFor(() => expect(screen.getByTestId("service-status")).toHaveTextContent("options.service.status.failed"))
    expect(store.get(configAtom).providersConfig[0].connectionCheck).toMatchObject({ ok: false, error: "timeout" })
  })

  it("edits the prompt in place and stores the built-in text as no custom prompt", async () => {
    const { store } = await renderSettings(configured)
    fireEvent.click(screen.getByRole("button", { name: "options.quality.prompt.edit" }))

    const template = screen.getByLabelText("options.quality.prompt.template") as HTMLTextAreaElement
    expect(template.value).toBe(DEFAULT_TRANSLATE_PROMPT)

    fireEvent.change(template, { target: { value: "Translate this" } })
    expect(screen.getByText("options.quality.prompt.missingInput")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "options.quality.prompt.apply" })).toBeDisabled()

    fireEvent.change(template, { target: { value: "Translate tersely: {{input}}" } })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "options.quality.prompt.apply" }))
    })
    expect(store.get(configAtom).translate.customPromptsConfig.patterns[0]).toMatchObject({ prompt: "Translate tersely: {{input}}" })
    expect(screen.getByText("options.quality.prompt.custom")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "options.quality.prompt.edit" }))
    fireEvent.click(screen.getByRole("button", { name: "options.quality.prompt.restore" }))
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "options.quality.prompt.apply" }))
    })
    expect(store.get(configAtom).translate.customPromptsConfig).toEqual({ promptId: null, patterns: [] })
  })
})
