import type { Config } from "@/types/config/config"
import { beforeEach, expect, it } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { storage } from "#imports"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { initializeConfig } from "../init"

beforeEach(() => {
  fakeBrowser.reset()
})

it("user updates from a version without reading settings: Given a stored config without them, When the background initializes the config, Then the other settings stay and word-prefix emphasis is off", async () => {
  // Given
  const older = Object.fromEntries(Object.entries({ ...DEFAULT_CONFIG, language: { ...DEFAULT_CONFIG.language, targetCode: "jpn" } }).filter(([key]) => key !== "reading"))
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, older)

  // When
  await initializeConfig()

  // Then
  const config = await storage.getItem<Config>(`local:${CONFIG_STORAGE_KEY}`)
  expect(config?.language.targetCode).toBe("jpn")
  expect(config?.reading).toEqual({ wordPrefixEmphasis: false })
})
