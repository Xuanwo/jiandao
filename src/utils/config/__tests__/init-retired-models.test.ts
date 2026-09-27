import type { Config } from "@/types/config/config"
import { beforeEach, expect, it } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { storage } from "#imports"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { CONFIG_SCHEMA_VERSION, initializeConfig } from "../init"

beforeEach(() => {
  fakeBrowser.reset()
})

async function storedModels() {
  const stored = await storage.getItem<Config>(`local:${CONFIG_STORAGE_KEY}`)
  return stored?.providersConfig.map(({ provider, apiKey, model }) => ({ provider, apiKey, model }))
}

async function startWithModels(models: Record<string, string>) {
  const saved = {
    ...DEFAULT_CONFIG,
    providersConfig: DEFAULT_CONFIG.providersConfig.map(provider => ({ ...provider, apiKey: `key-${provider.provider}`, model: models[provider.provider] ?? provider.model })),
  }
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, saved)
  await initializeConfig()
  return storedModels()
}

it.each([
  ["gpt-5-mini", "deepseek-v4-flash"],
  ["gpt-5-mini", "deepseek-chat"],
])("user upgrades with the old default models %s and %s: Given they are saved, When the extension starts, Then OpenAI uses gpt-6-luna, DeepSeek uses deepseek-flash, and the keys stay", async (openai, deepseek) => {
  expect(await startWithModels({ openai, deepseek })).toEqual([
    { provider: "openai", apiKey: "key-openai", model: "gpt-6-luna" },
    { provider: "deepseek", apiKey: "key-deepseek", model: "deepseek-flash" },
    { provider: "openai-compatible", apiKey: "key-openai-compatible", model: "" },
  ])
})

it("user chose other models: Given current OpenAI and DeepSeek models and a custom provider that serves gpt-5-mini, When the extension starts, Then every model stays", async () => {
  expect(await startWithModels({ "openai": "gpt-5.4-mini", "deepseek": "deepseek-v4-pro", "openai-compatible": "gpt-5-mini" })).toEqual([
    { provider: "openai", apiKey: "key-openai", model: "gpt-5.4-mini" },
    { provider: "deepseek", apiKey: "key-deepseek", model: "deepseek-v4-pro" },
    { provider: "openai-compatible", apiKey: "key-openai-compatible", model: "gpt-5-mini" },
  ])
})

it("user upgrades from a version with the old model fields: Given deepseek-chat saved as a catalog model, When the extension starts, Then DeepSeek uses deepseek-flash", async () => {
  const saved = {
    ...DEFAULT_CONFIG,
    providersConfig: DEFAULT_CONFIG.providersConfig.map(provider => provider.provider === "deepseek"
      ? { ...provider, model: { model: "deepseek-chat", isCustomModel: false, customModel: null } }
      : provider),
  }
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, saved)

  await initializeConfig()

  expect((await storedModels())?.find(provider => provider.provider === "deepseek")?.model).toBe("deepseek-flash")
})

it("user selects a retired model after the upgrade: Given gpt-5-mini saved by the current version, When the extension starts again, Then OpenAI keeps gpt-5-mini", async () => {
  const saved = { ...DEFAULT_CONFIG, providersConfig: DEFAULT_CONFIG.providersConfig.map(provider => provider.provider === "openai" ? { ...provider, model: "gpt-5-mini" } : provider) }
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, saved)
  await storage.setMeta(`local:${CONFIG_STORAGE_KEY}`, { schemaVersion: CONFIG_SCHEMA_VERSION, lastModifiedAt: 1 })

  await initializeConfig()

  expect((await storedModels())?.find(provider => provider.provider === "openai")?.model).toBe("gpt-5-mini")
})

it("user reaches OpenAI and DeepSeek through a relay: Given the old default models and a relay base URL, When the extension starts, Then the models stay", async () => {
  const relay: Record<string, string> = { openai: "https://relay.example.com/v1", deepseek: "https://relay.example.com/deepseek" }
  const saved = {
    ...DEFAULT_CONFIG,
    providersConfig: DEFAULT_CONFIG.providersConfig.map(provider => provider.provider in relay
      ? { ...provider, baseURL: relay[provider.provider], model: provider.provider === "openai" ? "gpt-5-mini" : "deepseek-chat" }
      : provider),
  }
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, saved)

  await initializeConfig()

  const stored = await storage.getItem<Config>(`local:${CONFIG_STORAGE_KEY}`)
  expect(stored?.providersConfig.filter(provider => provider.provider in relay).map(({ provider, model }) => ({ provider, model }))).toEqual([
    { provider: "openai", model: "gpt-5-mini" },
    { provider: "deepseek", model: "deepseek-chat" },
  ])
})
