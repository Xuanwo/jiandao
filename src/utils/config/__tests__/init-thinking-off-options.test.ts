import type { Config } from "@/types/config/config"
import type { ConfigMeta } from "@/types/config/meta"
import type { LLMProviderTypes } from "@/types/config/provider"
import { beforeEach, expect, it } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { storage } from "#imports"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { CONFIG_SCHEMA_VERSION, initializeConfig } from "../init"

type SavedOptions = Record<LLMProviderTypes, Record<string, unknown> | undefined>

const NO_OPTIONS: SavedOptions = { "openai": undefined, "deepseek": undefined, "openai-compatible": undefined }

const THINKING_OFF: SavedOptions = {
  "openai": { reasoningEffort: "none" },
  "deepseek": { thinking: { type: "disabled" } },
  "openai-compatible": { reasoningEffort: "none" },
}

beforeEach(() => {
  fakeBrowser.reset()
})

async function storedOptions() {
  const stored = await storage.getItem<Config>(`local:${CONFIG_STORAGE_KEY}`)
  if (!stored)
    throw new Error("The extension saved no config")
  return Object.fromEntries(stored.providersConfig.map(provider => [provider.provider, provider.providerOptions]))
}

async function start(providerOptions: SavedOptions, meta?: ConfigMeta) {
  const saved = {
    ...DEFAULT_CONFIG,
    providersConfig: DEFAULT_CONFIG.providersConfig.map(provider => ({ ...provider, providerOptions: providerOptions[provider.provider] })),
  }
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, saved)
  if (meta)
    await storage.setMeta(`local:${CONFIG_STORAGE_KEY}`, meta)
  await initializeConfig()
  return storedOptions()
}

it("user upgrades with providers without saved options: Given a config of version 1, When the extension starts, Then each provider shows the options of its type that turn off thinking", async () => {
  expect(await start(NO_OPTIONS, { schemaVersion: 1, lastModifiedAt: 1 })).toEqual(THINKING_OFF)
})

it.each([
  [{}],
  [{ reasoningEffort: "low" }],
])("user upgrades with saved options %j: Given the saved options, When the extension starts, Then they stay", async (options) => {
  expect(await start({ "openai": options, "deepseek": options, "openai-compatible": options })).toEqual({
    "openai": options,
    "deepseek": options,
    "openai-compatible": options,
  })
})

it("user removes the options after the upgrade: Given no saved options in the current version, When the extension starts again, Then the options stay removed", async () => {
  expect(await start(NO_OPTIONS, { schemaVersion: CONFIG_SCHEMA_VERSION, lastModifiedAt: 1 })).toEqual(NO_OPTIONS)
})

it("user installs the extension: Given no saved config, When the extension starts, Then each provider has the options of its type and the current schema version", async () => {
  await initializeConfig()

  expect(await storedOptions()).toEqual(THINKING_OFF)
  expect((await storage.getMeta<ConfigMeta>(`local:${CONFIG_STORAGE_KEY}`)).schemaVersion).toBe(CONFIG_SCHEMA_VERSION)
})
