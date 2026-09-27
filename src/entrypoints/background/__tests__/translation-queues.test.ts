import type { ProviderConfig } from "@/types/config/provider"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"

const onMessageMock = vi.fn()
const ensureInitializedConfigMock = vi.fn()
const executeTranslateMock = vi.fn()
const generateArticleSummaryMock = vi.fn()
const articleSummaryCacheGetMock = vi.fn()
const articleSummaryCachePutMock = vi.fn()
const translationCacheGetMock = vi.fn()
const translationCachePutMock = vi.fn()

vi.mock("@/utils/message", () => ({
  onMessage: onMessageMock,
}))

vi.mock("../config", () => ({
  ensureInitializedConfig: ensureInitializedConfigMock,
}))

vi.mock("@/utils/host/translate/execute-translate", () => ({
  executeTranslate: executeTranslateMock,
}))

vi.mock("@/utils/content/summary", () => ({
  generateArticleSummary: generateArticleSummaryMock,
}))

vi.mock("@/utils/db/dexie/db", () => ({
  db: {
    articleSummaryCache: {
      get: articleSummaryCacheGetMock,
      put: articleSummaryCachePutMock,
    },
    translationCache: {
      get: translationCacheGetMock,
      put: translationCachePutMock,
    },
  },
}))

function getRegisteredMessageHandler(name: string) {
  const registration = onMessageMock.mock.calls.find(call => call[0] === name)
  if (!registration) {
    throw new Error(`Message handler not registered: ${name}`)
  }
  return registration[1] as (message: { data: Record<string, unknown> }) => Promise<unknown>
}

const llmProvider: ProviderConfig = {
  id: "openai-default",
  name: "OpenAI",
  provider: "openai",
  enabled: true,
  apiKey: "sk-test",
  model: "gpt-5-mini",
}

describe("translation queue helpers", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    ensureInitializedConfigMock.mockResolvedValue({
      ...DEFAULT_CONFIG,
      translate: {
        ...DEFAULT_CONFIG.translate,
        enableAIContentAware: true,
      },
    })

    executeTranslateMock.mockResolvedValue("translated text")
    generateArticleSummaryMock.mockResolvedValue("Generated summary")
    articleSummaryCacheGetMock.mockResolvedValue(undefined)
    articleSummaryCachePutMock.mockResolvedValue(undefined)
    translationCacheGetMock.mockResolvedValue(undefined)
    translationCachePutMock.mockResolvedValue(undefined)
  })

  it("routes supported providers through the batch queue", async () => {
    const { shouldUseBatchQueue } = await import("../translation-queues")

    const customProvider: ProviderConfig = {
      id: "custom-openai",
      name: "Custom Provider",
      provider: "openai-compatible",
      enabled: true,
      apiKey: "key",
      baseURL: "https://api.example.com/v1",
      model: "custom-model",
    }

    expect(shouldUseBatchQueue(customProvider)).toBe(true)
    expect(shouldUseBatchQueue(llmProvider)).toBe(true)
  })

  it("passes webpage context through the translation queue without generating a new summary", async () => {
    const { setUpWebPageTranslationQueue } = await import("../translation-queues")
    await setUpWebPageTranslationQueue()

    const handler = getRegisteredMessageHandler("enqueueTranslateRequest")
    const result = await handler({
      data: {
        text: "hello",
        langConfig: DEFAULT_CONFIG.language,
        providerConfig: llmProvider,
        scheduleAt: Date.now(),
        hash: "webpage-hash",
        webTitle: "Page title",
        webDescription: "Page description",
        webContent: "Page body",
        webSummary: "Ready summary",
      },
    })

    expect(result).toBe("translated text")
    expect(generateArticleSummaryMock).not.toHaveBeenCalled()
    expect(executeTranslateMock).toHaveBeenCalledWith(
      "hello",
      DEFAULT_CONFIG.language,
      llmProvider,
      expect.any(Function),
      expect.objectContaining({
        context: {
          webTitle: "Page title",
          webDescription: "Page description",
          webContent: "Page body",
          webSummary: "Ready summary",
        },
      }),
    )
  })

  it("returns cached translations unchanged", async () => {
    translationCacheGetMock.mockResolvedValueOnce({
      key: "webpage-hash",
      translation: "L&#39;Iran chiama &quot;Dichiarazione&quot; &lt;span&gt;",
    })

    const { setUpWebPageTranslationQueue } = await import("../translation-queues")
    await setUpWebPageTranslationQueue()

    const handler = getRegisteredMessageHandler("enqueueTranslateRequest")
    const result = await handler({
      data: {
        text: "hello",
        langConfig: DEFAULT_CONFIG.language,
        providerConfig: llmProvider,
        scheduleAt: Date.now(),
        hash: "webpage-hash",
      },
    })

    expect(result).toBe("L&#39;Iran chiama &quot;Dichiarazione&quot; &lt;span&gt;")
    expect(executeTranslateMock).not.toHaveBeenCalled()
    expect(translationCachePutMock).not.toHaveBeenCalled()
  })

  it("exposes webpage summary generation as a separate background handler", async () => {
    const { setUpWebPageTranslationQueue } = await import("../translation-queues")
    await setUpWebPageTranslationQueue()

    const handler = getRegisteredMessageHandler("getOrGenerateWebPageSummary")
    const result = await handler({
      data: {
        webTitle: "Page title",
        webContent: "page body",
        providerConfig: llmProvider,
      },
    })

    expect(result).toBe("Generated summary")
    expect(generateArticleSummaryMock).toHaveBeenCalledWith(
      "Page title",
      "page body",
      llmProvider,
    )
  })
})
