import type { Config } from "@/types/config/config"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"

const getItemMock = vi.fn()
const clearMock = vi.fn()
const setItemMock = vi.fn()
const setMetaMock = vi.fn()
const loggerWarnMock = vi.fn()

vi.mock("#imports", () => ({
  storage: {
    getItem: getItemMock,
    clear: clearMock,
    setItem: setItemMock,
    setMeta: setMetaMock,
  },
}))

vi.mock("wxt/utils/storage", () => ({
  storage: {
    getItem: getItemMock,
    clear: clearMock,
    setItem: setItemMock,
    setMeta: setMetaMock,
  },
}))

vi.mock("@/utils/logger", () => ({
  logger: {
    warn: loggerWarnMock,
  },
}))

function buildStableConfig(): Config {
  const config = structuredClone(DEFAULT_CONFIG)
  config.providersConfig = config.providersConfig.map((providerConfig) => {
    const apiKeyEnvName = `WXT_${providerConfig.provider.toUpperCase()}_API_KEY`
    const envApiKey = import.meta.env[apiKeyEnvName] as string | undefined
    if (!envApiKey) {
      return providerConfig
    }

    return {
      ...providerConfig,
      apiKey: envApiKey,
    }
  })
  return config
}

describe("initializeConfig", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    setItemMock.mockResolvedValue(undefined)
    setMetaMock.mockResolvedValue(undefined)
    clearMock.mockResolvedValue(undefined)
  })

  it("does not write when the config is already at the current version", async () => {
    getItemMock.mockResolvedValueOnce(buildStableConfig())

    const { initializeConfig } = await import("../init")
    await initializeConfig()

    expect(setItemMock).not.toHaveBeenCalled()
    expect(setMetaMock).not.toHaveBeenCalled()
    expect(clearMock).not.toHaveBeenCalled()
  })

  it("writes the default config when none is stored", async () => {
    getItemMock.mockResolvedValueOnce(null)

    const { initializeConfig } = await import("../init")
    await initializeConfig()

    expect(setItemMock).toHaveBeenCalledTimes(1)
    expect(setItemMock).toHaveBeenCalledWith("local:config", buildStableConfig())
    expect(setMetaMock).not.toHaveBeenCalled()
    expect(clearMock).not.toHaveBeenCalled()
  })

  it("stamps the version on a config 1.1.0 stored and drops unknown roots", async () => {
    const { version: _, ...unversioned } = buildStableConfig()
    getItemMock.mockResolvedValueOnce({ ...unversioned, tts: { defaultVoice: "en-US-GuyNeural" } })

    const { initializeConfig } = await import("../init")
    await initializeConfig()

    expect(setItemMock).toHaveBeenCalledTimes(1)
    expect(setItemMock).toHaveBeenCalledWith("local:config", buildStableConfig())
    expect(clearMock).not.toHaveBeenCalled()
  })

  it("clears local storage and records the reset when the config cannot be migrated", async () => {
    getItemMock.mockResolvedValueOnce({ ...buildStableConfig(), version: 99 })

    const { initializeConfig } = await import("../init")
    await initializeConfig()

    expect(clearMock).toHaveBeenCalledWith("local")
    expect(setItemMock).toHaveBeenCalledWith("local:config", buildStableConfig())
    expect(setMetaMock).toHaveBeenCalledWith("local:config", { resetAt: expect.any(Number) })
    expect(clearMock.mock.invocationCallOrder[0]).toBeLessThan(setItemMock.mock.invocationCallOrder[0])
    expect(loggerWarnMock).toHaveBeenCalledTimes(1)
  })
})
