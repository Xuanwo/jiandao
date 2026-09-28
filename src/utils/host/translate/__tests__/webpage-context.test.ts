// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockWarn } = vi.hoisted(() => ({
  mockWarn: vi.fn(),
}))

vi.mock("@/utils/logger", () => ({
  logger: {
    warn: mockWarn,
  },
}))

const ARTICLE = `
  <nav><a href="/">Home</a> <a href="/about">About us and everything else</a></nav>
  <main>
    <article>
      <h1>Reading and Experience</h1>
      <p>Reading and experience train your model of the world, and even if you forget the experience its effect persists.</p>
      <p>Your mind is like a compiled program you have lost the source of. It works, but you do not know why.</p>
    </article>
  </main>
  <footer><p>Copyright notice that is long enough to count as a paragraph on its own.</p></footer>`

async function loadModule() {
  vi.resetModules()
  return await import("../webpage-context")
}

describe("getOrCreateWebPageContext", () => {
  beforeEach(() => {
    mockWarn.mockReset()
    document.head.innerHTML = ""
    document.title = "Original Title"
    document.body.innerHTML = ARTICLE
    window.history.replaceState({}, "", "/article")
  })

  it("reads the article text, not the navigation or footer, and keeps the original title stable on the same URL", async () => {
    const { getOrCreateWebPageContext } = await loadModule()

    const first = await getOrCreateWebPageContext()

    document.title = "Translated Browser Title"
    document.body.innerHTML = "<main><p>Something else entirely, long enough to be a paragraph.</p></main>"
    const second = await getOrCreateWebPageContext()

    expect(first?.webTitle).toBe("Original Title")
    expect(first?.webContent).toBe("Reading and Experience\nReading and experience train your model of the world, and even if you forget the experience its effect persists.\nYour mind is like a compiled program you have lost the source of. It works, but you do not know why.")
    expect(second).toEqual({
      url: first?.url,
      webTitle: "Original Title",
      webDescription: "",
      webContent: first?.webContent,
    })
  })

  it("reads webpage description from meta tags", async () => {
    document.head.innerHTML = `<meta name="description" content="  Article   description  ">`
    const { getOrCreateWebPageContext } = await loadModule()

    const result = await getOrCreateWebPageContext()

    expect(result?.webDescription).toBe("Article description")
  })

  it("refreshes the cached title and content after the URL changes", async () => {
    const { getOrCreateWebPageContext } = await loadModule()

    const first = await getOrCreateWebPageContext()

    document.title = "Next Article Title"
    document.body.innerHTML = "<main><p>Next article body, a different paragraph with enough words in it.</p></main>"
    window.history.replaceState({}, "", "/article-2")

    const second = await getOrCreateWebPageContext()

    expect(first?.webTitle).toBe("Original Title")
    expect(second?.webTitle).toBe("Next Article Title")
    expect(second?.webContent).toBe("Next article body, a different paragraph with enough words in it.")
  })

  it("truncates webpage content to the shared limit when caching a new URL", async () => {
    const { getOrCreateWebPageContext } = await loadModule()

    const longContent = "x".repeat(2100)
    document.body.innerHTML = `<main><p>${longContent}</p></main>`

    const result = await getOrCreateWebPageContext()

    expect(result?.webContent).toHaveLength(2000)
    expect(result?.webContent).toBe(longContent.slice(0, 2000))
  })

  it("falls back to the body text when no block reads like an article", async () => {
    document.body.innerHTML = "<div>Short</div><div>Fallback body text</div>"
    const { getOrCreateWebPageContext } = await loadModule()

    const result = await getOrCreateWebPageContext()

    expect(result?.webContent).toBe("Short\nFallback body text")
    expect(mockWarn).not.toHaveBeenCalled()
  })
})
