// @vitest-environment jsdom

import type { Config } from "@/types/config/config"
import { createStore } from "jotai"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { storage } from "#imports"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { configAtom, writeConfigAtom } from "../config"

const STORAGE_ITEM = `local:${CONFIG_STORAGE_KEY}` as const

function configWithApiKey(apiKey: string): Config {
  return {
    ...DEFAULT_CONFIG,
    providersConfig: DEFAULT_CONFIG.providersConfig.map(provider => ({ ...provider, apiKey })),
  }
}

function apiKeyOf(config: Config) {
  return config.providersConfig[0].apiKey
}

async function storedApiKey() {
  const stored = await storage.getItem<Config>(STORAGE_ITEM)
  return stored ? apiKeyOf(stored) : undefined
}

describe("configAtom storage sync", () => {
  const store = createStore()
  const shownApiKeys: Array<string | undefined> = []
  let unsubscribe = () => {}

  beforeEach(async () => {
    await storage.setItem(STORAGE_ITEM, configWithApiKey("stored"))
    shownApiKeys.length = 0
    unsubscribe = store.sub(configAtom, () => {
      shownApiKeys.push(apiKeyOf(store.get(configAtom)))
    })
    await vi.waitFor(() => expect(apiKeyOf(store.get(configAtom))).toBe("stored"))
    shownApiKeys.length = 0
  })

  afterEach(async () => {
    unsubscribe()
    await storage.removeItem(STORAGE_ITEM)
  })

  it("user types fast in a settings field: Given two queued writes, When the first write reaches storage, Then the field never shows the older value again", async () => {
    const first = store.set(writeConfigAtom, { providersConfig: configWithApiKey("s").providersConfig })
    const second = store.set(writeConfigAtom, { providersConfig: configWithApiKey("sk").providersConfig })
    await Promise.all([first, second])

    await vi.waitFor(async () => expect(await storedApiKey()).toBe("sk"))
    expect(apiKeyOf(store.get(configAtom))).toBe("sk")
    expect(shownApiKeys.slice(shownApiKeys.indexOf("sk"))).not.toContain("s")
  })

  it("user types while the tab becomes visible: Given another context stored a value, When the user types before the reload completes, Then the typed value stays", async () => {
    await storage.setItem(STORAGE_ITEM, configWithApiKey("remote"))
    await vi.waitFor(() => expect(apiKeyOf(store.get(configAtom))).toBe("remote"))
    shownApiKeys.length = 0

    document.dispatchEvent(new Event("visibilitychange"))
    await store.set(writeConfigAtom, { providersConfig: configWithApiKey("mine").providersConfig })

    await vi.waitFor(async () => expect(await storedApiKey()).toBe("mine"))
    expect(apiKeyOf(store.get(configAtom))).toBe("mine")
    expect(shownApiKeys.slice(shownApiKeys.indexOf("mine"))).not.toContain("remote")
  })
})
