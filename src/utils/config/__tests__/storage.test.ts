import type { Config } from "@/types/config/config"
import { beforeEach, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { storage } from "#imports"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { getLocalConfig, subscribeLocalConfig, watchLocalConfig } from "../storage"

const TRANSLATION_ONLY: Config = { ...DEFAULT_CONFIG, translate: { ...DEFAULT_CONFIG.translate, mode: "translationOnly" } }

beforeEach(() => {
  fakeBrowser.reset()
})

it("user stores a config that the schema rejects: Given a watch on a stored config, When an invalid value and then no value is stored, Then the watch and getLocalConfig give the same result", async () => {
  // Given
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, TRANSLATION_ONLY)
  const changes: Array<{ newConfig: Config | null, oldConfig: Config | null }> = []
  const unwatch = watchLocalConfig((newConfig, oldConfig) => changes.push({ newConfig, oldConfig }))

  // When: the invalid value
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, { translate: "invalid" })

  // Then: both give the default config.
  await vi.waitFor(() => expect(changes).toHaveLength(1))
  expect(changes[0]).toEqual({ newConfig: DEFAULT_CONFIG, oldConfig: TRANSLATION_ONLY })
  expect(await getLocalConfig()).toEqual(DEFAULT_CONFIG)

  // When: no value
  await storage.removeItem(`local:${CONFIG_STORAGE_KEY}`)

  // Then: both give null.
  await vi.waitFor(() => expect(changes).toHaveLength(2))
  expect(changes[1]).toEqual({ newConfig: null, oldConfig: DEFAULT_CONFIG })
  expect(await getLocalConfig()).toBeNull()
  unwatch()
})

it("user changes the config while a subscription starts: Given a stored config, When it changes before the first read of the subscription ends, Then the subscriber ends with the new config", async () => {
  // Given
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, DEFAULT_CONFIG)
  const modes: Array<string | undefined> = []

  // When
  const unsubscribe = subscribeLocalConfig(config => modes.push(config?.translate.mode))
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, TRANSLATION_ONLY)
  // Storage reads end in the order that they start. Thus the first read of the subscription ends before this read.
  await getLocalConfig()

  // Then
  expect(modes.at(-1), `modes in the order the subscriber got them: ${modes.join(", ")}`).toBe("translationOnly")
  unsubscribe()
})

it("user leaves the page while a subscription starts: Given a stored config, When the subscription stops before its first read ends, Then the subscriber gets no config", async () => {
  // Given
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, TRANSLATION_ONLY)
  const modes: Array<string | undefined> = []

  // When
  const unsubscribe = subscribeLocalConfig(config => modes.push(config?.translate.mode))
  unsubscribe()
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, DEFAULT_CONFIG)
  await getLocalConfig()

  // Then
  expect(modes).toEqual([])
})
