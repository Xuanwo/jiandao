import type { Config } from "@/types/config/config"
import { storage } from "#imports"
import { configSchema } from "@/types/config/config"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "../constants/config"
import { logger } from "../logger"

/**
 * Checks a stored config value against the config schema. It gives null for a
 * missing value and the default config for an invalid value.
 */
function parseStoredConfig(config: unknown): Config | null {
  if (!config) {
    logger.warn("No config found in storage")
    return null
  }
  const parsedConfig = configSchema.safeParse(config)
  if (!parsedConfig.success) {
    logger.error("Config is invalid, using default config")
    return DEFAULT_CONFIG
  }
  return parsedConfig.data
}

export async function getLocalConfig() {
  return parseStoredConfig(await storage.getItem<unknown>(`local:${CONFIG_STORAGE_KEY}`))
}

/**
 * Calls back with each change of the stored config. It gives the new and the
 * old value after the same check as getLocalConfig. Returns the function that
 * stops the watch.
 */
export function watchLocalConfig(callback: (newConfig: Config | null, oldConfig: Config | null) => void): () => void {
  return storage.watch<unknown>(`local:${CONFIG_STORAGE_KEY}`, (newValue, oldValue) => {
    callback(parseStoredConfig(newValue), parseStoredConfig(oldValue))
  })
}
