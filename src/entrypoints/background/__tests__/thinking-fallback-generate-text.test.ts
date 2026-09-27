import type { Config } from "@/types/config/config"
import type { LLMProviderConfig } from "@/types/config/provider"
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { storage } from "#imports"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { defaultProvider, OPENAI_REASONING_EFFORT_ERROR, startFakeChatGateway } from "@/utils/providers/__tests__/fake-chat-gateway"
import { runGenerateTextInBackground, setupLLMGenerateTextMessageHandlers } from "../llm-generate-text"

let gateway: Awaited<ReturnType<typeof startFakeChatGateway>>
const { sendMessage } = fakeBrowser.tabs
const TAB_ID = 7
let sent: { tabId: number, type: string, data: unknown }[]

beforeAll(async () => {
  gateway = await startFakeChatGateway()
})

beforeEach(() => {
  fakeBrowser.reset()
  gateway.received.length = 0
  sent = []
  // A fake of tabs.sendMessage(tabId, message) that records what each tab gets.
  fakeBrowser.tabs.sendMessage = async (tabId: number, message: { type: string, data: unknown }) => {
    sent.push({ tabId, type: message.type, data: message.data })
  }
})

afterEach(() => {
  fakeBrowser.tabs.sendMessage = sendMessage
})

afterAll(async () => {
  await gateway.close()
})

async function saveProvider(provider: LLMProviderConfig) {
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, {
    ...DEFAULT_CONFIG,
    providersConfig: DEFAULT_CONFIG.providersConfig.map(config => config.id === provider.id ? provider : config),
  })
}

async function storedOptions(providerId: string) {
  const config = await storage.getItem<Config>(`local:${CONFIG_STORAGE_KEY}`)
  return config?.providersConfig.find(item => item.id === providerId)?.providerOptions
}

it("user's page detects its language with an OpenAI model that rejects none: Given the preset and another option, When OpenAI answers HTTP 400 to the request of the tab, Then the second request has no reasoning effort, the saved options keep only the other option, and the tab gets the reason", async () => {
  // gpt-5-mini accepts reasoning efforts from "minimal" to "high", but not "none".
  gateway.behavior = { rejectedEfforts: ["none"] }
  const provider = { ...defaultProvider("openai"), apiKey: "key", baseURL: gateway.baseURL, model: "gpt-5-mini", providerOptions: { reasoningEffort: "none", textVerbosity: "low" } }
  await saveProvider(provider)

  setupLLMGenerateTextMessageHandlers()
  const tab = await fakeBrowser.tabs.create({ url: "https://example.com" })

  // The listener answers with the promise that it returns, like a webextension-polyfill listener.
  const [result] = await fakeBrowser.runtime.onMessage.trigger(
    { id: 1, type: "backgroundGenerateText", timestamp: Date.now(), data: { providerId: provider.id, prompt: "Hello" } },
    { tab },
  )

  expect(result).toEqual({ res: { text: "Hola" } })
  expect(gateway.received).toEqual([{ reasoning_effort: "none" }, {}])
  expect(await storedOptions(provider.id)).toEqual({ textVerbosity: "low" })
  expect(sent).toEqual([{ tabId: tab.id, type: "notifyThinkingFallback", data: { kind: "removed", reason: OPENAI_REASONING_EFFORT_ERROR } }])
})

it("user's page detects its language with a custom provider behind a strict gateway: Given the preset, When the gateway rejects none, Then the second request uses the thinking switch and the saved options use it", async () => {
  gateway.behavior = { rejectedEfforts: ["none"] }
  const provider = { ...defaultProvider("openai-compatible"), apiKey: "key", baseURL: gateway.baseURL, model: "deepseek-v4.1-flash" }
  await saveProvider(provider)

  const result = await runGenerateTextInBackground({ providerId: provider.id, prompt: "Hello" }, TAB_ID)

  expect(result).toEqual({ text: "Hola" })
  expect(gateway.received).toEqual([{ reasoning_effort: "none" }, { thinking: { type: "disabled" } }])
  expect(await storedOptions(provider.id)).toEqual({ thinking: { type: "disabled" } })
  expect(sent.map(message => message.data)).toEqual([{ kind: "thinking", reason: expect.stringContaining("Invalid option") }])
})

it.each([
  ["no saved config", false],
  ["a provider that the config does not have", true],
])("user's page detects its language with %s: Given the provider ID, When the text is generated, Then it fails with the provider ID and sends no request", async (_case, saveConfig) => {
  if (saveConfig)
    await saveProvider(defaultProvider("openai-compatible"))

  await expect(runGenerateTextInBackground({ providerId: "missing-provider", prompt: "Hello" }, TAB_ID)).rejects.toThrow("Provider missing-provider not found")
  expect(gateway.received).toEqual([])
})
