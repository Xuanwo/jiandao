// @vitest-environment jsdom
import type { JSONValue } from "ai"
import type { APIProviderConfig } from "@/types/config/provider"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Toaster } from "sonner"
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { storage } from "#imports"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { defaultProvider, startFakeChatGateway } from "@/utils/providers/__tests__/fake-chat-gateway"
import { APIKeyField } from "../api-key-field"
import { formOpts, useAppForm } from "../form"

let gateway: Awaited<ReturnType<typeof startFakeChatGateway>>
let provider: APIProviderConfig

beforeAll(async () => {
  gateway = await startFakeChatGateway()
  provider = { ...defaultProvider("openai-compatible"), apiKey: "key", baseURL: gateway.baseURL, model: "deepseek-v4.1-flash", providerOptions: { reasoningEffort: "none", topK: 20 } }
})

beforeEach(async () => {
  fakeBrowser.reset()
  gateway.received.length = 0
  // A gateway in front of DeepSeek V4.1 Flash rejects reasoning_effort "none".
  gateway.behavior = { rejectedEfforts: ["none"] }
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, {
    ...DEFAULT_CONFIG,
    providersConfig: DEFAULT_CONFIG.providersConfig.map(config => config.id === provider.id ? provider : config),
  })
})

afterAll(async () => {
  await gateway.close()
})

/** Renders the API key field of the provider form, and records each save of the form. */
function renderField() {
  const saves: APIProviderConfig[] = []
  const formControls: { setProviderOptions?: (options: Record<string, JSONValue>) => void } = {}
  function ProviderFormWithKeyField() {
    const form = useAppForm({ ...formOpts, defaultValues: provider, onSubmit: ({ value }) => {
      saves.push(value)
    } })
    formControls.setProviderOptions = options => form.setFieldValue("providerOptions", options)
    return <APIKeyField form={form} />
  }
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <ProviderFormWithKeyField />
      <Toaster />
    </QueryClientProvider>,
  )
  const resultIcon = () => view.container.querySelector(".tabler-icon-check, .tabler-icon-x")
  const setProviderOptions = (options: Record<string, JSONValue>) => act(() => {
    if (!formControls.setProviderOptions)
      throw new Error("The form is not rendered")
    formControls.setProviderOptions(options)
  })
  return { saves, resultIcon, setProviderOptions }
}

function testConnection() {
  fireEvent.click(screen.getByRole("button", { name: "options.providers.form.testConnection.button" }))
}

it("user tests a custom provider behind a strict gateway: Given the preset and another option, When the gateway rejects none, Then the thinking switch works, the form saves it with the other option and tells why", async () => {
  const { saves, resultIcon } = renderField()

  testConnection()

  await waitFor(() => expect(resultIcon()).toHaveClass("tabler-icon-check"))
  expect(gateway.received).toEqual([{ reasoning_effort: "none" }, { thinking: { type: "disabled" } }])
  expect(saves.at(-1)?.providerOptions).toEqual({ topK: 20, thinking: { type: "disabled" } })
  expect(await screen.findByText("translation.thinkingFallback")).toBeInTheDocument()
})

it("user tests a custom provider that rejects both switches: Given the preset and another option, When the gateway also rejects the thinking switch, Then the form saves only the other option and tells why", async () => {
  gateway.behavior = { rejectedEfforts: ["none"], rejectThinking: true }
  const { saves, resultIcon } = renderField()

  testConnection()

  await waitFor(() => expect(resultIcon()).toHaveClass("tabler-icon-check"))
  expect(saves.at(-1)?.providerOptions).toEqual({ topK: 20 })
  expect(await screen.findByText("translation.thinkingRemoved")).toBeInTheDocument()
})

it("user edits the options during a test: Given the gateway rejects none, When the user changes the options before the second request ends, Then the test keeps the user's options and hides its result", async () => {
  const { promise: holdThinking, resolve: release } = Promise.withResolvers<void>()
  gateway.behavior = { rejectedEfforts: ["none"], holdThinking }
  const { saves, resultIcon, setProviderOptions } = renderField()

  testConnection()
  await waitFor(() => expect(gateway.received).toHaveLength(2))
  await setProviderOptions({ reasoningEffort: "low" })
  release()

  await waitFor(() => expect(screen.getByRole("button", { name: "options.providers.form.testConnection.button" })).toBeEnabled())
  expect(resultIcon()).toBeNull()
  expect(saves.map(save => save.providerOptions)).not.toContainEqual({ topK: 20, thinking: { type: "disabled" } })
})
