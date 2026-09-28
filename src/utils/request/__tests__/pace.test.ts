import type { PaceState } from "../pace"
import { describe, expect, it, vi } from "vitest"
import { Pace } from "../pace"

const limits = { minRate: 0.5, maxRate: 256, burstSeconds: 4 }

describe("pace", () => {
  it("doubles with every success while the service has never throttled", () => {
    const pace = new Pace(limits, { rate: 4, ceiling: null })
    for (let i = 0; i < 4; i++)
      pace.recordSuccess()
    expect(pace.rate).toBe(64)
    expect(pace.capacity).toBe(256)
  })

  it("remembers the throttled rate as the ceiling, halves, and closes half the gap to just below it per success", () => {
    const pace = new Pace(limits, { rate: 40, ceiling: null })
    pace.recordThrottle()
    expect(pace.snapshot()).toEqual({ rate: 20, ceiling: 40 })

    pace.recordSuccess()
    expect(pace.rate).toBe(28)
    pace.recordSuccess()
    expect(pace.rate).toBe(32)
    for (let i = 0; i < 20; i++)
      pace.recordSuccess()
    expect(pace.rate).toBeCloseTo(36)
    expect(pace.rate).toBeLessThan(36)
  })

  it("starts from a remembered pace instead of probing again", () => {
    const pace = new Pace(limits, { rate: 36, ceiling: 40 })
    pace.recordSuccess()
    expect(pace.rate).toBe(36)
  })

  it("raises the ceiling after 50 successes without throttling", () => {
    const pace = new Pace(limits, { rate: 36, ceiling: 40 })
    for (let i = 0; i < 49; i++)
      pace.recordSuccess()
    expect(pace.snapshot().ceiling).toBe(40)

    pace.recordSuccess()
    expect(pace.snapshot().ceiling).toBe(48)
    expect(pace.rate).toBeCloseTo(39.6)
  })

  it("keeps to the numerical guards", () => {
    const pace = new Pace(limits, { rate: 0.6, ceiling: null })
    pace.recordThrottle()
    expect(pace.rate).toBe(0.5)
    expect(pace.capacity).toBe(2)

    const fast = new Pace(limits, { rate: 200, ceiling: null })
    fast.recordSuccess()
    expect(fast.rate).toBe(256)
  })

  it("reports every change so it can be stored, and only changes", () => {
    const changes: PaceState[] = []
    const onChange = vi.fn((state: PaceState) => changes.push(state))
    const pace = new Pace(limits, { rate: 256, ceiling: null }, onChange)

    pace.recordSuccess()
    expect(onChange).not.toHaveBeenCalled()
    pace.recordThrottle()
    expect(changes).toEqual([{ rate: 128, ceiling: 256 }])
  })
})
