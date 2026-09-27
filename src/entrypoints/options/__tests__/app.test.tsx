// @vitest-environment jsdom
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

vi.mock("@/utils/message", () => ({
  onMessage: vi.fn(() => vi.fn()),
  sendMessage: vi.fn(() => Promise.resolve(undefined)),
}))

vi.mock("@/components/ui/css-code-editor", () => ({
  CSSCodeEditor: () => <textarea aria-label="css-editor" readOnly />,
}))

function renderSettings() {
  const store = createStore()
  store.set(configAtom, DEFAULT_CONFIG)

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

describe("settings page", () => {
  afterEach(() => {
    cleanup()
  })

  it("renders every section on one page in usage order", () => {
    const { container } = renderSettings()

    const sectionIds = [...container.querySelectorAll("section[id]")].map(section => section.id)
    expect(sectionIds).toEqual(["service", "reading", "quality", "advanced"])
  })

  it("shows the service in use read-only, with the import and agent actions instead of a form", () => {
    const { container } = renderSettings()

    // One service, no selection: the card names the service in use and where page text goes.
    expect(container.querySelector("#service input[type=radio]")).toBeNull()
    expect(screen.getByText("OpenAI")).toBeInTheDocument()
    expect(screen.getByText("options.service.status.unconfigured")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "options.service.paste.open" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "options.service.copyInstructions" })).toBeInTheDocument()
    // No editable field in the service section: the service is configured through an agent.
    expect(container.querySelector("#service textarea, #service input")).toBeNull()
  })

  it("opens the paste box with a preview once a valid configuration is pasted", () => {
    renderSettings()

    fireEvent.click(screen.getByRole("button", { name: "options.service.paste.open" }))
    const textarea = screen.getByLabelText("options.service.paste.label")
    expect(screen.getByRole("button", { name: "options.service.paste.apply" })).toBeDisabled()

    fireEvent.change(textarea, { target: { value: JSON.stringify({ plainly: 1, provider: { type: "deepseek", apiKey: "sk-test", model: "deepseek-flash" } }) } })

    expect(screen.getByText("DeepSeek", { selector: "span" })).toBeInTheDocument()
    expect(screen.getByText("deepseek-flash", { selector: "span" })).toBeInTheDocument()
    expect(screen.getByText("options.service.sendsTo")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "options.service.paste.apply" })).toBeEnabled()
  })

  it("keeps the advanced knobs collapsed until opened", () => {
    renderSettings()

    expect(screen.queryByLabelText("options.advanced.rate")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /options\.advanced\.title/ }))
    expect(screen.getByLabelText("options.advanced.rate")).toBeInTheDocument()
  })
})
