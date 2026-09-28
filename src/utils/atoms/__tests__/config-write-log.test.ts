import type { Config } from "@/types/config/config"
import { Console } from "node:console"
import { PassThrough } from "node:stream"
import { createStore } from "jotai"
import { describe, expect, it } from "vitest"
import { storage } from "#imports"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { writeConfigAtom } from "../config"

describe("writeConfigAtom", () => {
  it("user saves an invalid config: Given the storage write fails, When the error goes to the log, Then the log does not contain the API key", async () => {
    await storage.setItem<Config>(`local:${CONFIG_STORAGE_KEY}`, DEFAULT_CONFIG)
    // A config with no enabled provider fails the schema check, so the storage write fails.
    const providersConfig = DEFAULT_CONFIG.providersConfig.map(provider => ({ ...provider, apiKey: "sk-secret", enabled: false }))

    // Send the console output to a real Node console that writes to a stream that the test reads.
    // The console prints objects at all depths, so a key in a nested object also shows in the log.
    const output = new PassThrough({ encoding: "utf8" })
    let logged = ""
    output.on("data", (chunk: string) => {
      logged += chunk
    })
    const originalConsole = globalThis.console
    globalThis.console = new Console({ stdout: output, stderr: output, inspectOptions: { depth: Infinity } })
    try {
      await expect(createStore().set(writeConfigAtom, { providersConfig })).rejects.toThrow()
    }
    finally {
      globalThis.console = originalConsole
    }

    expect(logged).toContain("Failed to set config to storage:")
    expect(logged).not.toContain("sk-secret")
  })
})
