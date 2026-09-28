// @vitest-environment jsdom
import type { Config } from "@/types/config/config"
import type { WebPagePromptContext } from "@/types/content"
import { beforeEach, describe, expect, it } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { storage } from "#imports"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { resolveProviderConfig } from "@/utils/constants/feature-providers"
import { onMessage } from "@/utils/message"
import { translateTextCore } from "../translate-text"
import { translateTextForPage } from "../translate-variants"

const providerConfig = resolveProviderConfig(DEFAULT_CONFIG, "translate")

const langConfig = { sourceCode: "eng", targetCode: "cmn", level: "intermediate" } as const

const basePageContext: WebPagePromptContext = {
  webTitle: "Release notes",
  webDescription: "Notes for the release",
  webContent: "Page body.",
  webSummary: "The release adds a new setting.",
}

async function saveTranslatePrompt(prompt: string) {
  const config: Config = {
    ...DEFAULT_CONFIG,
    translate: {
      ...DEFAULT_CONFIG.translate,
      customPromptsConfig: {
        promptId: "custom",
        patterns: [{ id: "custom", name: "Custom", systemPrompt: "Translate to {{targetLanguage}}.", prompt }],
      },
    },
  }
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, config)
}

/** Runs a translation and returns the cache key that it sends to the background. */
async function captureCacheKey(translate: () => Promise<string>): Promise<string> {
  let cacheKey = ""
  const removeListener = onMessage("enqueueTranslateRequest", async (message) => {
    cacheKey = message.data.hash
    return "translated"
  })
  try {
    await translate()
  }
  finally {
    removeListener()
  }
  return cacheKey
}

async function cacheKeyFor(pageChanges: Partial<WebPagePromptContext>): Promise<string> {
  return captureCacheKey(() => translateTextCore({
    text: "The release adds a new setting.",
    langConfig,
    providerConfig,
    webPageContext: { ...basePageContext, ...pageChanges },
  }))
}

async function pageCacheKeyFor(path: string, pageBody: string): Promise<string> {
  window.history.pushState({}, "", path)
  document.title = basePageContext.webTitle ?? ""
  document.head.innerHTML = `<meta name="description" content="${pageBody}">`
  document.body.innerHTML = `<article><h1>${document.title}</h1><p>${pageBody}</p></article>`

  const removeSummaryListener = onMessage("getOrGenerateWebPageSummary", async () => basePageContext.webSummary ?? "")
  try {
    return await captureCacheKey(() => translateTextForPage("The release adds a new setting."))
  }
  finally {
    removeSummaryListener()
  }
}

describe("translation cache key", () => {
  beforeEach(async () => {
    fakeBrowser.reset()
    await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, DEFAULT_CONFIG)
  })

  it("user gets a cached translation: Given the default prompt, which does not use {{webDescription}} or {{webContent}}, and the AI content aware setting is on, When the user translates the same paragraph on two pages with different descriptions and content, Then both translations use one cache entry", async () => {
    await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, {
      ...DEFAULT_CONFIG,
      translate: { ...DEFAULT_CONFIG.translate, enableAIContentAware: true },
    })

    const firstKey = await pageCacheKeyFor("/release-notes/first", "First page body.")
    const secondKey = await pageCacheKeyFor("/release-notes/second", "Second page body.")

    // The model receives the same request.
    expect(secondKey).toBe(firstKey)
  })

  it("user gets a cached translation: Given a custom prompt that sends no page context to the model, When the page title, description, content and summary are different, Then both translations use one cache entry", async () => {
    await saveTranslatePrompt("{{input}}")

    const firstKey = await cacheKeyFor({})
    const secondKey = await cacheKeyFor({
      webTitle: "Changelog",
      webDescription: "Changes in the release",
      webContent: "Other page body.",
      webSummary: "The release removes an old setting.",
    })

    // The model receives the same request.
    expect(secondKey).toBe(firstKey)
  })

  it("user gets a new translation: Given a custom prompt that sends {{webContent}} to the model, When the page content is different only at the end, Then the translations use different cache entries", async () => {
    await saveTranslatePrompt("Page content: {{webContent}}\n\n{{input}}")
    const sharedStart = "Shared page text. ".repeat(100)

    const firstKey = await cacheKeyFor({ webContent: `${sharedStart} first ending` })
    const secondKey = await cacheKeyFor({ webContent: `${sharedStart} second ending` })

    // The model receives different requests.
    expect(secondKey).not.toBe(firstKey)
  })

  it.each([
    ["title", { webTitle: "Changelog" }],
    ["summary", { webSummary: "The release removes an old setting." }],
  ])("user gets a new translation: Given the default prompt, which sends the page title and summary to the model, When the page %s is different, Then the translations use different cache entries", async (_field, pageChanges) => {
    const firstKey = await cacheKeyFor({})
    const secondKey = await cacheKeyFor(pageChanges)

    // The model receives different requests.
    expect(secondKey).not.toBe(firstKey)
  })
})
