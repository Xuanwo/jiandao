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
