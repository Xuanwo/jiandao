import type { JSONValue } from "ai"
import type { APIProviderConfig } from "@/types/config/provider"
import { describe, expect, it } from "vitest"
import { runWithThinkingFallback } from "../thinking-fallback"
import { defaultProvider } from "./fake-chat-gateway"

interface Rejection {
  message: string
  status: number
}

const PRESET_REJECTION: Rejection = { message: "Invalid option: expected one of \"low\"|\"medium\"|\"high\"|\"xhigh\"|\"max\"", status: 400 }
const THINKING_REJECTION: Rejection = { message: "Unrecognized request argument supplied: thinking", status: 400 }

/** An endpoint error with its HTTP status, like the APICallError of the AI SDK. */
function endpointError({ message, status }: Rejection) {
  return Object.assign(new Error(message), { statusCode: status })
}

/**
 * An endpoint that records the provider options of each request. It fails a
 * request with the preset, with the thinking switch, or with neither, with
 * the given errors.
 */
function fakeEndpoint({ preset = PRESET_REJECTION, thinking, neither }: { preset?: Rejection, thinking?: Rejection, neither?: Rejection } = {}) {
  const received: (Record<string, JSONValue> | undefined)[] = []
  const test = async (config: APIProviderConfig) => {
    const options = config.providerOptions
    received.push(options)
    if (options?.reasoningEffort === "none")
      throw endpointError(preset)
    if (thinking && options?.thinking)
      throw endpointError(thinking)
    if (neither && !options?.thinking)
      throw endpointError(neither)
    return "Hola"
  }
  return { received, test }
}

function providerFor(provider: "openai-compatible" | "deepseek" | "openai", providerOptions: Record<string, JSONValue> | undefined): APIProviderConfig {
  return { ...defaultProvider(provider), apiKey: "key", model: "any-model", providerOptions }
}

const PRESET_AND_TOP_K = { reasoningEffort: "none", topK: 20 }
const THINKING_OFF = { thinking: { type: "disabled" } }

describe("thinking fallback for OpenAI and custom providers", () => {
  it.each([
    [400, PRESET_REJECTION.message],
    [422, "Unsupported value for reasoning_effort: none"],
    [404, "reasoningEffort is not supported by this model"],
  ])("user's endpoint rejects the preset with status %i and %j: Given the preset and another option, When the first request fails, Then the second request uses the thinking switch and the fallback reports why", async (status, message) => {
    const endpoint = fakeEndpoint({ preset: { message, status } })

    const outcome = await runWithThinkingFallback(providerFor("openai-compatible", PRESET_AND_TOP_K), endpoint.test)

    expect(endpoint.received).toEqual([PRESET_AND_TOP_K, { topK: 20, ...THINKING_OFF }])
    expect(outcome).toEqual({ result: "Hola", fallback: { kind: "thinking", options: { topK: 20, ...THINKING_OFF }, reason: message } })
  })

  it.each([
    [{ message: "Invalid API key", status: 401 }],
    [{ message: "Rate limit exceeded for reasoning_effort requests", status: 429 }],
  ])("user's endpoint fails for another reason: Given the error %j, When the first request fails, Then the error shows and there is no second request", async (rejection) => {
    const endpoint = fakeEndpoint({ preset: rejection })

    await expect(runWithThinkingFallback(providerFor("openai-compatible", PRESET_AND_TOP_K), endpoint.test)).rejects.toThrow(rejection.message)
    expect(endpoint.received).toHaveLength(1)
  })

  it.each([
    [{ reasoningEffort: "low" }],
    [{ topK: 20 }],
    [undefined],
  ])("user changed the preset: Given the options %j and an endpoint that rejects them, When the first request fails, Then the error shows and there is no second request", async (options) => {
    const endpoint = fakeEndpoint({ neither: PRESET_REJECTION })

    await expect(runWithThinkingFallback(providerFor("openai-compatible", options), endpoint.test)).rejects.toThrow(PRESET_REJECTION.message)
    expect(endpoint.received).toHaveLength(1)
  })

  it("user's OpenAI model rejects the preset: Given the preset and another option, When OpenAI answers HTTP 400, Then the second request has neither the preset nor the thinking switch, and the fallback removes the preset", async () => {
    const message = "Unsupported value: 'reasoning.effort' does not support 'none' with this model. Supported values are: 'low', 'medium', and 'high'."
    const endpoint = fakeEndpoint({ preset: { message, status: 400 } })

    const outcome = await runWithThinkingFallback(providerFor("openai", PRESET_AND_TOP_K), endpoint.test)

    expect(endpoint.received).toEqual([PRESET_AND_TOP_K, { topK: 20 }])
    expect(outcome).toEqual({ result: "Hola", fallback: { kind: "removed", options: { topK: 20 }, reason: message } })
  })

  it("user tests a DeepSeek provider: Given the same error, When the first request fails, Then the error shows and there is no second request", async () => {
    const endpoint = fakeEndpoint()

    await expect(runWithThinkingFallback(providerFor("deepseek", { reasoningEffort: "none" }), endpoint.test)).rejects.toThrow(PRESET_REJECTION.message)
    expect(endpoint.received).toHaveLength(1)
  })

  it("user's endpoint rejects both switches: Given the preset and another option, When the endpoint also rejects the thinking switch, Then the third request has neither, and the fallback removes them and reports both errors", async () => {
    const endpoint = fakeEndpoint({ thinking: THINKING_REJECTION })

    const outcome = await runWithThinkingFallback(providerFor("openai-compatible", PRESET_AND_TOP_K), endpoint.test)

    expect(endpoint.received).toEqual([PRESET_AND_TOP_K, { topK: 20, ...THINKING_OFF }, { topK: 20 }])
    expect(outcome).toEqual({ result: "Hola", fallback: { kind: "removed", options: { topK: 20 }, reason: `${PRESET_REJECTION.message}; ${THINKING_REJECTION.message}` } })
  })

  it("user set their own thinking option: Given the preset, a thinking option and another option, When the endpoint rejects the preset, Then the second request keeps both options of the user and the fallback removes only the preset", async () => {
    const own = { reasoningEffort: "none", thinking: { type: "enabled", budget_tokens: 512 }, topK: 20 }
    const endpoint = fakeEndpoint()

    const outcome = await runWithThinkingFallback(providerFor("openai-compatible", own), endpoint.test)

    expect(endpoint.received).toEqual([own, { thinking: { type: "enabled", budget_tokens: 512 }, topK: 20 }])
    expect(outcome.fallback).toEqual({ kind: "removed", options: { thinking: { type: "enabled", budget_tokens: 512 }, topK: 20 }, reason: PRESET_REJECTION.message })
  })

  it("user set their own thinking option that the endpoint rejects: Given the preset and a thinking option, When the endpoint rejects both, Then the error shows and the thinking option of the user stays", async () => {
    const endpoint = fakeEndpoint({ thinking: THINKING_REJECTION })

    await expect(runWithThinkingFallback(providerFor("openai-compatible", { reasoningEffort: "none", thinking: { type: "enabled" } }), endpoint.test)).rejects.toThrow(THINKING_REJECTION.message)
    expect(endpoint.received).toEqual([{ reasoningEffort: "none", thinking: { type: "enabled" } }, { thinking: { type: "enabled" } }])
  })

  it.each([
    [{ message: "Invalid API key", status: 401 }],
    [{ message: "Rate limit exceeded for model kimi-k2-thinking", status: 429 }],
    [{ message: "The model kimi-k2-thinking is overloaded", status: 503 }],
  ])("user's endpoint fails for another reason with the thinking switch: Given the error %j, When the second request fails, Then that error shows and there is no third request", async (rejection) => {
    const endpoint = fakeEndpoint({ thinking: rejection })

    await expect(runWithThinkingFallback(providerFor("openai-compatible", PRESET_AND_TOP_K), endpoint.test)).rejects.toThrow(rejection.message)
    expect(endpoint.received).toHaveLength(2)
  })

  it("user's endpoint also fails without both switches: Given it rejects both switches, When the third request fails, Then its error shows", async () => {
    const endpoint = fakeEndpoint({ thinking: THINKING_REJECTION, neither: { message: "Invalid API key", status: 401 } })

    await expect(runWithThinkingFallback(providerFor("openai-compatible", PRESET_AND_TOP_K), endpoint.test)).rejects.toThrow("Invalid API key")
    expect(endpoint.received).toHaveLength(3)
  })
})
