// @vitest-environment jsdom

import type { ContentScriptContext } from "#imports"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { bootstrapHostContent } from "../runtime"

const {
  messageHandlers,
  managerInstances,
  mockBindTranslationShortcutKey,
  mockDetectPageLanguageLightweight,
  mockEnsurePresetStyles,
  mockMountHostToast,
  mockOnMessage,
  mockSendMessage,
  mockSetupUrlChangeListener,
  mockWatchConfigChanges,
} = vi.hoisted(() => ({
  messageHandlers: new Map<string, (msg?: any) => any>(),
  managerInstances: [] as Array<{
    isActive: boolean
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
    restart: ReturnType<typeof vi.fn>
  }>,
  mockBindTranslationShortcutKey: vi.fn(),
  mockDetectPageLanguageLightweight: vi.fn(),
  mockEnsurePresetStyles: vi.fn(),
  mockMountHostToast: vi.fn(),
  mockOnMessage: vi.fn(),
  mockSendMessage: vi.fn(),
  mockSetupUrlChangeListener: vi.fn(),
  mockWatchConfigChanges: vi.fn(),
}))

vi.mock("@/utils/content/page-language", () => ({
  detectPageLanguageLightweight: mockDetectPageLanguageLightweight,
}))

vi.mock("@/utils/host/translate/ui/style-injector", () => ({
  ensurePresetStyles: mockEnsurePresetStyles,
}))

vi.mock("@/utils/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock("@/utils/message", () => ({
  onMessage: mockOnMessage,
  sendMessage: mockSendMessage,
}))

vi.mock("../listen", () => ({
  setupUrlChangeListener: mockSetupUrlChangeListener,
}))

vi.mock("../mount-host-toast", () => ({
  mountHostToast: mockMountHostToast,
}))

vi.mock("../translation-control/handle-config-change", () => ({
  watchConfigChanges: mockWatchConfigChanges,
}))

vi.mock("../translation-control/bind-translation-shortcut", () => ({
  bindTranslationShortcutKey: mockBindTranslationShortcutKey,
}))

vi.mock("../translation-control/page-translation", () => ({
  PageTranslationManager: class {
    isActive = false
    start = vi.fn(async () => {
      this.isActive = true
    })

    stop = vi.fn(() => {
      this.isActive = false
    })

    restart = vi.fn(async () => {
      this.isActive = true
    })

    constructor() {
      managerInstances.push(this)
    }
  },
}))

const contextCleanups: Array<() => void> = []

afterEach(() => {
  for (const cleanup of contextCleanups.splice(0))
    cleanup()
})

function createContentScriptContext() {
  const invalidationCallbacks: Array<() => void> = []
  const invalidate = () => {
    for (const callback of invalidationCallbacks.splice(0))
      callback()
  }
  contextCleanups.push(invalidate)

  return {
    ctx: {
      onInvalidated: (callback: () => void) => {
        invalidationCallbacks.push(callback)
      },
    } as ContentScriptContext,
    invalidate,
  }
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
  await Promise.resolve()
}

describe("bootstrapHostContent keeps the toggle handler whatever else fails", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    messageHandlers.clear()
    managerInstances.length = 0

    mockSetupUrlChangeListener.mockReturnValue(vi.fn())
    mockMountHostToast.mockReturnValue(vi.fn())
    mockBindTranslationShortcutKey.mockResolvedValue(vi.fn())
    mockWatchConfigChanges.mockReturnValue(vi.fn())
    mockOnMessage.mockImplementation((name: string, handler: (msg?: any) => any) => {
      messageHandlers.set(name, handler)
      return vi.fn()
    })
    mockDetectPageLanguageLightweight.mockResolvedValue({ detectedCodeOrUnd: "fra" })
    mockSendMessage.mockImplementation((name: string) =>
      Promise.resolve(name === "getEnablePageTranslationFromContentScript" ? false : undefined))
  })

  /**
   * Reading the shortcut is a storage read, and storage throws in an invalidated
   * extension context. The popup's translate button talks to a handler
   * registered in the same bootstrap, so a failure here used to leave the page
   * permanently unable to translate: nothing happened, and nothing was logged.
   */
  it("a storage read that throws while binding the shortcut leaves the toggle handler registered", async () => {
    mockBindTranslationShortcutKey.mockRejectedValue(new Error("Extension context invalidated"))

    const { ctx } = createContentScriptContext()
    await bootstrapHostContent(ctx)

    expect(messageHandlers.has("askManagerToTogglePageTranslation")).toBe(true)
  })

  it("a storage area that throws while watching the config leaves the toggle handler registered", async () => {
    mockWatchConfigChanges.mockImplementation(() => {
      throw new Error("storage.local is undefined")
    })

    const { ctx } = createContentScriptContext()
    await bootstrapHostContent(ctx)

    expect(messageHandlers.has("askManagerToTogglePageTranslation")).toBe(true)
    expect(messageHandlers.has("refreshDetectedPageLanguage")).toBe(true)
  })

  it("a failing style injection leaves the toggle handler registered", async () => {
    mockEnsurePresetStyles.mockImplementation(() => {
      throw new Error("no document")
    })

    const { ctx } = createContentScriptContext()
    await bootstrapHostContent(ctx)

    expect(messageHandlers.has("askManagerToTogglePageTranslation")).toBe(true)
  })
})

describe("bootstrapHostContent URL changes", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    messageHandlers.clear()
    managerInstances.length = 0

    mockSetupUrlChangeListener.mockReturnValue(vi.fn())
    mockMountHostToast.mockReturnValue(vi.fn())
    mockBindTranslationShortcutKey.mockResolvedValue(vi.fn())
    mockWatchConfigChanges.mockReturnValue(vi.fn())
    mockOnMessage.mockImplementation((name: string, handler: (msg?: any) => any) => {
      messageHandlers.set(name, handler)
      return vi.fn()
    })
    mockDetectPageLanguageLightweight.mockResolvedValue({ detectedCodeOrUnd: "fra" })
    mockSendMessage.mockImplementation((name: string) => {
      if (name === "getEnablePageTranslationFromContentScript")
        return Promise.resolve(false)

      return Promise.resolve(undefined)
    })
  })

  it("refreshes active page translation on same-origin SPA navigation without disabling the session", async () => {
    mockSendMessage.mockImplementation((name: string) => {
      if (name === "getEnablePageTranslationFromContentScript")
        return Promise.resolve(true)

      return Promise.resolve(undefined)
    })

    const { ctx, invalidate } = createContentScriptContext()
    await bootstrapHostContent(ctx)
    const manager = managerInstances[0]

    window.dispatchEvent(new CustomEvent("extension:URLChange", {
      detail: {
        from: "https://example.com/articles/1",
        to: "https://example.com/articles/2?ref=nav#comments",
      },
    }))
    await flushAsyncWork()

    expect(manager.start).toHaveBeenCalledTimes(1)
    expect(manager.restart).toHaveBeenCalledTimes(1)
    expect(manager.stop).not.toHaveBeenCalled()
    expect(mockSendMessage).toHaveBeenCalledWith("reportDetectedPageLanguage", {
      url: "https://example.com/articles/2?ref=nav#comments",
      detectedCodeOrUnd: "fra",
    })

    invalidate()
  })

  it("keeps inactive page translation inactive and only asks auto-translation on SPA navigation", async () => {
    const { ctx, invalidate } = createContentScriptContext()
    await bootstrapHostContent(ctx)
    const manager = managerInstances[0]

    window.dispatchEvent(new CustomEvent("extension:URLChange", {
      detail: {
        from: "https://example.com/articles/1",
        to: "https://example.com/articles/2",
      },
    }))
    await flushAsyncWork()

    expect(mockSendMessage.mock.calls.filter(([name]) => name === "reportDetectedPageLanguage")).toHaveLength(2)
    expect(manager.start).not.toHaveBeenCalled()
    expect(manager.restart).not.toHaveBeenCalled()
    expect(manager.stop).not.toHaveBeenCalled()
    expect(mockSendMessage).toHaveBeenCalledWith("reportDetectedPageLanguage", {
      url: "https://example.com/articles/2",
      detectedCodeOrUnd: "fra",
    })

    invalidate()
  })

  it("refreshes and reports detected language when background requests active-tab refresh", async () => {
    const { ctx, invalidate } = createContentScriptContext()
    await bootstrapHostContent(ctx)
    await flushAsyncWork()

    mockSendMessage.mockClear()
    mockDetectPageLanguageLightweight.mockClear()
    mockDetectPageLanguageLightweight.mockResolvedValueOnce({ detectedCodeOrUnd: "jpn" })

    const refreshHandler = messageHandlers.get("refreshDetectedPageLanguage")
    if (!refreshHandler) {
      throw new Error("Expected refreshDetectedPageLanguage handler to be registered")
    }

    refreshHandler()
    await flushAsyncWork()

    expect(mockDetectPageLanguageLightweight).toHaveBeenCalledOnce()
    expect(mockSendMessage).toHaveBeenCalledWith("reportDetectedPageLanguage", {
      url: window.location.href,
      detectedCodeOrUnd: "jpn",
    })

    invalidate()
  })
})
