import type { Config } from "@/types/config/config"
import type { ProviderConfig } from "@/types/config/provider"
import { afterEach, describe, expect, it, vi } from "vitest"

import { parseBatchResult } from "@/entrypoints/background/translation-queues"
import { BATCH_SEPARATOR } from "@/utils/constants/prompt"
import { sha256Hex } from "@/utils/hash"
import { executeTranslate } from "@/utils/host/translate/execute-translate"
import { BatchQueue } from "../batch-queue"
import { RequestQueue } from "../request-queue"

const mockPromptResolver = vi.fn().mockResolvedValue({ systemPrompt: "", prompt: "" })

// Mock dependencies
vi.mock("@/utils/host/translate/execute-translate", () => ({
  executeTranslate: vi.fn(),
}))

vi.mock("@/utils/hash", () => ({
  sha256Hex: vi.fn(async (...args: string[]) => `hash-${args.join("-")}`),
}))

const mockExecuteTranslate = vi.mocked(executeTranslate)

// Helper: mock successful translation
function mockTranslateSuccess(results: string[]) {
  mockExecuteTranslate.mockImplementation((text: string) => {
    const batchSeparator = `\n\n${BATCH_SEPARATOR}\n\n`
    if (text.includes(batchSeparator)) {
      return Promise.resolve(results.join(batchSeparator))
    }
    return Promise.resolve(results[0] || "translated")
  })
}

// Helper: mock translation failure
function mockTranslateError(error: Error) {
  mockExecuteTranslate.mockImplementation(() => Promise.reject(error))
}

// Test configurations
const sampleLangConfig: Config["language"] = {
  sourceCode: "eng",
  targetCode: "cmn",
  level: "beginner",
}

const sampleProviderConfig: ProviderConfig = {
  id: "test-provider",
  name: "Test Provider",
  provider: "openai",
  enabled: true,
  apiKey: "test-key",
  model: "gpt-4o-mini",
}

interface TranslateBatchData {
  text: string
  langConfig: Config["language"]
  providerConfig: ProviderConfig
  hash: string
}

const baseBatchConfig = {
  maxCharactersPerBatch: 100,
  maxItemsPerBatch: 3,
  batchDelay: 1000,
}

const baseRequestQueueConfig = {
  rate: 2,
  capacity: 2,
  timeoutMs: 10_000,
  maxRetries: 0,
  baseRetryDelayMs: 100,
}

function createBatchQueue(
  requestQueue: RequestQueue,
  config = baseBatchConfig,
  options?: {
    learnedLimits?: (limitKey: string) => { maxItems: number, maxCharacters: number } | undefined
    onLimitsLearned?: (limitKey: string, limits: { maxItems: number, maxCharacters: number }) => void
    enableFallbackToIndividual?: boolean
    executeIndividual?: (data: TranslateBatchData) => Promise<string>
    onError?: (error: Error, context: { batchKey: string, retryCount: number, isFallback: boolean }) => void
  },
) {
  return new BatchQueue<TranslateBatchData, string>({
    ...config,
    enableFallbackToIndividual: options?.enableFallbackToIndividual,
    getBatchKey: (data) => {
      return `${data.langConfig.sourceCode}-${data.langConfig.targetCode}-${data.providerConfig.id}`
    },
    getLimitKey: data => data.providerConfig.id,
    learnedLimits: options?.learnedLimits,
    onLimitsLearned: options?.onLimitsLearned,
    getCharacters: (data) => {
      return data.text.length
    },
    executeBatch: async (dataList) => {
      const { langConfig, providerConfig } = dataList[0]
      const texts = dataList.map(d => d.text)
      const batchText = texts.join(`\n\n${BATCH_SEPARATOR}\n\n`)
      const hash = await sha256Hex(...dataList.map(d => d.hash))

      const batchThunk = async (): Promise<string[]> => {
        const result = await executeTranslate(batchText, langConfig, providerConfig, mockPromptResolver, { isBatch: true })
        return parseBatchResult(result)
      }

      return requestQueue.enqueue(batchThunk, Date.now(), hash)
    },
    executeIndividual: options?.executeIndividual,
    onError: options?.onError,
  })
}

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

function enqueueTexts(batchQueue: BatchQueue<TranslateBatchData, string>, texts: string[], providerConfig = sampleProviderConfig) {
  return texts.map((text, index) => batchQueue.enqueue({
    text,
    langConfig: sampleLangConfig,
    providerConfig,
    hash: `${providerConfig.id}-${index}-${text}`,
  }))
}

/** Answers a batch with `answer(count)` parts; a single-item batch counts as a batch too. */
function mockBatchAnswers(answer: (count: number) => number) {
  mockExecuteTranslate.mockImplementation((text: string, _lang, _provider, _resolver, options) => {
    const parts = text.split(`\n\n${BATCH_SEPARATOR}\n\n`)
    if (!options?.isBatch)
      return Promise.resolve(`individual-${text}`)
    return Promise.resolve(Array.from({ length: answer(parts.length) }, (_, i) => `r-${parts[i] ?? "extra"}`).join(`\n\n${BATCH_SEPARATOR}\n\n`))
  })
}

describe("batchQueue – core functionality", () => {
  it("processes single task successfully", async () => {
    vi.useFakeTimers()
    mockTranslateSuccess(["result"])

    const requestQueue = new RequestQueue(baseRequestQueueConfig)
    const batchQueue = createBatchQueue(requestQueue)

    const promise = batchQueue.enqueue({
      text: "Hello",
      langConfig: sampleLangConfig,
      providerConfig: sampleProviderConfig,
      hash: "hash1",
    })

    vi.advanceTimersByTime(baseBatchConfig.batchDelay)
    vi.advanceTimersByTime(0)

    await expect(promise).resolves.toBe("result")
  })
})

describe("batchQueue – batching logic", () => {
  it("batches multiple tasks with same config", async () => {
    vi.useFakeTimers()
    mockTranslateSuccess(["result1", "result2", "result3"])

    const requestQueue = new RequestQueue(baseRequestQueueConfig)
    const batchQueue = createBatchQueue(requestQueue)

    const promises = [
      batchQueue.enqueue({
        text: "Text 1",
        langConfig: sampleLangConfig,
        providerConfig: sampleProviderConfig,
        hash: "hash1",
      }),
      batchQueue.enqueue({
        text: "Text 2",
        langConfig: sampleLangConfig,
        providerConfig: sampleProviderConfig,
        hash: "hash2",
      }),
      batchQueue.enqueue({
        text: "Text 3",
        langConfig: sampleLangConfig,
        providerConfig: sampleProviderConfig,
        hash: "hash3",
      }),
    ]

    vi.advanceTimersByTime(baseBatchConfig.batchDelay)
    vi.advanceTimersByTime(0)

    const results = await Promise.all(promises)
    expect(results).toEqual(["result1", "result2", "result3"])
  })

  it("flushes batch when size limit reached", async () => {
    vi.useFakeTimers()
    mockTranslateSuccess(["result1", "result2"])

    const requestQueue = new RequestQueue(baseRequestQueueConfig)
    const batchQueue = createBatchQueue(requestQueue, {
      ...baseBatchConfig,
      maxItemsPerBatch: 2, // Flush when 2 tasks batched
    })

    const promises = [
      batchQueue.enqueue({
        text: "A",
        langConfig: sampleLangConfig,
        providerConfig: sampleProviderConfig,
        hash: "hash1",
      }),
      batchQueue.enqueue({
        text: "B",
        langConfig: sampleLangConfig,
        providerConfig: sampleProviderConfig,
        hash: "hash2",
      }), // Should trigger flush
    ]

    vi.advanceTimersByTime(0) // No delay needed

    const results = await Promise.all(promises)
    expect(results).toEqual(["result1", "result2"])
  })

  it("flushes batch when character limit reached", async () => {
    vi.useFakeTimers()

    // Setup separate mock calls for separate batches
    let callCount = 0
    mockExecuteTranslate.mockImplementation(() => {
      callCount++
      return Promise.resolve(callCount === 1 ? "first-batch" : "second-batch")
    })

    const requestQueue = new RequestQueue(baseRequestQueueConfig)
    const batchQueue = createBatchQueue(requestQueue, {
      ...baseBatchConfig,
      maxCharactersPerBatch: 10,
    })

    const promise1 = batchQueue.enqueue({
      text: "Hi",
      langConfig: sampleLangConfig,
      providerConfig: sampleProviderConfig,
      hash: "hash1",
    })
    const promise2 = batchQueue.enqueue({
      text: "Very long text exceeding limit",
      langConfig: sampleLangConfig,
      providerConfig: sampleProviderConfig,
      hash: "hash2",
    })

    vi.advanceTimersByTime(0)

    const [result1, result2] = await Promise.all([promise1, promise2])
    expect(result1).toBe("first-batch")
    expect(result2).toBe("second-batch")
  })

  it("separates batches by different configs", async () => {
    vi.useFakeTimers()

    // Setup separate mock calls for different configs
    let callCount = 0
    mockExecuteTranslate.mockImplementation(() => {
      callCount++
      return Promise.resolve(callCount === 1 ? "english-result" : "chinese-result")
    })

    const requestQueue = new RequestQueue(baseRequestQueueConfig)
    const batchQueue = createBatchQueue(requestQueue)

    const config1 = { ...sampleLangConfig, targetCode: "eng" as const }
    const config2 = { ...sampleLangConfig, targetCode: "cmn" as const }

    const promises = [
      batchQueue.enqueue({
        text: "Text 1",
        langConfig: config1,
        providerConfig: sampleProviderConfig,
        hash: "hash1",
      }),
      batchQueue.enqueue({
        text: "Text 2",
        langConfig: config2,
        providerConfig: sampleProviderConfig,
        hash: "hash2",
      }),
    ]

    vi.advanceTimersByTime(baseBatchConfig.batchDelay)
    vi.advanceTimersByTime(0)

    const results = await Promise.all(promises)
    expect(results).toEqual(["english-result", "chinese-result"])
  })
})

describe("batchQueue – timing control", () => {
  it("flushes batch after delay timeout", async () => {
    vi.useFakeTimers()
    mockTranslateSuccess(["delayed"])

    const requestQueue = new RequestQueue(baseRequestQueueConfig)
    const batchQueue = createBatchQueue(requestQueue, {
      ...baseBatchConfig,
      batchDelay: 500,
    })

    const promise = batchQueue.enqueue({
      text: "Test",
      langConfig: sampleLangConfig,
      providerConfig: sampleProviderConfig,
      hash: "hash1",
    })

    // Before timeout
    vi.advanceTimersByTime(400)
    // Promise should not be resolved yet

    // After timeout
    vi.advanceTimersByTime(200)
    vi.advanceTimersByTime(0)

    await expect(promise).resolves.toBe("delayed")
  })
})

describe("batchQueue – error handling", () => {
  it("propagates translation errors to all tasks (no retry)", async () => {
    vi.useFakeTimers()
    const error = new Error("Translation failed")
    mockTranslateError(error)

    const requestQueue = new RequestQueue(baseRequestQueueConfig)
    const batchQueue = createBatchQueue(requestQueue, baseBatchConfig, {
      enableFallbackToIndividual: false,
    })

    const promises = [
      batchQueue.enqueue({
        text: "Text 1",
        langConfig: sampleLangConfig,
        providerConfig: sampleProviderConfig,
        hash: "hash1",
      }),
      batchQueue.enqueue({
        text: "Text 2",
        langConfig: sampleLangConfig,
        providerConfig: sampleProviderConfig,
        hash: "hash2",
      }),
    ]

    vi.advanceTimersByTime(baseBatchConfig.batchDelay)
    vi.advanceTimersByTime(0)

    await expect(Promise.all(promises)).rejects.toThrow("Translation failed")
  })

  it("splits a batch that loses paragraphs and translates the halves", async () => {
    vi.useFakeTimers()
    // The service merges paragraphs: any batch of more than one comes back as a single part.
    mockBatchAnswers(count => count > 1 ? 1 : count)

    const requestQueue = new RequestQueue(baseRequestQueueConfig)
    const batchQueue = createBatchQueue(requestQueue, baseBatchConfig, { enableFallbackToIndividual: false })
    const promises = enqueueTexts(batchQueue, ["A", "B"])

    await vi.advanceTimersByTimeAsync(baseBatchConfig.batchDelay)
    await vi.advanceTimersByTimeAsync(1000)

    await expect(Promise.all(promises)).resolves.toEqual(["r-A", "r-B"])
  })

  it("keeps later batches for the same service at the smaller size, and leaves other services alone", async () => {
    vi.useFakeTimers()
    mockBatchAnswers(count => count > 1 ? 1 : count)
    const otherProvider = { ...sampleProviderConfig, id: "other-provider", name: "Other" }

    const requestQueue = new RequestQueue({ ...baseRequestQueueConfig, rate: 100, capacity: 100 })
    const batchQueue = createBatchQueue(requestQueue, baseBatchConfig, { enableFallbackToIndividual: false })
    const first = enqueueTexts(batchQueue, ["A", "B"])
    await vi.advanceTimersByTimeAsync(baseBatchConfig.batchDelay)
    await Promise.all(first)

    expect(batchQueue.limitsFor(sampleProviderConfig.id)).toEqual({ maxItems: 1, maxCharacters: 1 })
    expect(batchQueue.limitsFor(otherProvider.id)).toEqual({ maxItems: baseBatchConfig.maxItemsPerBatch, maxCharacters: baseBatchConfig.maxCharactersPerBatch })

    mockExecuteTranslate.mockClear()
    const second = enqueueTexts(batchQueue, ["C", "D"])
    await vi.advanceTimersByTimeAsync(baseBatchConfig.batchDelay)
    await expect(Promise.all(second)).resolves.toEqual(["r-C", "r-D"])
    // Sent one paragraph at a time, with no failed attempt first.
    expect(mockExecuteTranslate).toHaveBeenCalledTimes(2)
  })

  it("does not retry regular request errors", async () => {
    vi.useFakeTimers()
    let attemptCount = 0
    mockExecuteTranslate.mockImplementation(() => {
      attemptCount++
      return Promise.reject(new Error("Network error"))
    })

    const requestQueue = new RequestQueue(baseRequestQueueConfig)
    const batchQueue = createBatchQueue(requestQueue, baseBatchConfig, {
      enableFallbackToIndividual: false,
    })

    const promise = batchQueue.enqueue({
      text: "Test",
      langConfig: sampleLangConfig,
      providerConfig: sampleProviderConfig,
      hash: "hash1",
    })

    vi.advanceTimersByTime(baseBatchConfig.batchDelay)
    vi.advanceTimersByTime(0)

    await expect(promise).rejects.toThrow("Network error")
    expect(attemptCount).toBe(1) // No retry for regular errors
  })

  it("reports the smaller size so it can be kept, and starts from a size kept earlier", async () => {
    vi.useFakeTimers()
    mockBatchAnswers(count => count > 1 ? 1 : count)
    const onLimitsLearned = vi.fn()

    const requestQueue = new RequestQueue({ ...baseRequestQueueConfig, rate: 100, capacity: 100 })
    const learning = createBatchQueue(requestQueue, baseBatchConfig, { enableFallbackToIndividual: false, onLimitsLearned })
    const promises = enqueueTexts(learning, ["A", "B"])
    await vi.advanceTimersByTimeAsync(baseBatchConfig.batchDelay)
    await Promise.all(promises)
    expect(onLimitsLearned).toHaveBeenCalledWith(sampleProviderConfig.id, { maxItems: 1, maxCharacters: 1 })

    // A later session reads the kept size and sends one paragraph at a time from the start.
    mockExecuteTranslate.mockClear()
    const remembering = createBatchQueue(requestQueue, baseBatchConfig, {
      enableFallbackToIndividual: false,
      learnedLimits: key => key === sampleProviderConfig.id ? { maxItems: 1, maxCharacters: 1 } : undefined,
    })
    const next = enqueueTexts(remembering, ["C", "D"])
    await vi.advanceTimersByTimeAsync(baseBatchConfig.batchDelay)
    await expect(Promise.all(next)).resolves.toEqual(["r-C", "r-D"])
    expect(mockExecuteTranslate).toHaveBeenCalledTimes(2)
  })

  it("falls back to an individual request when a single paragraph still comes back wrong", async () => {
    vi.useFakeTimers()
    // Every batch, even of one paragraph, comes back with an extra part.
    mockBatchAnswers(count => count + 1)

    const requestQueue = new RequestQueue({ ...baseRequestQueueConfig, rate: 100, capacity: 100 })
    const batchQueue = createBatchQueue(requestQueue, baseBatchConfig, {
      enableFallbackToIndividual: true,
      executeIndividual: data => executeTranslate(data.text, data.langConfig, data.providerConfig, mockPromptResolver),
    })
    const promises = enqueueTexts(batchQueue, ["Text1", "Text2"])

    await vi.advanceTimersByTimeAsync(baseBatchConfig.batchDelay)

    await expect(Promise.all(promises)).resolves.toEqual(["individual-Text1", "individual-Text2"])
  })

  it("does not fall back to individual requests on request errors", async () => {
    vi.useFakeTimers()
    let batchAttemptCount = 0
    const executeIndividual = vi.fn(async (data: TranslateBatchData) => {
      const result = await executeTranslate(data.text, data.langConfig, data.providerConfig, mockPromptResolver)
      return result
    })

    mockExecuteTranslate.mockImplementation((text: string) => {
      const batchSeparator = `\n\n${BATCH_SEPARATOR}\n\n`
      if (text.includes(batchSeparator)) {
        batchAttemptCount++
        return Promise.reject(new Error("API error"))
      }
      return Promise.resolve(`individual-${text}`)
    })

    const requestQueue = new RequestQueue(baseRequestQueueConfig)
    const batchQueue = createBatchQueue(requestQueue, baseBatchConfig, {
      enableFallbackToIndividual: true,
      executeIndividual,
    })

    const promises = [
      batchQueue.enqueue({
        text: "Text1",
        langConfig: sampleLangConfig,
        providerConfig: sampleProviderConfig,
        hash: "hash1",
      }),
      batchQueue.enqueue({
        text: "Text2",
        langConfig: sampleLangConfig,
        providerConfig: sampleProviderConfig,
        hash: "hash2",
      }),
    ]

    vi.advanceTimersByTime(baseBatchConfig.batchDelay)
    vi.advanceTimersByTime(0)

    await expect(Promise.all(promises)).rejects.toThrow("API error")
    expect(batchAttemptCount).toBe(1) // Only 1 attempt, no retry for request errors
    expect(executeIndividual).not.toHaveBeenCalled()
  })

  it("does not fall back to individual requests after rate limit errors", async () => {
    vi.useFakeTimers()
    let batchAttemptCount = 0
    const executeIndividual = vi.fn(async (data: TranslateBatchData) => {
      const result = await executeTranslate(data.text, data.langConfig, data.providerConfig, mockPromptResolver)
      return result
    })
    const rateLimitedError = Object.assign(new Error("Too Many Requests"), {
      statusCode: 429,
      responseHeaders: {
        "retry-after": "2",
      },
    })

    mockExecuteTranslate.mockImplementation((text: string) => {
      const batchSeparator = `\n\n${BATCH_SEPARATOR}\n\n`
      if (text.includes(batchSeparator)) {
        batchAttemptCount++
        return Promise.reject(rateLimitedError)
      }
      return Promise.resolve(`individual-${text}`)
    })

    const requestQueue = new RequestQueue(baseRequestQueueConfig)
    const batchQueue = createBatchQueue(requestQueue, baseBatchConfig, {
      enableFallbackToIndividual: true,
      executeIndividual,
    })

    const promises = [
      batchQueue.enqueue({
        text: "Text1",
        langConfig: sampleLangConfig,
        providerConfig: sampleProviderConfig,
        hash: "hash1",
      }),
      batchQueue.enqueue({
        text: "Text2",
        langConfig: sampleLangConfig,
        providerConfig: sampleProviderConfig,
        hash: "hash2",
      }),
    ]

    vi.advanceTimersByTime(baseBatchConfig.batchDelay)
    vi.advanceTimersByTime(0)

    await expect(Promise.all(promises)).rejects.toBe(rateLimitedError)
    expect(batchAttemptCount).toBe(1)
    expect(executeIndividual).not.toHaveBeenCalled()
  })

  it("reports the failed batch and each failed half to onError", async () => {
    vi.useFakeTimers()
    mockBatchAnswers(count => count + 1)

    const onError = vi.fn()
    const requestQueue = new RequestQueue({ ...baseRequestQueueConfig, rate: 100, capacity: 100 })
    const batchQueue = createBatchQueue(requestQueue, baseBatchConfig, { enableFallbackToIndividual: false, onError })
    const promises = enqueueTexts(batchQueue, ["Text 1", "Text 2"]).map(p => p.catch(err => err))

    await vi.advanceTimersByTimeAsync(baseBatchConfig.batchDelay)
    await Promise.all(promises)

    expect(onError).toHaveBeenCalledTimes(3)
    expect(onError).toHaveBeenNthCalledWith(1, expect.any(Error), expect.objectContaining({ retryCount: 0 }))
    expect(onError).toHaveBeenNthCalledWith(2, expect.any(Error), expect.objectContaining({ retryCount: 1 }))
    expect(onError).toHaveBeenNthCalledWith(3, expect.any(Error), expect.objectContaining({ retryCount: 1 }))
  })

  it("calls onError once on request error (no retry)", async () => {
    vi.useFakeTimers()
    const error = new Error("Request failed")
    mockTranslateError(error)

    const onError = vi.fn()
    const requestQueue = new RequestQueue(baseRequestQueueConfig)
    const batchQueue = createBatchQueue(requestQueue, baseBatchConfig, {
      enableFallbackToIndividual: false,
      onError,
    })

    const promise = batchQueue.enqueue({
      text: "Test",
      langConfig: sampleLangConfig,
      providerConfig: sampleProviderConfig,
      hash: "hash1",
    }).catch(err => err)

    vi.advanceTimersByTime(baseBatchConfig.batchDelay)
    vi.advanceTimersByTime(0)

    await promise
    expect(onError).toHaveBeenCalledTimes(1) // Only once, no retry
    expect(onError).toHaveBeenCalledWith(error, expect.objectContaining({ retryCount: 0, isFallback: false }))
  })
})
