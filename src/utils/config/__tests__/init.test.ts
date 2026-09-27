import type { Config } from "@/types/config/config"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { CONFIG_SCHEMA_VERSION, DEFAULT_CONFIG } from "@/utils/constants/config"

const getItemMock = vi.fn()
const getMetaMock = vi.fn()
const setItemMock = vi.fn()
const setMetaMock = vi.fn()
const loggerWarnMock = vi.fn()

vi.mock("#imports", () => ({
  storage: {
    getItem: getItemMock,
    getMeta: getMetaMock,
    setItem: setItemMock,
    setMeta: setMetaMock,
  },
}))

vi.mock("wxt/utils/storage", () => ({
  storage: {
    getItem: getItemMock,
    getMeta: getMetaMock,
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
  })

  it("does not write when config and meta are already up to date", async () => {
    const config = buildStableConfig()
    getItemMock.mockResolvedValueOnce(config)
    getMetaMock.mockResolvedValueOnce({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      lastModifiedAt: 123,
    })

    const { initializeConfig } = await import("../init")
    await initializeConfig()

    expect(setItemMock).not.toHaveBeenCalled()
    expect(setMetaMock).not.toHaveBeenCalled()
  })

  it("writes config and meta when config is missing", async () => {
    getItemMock.mockResolvedValueOnce(null)
    getMetaMock.mockResolvedValueOnce(null)

    const { initializeConfig } = await import("../init")
    await initializeConfig()

    expect(setItemMock).toHaveBeenCalledTimes(1)
    expect(setItemMock).toHaveBeenCalledWith("local:config", expect.any(Object))
    expect(setMetaMock).toHaveBeenCalledTimes(1)
    expect(setMetaMock).toHaveBeenCalledWith("local:config", expect.objectContaining({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      lastModifiedAt: expect.any(Number),
    }))
  })

  it("persists canonical config when stored config contains unsupported roots", async () => {
    const config = buildStableConfig()
    const staleConfig = {
      ...config,
      tts: { defaultVoice: "en-US-GuyNeural" },
      videoSubtitles: { enabled: true },
      selectionToolbar: { enabled: true },
    } as Config & Record<string, unknown>

    getItemMock.mockResolvedValueOnce(staleConfig)
    getMetaMock.mockResolvedValueOnce({
      schemaVersion: 79,
      lastModifiedAt: 888,
    })

    const { initializeConfig } = await import("../init")
    await initializeConfig()

    expect(setItemMock).toHaveBeenCalledTimes(1)
    expect(setItemMock).toHaveBeenCalledWith("local:config", config)
    expect(setMetaMock).toHaveBeenCalledTimes(1)
    expect(setMetaMock).toHaveBeenCalledWith("local:config", {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      lastModifiedAt: 888,
    })
  })

  it("only updates meta when config is unchanged but lastModifiedAt is missing", async () => {
    const config = buildStableConfig()
    getItemMock.mockResolvedValueOnce(config)
    getMetaMock.mockResolvedValueOnce({
      schemaVersion: CONFIG_SCHEMA_VERSION,
    })

    const { initializeConfig } = await import("../init")
    await initializeConfig()

    expect(setItemMock).not.toHaveBeenCalled()
    expect(setMetaMock).toHaveBeenCalledTimes(1)
    expect(setMetaMock).toHaveBeenCalledWith("local:config", expect.objectContaining({
      schemaVersion: CONFIG_SCHEMA_VERSION,
      lastModifiedAt: expect.any(Number),
    }))
  })
})
