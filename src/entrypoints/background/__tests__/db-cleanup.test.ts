import { beforeEach, describe, expect, it, vi } from "vitest"

const alarmsGetMock = vi.fn()
const alarmsCreateMock = vi.fn()
const alarmsAddListenerMock = vi.fn()

const translationDeleteOlderThanMock = vi.fn()

const summaryDeleteOlderThanMock = vi.fn()

const loggerInfoMock = vi.fn()
const loggerErrorMock = vi.fn()

vi.mock("#imports", () => ({
  browser: {
    alarms: {
      get: alarmsGetMock,
      create: alarmsCreateMock,
      onAlarm: {
        addListener: alarmsAddListenerMock,
      },
    },
  },
}))

vi.mock("wxt/browser", () => ({
  browser: {
    alarms: {
      get: alarmsGetMock,
      create: alarmsCreateMock,
      onAlarm: {
        addListener: alarmsAddListenerMock,
      },
    },
  },
}))

vi.mock("@/utils/db/cache-db", () => ({
  cacheDb: {
    translationCache: {
      deleteOlderThan: translationDeleteOlderThanMock,
      clear: vi.fn(),
    },
    articleSummaryCache: {
      deleteOlderThan: summaryDeleteOlderThanMock,
      clear: vi.fn(),
    },
  },
}))

vi.mock("@/utils/logger", () => ({
  logger: {
    info: loggerInfoMock,
    error: loggerErrorMock,
  },
}))

describe("setUpDatabaseCleanup", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()

    alarmsGetMock.mockResolvedValue(null)
    alarmsCreateMock.mockResolvedValue(undefined)

    translationDeleteOlderThanMock.mockResolvedValue(0)
    summaryDeleteOlderThanMock.mockResolvedValue(0)
  })

  it("does not run cleanup immediately on setup", async () => {
    const { setUpDatabaseCleanup } = await import("../db-cleanup")
    await setUpDatabaseCleanup()

    expect(alarmsCreateMock).toHaveBeenCalledTimes(2)
    expect(alarmsAddListenerMock).toHaveBeenCalledTimes(1)

    expect(translationDeleteOlderThanMock).not.toHaveBeenCalled()
    expect(summaryDeleteOlderThanMock).not.toHaveBeenCalled()
  })

  it("does not recreate alarms when they already exist", async () => {
    alarmsGetMock
      .mockResolvedValueOnce({ name: "cache-cleanup" })
      .mockResolvedValueOnce({ name: "summary-cache-cleanup" })

    const { setUpDatabaseCleanup } = await import("../db-cleanup")
    await setUpDatabaseCleanup()

    expect(alarmsCreateMock).not.toHaveBeenCalled()
  })

  it("runs only the matching cleanup handler for each alarm", async () => {
    let alarmListener: ((alarm: { name: string }) => Promise<void>) | undefined
    alarmsAddListenerMock.mockImplementation((listener: (alarm: { name: string }) => Promise<void>) => {
      alarmListener = listener
    })

    const {
      setUpDatabaseCleanup,
      SUMMARY_CACHE_CLEANUP_ALARM,
      TRANSLATION_CACHE_CLEANUP_ALARM,
    } = await import("../db-cleanup")

    await setUpDatabaseCleanup()
    if (!alarmListener) {
      throw new Error("Alarm listener was not registered")
    }

    await alarmListener({ name: TRANSLATION_CACHE_CLEANUP_ALARM })
    expect(translationDeleteOlderThanMock).toHaveBeenCalledTimes(1)
    expect(summaryDeleteOlderThanMock).not.toHaveBeenCalled()

    await alarmListener({ name: SUMMARY_CACHE_CLEANUP_ALARM })
    expect(summaryDeleteOlderThanMock).toHaveBeenCalledTimes(1)
  })
})
