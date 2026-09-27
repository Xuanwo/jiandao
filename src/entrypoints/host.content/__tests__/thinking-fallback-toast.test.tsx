// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react"
import { Toaster } from "sonner"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { listenForThinkingFallback } from "../thinking-fallback-toast"

let stop = () => {}

beforeEach(() => {
  fakeBrowser.reset()
  render(<Toaster />)
})

afterEach(() => {
  stop()
  vi.useRealTimers()
})

async function reportFallback(kind: "thinking" | "removed" = "thinking") {
  await act(async () => {
    const results = await fakeBrowser.runtime.onMessage.trigger(
      { id: 1, type: "notifyThinkingFallback", timestamp: 0, data: { kind, reason: "Invalid option" } },
      {},
      () => {},
    )
    await Promise.all(results)
  })
}

it("user translates a page after the service rejected the preset: Given the top frame, When the background reports the fallback, Then the page tells why", async () => {
  stop = listenForThinkingFallback(true)

  await reportFallback()

  expect(await screen.findByText("translation.thinkingFallback")).toBeInTheDocument()
})

it("user translates a page after the service rejected both switches: Given the top frame, When the background reports that it removed them, Then the page tells that", async () => {
  stop = listenForThinkingFallback(true)

  await reportFallback("removed")

  expect(await screen.findByText("translation.thinkingRemoved")).toBeInTheDocument()
})

it("user translates a page with frames: Given a frame, When the background reports the fallback, Then the frame shows nothing, so only the top frame tells why", async () => {
  // The toaster shows a toast in a timer after the call.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
  stop = listenForThinkingFallback(false)

  await reportFallback()
  await act(() => vi.runOnlyPendingTimersAsync())

  expect(screen.queryByText("translation.thinkingFallback")).toBeNull()
})
