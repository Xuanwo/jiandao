import { describe, expect, it } from "vitest"
import {
  getProviderOptions,
  getProviderOptionsWithOverride,
  getRecommendedProviderOptionsMatch,
} from "../../providers/options"

describe("getProviderOptions", () => {
  it("returns options for OpenAI reasoning models", () => {
    expect(getProviderOptions("o1-preview", "openai").openai?.reasoningEffort).toBe("minimal")
    expect(getProviderOptions("o3-mini", "openai").openai?.reasoningEffort).toBe("minimal")
    expect(getProviderOptions("o4-mini", "openai").openai?.reasoningEffort).toBe("minimal")
    expect(getProviderOptions("O4-Mini", "openai").openai?.reasoningEffort).toBe("minimal")
  })

  it("returns documented GPT-5 reasoning defaults", () => {
    expect(getProviderOptions("gpt-5.4-pro", "openai").openai?.reasoningEffort).toBe("medium")
    expect(getProviderOptions("GPT-5.4-Pro", "openai").openai?.reasoningEffort).toBe("medium")
    expect(getProviderOptions("gpt-5.2-pro", "openai").openai?.reasoningEffort).toBe("medium")
    expect(getProviderOptions("gpt-5-pro", "openai").openai?.reasoningEffort).toBe("high")
    expect(getProviderOptions("gpt-5.4", "openai").openai?.reasoningEffort).toBe("none")
    expect(getProviderOptions("gpt-5.2", "openai").openai?.reasoningEffort).toBe("none")
    expect(getProviderOptions("gpt-5", "openai").openai?.reasoningEffort).toBe("minimal")
    expect(getProviderOptions("gpt-5-mini", "openai").openai?.reasoningEffort).toBe("minimal")
  })

  it("omits recommendations for GPT-5 chat-latest models", () => {
    expect(getProviderOptions("gpt-5-chat-latest", "openai")).toEqual({})
    expect(getProviderOptions("gpt-5.1-chat-latest", "openai")).toEqual({})
    expect(getProviderOptions("gpt-5.2-chat-latest", "openai")).toEqual({})
    expect(getProviderOptions("gpt-5.3-chat-latest", "openai")).toEqual({})
  })

  it("returns DeepSeek thinking defaults", () => {
    expect(getProviderOptions("deepseek-reasoner", "deepseek").deepseek?.thinking).toEqual({ type: "disabled" })
    expect(getProviderOptions("deepseek-v4-flash", "deepseek").deepseek?.thinking).toEqual({ type: "disabled" })
    expect(getProviderOptions("DeepSeek-V4-Flash", "deepseek").deepseek?.thinking).toEqual({ type: "disabled" })
    expect(getProviderOptions("deepseek-v4-pro", "deepseek").deepseek?.thinking).toEqual({ type: "disabled" })
  })

  it("returns empty object for non-matching models", () => {
    expect(getProviderOptions("some-random-model", "openai")).toEqual({})
  })

  it("treats an explicit empty provider options object as a user override", () => {
    expect(getProviderOptionsWithOverride("gpt-5-mini", "openai", {})).toEqual({ openai: {} })
  })

  it("falls back to recommendations when user options are undefined", () => {
    expect(getProviderOptionsWithOverride("gpt-5-mini", "openai")).toEqual({ openai: { reasoningEffort: "minimal" } })
  })

  it("uses user options as-is without merging matched defaults", () => {
    expect(getProviderOptionsWithOverride("gpt-5-mini", "openai", { foo: "bar" })).toEqual({ openai: { foo: "bar" } })
  })

  it("normalizes common OpenAI-compatible snake_case aliases", () => {
    const options = getProviderOptionsWithOverride("gpt-5-mini", "openai-compatible", {
      reasoning_effort: "minimal",
      verbosity: "low",
      foo: "bar",
    })

    expect(options).toEqual({
      "openai-compatible": {
        reasoningEffort: "minimal",
        textVerbosity: "low",
        foo: "bar",
      },
    })
  })

  it("prefers canonical OpenAI-compatible keys when both forms are present", () => {
    const options = getProviderOptionsWithOverride("gpt-5-mini", "openai-compatible", {
      reasoning_effort: "high",
      reasoningEffort: "minimal",
      verbosity: "high",
      textVerbosity: "low",
    })

    expect(options).toEqual({
      "openai-compatible": {
        reasoningEffort: "minimal",
        textVerbosity: "low",
      },
    })
  })

  it("exposes recommendation metadata for UI suggestion state", () => {
    const gpt5Match = getRecommendedProviderOptionsMatch("gpt-5-mini")
    const gpt51Match = getRecommendedProviderOptionsMatch("gpt-5.1")

    expect(gpt5Match?.matchIndex).toBeTypeOf("number")
    expect(gpt51Match?.matchIndex).toBeTypeOf("number")
    expect(gpt5Match?.matchIndex).not.toBe(gpt51Match?.matchIndex)
    expect(getRecommendedProviderOptionsMatch("plain-model")).toBeUndefined()
  })
})
