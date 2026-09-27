import type { Config } from "@/types/config/config"
import type { LLMProviderConfig } from "@/types/config/provider"
import { createServer } from "node:http"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { storage } from "#imports"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { generateArticleSummary } from "@/utils/content/summary"
import { aiTranslate } from "@/utils/host/translate/api/ai"

const requests: Record<string, unknown>[] = []

// A local server with the wire contracts of the providers:
// OpenAI Responses (https://platform.openai.com/docs/api-reference/responses/create)
// and Chat Completions (https://platform.openai.com/docs/api-reference/chat/create),
// which the DeepSeek and OpenAI-compatible providers use.
const server = createServer(async (request, response) => {
  let text = ""
  for await (const chunk of request)
    text += chunk
  const body: { model: string } = JSON.parse(text)
  requests.push(body)
  response.setHeader("Content-Type", "application/json")
  if (request.url === "/responses") {
    response.end(JSON.stringify({
      id: "resp-test",
      object: "response",
      created_at: 1,
      status: "completed",
      model: body.model,
      output: [{
        type: "message",
        id: "msg-test",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text: "Result", annotations: [] }],
      }],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    }))
    return
  }
  response.end(JSON.stringify({
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 1,
    model: body.model,
    choices: [{ index: 0, message: { role: "assistant", content: "Result" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }))
})

let baseURL = ""

type Provider = LLMProviderConfig["provider"]

/** The default provider of this type, as a fresh install saves it, with the local server. */
function providerFor(provider: Provider, changes: Partial<LLMProviderConfig> = {}): LLMProviderConfig {
  const defaults = DEFAULT_CONFIG.providersConfig.find(config => config.provider === provider)
  if (!defaults || defaults.provider !== provider)
    throw new Error(`No default ${provider} provider`)
  return { ...defaults, apiKey: "test-key", baseURL, model: defaults.model || "any-model", ...changes }
}

async function saveProvider(providerConfig: LLMProviderConfig) {
  const config: Config = {
    ...DEFAULT_CONFIG,
    providersConfig: DEFAULT_CONFIG.providersConfig.map(config => config.id === providerConfig.id ? providerConfig : config),
  }
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, config)
}

async function translate(providerConfig: LLMProviderConfig) {
  await saveProvider(providerConfig)
  await aiTranslate("Hello", "cmn", providerConfig, async () => ({ systemPrompt: "", prompt: "Translate: Hello" }))
}

/** The wire fields that the saved options of each provider type send. */
const THINKING_OFF_WIRE_FIELDS = {
  "openai": { reasoning: { effort: "none" } },
  "deepseek": { thinking: { type: "disabled" } },
  "openai-compatible": { reasoning_effort: "none" },
} as const

function thinkingFields(request: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(request).filter(([key]) => ["reasoning", "reasoning_effort", "thinking"].includes(key)))
}

beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string")
    throw new Error("The test server has no port")
  baseURL = `http://127.0.0.1:${address.port}`
  fakeBrowser.reset()
})

beforeEach(() => {
  requests.length = 0
})

afterAll(async () => {
  await new Promise(resolve => server.close(resolve))
})

// Each provider uses its default model. @ai-sdk/openai sends reasoning options
// only for models that it knows as reasoning models, such as gpt-6-luna.
describe.each([
  ["openai", "gpt-6-luna"],
  ["deepseek", "deepseek-flash"],
  ["openai-compatible", "any-model"],
] as const)("the saved provider options of a new %s provider", (provider, model) => {
  it("user translates a paragraph: Given the provider options of a new provider, When the request is sent, Then thinking is off", async () => {
    await translate(providerFor(provider, { model }))

    expect(requests).toHaveLength(1)
    expect(thinkingFields(requests[0])).toEqual(THINKING_OFF_WIRE_FIELDS[provider])
  })

  it("user reads a page with page context: Given the provider options of a new provider, When the summary is made, Then thinking is off", async () => {
    const providerConfig = providerFor(provider, { model })
    await saveProvider(providerConfig)
    await generateArticleSummary("Release notes", "The release adds a setting.", providerConfig)

    expect(requests).toHaveLength(1)
    expect(thinkingFields(requests[0])).toEqual(THINKING_OFF_WIRE_FIELDS[provider])
  })

  it("user removes the provider options: Given no saved options, When a paragraph is translated, Then the request has no thinking option", async () => {
    await translate(providerFor(provider, { model, providerOptions: undefined }))

    expect(thinkingFields(requests[0])).toEqual({})
  })
})

it("user upgrades with a DeepSeek model that had hidden options: Given deepseek-v4-flash and no saved options, When a paragraph is translated, Then the request has no thinking option", async () => {
  await translate(providerFor("deepseek", { model: "deepseek-v4-flash", providerOptions: undefined }))

  expect(thinkingFields(requests[0])).toEqual({})
})

it("user turns thinking on for DeepSeek: Given edited provider options, When a paragraph is translated, Then only the edited options are sent", async () => {
  await translate(providerFor("deepseek", { providerOptions: { thinking: { type: "enabled" } } }))

  expect(thinkingFields(requests[0])).toEqual({ thinking: { type: "enabled" } })
})

it("user sets a reasoning effort for a custom provider: Given edited provider options, When a paragraph is translated, Then only the edited options are sent", async () => {
  await translate(providerFor("openai-compatible", { providerOptions: { reasoningEffort: "low" } }))

  expect(thinkingFields(requests[0])).toEqual({ reasoning_effort: "low" })
})
