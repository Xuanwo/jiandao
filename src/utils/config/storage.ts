import type { Config } from "@/types/config/config"
import type { ConfigMeta } from "@/types/config/meta"
import { storage } from "#imports"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "../constants/config"
import { logger } from "../logger"
import { migrateStoredConfig } from "./migrate"

/**
 * Migrates a stored config in memory: a same-version replacement or interrupted
 * onInstalled may leave it unmigrated. Reads never persist or clear it.
 * It gives null for a missing value and the default config for an invalid value.
 */
function parseStoredConfig(config: unknown): Config | null {
  if (config === null || config === undefined) {
    logger.warn("No config found in storage")
    return null
  }
  const migrated = migrateStoredConfig(config)
  if (!migrated.ok) {
    logger.error(`Stored config is invalid, using the default config: ${migrated.reason}`)
    return DEFAULT_CONFIG
  }
  return migrated.config
}

export async function getLocalConfig() {
  return parseStoredConfig(await storage.getItem<unknown>(`local:${CONFIG_STORAGE_KEY}`))
}

/**
 * The stored config that a partial write merges into. A missing config gives
 * the default config, because there is nothing to lose. An invalid config
 * throws: merging the patch into the default config would replace every
 * stored service.
 */
export async function getLocalConfigForWrite(): Promise<Config> {
  const stored = await storage.getItem<unknown>(`local:${CONFIG_STORAGE_KEY}`)
  if (stored === null || stored === undefined)
    return DEFAULT_CONFIG
  const migrated = migrateStoredConfig(stored)
  if (!migrated.ok)
    throw new Error(`The stored config is invalid, so nothing was saved: ${migrated.reason}`)
  return migrated.config
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

/**
 * Gives onConfig the stored config one time after the watch starts, and then
 * each new config. Returns the function that stops the watch.
 */
export function subscribeLocalConfig(onConfig: (config: Config | null) => void): () => void {
  let changed = false
  let stopped = false
  const unwatch = watchLocalConfig((newConfig) => {
    changed = true
    onConfig(newConfig)
  })
  // A change before the watch starts sends no event. Thus read the stored config after the watch starts.
  // A change event that comes first has a newer config than this read.
  void getLocalConfig().then((config) => {
    if (!changed && !stopped)
      onConfig(config)
  })
  return () => {
    stopped = true
    unwatch()
  }
}

/** Whether the stored config was cleared on a version conflict and no service has been applied since. */
export async function wasConfigReset(): Promise<boolean> {
  const meta = await storage.getMeta<ConfigMeta>(`local:${CONFIG_STORAGE_KEY}`)
  return typeof meta?.resetAt === "number"
}

/** Ends the reset notice once the reader has configured a service again. */
export async function clearConfigResetNotice(): Promise<void> {
  await storage.removeMeta(`local:${CONFIG_STORAGE_KEY}`, "resetAt")
}
