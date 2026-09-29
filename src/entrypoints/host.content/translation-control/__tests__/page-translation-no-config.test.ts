// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest"
import { PageTranslationManager } from "../page-translation"

const { mockGetLocalConfig, mockToastError } = vi.hoisted(() => ({
  mockGetLocalConfig: vi.fn(),
  mockToastError: vi.fn(),
}))

vi.mock("#imports", () => ({
  i18n: { t: (key: string) => key },
}))

vi.mock("@/components/toast", () => ({
  toast: { error: mockToastError, success: vi.fn() },
}))

vi.mock("@/utils/config/storage", () => ({
  getLocalConfig: mockGetLocalConfig,
}))

vi.mock("@/utils/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), log: vi.fn(), warn: vi.fn() },
}))

vi.mock("@/utils/message", () => ({
  onMessage: vi.fn(),
  sendMessage: vi.fn(async () => undefined),
}))

describe("page translation with nothing stored to translate with", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetLocalConfig.mockResolvedValue(null)
  })

  /**
   * The popup's translate button reaches this, and the branch used to return
   * without telling the reader anything at all.
   */
  it("tells the reader to set up a service instead of returning silently", async () => {
    const manager = new PageTranslationManager({ root: null })
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    await manager.start()

    expect(manager.isActive).toBe(false)
    expect(mockToastError).toHaveBeenCalledWith("translation.noApiKey")
    warn.mockRestore()
  })
})
