import type { Config } from "@/types/config/config"
import type { LLMProviderConfig } from "@/types/config/provider"
import { createServer } from "node:http"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { storage } from "#imports"
import { setUpWebPageTranslationQueue } from "@/entrypoints/background/translation-queues"
import { isLLMProviderConfig } from "@/types/config/provider"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { generateArticleSummary } from "@/utils/content/summary"
import { aiTranslate } from "@/utils/host/translate/api/ai"

/**
 * Starts a local server with the OpenAI Chat Completions wire contract
 * (https://platform.openai.com/docs/api-reference/chat/create), which the
 * openai-compatible provider uses. It records the model of each request and
 * answers each request with the same text.
 */
async function startChatServer() {
  const models: string[] = []
  const server = createServer(async (request, response) => {
    let body = ""
    for await (const chunk of request)
      body += chunk
    const { model }: { model: string } = JSON.parse(body)
    models.push(model)
    response.setHeader("Content-Type", "application/json")
    response.end(JSON.stringify({
      id: "chatcmpl-test",
      object: "chat.completion",
      created: 1,
      model,
      choices: [{ index: 0, message: { role: "assistant", content: "Hola" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }))
  })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string")
    throw new Error("The local server has no port")
  return {
    baseURL: `http://127.0.0.1:${address.port}/v1`,
    models,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  }
}

let savedServer: Awaited<ReturnType<typeof startChatServer>>
let editedServer: Awaited<ReturnType<typeof startChatServer>>

beforeAll(async () => {
  savedServer = await startChatServer()
  editedServer = await startChatServer()
})

afterAll(async () => {
  await savedServer.close()
  await editedServer.close()
})

type CustomProviderConfig = Extract<LLMProviderConfig, { provider: "openai-compatible" }>

function defaultCustomProvider(): CustomProviderConfig {
  const provider = DEFAULT_CONFIG.providersConfig.find(
    (config): config is CustomProviderConfig => isLLMProviderConfig(config) && config.provider === "openai-compatible",
  )
  if (!provider)
    throw new Error("The default config has no openai-compatible provider")
  return provider
}

const savedProvider = defaultCustomProvider()

function withSettings(url: string, model: string): LLMProviderConfig {
  return {
    ...savedProvider,
    apiKey: "key",
    baseURL: url,
    model: { model: "use-custom-model", isCustomModel: true, customModel: model },
  }
}

describe("provider settings that are not saved yet", () => {
  beforeEach(async () => {
    fakeBrowser.storage.resetState()
    savedServer.models.length = 0
    editedServer.models.length = 0
    const stored: Config = {
      ...DEFAULT_CONFIG,
      providersConfig: DEFAULT_CONFIG.providersConfig.map(config =>
        config.id === savedProvider.id ? withSettings(savedServer.baseURL, "old-model") : config,
      ),
    }
    await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, stored)
  })

  it("user tests settings before they are saved: Given the stored custom provider has an old base URL and model, When a translation runs with the edited settings, Then the request goes to the edited base URL with the edited model", async () => {
    const translation = await aiTranslate("Hello", "Spanish", withSettings(editedServer.baseURL, "new-model"), async () => ({ systemPrompt: "", prompt: "Hello" }))

    expect(translation).toBe("Hola")
    expect(editedServer.models).toEqual(["new-model"])
    expect(savedServer.models).toEqual([])
  })

  it("user gets a page summary with the given settings: Given the stored custom provider has an old base URL and model, When a summary runs with the edited settings, Then the request goes to the edited base URL with the edited model", async () => {
    const summary = await generateArticleSummary("Release notes", "The release adds a new setting.", withSettings(editedServer.baseURL, "new-model"))

    expect(summary).toBe("Hola")
    expect(editedServer.models).toEqual(["new-model"])
    expect(savedServer.models).toEqual([])
  })

  describe("a translate request from a tab", () => {
    // The message listener stays for all tests, because the messaging library
    // accepts only one listener for each message type.
    beforeAll(async () => {
      await setUpWebPageTranslationQueue()
    })

    function translateRequestFromTab(providerConfig: LLMProviderConfig) {
      // An empty hash skips the translation cache, which needs IndexedDB.
      const message = {
        id: 1,
        type: "enqueueTranslateRequest",
        timestamp: Date.now(),
        data: { text: "Hello", langConfig: DEFAULT_CONFIG.language, providerConfig, scheduleAt: Date.now(), hash: "" },
      }
      const sender = { tab: { id: 1, index: 0, highlighted: false, active: true, pinned: false, incognito: false } }
      return fakeBrowser.runtime.onMessage.trigger(message, sender)
    }

    it("user translates a web page: Given the stored custom provider has an old base URL and model, When a tab sends a translate request with other settings, Then the request goes to the stored base URL with the stored model", async () => {
      const responses = await translateRequestFromTab(withSettings(editedServer.baseURL, "new-model"))

      expect(responses).toEqual([{ res: "Hola" }])
      expect(savedServer.models).toEqual(["old-model"])
      expect(editedServer.models).toEqual([])
    })

    it("user translates a web page: Given no stored provider has the id, When a tab sends a translate request with that id, Then the request fails and no server gets a request", async () => {
      const responses = await translateRequestFromTab({ ...withSettings(editedServer.baseURL, "new-model"), id: "unknown-provider" })

      expect(responses).toEqual([{ err: expect.objectContaining({ message: "Provider unknown-provider not found" }) }])
      expect(savedServer.models).toEqual([])
      expect(editedServer.models).toEqual([])
    })
  })
})
