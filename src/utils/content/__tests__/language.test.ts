// @vitest-environment jsdom

import type { ProviderConfig } from "@/types/config/provider"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getLocalConfig } from "@/utils/config/storage"
import { sendMessage } from "@/utils/message"
import { detectLanguageWithSource } from "../language"
import { detectPageLanguageLightweight } from "../page-language"

vi.mock("@/utils/message", () => ({
  sendMessage: vi.fn(),
}))

vi.mock("@/utils/config/storage", () => ({
  getLocalConfig: vi.fn(),
}))

const mockSendMessage = vi.mocked(sendMessage)

const providerConfig: ProviderConfig = {
  id: "openai-default",
  name: "OpenAI",
  description: "OpenAI",
  enabled: true,
  provider: "openai",
  apiKey: "test-api-key",
  model: "gpt-5-mini",
  temperature: 0,
}

describe("detectLanguageWithSource", () => {
  beforeEach(() => {
    mockSendMessage.mockReset()
  })

  it("detects page language on repeated refreshes without contacting the configured translation provider", async () => {
    vi.mocked(getLocalConfig).mockResolvedValue({
      providersConfig: [providerConfig],
      translate: { providerId: providerConfig.id },
    } as Awaited<ReturnType<typeof getLocalConfig>>)
    mockSendMessage.mockResolvedValue({ text: JSON.stringify({ code: "eng" }) })

    const doc = document.implementation.createHTMLDocument()
    doc.body.textContent = "This article explains how to configure your browser and translate the web pages you are reading."
    for (const lang of ["", "en", "ja"]) {
      doc.documentElement.lang = lang
      for (let refresh = 0; refresh < 2; refresh++) {
        const result = await detectPageLanguageLightweight(doc)

        expect(mockSendMessage).not.toHaveBeenCalled()
        expect(result.detectedCodeOrUnd).toBe("eng")
      }
    }
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
