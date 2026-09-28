import assert from "node:assert/strict"
import { after, afterEach, before, it } from "node:test"
import { configureService, launchBrowser, reportFailure } from "./browser.mjs"
import { setupDocumentFor, startFakeService } from "./fake-service.mjs"

let service
let context

before(async () => {
  service = await startFakeService()
})

after(async () => {
  await service.close()
})

/** The messages of each request to the service, oldest first. */
function requestMessages() {
  return service.completions().map(({ body }) => JSON.parse(body).messages)
}

/**
 * How the first message starts in the other requests to the service: the
 * language detection prompt (src/utils/prompts/language-detection.ts) and the
 * summary prompt (src/utils/content/summary.ts).
 */
const OTHER_REQUEST_PREFIXES = { languageDetection: "You are a language detection assistant", summary: "Summarize" }

/** The messages of each translation request. */
function translationRequests() {
  const prefixes = Object.values(OTHER_REQUEST_PREFIXES)
  return requestMessages().filter(([message]) => !prefixes.some(prefix => message.content.startsWith(prefix)))
}

/**
 * Starts the browser with the extension and applies a setup document for the
 * fake service on the settings page. Returns the popup page and the extension ID.
 */
async function setUpService() {
  const launched = await launchBrowser()
  context = launched.context
  const { page: popup, extensionId } = launched
  await configureService(popup, extensionId, setupDocumentFor(service.origin))
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await popup.getByRole("button", { name: /Translate this page/ }).waitFor({ timeout: 10_000 })
  return { popup, extensionId }
}

/**
 * Opens a page of the fake service, translates it with Alt+E and waits for the
 * title and four paragraphs: five translated blocks. Returns the page and the
 * translated texts.
 */
async function translateArticle(path = "/article") {
  const article = await context.newPage()
  await article.goto(`${service.origin}${path}`)
  await article.bringToFront()
  await article.locator("body").click()
  await article.keyboard.press("Alt+E")
  const blocks = article.locator(".jiandao-translated-block-content")
  await blocks.nth(4).waitFor({ timeout: 20_000 })
  return { article, translations: await blocks.allTextContents() }
}

afterEach(async (test) => {
  try {
    await reportFailure(test, context)
  }
  finally {
    await context?.close()
    context = undefined
  }
})

it("user translates a page with the shortcut: Given a configured service, When Alt+E is pressed on an article, Then every paragraph gets a translation and the popup shows the count", async () => {
  const { popup } = await setUpService()

  const { translations } = await translateArticle()
  assert.equal(translations.length, 5)
  assert.ok(translations.every(text => text.startsWith("【译】")), `translations: ${translations.join(" | ")}`)
  assert.ok(service.completions().length >= 1, "translation requests reached the service")

  // The popup reads the article tab's state while that tab is in front.
  await popup.reload()
  await popup.getByRole("button", { name: /Show original/ }).waitFor({ timeout: 10_000 })
  await popup.getByText("5 paragraphs").waitFor({ timeout: 10_000 })
})

it("user changes the display mode: Given a translated article in bilingual mode, When the popup changes to Translation only, Then the article shows only the translations and sends no new request", async () => {
  const { popup } = await setUpService()
  const { article } = await translateArticle()
  const requestsBefore = service.completions().length

  await popup.getByRole("button", { name: "Translation only", exact: true }).click()
  await popup.getByRole("button", { name: "Translation only", pressed: true }).waitFor()

  // Each paragraph changes on its own when its translation comes back, so wait until all of them show only a translation.
  await article.waitForFunction(() => [...document.querySelectorAll("h1, p")].every(element => element.textContent.trim().startsWith("【译】")), undefined, { timeout: 10_000 })
    .catch(async (error) => {
      const paragraphs = await article.locator("h1, p").allInnerTexts()
      throw new Error(`not every paragraph shows only its translation: ${paragraphs.join(" | ")}`, { cause: error })
    })
  assert.equal(service.completions().length, requestsBefore, "the translations came from the cache")
})

it("user changes the display mode while the page is translating: Given a slow service and an article translating in bilingual mode, When the popup changes to Translation only before the translations arrive, Then the article shows only the translations", async () => {
  const { popup } = await setUpService()
  const article = await context.newPage()
  await article.goto(`${service.origin}/article`)
  const releaseAnswers = service.holdAnswers()
  try {
    await article.bringToFront()
    await article.locator("body").click()
    await article.keyboard.press("Alt+E")
    await article.locator(".jiandao-spinner").first().waitFor({ timeout: 10_000 })

    await popup.getByRole("button", { name: "Translation only", exact: true }).click()
    await popup.getByRole("button", { name: "Translation only", pressed: true }).waitFor()
    // The page translation restarts: each paragraph waits again for its translation in the new mode.
    await article.locator(".jiandao-translated-content-wrapper[data-jiandao-translation-mode=\"translationOnly\"]").first().waitFor({ timeout: 10_000 })
  }
  finally {
    releaseAnswers()
  }

  await article.waitForFunction(() => [...document.querySelectorAll("h1, p")].every(element => element.textContent.trim().startsWith("【译】")), undefined, { timeout: 10_000 })
    .catch(async (error) => {
      const paragraphs = await article.locator("h1, p").allInnerTexts()
      throw new Error(`not every paragraph shows only its translation: ${paragraphs.join(" | ")}`, { cause: error })
    })
})

it("user translates a copy of an article: Given page context is on and the built-in prompt, When the article is translated and then a copy with another description, Then the copy gets its translations from the cache without a new request", async () => {
  const { popup, extensionId } = await setUpService()
  await popup.goto(`chrome-extension://${extensionId}/options.html`)
  await popup.getByRole("switch", { name: "Use page context" }).click()
  await popup.getByRole("switch", { name: "Use page context", checked: true }).waitFor()

  const requestsBefore = translationRequests().length
  const { translations: first } = await translateArticle("/article?description=First")
  const requestsAfterFirst = translationRequests().length
  assert.ok(requestsAfterFirst > requestsBefore, "the article reached the service")
  assert.ok(requestMessages().some(([message]) => message.content.startsWith(OTHER_REQUEST_PREFIXES.summary)), "page context is on: the summary request reached the service")

  // The built-in prompt sends the page title and summary, not the description, so the model request is the same.
  const { translations: copy } = await translateArticle("/article?description=Second")
  assert.deepEqual(copy, first)
  assert.equal(translationRequests().length, requestsAfterFirst, "the copy sent no new translation request")
})
