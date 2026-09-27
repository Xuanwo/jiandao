import type { Config } from "@/types/config/config"
import type { LLMProviderConfig } from "@/types/config/provider"
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { storage } from "#imports"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { defaultProvider, startFakeChatGateway } from "@/utils/providers/__tests__/fake-chat-gateway"
import { setUpWebPageTranslationQueue } from "../translation-queues"

let gateway: Awaited<ReturnType<typeof startFakeChatGateway>>
let provider: LLMProviderConfig
const { sendMessage } = fakeBrowser.tabs

beforeAll(async () => {
  gateway = await startFakeChatGateway()
  provider = { ...defaultProvider("openai-compatible"), apiKey: "key", baseURL: gateway.baseURL, model: "deepseek-v4.1-flash", providerOptions: { reasoningEffort: "none" } }
})

beforeEach(() => {
  fakeBrowser.reset()
  gateway.received.length = 0
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
})

afterEach(() => {
  vi.useRealTimers()
  fakeBrowser.tabs.sendMessage = sendMessage
})

afterAll(async () => {
  await gateway.close()
})

/** Moves the fake clock in small steps and lets the local server answer between them. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  const state = { done: false }
  const tracked = promise.finally(() => {
    state.done = true
  })
  while (!state.done) {
    await vi.advanceTimersByTimeAsync(100)
    await new Promise(resolve => setImmediate(resolve))
  }
  return tracked
}

it("user translates three paragraphs of a page in two requests: Given the preset behind a strict gateway, When both requests use the thinking switch, Then the paragraphs are translated, the saved options use the switch, and only the first save tells the tab", async () => {
  // A gateway in front of DeepSeek V4.1 Flash rejects reasoning_effort "none".
  gateway.behavior = { rejectedEfforts: ["none"] }
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, {
    ...DEFAULT_CONFIG,
    providersConfig: DEFAULT_CONFIG.providersConfig.map(config => config.id === provider.id ? provider : config),
    translate: { ...DEFAULT_CONFIG.translate, providerId: provider.id, batchQueueConfig: { ...DEFAULT_CONFIG.translate.batchQueueConfig, maxItemsPerBatch: 2 } },
  })
  // A fake of tabs.sendMessage(tabId, message) that records what each tab gets.
  const sent: { tabId: number, type: string, data: unknown }[] = []
  fakeBrowser.tabs.sendMessage = async (tabId: number, message: { type: string, data: unknown }) => {
    sent.push({ tabId, type: message.type, data: message.data })
  }
  await setUpWebPageTranslationQueue()
  const tab = await fakeBrowser.tabs.create({ url: "https://example.com" })

  // The listener answers with the promise that it returns, like a webextension-polyfill listener.
  const answers = await settle(Promise.all(["One", "Two", "Three"].map((text, index) => fakeBrowser.runtime.onMessage.trigger(
    { id: index, type: "enqueueTranslateRequest", timestamp: Date.now(), data: { text, langConfig: DEFAULT_CONFIG.language, providerConfig: provider, scheduleAt: Date.now(), hash: "" } },
    { tab },
  ).then((results: unknown[]) => results[0]))))

  expect(answers).toEqual(Array.from({ length: 3 }, () => ({ res: "Hola" })))
  expect(gateway.received.filter(options => options.reasoning_effort === "none")).toHaveLength(2)
  expect(gateway.received.filter(options => options.thinking)).toHaveLength(2)
  const config = await storage.getItem<Config>(`local:${CONFIG_STORAGE_KEY}`)
  expect(config?.providersConfig.find(item => item.id === provider.id)?.providerOptions).toEqual({ thinking: { type: "disabled" } })
  expect(sent).toEqual([{ tabId: tab.id, type: "notifyThinkingFallback", data: { kind: "thinking", reason: expect.stringContaining("Invalid option") } }])
})
