import { afterEach, describe, expect, it, vi } from "vitest"
import { Pace } from "../pace"
import { RequestQueue } from "../request-queue"

// Convenience helper: returns a thunk that resolves with <value>
// after <delayMs> real / fake milliseconds.
function makeThunk<T>(value: T, delayMs = 0) {
  return () =>
    new Promise<T>(res => setTimeout(res, delayMs, value))
}

// rejectThunk – rejects after delayMs
function rejectThunk(error: any, delayMs = 0) {
  return () =>
    new Promise((_, rej) => setTimeout(rej, delayMs, error))
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// A basic queue config we reuse (easy to tweak per‑test)
const baseConfig = {
  rate: 1, // 1 token / sec
  capacity: 1, // bucket size 1
  timeoutMs: 10_000,
  maxRetries: 0,
  baseRetryDelayMs: 100,
} as const

// Restore timers after each test so later suites aren't affected.
afterEach(() => {
  vi.useRealTimers()
})

// 1. Happy‑path: single task resolves.
describe("requestQueue – happy path", () => {
  it("resolves a single task", async () => {
    const q = new RequestQueue(baseConfig)
    const result = await q.enqueue(makeThunk("OK"), Date.now(), "one")
    expect(result).toBe("OK")
  })

  it("works with fake timers", async () => {
    vi.useFakeTimers()

    const q = new RequestQueue({
      ...baseConfig,
    })

    let executed = false
    const thunk = () => {
      executed = true
      return Promise.resolve("test")
    }

    const promise = q.enqueue(thunk, Date.now(), "test")

    vi.advanceTimersByTime(0)

    expect(executed).toBe(true)
    await expect(promise).resolves.toBe("test")
  })

  // 调试测试：检查带延迟的任务
  it("works with delayed thunks", async () => {
    vi.useFakeTimers()

    const q = new RequestQueue({
      ...baseConfig,
    })

    let executed = false
    let completed = false
    const delayedThunk = () => {
      executed = true
      return new Promise((resolve) => {
        setTimeout(() => {
          completed = true
          resolve("delayed")
        }, 1000)
      })
    }

    const promise = q.enqueue(delayedThunk, Date.now(), "delayed")

    vi.advanceTimersByTime(0)
    expect(executed).toBe(true)
    expect(completed).toBe(false)

    vi.advanceTimersByTime(1000)
    expect(completed).toBe(true)
    await expect(promise).resolves.toBe("delayed")
  })
})

// 2. Duplicate hash returns same promise instance & value.
describe("requestQueue – de‑duplication", () => {
  it("re‑uses the first task for identical hash", async () => {
    const q = new RequestQueue(baseConfig)

    const p1 = q.enqueue(makeThunk("A"), Date.now(), "dup")
    const p2 = q.enqueue(makeThunk("B"), Date.now(), "dup") // thunk should never run

    // Same promise object (because enqueue now returns duplicateTask.promise directly)
    expect(p1).toBe(p2)

    const [v1, v2] = await Promise.all([p1, p2])
    expect(v1).toBe("A")
    expect(v2).toBe("A")
  })
})

// 3. Token‑bucket rate limiting.
//    capacity = 1, rate = 1 token / sec → tasks should execute at t = 0s, 1s, 2s…
describe("requestQueue – token bucket", () => {
  it("executes tasks no faster than rate permits", async () => {
    vi.useFakeTimers()

    const q = new RequestQueue({
      ...baseConfig,
    })
    const completed: number[] = []

    const trackingThunk = (id: number) => () => {
      return new Promise((resolve) => {
        setTimeout(() => {
          completed.push(id)
          resolve(id)
        }, 1000)
      })
    }

    // enqueue 3 tasks immediately, each takes 1000ms to complete
    void q.enqueue(trackingThunk(0), Date.now(), "0")
    void q.enqueue(trackingThunk(1), Date.now(), "1")
    void q.enqueue(trackingThunk(2), Date.now(), "2")

    // t=1000ms: 第一个任务应该完成
    vi.advanceTimersByTime(1_000)

    expect(completed).toEqual([0])

    // t=2000ms: The second task should be completed (started at t=1000ms, completed at t=2000ms)
    vi.advanceTimersByTime(1_000)
    expect(completed).toEqual([0, 1])

    // t=3000ms: The third task should be completed (started at t=2000ms, completed at t=3000ms)
    vi.advanceTimersByTime(1_000)
    expect(completed).toEqual([0, 1, 2])
  })
})

// 4. scheduleAt in the future should delay execution even when tokens are available.
describe("requestQueue – respects scheduleAt", () => {
  it("delays task until scheduleAt time", async () => {
    vi.useFakeTimers()

    const q = new RequestQueue({
      ...baseConfig,
    })
    const completed: string[] = []

    const trackingThunk = (id: string) => () => {
      return new Promise((resolve) => {
        completed.push(id)
        resolve(id)
      })
    }

    // Task A scheduled now, task B scheduled 2s later
    const now = Date.now()
    void q.enqueue(trackingThunk("A"), now, "A")
    void q.enqueue(trackingThunk("B"), now + 2000, "B")

    vi.advanceTimersByTime(0)
    expect(completed).toEqual(["A"])

    vi.advanceTimersByTime(1999)
    expect(completed).toEqual(["A"])

    vi.advanceTimersByTime(1)
    expect(completed).toEqual(["A", "B"])
  })
})

// 5. Rejection propagates.
describe("requestQueue – error propagation", () => {
  it("rejects when thunk rejects", async () => {
    vi.useFakeTimers()
    const q = new RequestQueue({
      ...baseConfig,
    })

    const err = new Error("boom")
    const p = q.enqueue(rejectThunk(err, 1000), Date.now(), "err")

    vi.advanceTimersByTime(1000)
    await expect(p).rejects.toBe(err)
  })
})

// 6. High‑volume: 100 tasks should all resolve.
describe("requestQueue – high volume", () => {
  it("drains 100 tasks without starvation or leaks", async () => {
    vi.useFakeTimers()
    const q = new RequestQueue({
      ...baseConfig,
      rate: 5,
      capacity: 5,
    }) // 5 / sec
    const count = 100
    const completed: number[] = []

    const trackingThunk = (id: number) => () => {
      return new Promise((resolve) => {
        completed.push(id)
        resolve(id)
      })
    }

    for (let i = 0; i < count; i++) {
      void q.enqueue(trackingThunk(i), Date.now(), `task-${i}`)
    }

    // Advance time enough: 100 tasks, initial 5 tokens, then 5 per sec
    // First 5 tasks execute immediately, remaining 95 tasks need 95/5 = 19 seconds
    vi.advanceTimersByTime(19_000)
    expect(completed).toHaveLength(count)
  })
})

// 7. Bucket refills after idle period.
describe("requestQueue – bucket refill while idle", () => {
  it("restores capacity when queue sleeps", async () => {
    vi.useFakeTimers()
    const q = new RequestQueue({
      ...baseConfig,
      rate: 2,
      capacity: 2,
    })

    const completed: string[] = []
    const trackingThunk = (id: string) => () => {
      return new Promise((resolve) => {
        completed.push(id)
        resolve(id)
      })
    }

    // Use up both initial tokens
    void q.enqueue(trackingThunk("x"), Date.now(), "x")
    void q.enqueue(trackingThunk("y"), Date.now(), "y")

    vi.advanceTimersByTime(0)
    expect(completed).toEqual(["x", "y"])

    // At this moment bucketTokens == 0. Wait 1500 ms (rate 2/s → add 3 tokens)
    vi.advanceTimersByTime(1500)

    // New task should run immediately because capacity refilled to ≥1
    void q.enqueue(trackingThunk("z"), Date.now(), "z")
    expect(completed).toEqual(["x", "y", "z"])
  })
})

// 8. Timeout handling
describe("requestQueue – timeout handling", () => {
  it("rejects task when it exceeds timeout", async () => {
    vi.useFakeTimers()
    const q = new RequestQueue({
      ...baseConfig,
      timeoutMs: 2000,
    })

    // Task that takes 3000ms (longer than 2000ms timeout)
    const slowThunk = () => new Promise(resolve =>
      setTimeout(resolve, 3000, "too-slow"),
    )

    const promise = q.enqueue(slowThunk, Date.now(), "slow")

    // Advance to timeout
    vi.advanceTimersByTime(2000)

    await expect(promise).rejects.toThrow("Task")
    await expect(promise).rejects.toThrow("timed out after 2000ms")
  })

  it("resolves task when it completes before timeout", async () => {
    vi.useFakeTimers()
    const q = new RequestQueue({
      ...baseConfig,
      timeoutMs: 2000,
    })

    // Task that takes 1000ms (less than 2000ms timeout)
    const fastThunk = () => new Promise(resolve =>
      setTimeout(resolve, 1000, "fast"),
    )

    const promise = q.enqueue(fastThunk, Date.now(), "fast")

    vi.advanceTimersByTime(1000)

    await expect(promise).resolves.toBe("fast")
  })
})

// 9. Retry functionality
describe("requestQueue – retry functionality", () => {
  it("succeeds when retry eventually works", async () => {
    vi.useFakeTimers()
    let attempts = 0

    const q = new RequestQueue({
      ...baseConfig,
      maxRetries: 3,
      baseRetryDelayMs: 100,
    })

    const eventuallySucceedsThunk = () => {
      attempts++
      if (attempts < 2) { // Change to succeed on second attempt
        return Promise.reject(new Error(`Attempt ${attempts} failed`))
      }
      return Promise.resolve("success!")
    }

    const promise = q.enqueue(eventuallySucceedsThunk, Date.now(), "eventual-success")

    // Wait for retries to happen
    await vi.advanceTimersByTimeAsync(1000)

    expect(attempts).toBe(2)
    await expect(promise).resolves.toBe("success!")
  })

  it("does not retry when maxRetries is 0", async () => {
    vi.useFakeTimers()
    let attempts = 0

    const q = new RequestQueue({
      ...baseConfig,
      maxRetries: 0,
      baseRetryDelayMs: 100,
    })

    const failingThunk = () => {
      attempts++
      return Promise.reject(new Error("Always fails"))
    }

    const promise = q.enqueue(failingThunk, Date.now(), "no-retry")
    promise.catch(() => {})

    await vi.advanceTimersByTimeAsync(0)
    expect(attempts).toBe(1)

    await vi.advanceTimersByTimeAsync(1000)
    expect(attempts).toBe(1) // Still only 1 attempt

    await expect(promise).rejects.toThrow("Always fails")
  })

  it("implements exponential backoff delays", async () => {
    vi.useFakeTimers()
    const q = new RequestQueue({
      ...baseConfig,
      maxRetries: 2,
      baseRetryDelayMs: 1000,
    })

    let attempts = 0
    const failingThunk = () => {
      attempts++
      return Promise.reject(new Error("fail"))
    }

    const promise = q.enqueue(failingThunk, Date.now(), "backoff")
    promise.catch(() => {})

    // Initial execution
    await vi.advanceTimersByTimeAsync(0)
    expect(attempts).toBe(1)

    // After 500ms, should not have retried yet (first retry delay is ~1000ms)
    await vi.advanceTimersByTimeAsync(500)
    expect(attempts).toBe(1)

    // After 1200ms total, should have done first retry
    await vi.advanceTimersByTimeAsync(700)
    expect(attempts).toBe(2)

    // After another 1500ms, should not have retried yet (second retry delay is ~2000ms)
    await vi.advanceTimersByTimeAsync(1500)
    expect(attempts).toBe(2)

    // After another 1000ms (total ~3700ms), should have done second retry
    await vi.advanceTimersByTimeAsync(1000)
    expect(attempts).toBe(3)

    await expect(promise).rejects.toThrow("fail")
  })
})

// 10. Retry with timeout combined
describe("requestQueue – retry with timeout combined", () => {
  it("basic timeout functionality works", async () => {
    vi.useFakeTimers()

    const q = new RequestQueue({
      ...baseConfig,
      maxRetries: 0, // No retries for simplicity
      timeoutMs: 100,
    })

    const timeoutThunk = () => {
      // Task takes 200ms, but timeout is 100ms
      return new Promise(resolve => setTimeout(resolve, 200, "too slow"))
    }

    const promise = q.enqueue(timeoutThunk, Date.now(), "timeout-test")
    promise.catch(() => {})

    // Let the timeout happen
    await vi.advanceTimersByTimeAsync(150)

    // Should reject with timeout error
    await expect(promise).rejects.toThrow("timed out after 100ms")
  })
})

// 11. Retry policy and queue fail-fast drain
describe("requestQueue – retry policy and queue fail-fast drain", () => {
  it.each([
    {
      name: "400",
      createError: () => Object.assign(new Error("Bad Request"), { statusCode: 400 }),
    },
    {
      name: "isRetryable false",
      createError: () => Object.assign(new Error("Do not retry"), { isRetryable: false }),
    },
  ])("fails only the current task for $name", async ({ createError }) => {
    vi.useFakeTimers()
    let attempts = 0

    const q = new RequestQueue({
      ...baseConfig,
      rate: 10,
      capacity: 1,
      maxRetries: 2,
      baseRetryDelayMs: 100,
    })

    const error = createError()
    const completed: string[] = []

    const firstPromise = q.enqueue(() => {
      attempts++
      return Promise.reject(error)
    }, Date.now(), "current-only")
    firstPromise.catch(() => {})

    const secondPromise = q.enqueue(() => {
      completed.push("second")
      return Promise.resolve("second")
    }, Date.now(), "second")

    await vi.advanceTimersByTimeAsync(100)

    expect(attempts).toBe(1)
    expect(completed).toEqual(["second"])
    await expect(firstPromise).rejects.toBe(error)
    await expect(secondPromise).resolves.toBe("second")
  })

  it("drains waiting tasks immediately after a 429", async () => {
    vi.useFakeTimers()

    const q = new RequestQueue({
      ...baseConfig,
      rate: 10,
      capacity: 1,
      maxRetries: 2,
      baseRetryDelayMs: 100,
    })

    const completed: string[] = []
    const rateLimitedError = Object.assign(new Error("Too Many Requests"), {
      statusCode: 429,
      responseHeaders: {
        "retry-after": "2",
      },
    })

    const firstPromise = q.enqueue(
      () => Promise.reject(rateLimitedError),
      Date.now(),
      "first",
    )
    firstPromise.catch(() => {})

    const secondPromise = q.enqueue(
      () => {
        completed.push("second")
        return Promise.resolve("second")
      },
      Date.now(),
      "second",
    )
    secondPromise.catch(() => {})

    await vi.advanceTimersByTimeAsync(0)

    expect(completed).toEqual([])
    await expect(firstPromise).rejects.toBe(rateLimitedError)
    await expect(secondPromise).rejects.toBe(rateLimitedError)
  })

  it("drains other executing tasks immediately after a 429", async () => {
    vi.useFakeTimers()

    const q = new RequestQueue({
      ...baseConfig,
      rate: 10,
      capacity: 2,
      maxRetries: 2,
      baseRetryDelayMs: 100,
    })

    const rateLimitedError = Object.assign(new Error("Too Many Requests"), {
      statusCode: 429,
    })
    const secondDeferred = createDeferred<string>()

    const firstPromise = q.enqueue(
      () => Promise.reject(rateLimitedError),
      Date.now(),
      "first",
    )
    firstPromise.catch(() => {})

    const secondPromise = q.enqueue(
      () => secondDeferred.promise,
      Date.now(),
      "second",
    )
    secondPromise.catch(() => {})

    await vi.advanceTimersByTimeAsync(0)

    await expect(firstPromise).rejects.toBe(rateLimitedError)
    await expect(secondPromise).rejects.toBe(rateLimitedError)

    secondDeferred.resolve("late success")
    await vi.advanceTimersByTimeAsync(0)
    await expect(secondPromise).rejects.toBe(rateLimitedError)
  })

  it("ignores drained in-flight failures and allows new enqueues after a 429", async () => {
    vi.useFakeTimers()

    const q = new RequestQueue({
      ...baseConfig,
      rate: 10,
      capacity: 3,
      maxRetries: 2,
      baseRetryDelayMs: 100,
    })

    const rateLimitedError = Object.assign(new Error("Too Many Requests"), {
      statusCode: 429,
    })
    const laterError = Object.assign(new Error("Unauthorized"), {
      statusCode: 401,
    })
    const oldDeferred = createDeferred<string>()
    const newDeferred = createDeferred<string>()

    const firstPromise = q.enqueue(
      () => Promise.reject(rateLimitedError),
      Date.now(),
      "first",
    )
    firstPromise.catch(() => {})

    const oldPromise = q.enqueue(
      () => oldDeferred.promise,
      Date.now(),
      "old",
    )
    oldPromise.catch(() => {})

    await vi.advanceTimersByTimeAsync(0)
    await expect(oldPromise).rejects.toBe(rateLimitedError)

    const newPromise = q.enqueue(
      () => newDeferred.promise,
      Date.now(),
      "new",
    )

    oldDeferred.reject(laterError)
    await vi.advanceTimersByTimeAsync(0)

    newDeferred.resolve("new success")
    await vi.advanceTimersByTimeAsync(0)

    await expect(firstPromise).rejects.toBe(rateLimitedError)
    await expect(newPromise).resolves.toBe("new success")
  })

  it("does not let old in-flight task cleanup remove a new task with the same hash", async () => {
    vi.useFakeTimers()

    const q = new RequestQueue({
      ...baseConfig,
      rate: 10,
      capacity: 3,
      maxRetries: 2,
      baseRetryDelayMs: 100,
    })

    const rateLimitedError = Object.assign(new Error("Too Many Requests"), {
      statusCode: 429,
    })
    const oldDeferred = createDeferred<string>()
    const newDeferred = createDeferred<string>()
    let duplicateStarted = false

    const firstPromise = q.enqueue(
      () => Promise.reject(rateLimitedError),
      Date.now(),
      "first",
    )
    firstPromise.catch(() => {})

    const oldPromise = q.enqueue(
      () => oldDeferred.promise,
      Date.now(),
      "same",
    )
    oldPromise.catch(() => {})

    await vi.advanceTimersByTimeAsync(0)
    await expect(oldPromise).rejects.toBe(rateLimitedError)

    const newPromise = q.enqueue(
      () => newDeferred.promise,
      Date.now(),
      "same",
    )

    oldDeferred.resolve("old success")
    await vi.advanceTimersByTimeAsync(0)

    const duplicatePromise = q.enqueue(
      () => {
        duplicateStarted = true
        return Promise.resolve("duplicate")
      },
      Date.now(),
      "same",
    )

    expect(duplicatePromise).toBe(newPromise)
    expect(duplicateStarted).toBe(false)

    newDeferred.resolve("new success")
    await vi.advanceTimersByTimeAsync(0)

    await expect(firstPromise).rejects.toBe(rateLimitedError)
    await expect(newPromise).resolves.toBe("new success")
  })

  it.each([401, 403, 404])("drains the current backlog after a %s", async (statusCode) => {
    vi.useFakeTimers()

    const q = new RequestQueue({
      ...baseConfig,
      rate: 10,
      capacity: 1,
      maxRetries: 2,
      baseRetryDelayMs: 100,
    })

    const completed: string[] = []
    const error = Object.assign(new Error(`HTTP ${statusCode}`), {
      statusCode,
    })

    const firstPromise = q.enqueue(
      () => Promise.reject(error),
      Date.now(),
      "first",
    )
    firstPromise.catch(() => {})

    const secondPromise = q.enqueue(
      () => {
        completed.push("second")
        return Promise.resolve("second")
      },
      Date.now(),
      "second",
    )
    secondPromise.catch(() => {})

    await vi.advanceTimersByTimeAsync(0)

    expect(completed).toEqual([])
    await expect(firstPromise).rejects.toBe(error)
    await expect(secondPromise).rejects.toBe(error)
  })

  it.each([408, 409])("retries transient %s errors before resolving", async (statusCode) => {
    vi.useFakeTimers()
    let attempts = 0

    const q = new RequestQueue({
      ...baseConfig,
      rate: 10,
      capacity: 1,
      maxRetries: 2,
      baseRetryDelayMs: 100,
    })

    const error = Object.assign(new Error(`HTTP ${statusCode}`), {
      statusCode,
    })

    const promise = q.enqueue(() => {
      attempts++
      if (attempts === 1) {
        return Promise.reject(error)
      }
      return Promise.resolve("success")
    }, Date.now(), `transient-${statusCode}`)

    await vi.advanceTimersByTimeAsync(0)
    expect(attempts).toBe(1)

    await vi.advanceTimersByTimeAsync(200)

    expect(attempts).toBe(2)
    await expect(promise).resolves.toBe("success")
  })
})

// 12. Reconfigure the request queue
describe("requestQueue – paced by the service", () => {
  const limits = { minRate: 0.5, maxRate: 256, burstSeconds: 4 }

  function queueWith(pace: Pace) {
    return new RequestQueue({ ...baseConfig, rate: pace.rate, capacity: pace.capacity, pace })
  }

  function rateLimitError() {
    return Object.assign(new Error("429 Too Many Requests"), { statusCode: 429 })
  }

  it("reports a 429 and a timeout to the pace, and nothing else", async () => {
    const pace = new Pace(limits, { rate: 8, ceiling: null })
    const q = queueWith(pace)

    await expect(q.enqueue(() => Promise.reject(Object.assign(new Error("Bad request"), { statusCode: 400 })), Date.now(), "a")).rejects.toThrow()
    expect(pace.snapshot()).toEqual({ rate: 8, ceiling: null })

    await expect(q.enqueue(() => Promise.reject(rateLimitError()), Date.now(), "b")).rejects.toThrow("429")
    expect(pace.snapshot()).toEqual({ rate: 4, ceiling: 8 })

    await expect(q.enqueue(() => Promise.reject(new Error("Request timed out")), Date.now(), "c")).rejects.toThrow()
    expect(pace.snapshot()).toEqual({ rate: 2, ceiling: 4 })
  })

  it("reports each success to the pace", async () => {
    const pace = new Pace(limits, { rate: 4, ceiling: null })
    const q = queueWith(pace)

    await q.enqueue(() => Promise.resolve("a"), Date.now(), "a")
    expect(pace.rate).toBe(8)
  })
})
