import { describe, expect, it } from "vitest"
import { getProviderOptions } from "../options"

describe("getProviderOptions", () => {
  it("user saves snake_case options for a custom provider: Given reasoning_effort and verbosity, When a request is made, Then it sends the AI SDK keys", () => {
    const options = getProviderOptions({
      provider: "openai-compatible",
      providerOptions: {
        reasoning_effort: "minimal",
        verbosity: "low",
        foo: "bar",
      } })

    expect(options).toEqual({
      "openai-compatible": {
        reasoningEffort: "minimal",
        textVerbosity: "low",
        foo: "bar",
      },
    })
  })

  it("user saves both forms of a key for a custom provider: Given snake_case and camelCase keys, When a request is made, Then the camelCase values win", () => {
    const options = getProviderOptions({
      provider: "openai-compatible",
      providerOptions: {
        reasoning_effort: "high",
        reasoningEffort: "minimal",
        verbosity: "high",
        textVerbosity: "low",
      } })

    expect(options).toEqual({
      "openai-compatible": {
        reasoningEffort: "minimal",
        textVerbosity: "low",
      },
    })
  })
})
