import type { Config } from "@/types/config/config"
import type { LLMProviderConfig } from "@/types/config/provider"
import type { WebPagePromptContext } from "@/types/content"
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { storage } from "#imports"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { getTranslatePrompt } from "@/utils/prompts/translate"
import { defaultProvider, startFakeChatGateway } from "@/utils/providers/__tests__/fake-chat-gateway"
import { executeBatchTranslation } from "../translation-queues"

let gateway: Awaited<ReturnType<typeof startFakeChatGateway>>
let provider: LLMProviderConfig
const { sendMessage } = fakeBrowser.tabs
const { set } = fakeBrowser.storage.local

async function storedOptions() {
  const config = await storage.getItem<Config>(`local:${CONFIG_STORAGE_KEY}`)
  return config?.providersConfig.find(item => item.id === provider.id)?.providerOptions
}

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
    translate: { ...DEFAULT_CONFIG.translate, providerId: provider.id },
  })
})

afterEach(() => {
  fakeBrowser.tabs.sendMessage = sendMessage
  fakeBrowser.storage.local.set = set
})

afterAll(async () => {
  await gateway.close()
})

/** A fake of tabs.sendMessage(tabId, message) that records what each tab gets. */
function recordTabMessages() {
  const sent: { tabId: number, type: string, data: unknown }[] = []
  fakeBrowser.tabs.sendMessage = async (tabId: number, message: { type: string, data: unknown }) => {
    sent.push({ tabId, type: message.type, data: message.data })
  }
  return sent
}

it("user translates a page without a connection test: Given a new custom provider with the preset behind a strict gateway, When a batch is translated, Then it is translated with the thinking switch and the saved options use it", async () => {
  const data = { text: "Hello", langConfig: DEFAULT_CONFIG.language, providerConfig: provider, hash: "h", scheduleAt: 0 }

  const result = await executeBatchTranslation<WebPagePromptContext>([data], getTranslatePrompt)

  expect(result).toEqual(["Hola"])
  expect(gateway.received).toEqual([{ reasoning_effort: "none" }, { thinking: { type: "disabled" } }])
  expect(await storedOptions()).toEqual({ topK: 20, thinking: { type: "disabled" } })
})

it("user translates a page with a custom provider that rejects both switches: Given the preset and another option, When the gateway also rejects the thinking switch, Then the batch is translated without either, and the saved options keep only the other option", async () => {
  gateway.behavior = { rejectedEfforts: ["none"], rejectThinking: true }
  const data = { text: "Hello", langConfig: DEFAULT_CONFIG.language, providerConfig: provider, hash: "h", scheduleAt: 0 }

  const result = await executeBatchTranslation<WebPagePromptContext>([data], getTranslatePrompt)

  expect(result).toEqual(["Hola"])
  expect(gateway.received).toEqual([{ reasoning_effort: "none" }, { thinking: { type: "disabled" } }, {}])
  expect(await storedOptions()).toEqual({ topK: 20 })
})

it("user translates a page in two queued batches: Given both batches queued with the preset behind a strict gateway, When the first batch saves the fallback, Then the second batch sends the saved thinking switch in its first request", async () => {
  const queued = ["One", "Two"].map(text => ({ text, langConfig: DEFAULT_CONFIG.language, providerConfig: provider, hash: text, scheduleAt: 0 }))

  await executeBatchTranslation<WebPagePromptContext>([queued[0]], getTranslatePrompt)
  gateway.received.length = 0
  const result = await executeBatchTranslation<WebPagePromptContext>([queued[1]], getTranslatePrompt)

  expect(result).toEqual(["Hola"])
  expect(gateway.received).toEqual([{ thinking: { type: "disabled" } }])
})

it("user translates two paragraphs of a tab in one request: Given the preset behind a strict gateway, When the fallback is saved, Then the tab gets the reason once", async () => {
  const dataList = ["Hello", "World"].map(text => ({ text, langConfig: DEFAULT_CONFIG.language, providerConfig: provider, hash: "h", scheduleAt: 0, tabId: 7 }))
  const sent = recordTabMessages()

  expect(await executeBatchTranslation<WebPagePromptContext>(dataList, getTranslatePrompt)).toEqual(["Hola", "Hola"])

  expect(sent).toEqual([{ tabId: 7, type: "notifyThinkingFallback", data: { kind: "thinking", reason: expect.stringContaining("Invalid option") } }])
})

it("user translates a page when the options cannot be saved: Given storage that rejects writes, When the fallback works, Then the page still gets the translation from that request", async () => {
  const data = { text: "Hello", langConfig: DEFAULT_CONFIG.language, providerConfig: provider, hash: "h", scheduleAt: 0 }
  // The browser rejects a write with this message when the storage quota is full.
  fakeBrowser.storage.local.set = () => Promise.reject(new Error("QUOTA_BYTES quota exceeded"))

  const result = await executeBatchTranslation<WebPagePromptContext>([data], getTranslatePrompt)

  expect(result).toEqual(["Hola"])
  expect(gateway.received).toEqual([{ reasoning_effort: "none" }, { thinking: { type: "disabled" } }])
})

it("user changed the options while the page was translated: Given other saved options and a queued batch with the preset, When the batch is translated, Then it uses the saved options, they stay, and the tab gets no message", async () => {
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, {
    ...DEFAULT_CONFIG,
    providersConfig: DEFAULT_CONFIG.providersConfig.map(config => config.id === provider.id ? { ...provider, providerOptions: { reasoningEffort: "low" } } : config),
  })
  const sent = recordTabMessages()

  const result = await executeBatchTranslation<WebPagePromptContext>([{ text: "Hello", langConfig: DEFAULT_CONFIG.language, providerConfig: provider, hash: "h", scheduleAt: 0, tabId: 7 }], getTranslatePrompt)

  expect(result).toEqual(["Hola"])
  expect(await storedOptions()).toEqual({ reasoningEffort: "low" })
  expect(sent).toEqual([])
})

it("user translates several parts of a page at once: Given parallel requests that all use the fallback, When they save, Then the tab gets the reason once", async () => {
  const sent = recordTabMessages()

  await Promise.all(["One", "Two", "Three"].map(text => executeBatchTranslation<WebPagePromptContext>([{ text, langConfig: DEFAULT_CONFIG.language, providerConfig: provider, hash: text, scheduleAt: 0, tabId: 7 }], getTranslatePrompt)))

  expect(sent).toHaveLength(1)
  expect(await storedOptions()).toEqual({ topK: 20, thinking: { type: "disabled" } })
})
