import type { Config } from "@/types/config/config"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { storage } from "#imports"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { DEFAULT_LLM_PROVIDER_BASE_URLS } from "@/utils/constants/providers"

let getStorageItemMock: ReturnType<typeof vi.fn>

const {
  openAILanguageModelMock,
  deepSeekLanguageModelMock,
  openAICompatibleLanguageModelMock,
  createOpenAIMock,
  createDeepSeekMock,
  createOpenAICompatibleMock,
} = vi.hoisted(() => {
  const openAILanguageModelMock = vi.fn()
  const deepSeekLanguageModelMock = vi.fn()
  const openAICompatibleLanguageModelMock = vi.fn()
  const createOpenAIMock = vi.fn((_options?: Record<string, unknown>) => ({
    languageModel: openAILanguageModelMock,
  }))
  const createDeepSeekMock = vi.fn((_options?: Record<string, unknown>) => ({
    languageModel: deepSeekLanguageModelMock,
  }))
  const createOpenAICompatibleMock = vi.fn((_options?: Record<string, unknown>) => ({
    languageModel: openAICompatibleLanguageModelMock,
  }))

  return {
    openAILanguageModelMock,
    deepSeekLanguageModelMock,
    openAICompatibleLanguageModelMock,
    createOpenAIMock,
    createDeepSeekMock,
    createOpenAICompatibleMock,
  }
})

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: createOpenAIMock,
}))

vi.mock("@ai-sdk/deepseek", () => ({
  createDeepSeek: createDeepSeekMock,
}))

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: createOpenAICompatibleMock,
}))

/** Returns a valid stored config in which `provider` replaces the default provider of its type. */
function configWith(provider: Config["providersConfig"][number]): Config {
  return {
    ...DEFAULT_CONFIG,
    providersConfig: DEFAULT_CONFIG.providersConfig.map(item => item.provider === provider.provider ? provider : item),
  }
}

describe("getModelById", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    openAILanguageModelMock.mockReturnValue("openai-model")
    deepSeekLanguageModelMock.mockReturnValue("deepseek-model")
    openAICompatibleLanguageModelMock.mockReturnValue("custom-model")
    getStorageItemMock = vi.fn()
    ;(storage.getItem as unknown as ReturnType<typeof vi.fn>) = getStorageItemMock
  })

  it("user translates with OpenAI and no base URL: Given the default OpenAI provider, When the model is created, Then it uses the default OpenAI base URL", async () => {
    getStorageItemMock.mockResolvedValue(configWith({
      id: "openai-default",
      name: "OpenAI",
      enabled: true,
      provider: "openai",
      apiKey: "test-key",
      model: "gpt-5-mini",
    }))

    const { getModelById } = await import("../model")
    const result = await getModelById("openai-default")

    expect(result).toBe("openai-model")
    expect(createOpenAIMock).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: "test-key",
      baseURL: DEFAULT_LLM_PROVIDER_BASE_URLS.openai,
    }))
    expect(openAILanguageModelMock).toHaveBeenCalledWith("gpt-5-mini")
  })

  it("user translates with DeepSeek and no base URL: Given the default DeepSeek provider, When the model is created, Then it uses the default DeepSeek base URL", async () => {
    getStorageItemMock.mockResolvedValue(configWith({
      id: "deepseek-default",
      name: "DeepSeek",
      enabled: true,
      provider: "deepseek",
      apiKey: "test-key",
      model: "deepseek-v4-flash",
    }))

    const { getModelById } = await import("../model")
    const result = await getModelById("deepseek-default")

    expect(result).toBe("deepseek-model")
    expect(createDeepSeekMock).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: "test-key",
      baseURL: DEFAULT_LLM_PROVIDER_BASE_URLS.deepseek,
    }))
    expect(deepSeekLanguageModelMock).toHaveBeenCalledWith("deepseek-v4-flash")
  })

  it("passes custom headers for OpenAI-compatible providers", async () => {
    getStorageItemMock.mockResolvedValue(configWith({
      id: "custom-openai",
      name: "Custom Provider",
      enabled: true,
      provider: "openai-compatible",
      apiKey: "custom-key",
      baseURL: "http://127.0.0.1:1234/v1",
      model: "custom-model",
      headers: {
        "HTTP-Referer": "https://example.com",
        "X-Title": "Plainly",
      },
    }))

    const { getModelById } = await import("../model")
    const result = await getModelById("custom-openai")

    expect(result).toBe("custom-model")
    expect(createOpenAICompatibleMock).toHaveBeenCalledWith(expect.objectContaining({
      name: "openai-compatible",
      baseURL: "http://127.0.0.1:1234/v1",
      apiKey: "custom-key",
      headers: {
        "HTTP-Referer": "https://example.com",
        "X-Title": "Plainly",
      },
    }))
    expect(openAICompatibleLanguageModelMock).toHaveBeenCalledWith("custom-model")
  })
})
