import type { Config } from "@/types/config/config"
import type { ConfigMeta } from "@/types/config/meta"
import type { NonCustomLLMProviderTypes } from "@/types/config/provider"
import { dequal } from "dequal"
import { storage } from "#imports"
import { configSchema } from "@/types/config/config"
import { isAPIProviderConfig, isNonCustomLLMProviderConfig } from "@/types/config/provider"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "../constants/config"
import { DEFAULT_LLM_PROVIDER_MODELS, THINKING_OFF_PROVIDER_OPTIONS } from "../constants/providers"
import { logger } from "../logger"

/**
 * Version 1 did not save provider options for a new provider. At request time,
 * it added options that turned off thinking for some model names. Now a
 * request sends only the saved provider options. Save the options of the
 * provider type for each provider without saved options, so that the provider
 * options field shows them and the user can change or remove them. Saved
 * options, also an empty object, do not change.
 */
function saveThinkingOffProviderOptions(config: Config): Config {
  return {
    ...config,
    providersConfig: config.providersConfig.map(providerConfig => providerConfig.providerOptions === undefined
      ? { ...providerConfig, providerOptions: THINKING_OFF_PROVIDER_OPTIONS[providerConfig.provider] }
      : providerConfig),
  }
}

/** Models that earlier versions set as the default and that OpenAI or DeepSeek retired. */
const RETIRED_DEFAULT_MODELS: Record<NonCustomLLMProviderTypes, readonly string[]> = {
  openai: ["gpt-5-mini"],
  deepseek: ["deepseek-chat", "deepseek-v4-flash"],
}

/**
 * Replaces the retired default models with the current defaults, for OpenAI
 * and DeepSeek providers that use the official API. A provider with a base
 * URL can use a relay that still serves the old model, so it keeps its model.
 * The migration runs once, so a user can select such a model again after the
 * upgrade.
 */
function replaceRetiredDefaultModels(config: Config): Config {
  return {
    ...config,
    providersConfig: config.providersConfig.map(providerConfig => isNonCustomLLMProviderConfig(providerConfig)
      && !providerConfig.baseURL?.trim()
      && RETIRED_DEFAULT_MODELS[providerConfig.provider].includes(providerConfig.model)
      ? { ...providerConfig, model: DEFAULT_LLM_PROVIDER_MODELS[providerConfig.provider] }
      : providerConfig),
  }
}

/**
 * Config changes for configs that an older version saved, in ascending
 * version order. A migration runs once, when the saved schema version is
 * lower than its version.
 */
const MIGRATIONS: readonly { version: number, migrate: (config: Config) => Config }[] = [
  { version: 2, migrate: saveThinkingOffProviderOptions },
  { version: 3, migrate: replaceRetiredDefaultModels },
]

/** The schema version that initializeConfig saves: the version of the last migration. */
export const CONFIG_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version

/**
 * Initialize the config, this function should only be called once in the background script
 * @returns The extension config
 */
export async function initializeConfig() {
  const [storedConfig, configMeta] = await Promise.all([
    storage.getItem<Config>(`local:${CONFIG_STORAGE_KEY}`),
    storage.getMeta<ConfigMeta>(`local:${CONFIG_STORAGE_KEY}`),
  ])

  let config: Config
  let didConfigChange = false

  if (!storedConfig) {
    config = DEFAULT_CONFIG
    didConfigChange = true
  }
  else {
    config = storedConfig
  }

  const parseResult = configSchema.safeParse(config)
  if (!parseResult.success) {
    logger.warn("Config is invalid, using default config")
    config = DEFAULT_CONFIG
    didConfigChange = true
  }
  else if (!dequal(config, parseResult.data)) {
    config = parseResult.data
    didConfigChange = true
  }

  // A config without schema version is from version 1. The migrations do not
  // change the default config, so a fresh install stays as it is.
  const savedSchemaVersion = configMeta?.schemaVersion ?? 1
  const migratedConfig = MIGRATIONS
    .filter(({ version }) => savedSchemaVersion < version)
    .reduce((current, { migrate }) => migrate(current), config)
  if (!dequal(migratedConfig, config)) {
    config = migratedConfig
    didConfigChange = true
  }

  if (import.meta.env.DEV) {
    const apiKeyResult = applyAPIKeysFromEnv(config)
    config = apiKeyResult.config
    didConfigChange = didConfigChange || apiKeyResult.changed
  }

  const didMetaNeedUpdate
    = configMeta?.schemaVersion !== CONFIG_SCHEMA_VERSION
      || configMeta?.lastModifiedAt === undefined

  if (didConfigChange) {
    await storage.setItem<Config>(`local:${CONFIG_STORAGE_KEY}`, config)
  }

  if (didConfigChange || didMetaNeedUpdate) {
    await storage.setMeta<ConfigMeta>(`local:${CONFIG_STORAGE_KEY}`, {
      schemaVersion: CONFIG_SCHEMA_VERSION,
      lastModifiedAt: configMeta?.lastModifiedAt ?? Date.now(),
    })
  }
}

function applyAPIKeysFromEnv(config: Config): { config: Config, changed: boolean } {
  let changed = false

  const providersConfig = config.providersConfig.map((providerConfig) => {
    if (!isAPIProviderConfig(providerConfig)) {
      return providerConfig
    }

    const apiKeyEnvName = `WXT_${providerConfig.provider.toUpperCase()}_API_KEY`
    const envApiKey = import.meta.env[apiKeyEnvName] as string | undefined
    if (!envApiKey || providerConfig.apiKey === envApiKey) {
      return providerConfig
    }

    changed = true
    return {
      ...providerConfig,
      apiKey: envApiKey,
    }
  })

  if (!changed) {
    return { config, changed: false }
  }

  return {
    config: {
      ...config,
      providersConfig,
    },
    changed: true,
  }
}
