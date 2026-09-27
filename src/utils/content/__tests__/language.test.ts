import type { LLMProviderConfig } from "@/types/config/provider"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { sendMessage } from "@/utils/message"
import { detectLanguageWithSource } from "../language"

vi.mock("@/utils/message", () => ({
  sendMessage: vi.fn(),
}))

vi.mock("@/utils/config/storage", () => ({
  getLocalConfig: vi.fn(),
}))

const mockSendMessage = vi.mocked(sendMessage)

const providerConfig: LLMProviderConfig = {
  id: "openai-default",
  name: "OpenAI",
  description: "OpenAI",
  enabled: true,
  provider: "openai",
  apiKey: "test-api-key",
  model: "gpt-5-mini",
  providerOptions: {},
  temperature: 0,
}

describe("detectLanguageWithSource", () => {
  beforeEach(() => {
    mockSendMessage.mockReset()
  })

  it("returns LLM result when it is a supported language code", async () => {
    mockSendMessage.mockResolvedValue({
      text: JSON.stringify({ reason: "English text.", code: "eng" }),
    })

    await expect(detectLanguageWithSource("This is enough text to detect language.", { providerConfig })).resolves.toEqual({
      code: "eng",
      source: "llm",
    })
  })

  it("falls back when LLM returns an unsupported language code", async () => {
    mockSendMessage.mockResolvedValue({
      text: JSON.stringify({ reason: "Unsupported language.", code: "und" }),
    })

    await expect(detectLanguageWithSource("Eyi je oro ni ede Yoruba fun idanwo wiwa ede.", { providerConfig })).resolves.toEqual({
      code: "und",
      source: "fallback",
    })
  })
})
