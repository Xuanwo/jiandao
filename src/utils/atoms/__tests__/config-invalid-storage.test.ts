import type { Config } from "@/types/config/config"
import { createStore } from "jotai"
import { afterEach, describe, expect, it, vi } from "vitest"
import { storage } from "#imports"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { configAtom, resetConfigAtom, writeConfigAtom } from "../config"

const STORAGE_ITEM = `local:${CONFIG_STORAGE_KEY}` as const

// A config written by another version: its service has a field this version does not know.
const foreignConfig = {
  ...DEFAULT_CONFIG,
  providersConfig: DEFAULT_CONFIG.providersConfig.map(provider => ({ ...provider, apiKey: "sk-stored", futureField: true })),
}

describe("config writes over an invalid stored config", () => {
  afterEach(async () => {
    vi.restoreAllMocks()
    await storage.removeItem(STORAGE_ITEM)
  })

  it("user changes the display mode: Given a stored config that fails the schema, When the popup writes the mode, Then the write fails and the stored services stay", async () => {
    await storage.setItem(STORAGE_ITEM, foreignConfig)
    vi.spyOn(console, "error").mockImplementation(() => {})
    const store = createStore()

    await expect(store.set(writeConfigAtom, { translate: { ...DEFAULT_CONFIG.translate, mode: "translationOnly" } }))
      .rejects
      .toThrow(/stored config is invalid.*providersConfig\.0/)

    expect(await storage.getItem(STORAGE_ITEM)).toEqual(foreignConfig)
    expect(store.get(configAtom).translate.mode).toBe(DEFAULT_CONFIG.translate.mode)
  })

  it("rolls back all same-tick rejected writes and can retry after the queue drains", async () => {
    await storage.setItem(STORAGE_ITEM, foreignConfig)
    vi.spyOn(console, "error").mockImplementation(() => {})
    const store = createStore()
    const first = store.set(writeConfigAtom, { translate: { ...DEFAULT_CONFIG.translate, mode: "translationOnly" } })
    const second = store.set(writeConfigAtom, { reading: { wordPrefixEmphasis: true } })

    const results = await Promise.allSettled([first, second])

    expect(results.map(result => result.status)).toEqual(["rejected", "rejected"])
    expect(await storage.getItem(STORAGE_ITEM)).toEqual(foreignConfig)
    expect(store.get(configAtom)).toEqual(DEFAULT_CONFIG)

    await storage.setItem(STORAGE_ITEM, DEFAULT_CONFIG)
    await store.set(writeConfigAtom, { translate: { ...DEFAULT_CONFIG.translate, mode: "translationOnly" } })
    expect(store.get(configAtom).translate.mode).toBe("translationOnly")
    expect(await storage.getItem(STORAGE_ITEM)).toEqual(store.get(configAtom))
  })

  it.each([true, false])("preserves the last confirmed config when a later read fails (first write succeeds: %s)", async (firstSucceeds) => {
    const stored = { ...DEFAULT_CONFIG, reading: { wordPrefixEmphasis: true } }
    await storage.setItem(STORAGE_ITEM, stored)
    vi.spyOn(console, "error").mockImplementation(() => {})
    const getItem = storage.getItem.bind(storage)
    let reads = 0
    vi.spyOn(storage, "getItem").mockImplementation((...args) => {
      if (++reads === 2)
        return Promise.reject(new Error("Storage read failed"))
      return getItem(...args)
    })
    if (!firstSucceeds)
      vi.spyOn(storage, "setItem").mockRejectedValueOnce(new Error("Storage write failed"))
    const store = createStore()
    const translate = { ...DEFAULT_CONFIG.translate, mode: "translationOnly" as const }
    const first = store.set(writeConfigAtom, { translate })
    const second = store.set(writeConfigAtom, { reading: { wordPrefixEmphasis: true } })

    const results = await Promise.allSettled([first, second])

    expect(results.map(result => result.status)).toEqual([firstSucceeds ? "fulfilled" : "rejected", "rejected"])
    const confirmed = firstSucceeds ? { ...stored, translate } : stored
    expect(await storage.getItem(STORAGE_ITEM)).toEqual(confirmed)
    expect(store.get(configAtom)).toEqual(confirmed)
  })

  it("restores the confirmed write when a queued reset cannot be saved", async () => {
    const stored = { ...DEFAULT_CONFIG, reading: { wordPrefixEmphasis: true } }
    await storage.setItem(STORAGE_ITEM, stored)
    vi.spyOn(console, "error").mockImplementation(() => {})
    const setItem = storage.setItem.bind(storage)
    vi.spyOn(storage, "setItem")
      .mockImplementationOnce((...args) => setItem(...args))
      .mockRejectedValueOnce(new Error("Storage write failed"))
    const store = createStore()
    const translate = { ...DEFAULT_CONFIG.translate, mode: "translationOnly" as const }
    const first = store.set(writeConfigAtom, { translate })
    const reset = store.set(resetConfigAtom)

    const results = await Promise.allSettled([first, reset])

    expect(results.map(result => result.status)).toEqual(["fulfilled", "rejected"])
    expect(store.get(configAtom)).toEqual({ ...stored, translate })
    expect(await storage.getItem(STORAGE_ITEM)).toEqual({ ...stored, translate })
  })

  it("uses each store's current value as the next batch baseline", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const firstStore = createStore()
    await firstStore.set(writeConfigAtom, { reading: { wordPrefixEmphasis: true } })
    await storage.setItem(STORAGE_ITEM, foreignConfig)
    const secondStore = createStore()
    const translate = { ...DEFAULT_CONFIG.translate, mode: "translationOnly" as const }

    await expect(secondStore.set(writeConfigAtom, { translate })).rejects.toThrow("stored config is invalid")
    expect(secondStore.get(configAtom)).toEqual(DEFAULT_CONFIG)

    const refreshed = { ...DEFAULT_CONFIG, reading: { wordPrefixEmphasis: true } }
    secondStore.set(configAtom, refreshed)
    await expect(secondStore.set(writeConfigAtom, { translate })).rejects.toThrow("stored config is invalid")
    expect(secondStore.get(configAtom)).toEqual(refreshed)
  })

  it("user saves a first setting: Given no stored config, When a field is written, Then the default config with that field is stored", async () => {
    await storage.removeItem(STORAGE_ITEM)

    await createStore().set(writeConfigAtom, { translate: { ...DEFAULT_CONFIG.translate, mode: "translationOnly" } })

    const stored = await storage.getItem<Config>(STORAGE_ITEM)
    expect(stored?.translate.mode).toBe("translationOnly")
    expect(stored?.providersConfig).toEqual(DEFAULT_CONFIG.providersConfig)
  })

  it("user resets the settings on the recovery screen: Given a stored config that fails the schema, When the reset runs, Then the default config is stored", async () => {
    await storage.setItem(STORAGE_ITEM, foreignConfig)

    await createStore().set(resetConfigAtom)

    expect(await storage.getItem(STORAGE_ITEM)).toEqual(DEFAULT_CONFIG)
  })
})
