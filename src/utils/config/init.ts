import type { Config } from "@/types/config/config"
import type { ConfigMeta } from "@/types/config/meta"
import { storage } from "#imports"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "../constants/config"
import { logger } from "../logger"
import { deepEqual } from "../object"
import { migrateStoredConfig } from "./migrate"

const CONFIG_KEY = `local:${CONFIG_STORAGE_KEY}` as const

/**
 * Initialize the config, this function should only be called once in the background script.
 *
 * A stored config is migrated to the current version. When it cannot be
 * (see migrateStoredConfig), everything in local storage is cleared, the
 * default config is written, and the config meta records the reset so the
 * setup prompts can tell the reader why the service is gone.
 */
export async function initializeConfig() {
  const storedConfig = await storage.getItem<unknown>(CONFIG_KEY)

  let config: Config
  let didConfigChange = false
  let conflict: string | null = null

  if (storedConfig == null) {
    config = DEFAULT_CONFIG
    didConfigChange = true
  }
  else {
    const migrated = migrateStoredConfig(storedConfig)
    if (migrated.ok) {
      config = migrated.config
      didConfigChange = !deepEqual(storedConfig, config)
    }
    else {
      conflict = migrated.reason
      config = DEFAULT_CONFIG
      didConfigChange = true
    }
  }

  if (import.meta.env.DEV) {
    const apiKeyResult = applyAPIKeysFromEnv(config)
    config = apiKeyResult.config
    didConfigChange = didConfigChange || apiKeyResult.changed
  }

  if (conflict !== null) {
    logger.warn(`Clearing the stored config: ${conflict}`)
    // Everything in local storage derives from the old config (or from builds
    // before it), so none of it is kept.
    await storage.clear("local")
    await storage.setItem<Config>(CONFIG_KEY, config)
    await storage.setMeta<ConfigMeta>(CONFIG_KEY, { resetAt: Date.now() })
    return
  }

  if (didConfigChange)
    await storage.setItem<Config>(CONFIG_KEY, config)
}

function applyAPIKeysFromEnv(config: Config): { config: Config, changed: boolean } {
  let changed = false

  const providersConfig = config.providersConfig.map((providerConfig) => {
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
