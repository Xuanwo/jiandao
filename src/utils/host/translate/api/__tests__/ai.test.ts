import type { ProviderConfig } from "@/types/config/provider"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { aiTranslate } from "../ai"

const mocks = vi.hoisted(() => ({
  requestText: vi.fn(),
}))

vi.mock("@/utils/providers/request", () => ({
  requestText: mocks.requestText,
}))

const providerConfig: ProviderConfig = {
  id: "openai-default",
  name: "OpenAI",
  provider: "openai",
  enabled: true,
  apiKey: "sk-test",
  model: "gpt-6-luna",
  temperature: 0.3,
}

const promptResolver = vi.fn().mockResolvedValue({
  systemPrompt: "system",
  prompt: "prompt",
})

describe("aiTranslate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("sends the resolved prompts with the service's temperature", async () => {
    mocks.requestText.mockResolvedValue("你好")

    await expect(aiTranslate("hello", "Chinese", providerConfig, promptResolver)).resolves.toBe("你好")

    expect(promptResolver).toHaveBeenCalledWith("Chinese", "hello", undefined)
    expect(mocks.requestText).toHaveBeenCalledWith(providerConfig, { system: "system", prompt: "prompt", temperature: 0.3 })
  })

  it("keeps only the text after an inline reasoning block", async () => {
    mocks.requestText.mockResolvedValue("<think>thinking hard</think>\n你好")

    await expect(aiTranslate("hello", "Chinese", providerConfig, promptResolver)).resolves.toBe("\n你好")
  })

  it("passes request errors through unchanged so the queue can read their metadata", async () => {
    const error = new Error("Too Many Requests")
    mocks.requestText.mockRejectedValue(error)

    await expect(aiTranslate("hello", "Chinese", providerConfig, promptResolver)).rejects.toBe(error)
  })
})
