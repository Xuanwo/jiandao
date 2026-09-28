import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import { onMessage, sendMessage } from "../message"

describe("extension messaging", () => {
  beforeEach(() => {
    fakeBrowser.reset()
  })

  it("delivers data to the handler and returns its result", async () => {
    const handler = vi.fn(async ({ data }: { data: { tabId: number } }) => data.tabId === 7)
    const off = onMessage("getEnablePageTranslationByTabId", handler)

    await expect(sendMessage("getEnablePageTranslationByTabId", { tabId: 7 })).resolves.toBe(true)
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ data: { tabId: 7 } }))
    off()
  })

  it("rethrows a handler error on the sending side", async () => {
    const off = onMessage("clearAllTranslationRelatedCache", async () => {
      throw new TypeError("storage is full")
    })

    await expect(sendMessage("clearAllTranslationRelatedCache")).rejects.toMatchObject({ name: "TypeError", message: "storage is full" })
    off()
  })

  it("ignores messages that are not Jiandao's and types without a handler", async () => {
    const off = onMessage("refreshDetectedPageLanguage", () => {})
    await expect(fakeBrowser.runtime.sendMessage({ someone: "else" })).resolves.toBeUndefined()
    await expect(sendMessage("getDetectedCode")).rejects.toThrow(/No handler answered/)
    off()
  })
})
