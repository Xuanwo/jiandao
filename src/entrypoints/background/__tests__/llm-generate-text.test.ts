import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"

const onMessageMock = vi.fn()
const getLocalConfigMock = vi.fn()
const requestTextMock = vi.fn()
const loggerErrorMock = vi.fn()

vi.mock("@/utils/message", () => ({
  onMessage: onMessageMock,
}))

vi.mock("@/utils/config/storage", () => ({
  getLocalConfig: getLocalConfigMock,
}))

vi.mock("@/utils/providers/request", () => ({
  requestText: requestTextMock,
}))

vi.mock("@/utils/logger", () => ({
  logger: {
    error: loggerErrorMock,
  },
}))

function getRegisteredMessageHandler(name: string) {
  const registration = onMessageMock.mock.calls.find(call => call[0] === name)
  if (!registration) {
    throw new Error(`Message handler not registered: ${name}`)
  }
  return registration[1] as (message: { data: Record<string, unknown> }) => Promise<{ text: string }>
}

const storedProvider = { ...DEFAULT_CONFIG.providersConfig[0], apiKey: "sk-test" }

describe("llm-generate-text", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    getLocalConfigMock.mockResolvedValue({ ...DEFAULT_CONFIG, providersConfig: [storedProvider] })
  })

  it("sends the request with the stored service config", async () => {
    requestTextMock.mockResolvedValue("eng")

    const { runGenerateTextInBackground } = await import("../llm-generate-text")
    const result = await runGenerateTextInBackground({
      providerId: storedProvider.id,
      system: "system",
      prompt: "hello world",
      temperature: 0.2,
    })

    expect(requestTextMock).toHaveBeenCalledWith(storedProvider, {
      system: "system",
      prompt: "hello world",
      temperature: 0.2,
    })
    expect(result).toEqual({ text: "eng" })
  })

  it("fails for an unknown service without sending anything", async () => {
    const { runGenerateTextInBackground } = await import("../llm-generate-text")

    await expect(runGenerateTextInBackground({ providerId: "missing", prompt: "hello" })).rejects.toThrow("Provider missing not found")
    expect(requestTextMock).not.toHaveBeenCalled()
  })

  it("registers backgroundGenerateText message handler", async () => {
    requestTextMock.mockResolvedValue("cmn")

    const { setupLLMGenerateTextMessageHandlers } = await import("../llm-generate-text")
    setupLLMGenerateTextMessageHandlers()

    const handler = getRegisteredMessageHandler("backgroundGenerateText")
    const result = await handler({
      data: {
        providerId: storedProvider.id,
        prompt: "你好",
      },
    })

    expect(result).toEqual({ text: "cmn" })
  })

  it("logs and rethrows handler errors", async () => {
    requestTextMock.mockRejectedValue(new Error("provider unavailable"))

    const { setupLLMGenerateTextMessageHandlers } = await import("../llm-generate-text")
    setupLLMGenerateTextMessageHandlers()
    const handler = getRegisteredMessageHandler("backgroundGenerateText")

    await expect(handler({
      data: {
        providerId: storedProvider.id,
        prompt: "test",
      },
    })).rejects.toThrow("provider unavailable")

    expect(loggerErrorMock).toHaveBeenCalled()
  })
})
