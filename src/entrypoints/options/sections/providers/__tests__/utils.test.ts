import type { Config } from "@/types/config/config"
import type { APIProviderConfig } from "@/types/config/provider"
import { describe, expect, it, vi } from "vitest"
import { duplicateProvider } from "../utils"

type CustomProviderConfig = Extract<APIProviderConfig, { provider: "openai-compatible" }>

describe("api provider utils", () => {
  it("duplicates an existing provider config with a fresh id and unique name", async () => {
    const sourceProvider: CustomProviderConfig = {
      id: "custom-original",
      name: "Custom Provider",
      description: "shared credentials",
      enabled: true,
      provider: "openai-compatible",
      apiKey: "[REDACTED]",
      baseURL: "https://api.example.com/v1",
      temperature: 0.3,
      providerOptions: { reasoningEffort: "minimal" },
      headers: { "x-test": "enabled" },
      model: "custom-model",
    }
    const existingCopy: CustomProviderConfig = {
      ...sourceProvider,
      id: "custom-copy",
      name: "Custom Provider 1",
    }
    const providersConfig = [sourceProvider, existingCopy] as Config["providersConfig"]
    let updatedProviders: Config["providersConfig"] | undefined
    const setProvidersConfig = vi.fn(async (config: Partial<Config["providersConfig"]>) => {
      updatedProviders = config as Config["providersConfig"]
    })
    const setSelectedProviderId = vi.fn()

    const newProviderId = await duplicateProvider(
      sourceProvider,
      providersConfig,
      setProvidersConfig,
      setSelectedProviderId,
    )

    expect(newProviderId).not.toBe(sourceProvider.id)
    expect(setProvidersConfig).toHaveBeenCalledOnce()
    expect(updatedProviders).toHaveLength(3)

    const duplicatedProvider = updatedProviders?.[2] as CustomProviderConfig
    expect(duplicatedProvider).toEqual({
      ...sourceProvider,
      id: newProviderId,
      name: "Custom Provider 2",
    })
    expect(duplicatedProvider).not.toBe(sourceProvider)
    expect(duplicatedProvider.providerOptions).not.toBe(sourceProvider.providerOptions)
    expect(duplicatedProvider.headers).not.toBe(sourceProvider.headers)
    expect(setSelectedProviderId).toHaveBeenCalledWith(newProviderId)
  })
})
