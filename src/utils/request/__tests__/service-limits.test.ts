import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing"
import { storage } from "#imports"
import { serviceLimitsKey, ServiceLimitsStore } from "../service-limits"

const DAY = 24 * 60 * 60 * 1000

describe("service limits store", () => {
  beforeEach(() => {
    fakeBrowser.reset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("keys limits by service and model", () => {
    expect(serviceLimitsKey({ id: "p1", model: "m1" })).not.toBe(serviceLimitsKey({ id: "p1", model: "m2" }))
  })

  it("keeps what was learned for the next session, in one coalesced write", async () => {
    const now = 1_000 * DAY
    const first = new ServiceLimitsStore(() => now)
    await first.load()
    first.update("p1:m1", { pace: { rate: 5, ceiling: 10 } })
    first.update("p1:m1", { batch: { maxItems: 2, maxCharacters: 400 } })
    expect(await storage.getItem("local:serviceLimits")).toBeNull()

    await vi.advanceTimersByTimeAsync(2000)

    const next = new ServiceLimitsStore(() => now)
    await next.load()
    expect(next.get("p1:m1")).toEqual({ pace: { rate: 5, ceiling: 10 }, batch: { maxItems: 2, maxCharacters: 400 }, updatedAt: now })
  })

  it("forgets services unused for 90 days", async () => {
    const now = 1_000 * DAY
    await storage.setItem("local:serviceLimits", {
      "old:m": { pace: { rate: 1, ceiling: 2 }, updatedAt: now - 91 * DAY },
      "recent:m": { pace: { rate: 3, ceiling: 4 }, updatedAt: now - DAY },
    })

    const store = new ServiceLimitsStore(() => now)
    await store.load()
    expect(store.get("old:m")).toBeUndefined()
    expect(store.get("recent:m")?.pace).toEqual({ rate: 3, ceiling: 4 })
  })
})
