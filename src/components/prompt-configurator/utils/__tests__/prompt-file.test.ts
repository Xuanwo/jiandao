// @vitest-environment jsdom

import { Buffer, Blob as NodeBlob, resolveObjectURL } from "node:buffer"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { downloadJSONFile } from "../prompt-file"

describe("downloadJSONFile", () => {
  const clickedLinks: HTMLAnchorElement[] = []
  const jsdomBlob = globalThis.Blob

  function recordLinkClick(event: MouseEvent) {
    if (event.target instanceof HTMLAnchorElement) {
      clickedLinks.push(event.target)
      // jsdom does not download files, so stop its navigation attempt.
      event.preventDefault()
    }
  }

  beforeEach(() => {
    // A browser creates the Blob and its object URL in one realm. jsdom has no
    // URL.createObjectURL, so the test uses the Blob class of Node.js, which
    // matches the URL.createObjectURL of Node.js.
    Object.defineProperty(globalThis, "Blob", { configurable: true, writable: true, value: NodeBlob })
    vi.useFakeTimers()
    clickedLinks.length = 0
    document.addEventListener("click", recordLinkClick, true)
  })

  afterEach(() => {
    document.removeEventListener("click", recordLinkClick, true)
    vi.useRealTimers()
    Object.defineProperty(globalThis, "Blob", { configurable: true, writable: true, value: jsdomBlob })
  })

  it("user exports the prompts: Given two prompts, When the export starts, Then a download link with the file name and the exact JSON bytes is clicked and the URL is revoked after 40 seconds", async () => {
    const prompts = [
      { name: "Formal", systemPrompt: "", prompt: "Translate {{input}} to {{targetLang}}." },
      { name: "中文", systemPrompt: "Keep the tone.", prompt: "翻译 {{input}}" },
    ]

    downloadJSONFile(prompts)

    expect(clickedLinks).toHaveLength(1)
    const [link] = clickedLinks
    expect(link.download).toBe("Plainly_prompts.json")
    expect(link.isConnected).toBe(false)

    const file = resolveObjectURL(link.href)
    expect(file?.type).toBe("text/json")
    const bytes = Buffer.from(await file?.arrayBuffer() ?? new ArrayBuffer(0))
    expect(bytes.equals(Buffer.from(JSON.stringify(prompts, null, 2), "utf8"))).toBe(true)

    vi.advanceTimersByTime(39_999)
    expect(resolveObjectURL(link.href)).toBeDefined()

    vi.advanceTimersByTime(1)
    expect(resolveObjectURL(link.href)).toBeUndefined()
  })
})
