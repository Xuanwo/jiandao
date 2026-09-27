import type { Config } from "@/types/config/config"
import type { LLMProviderConfig } from "@/types/config/provider"
import { createServer } from "node:http"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { storage } from "#imports"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { aiTranslate } from "@/utils/host/translate/api/ai"

const requestPaths: string[] = []

const server = createServer((request, response) => {
  requestPaths.push(`${request.method} ${request.url}`)
  request.resume()
  response.setHeader("Content-Type", "application/json")
  response.end(JSON.stringify({
    id: "chatcmpl-1",
    object: "chat.completion",
    created: 0,
    model: "test-model",
    choices: [{ index: 0, message: { role: "assistant", content: "Bonjour" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }))
})

let origin = ""

beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("The test server has no TCP address")
  }
  origin = `http://127.0.0.1:${address.port}`
})

afterEach(async () => {
  requestPaths.length = 0
  await storage.removeItem(`local:${CONFIG_STORAGE_KEY}`)
})

afterAll(async () => {
  await new Promise(resolve => server.close(resolve))
})

async function translateWith(providerConfig: LLMProviderConfig) {
  const config: Config = { ...DEFAULT_CONFIG, providersConfig: [providerConfig] }
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, config)
  return aiTranslate("Hello", "French", providerConfig, async (_targetLang, input) => ({ systemPrompt: "", prompt: input }))
}

describe("translation request base URL", () => {
  it("user enters a base URL with spaces and trailing slashes: Given a custom provider at \" http://host/v1// \", When a text is translated, Then the request reaches /v1/chat/completions", async () => {
    const translation = await translateWith({
      id: "custom-provider",
      name: "Custom Provider",
      enabled: true,
      provider: "openai-compatible",
      apiKey: "test-key",
      baseURL: ` ${origin}/v1// `,
      model: { model: "use-custom-model", isCustomModel: true, customModel: "test-model" },
    })

    expect(translation).toBe("Bonjour")
    expect(requestPaths).toEqual(["POST /v1/chat/completions"])
  })

  it("user overrides the base URL of a built-in provider: Given DeepSeek at http://host/v1/ with spaces, When a text is translated, Then the request reaches /v1/chat/completions", async () => {
    const translation = await translateWith({
      id: "deepseek-default",
      name: "DeepSeek",
      enabled: true,
      provider: "deepseek",
      apiKey: "test-key",
      baseURL: ` ${origin}/v1/ `,
      model: { model: "deepseek-v4-flash", isCustomModel: false, customModel: null },
    })

    expect(translation).toBe("Bonjour")
    expect(requestPaths).toEqual(["POST /v1/chat/completions"])
  })
})
