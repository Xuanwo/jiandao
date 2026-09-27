import type { Config } from "@/types/config/config"
import type { LLMProviderConfig } from "@/types/config/provider"
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { storage } from "#imports"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { BATCH_SEPARATOR } from "@/utils/constants/prompt"
import { defaultProvider, startFakeChatGateway } from "@/utils/providers/__tests__/fake-chat-gateway"
import { setUpWebPageTranslationQueue } from "../translation-queues"

let gateway: Awaited<ReturnType<typeof startFakeChatGateway>>
let provider: LLMProviderConfig

beforeAll(async () => {
  gateway = await startFakeChatGateway()
  // The gateway answers one paragraph with two, so a batch never gets one
  // result for each paragraph.
  gateway.behavior = { rejectedEfforts: ["none"], extraParagraph: true }
  provider = { ...defaultProvider("openai-compatible"), apiKey: "key", baseURL: gateway.baseURL, model: "deepseek-v4.1-flash" }
})

beforeEach(async () => {
  fakeBrowser.reset()
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, {
    ...DEFAULT_CONFIG,
    providersConfig: DEFAULT_CONFIG.providersConfig.map(config => config.id === provider.id ? provider : config),
    translate: { ...DEFAULT_CONFIG.translate, providerId: provider.id },
  })
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
})

afterEach(() => {
  vi.useRealTimers()
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

it("user translates a paragraph that the gateway answers as two: Given the preset behind a strict gateway, When the batch falls back to one request for the paragraph, Then the retries and that request use the saved thinking switch without the preset", async () => {
  await setUpWebPageTranslationQueue()
  const tab = await fakeBrowser.tabs.create({ url: "https://example.com" })
  // The listener answers with the promise that it returns, like a webextension-polyfill listener.
  const response = fakeBrowser.runtime.onMessage.trigger(
    { id: 1, type: "enqueueTranslateRequest", timestamp: Date.now(), data: { text: "Hello", langConfig: DEFAULT_CONFIG.language, providerConfig: provider, scheduleAt: Date.now(), hash: "" } },
    { tab },
  ).then((answers: unknown[]) => answers[0])

  expect(await settle(response)).toEqual({ res: `Hola\n\n${BATCH_SEPARATOR}\n\nHola` })
  // Only the first batch request sends the preset. Its three retries and the
  // request for the paragraph use the saved thinking switch at once.
  expect(gateway.received).toEqual([{ reasoning_effort: "none" }, ...Array.from({ length: 5 }, () => ({ thinking: { type: "disabled" } }))])
  const config = await storage.getItem<Config>(`local:${CONFIG_STORAGE_KEY}`)
  expect(config?.providersConfig.find(item => item.id === provider.id)?.providerOptions).toEqual({ thinking: { type: "disabled" } })
})
