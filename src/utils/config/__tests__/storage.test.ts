import type { Config } from "@/types/config/config"
import { createStore } from "jotai"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { storage } from "#imports"
import { CONFIG_VERSION } from "@/types/config/config"
import { writeConfigAtom } from "@/utils/atoms/config"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { getLocalConfig, getLocalConfigForWrite, subscribeLocalConfig, watchLocalConfig } from "../storage"

const TRANSLATION_ONLY: Config = { ...DEFAULT_CONFIG, translate: { ...DEFAULT_CONFIG.translate, mode: "translationOnly" } }
const STORAGE_ITEM = `local:${CONFIG_STORAGE_KEY}` as const
const SERVICE_CONFIG: Config = {
  ...DEFAULT_CONFIG,
  providersConfig: DEFAULT_CONFIG.providersConfig.map(provider => ({ ...provider, apiKey: "fictitious-migration-test-key" })),
}
const { version: _, ...VERSIONLESS_CONFIG } = SERVICE_CONFIG

beforeEach(() => {
  fakeBrowser.reset()
})

afterEach(() => {
  storage.unwatch()
  vi.restoreAllMocks()
})

it("user opens a same-version replacement: Given a versionless stored service, When the config is read, Then the service and current version are returned without changing storage", async () => {
  // Given
  await storage.setItem(STORAGE_ITEM, VERSIONLESS_CONFIG)
  await storage.setMeta(STORAGE_ITEM, { resetAt: 123, v: 1 })
  await storage.setItem("local:serviceLimits", { "test-service": { remaining: 7 } })
  const before = await storage.snapshot("local")

  // When
  const config = await getLocalConfig()

  // Then
  expect(config).toEqual(SERVICE_CONFIG)
  expect(await storage.snapshot("local")).toEqual(before)
})

it.each([
  ["false", false],
  ["zero", 0],
  ["empty string", ""],
  ["string", "invalid"],
  ["array", []],
  ["newer version", { ...SERVICE_CONFIG, version: CONFIG_VERSION + 1 }],
  ["invalid shape", { ...VERSIONLESS_CONFIG, translate: "invalid" }],
])("user has a conflicting config (%s): Given an invalid stored value, When it is read or used for a patch, Then reads fall back and writes reject without changing storage", async (_label, value) => {
  // Given
  await storage.setItem(STORAGE_ITEM, value)
  await storage.setMeta(STORAGE_ITEM, { resetAt: 123, v: 1 })
  await storage.setItem("local:serviceLimits", { "test-service": { remaining: 7 } })
  const before = await storage.snapshot("local")

  // When / Then
  expect(await getLocalConfig()).toEqual(DEFAULT_CONFIG)
  await expect(getLocalConfigForWrite()).rejects.toThrow("stored config is invalid")
  await expect(createStore().set(writeConfigAtom, { translate: TRANSLATION_ONLY.translate })).rejects.toThrow("stored config is invalid")
  expect(await storage.snapshot("local")).toEqual(before)
})

it.each([null, undefined])("user has no config (%s): Given a missing storage value, When it is read for display or a write, Then display gets null and the write gets defaults", async (value) => {
  // Given: WXT normally normalizes both missing values to null.
  vi.spyOn(storage, "getItem").mockResolvedValue(value)

  // When / Then
  expect(await getLocalConfig()).toBeNull()
  expect(await getLocalConfigForWrite()).toEqual(DEFAULT_CONFIG)
  expect(await storage.snapshot("local")).toEqual({})
})

it("user changes a setting before install migration: Given a versionless stored service, When the write base is read and a real config patch is saved, Then migration stays in memory until the patch persists it with the service intact", async () => {
  // Given
  await storage.setItem(STORAGE_ITEM, VERSIONLESS_CONFIG)
  await storage.setMeta(STORAGE_ITEM, { resetAt: 123, v: 1 })
  await storage.setItem("local:serviceLimits", { "test-service": { remaining: 7 } })
  const before = await storage.snapshot("local")

  // When: reading a write base must not persist the migration.
  expect(await getLocalConfigForWrite()).toEqual(SERVICE_CONFIG)
  expect(await storage.snapshot("local")).toEqual(before)

  // When: an actual user patch is saved through the production write path.
  await createStore().set(writeConfigAtom, { translate: TRANSLATION_ONLY.translate })

  // Then
  expect(await storage.snapshot("local")).toEqual({
    ...before,
    [CONFIG_STORAGE_KEY]: { ...SERVICE_CONFIG, translate: TRANSLATION_ONLY.translate },
  })
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

it("user receives versionless changes: Given a watch on a versionless stored service, When another versionless config arrives, Then both event values are migrated without writing storage", async () => {
  // Given
  await storage.setItem(STORAGE_ITEM, VERSIONLESS_CONFIG)
  await storage.setMeta(STORAGE_ITEM, { resetAt: 123, v: 1 })
  await storage.setItem("local:serviceLimits", { "test-service": { remaining: 7 } })
  const before = await storage.snapshot("local")
  const changes: Array<{ newConfig: Config | null, oldConfig: Config | null }> = []
  const unwatch = watchLocalConfig((newConfig, oldConfig) => changes.push({ newConfig, oldConfig }))
  const next = { ...VERSIONLESS_CONFIG, translate: TRANSLATION_ONLY.translate }

  // When
  await storage.setItem(STORAGE_ITEM, next)

  // Then
  await vi.waitFor(() => expect(changes).toEqual([{
    newConfig: { ...SERVICE_CONFIG, translate: TRANSLATION_ONLY.translate },
    oldConfig: SERVICE_CONFIG,
  }]))
  expect(await storage.snapshot("local")).toEqual({ ...before, [CONFIG_STORAGE_KEY]: next })
  unwatch()
})

it("user subscribes before install migration: Given a versionless stored service, When subscribing and receiving a later versionless config, Then both configs retain the service without writing storage", async () => {
  // Given
  await storage.setItem(STORAGE_ITEM, VERSIONLESS_CONFIG)
  await storage.setMeta(STORAGE_ITEM, { resetAt: 123, v: 1 })
  await storage.setItem("local:serviceLimits", { "test-service": { remaining: 7 } })
  const before = await storage.snapshot("local")
  const configs: Array<Config | null> = []

  // When: initial subscription read.
  const unsubscribe = subscribeLocalConfig(config => configs.push(config))

  // Then
  await vi.waitFor(() => expect(configs).toEqual([SERVICE_CONFIG]))
  expect(await storage.snapshot("local")).toEqual(before)

  // When: a subsequent versionless change.
  const next = { ...VERSIONLESS_CONFIG, translate: TRANSLATION_ONLY.translate }
  await storage.setItem(STORAGE_ITEM, next)

  // Then
  await vi.waitFor(() => expect(configs).toEqual([
    SERVICE_CONFIG,
    { ...SERVICE_CONFIG, translate: TRANSLATION_ONLY.translate },
  ]))
  expect(await storage.snapshot("local")).toEqual({ ...before, [CONFIG_STORAGE_KEY]: next })
  unsubscribe()
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
