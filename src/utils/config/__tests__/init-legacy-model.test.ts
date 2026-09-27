import type { Config } from "@/types/config/config"
import { beforeEach, expect, it } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { storage } from "#imports"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { initializeConfig } from "../init"

const LEGACY_MODELS = {
  "openai": { model: "gpt-5-mini", isCustomModel: false, customModel: null },
  "deepseek": { model: "deepseek-chat", isCustomModel: true, customModel: "deepseek-v4-pro" },
  "openai-compatible": { model: "use-custom-model", isCustomModel: true, customModel: null },
}

beforeEach(() => {
  fakeBrowser.reset()
})

it("user upgrades with saved providers: Given a config saved with the old model fields, When the extension starts, Then each provider keeps its key and its selected model", async () => {
  // Given
  const legacy = {
    ...DEFAULT_CONFIG,
    providersConfig: DEFAULT_CONFIG.providersConfig.map(provider => ({
      ...provider,
      apiKey: `key-${provider.provider}`,
      model: LEGACY_MODELS[provider.provider],
    })),
  }
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, legacy)

  // When
  await initializeConfig()

  // Then
  const stored = await storage.getItem<Config>(`local:${CONFIG_STORAGE_KEY}`)
  expect(stored?.providersConfig.map(({ provider, apiKey, model }) => ({ provider, apiKey, model }))).toEqual([
    { provider: "openai", apiKey: "key-openai", model: "gpt-5-mini" },
    { provider: "deepseek", apiKey: "key-deepseek", model: "deepseek-v4-pro" },
    { provider: "openai-compatible", apiKey: "key-openai-compatible", model: "" },
  ])
})
