/* global chrome -- worker.evaluate() runs in the real extension service worker. */
import assert from "node:assert/strict"
import { after, afterEach, before, it } from "node:test"
import { configureService, launchBrowser, pressTranslateShortcut, reportFailure } from "./browser.mjs"
import { setupDocumentFor, startFakeService } from "./fake-service.mjs"

let service
let context
before(async () => {
  service = await startFakeService()
})
after(async () => {
  await service.close()
})
afterEach(async (test) => {
  try {
    await reportFailure(test, context)
  }
  finally {
    await context?.close()
    context = undefined
  }
})

async function openArticle() {
  const launched = await launchBrowser()
  context = launched.context
  const { page: popup, extensionId } = launched
  await configureService(popup, extensionId, setupDocumentFor(service.origin))
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  const article = await context.newPage()
  // CDP observes every execution world, including the extension's isolated world.
  const session = await context.newCDPSession(article)
  const uncaught = []
  session.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
    uncaught.push(exceptionDetails.exception?.description ?? exceptionDetails.text)
  })
  await session.send("Runtime.enable")
  await article.goto(`${service.origin}/article`)
  await pressTranslateShortcut(article)
  await article.locator(".jiandao-translated-block-content").nth(4).waitFor({ timeout: 20_000 })
  return { article, popup, worker: context.serviceWorkers()[0], uncaught }
}

async function changeRoute(article, language, path) {
  await article.evaluate(({ language, path }) => {
    document.documentElement.lang = language
    document.title = "Bonjour"
    document.body.innerHTML = "<h1>Bonjour</h1>"
    history.pushState({}, "", path)
  }, { language, path })
}

it("user keeps the detected language after a failed SPA restart: Given a translated page, When content storage access is denied during navigation, Then the new language appears and translation can be retried", async () => {
  const { article, popup, worker, uncaught } = await openArticle()
  await worker.evaluate(() => chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }))
  try {
    await changeRoute(article, "fr", "/french")
    // Keep the article active: opening/reloading the popup would request another
    // language refresh and conceal the missing refresh after a failed restart.
    await popup.getByRole("button", { name: "Source language", exact: true }).filter({ hasText: "French" }).waitFor({ timeout: 10_000 })
  }
  finally {
    await worker.evaluate(() => chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" }))
  }
  await pressTranslateShortcut(article)
  await article.locator(".jiandao-translated-block-content").first().waitFor({ timeout: 20_000 })
  assert.deepEqual(uncaught, [], "the restart failure must be handled, not an uncaught rejection")
})

it("user retries translation after config is restored: Given an open page whose config disappears, When translation is requested, Then a setup toast appears and restoring the service allows a retry without reloading", async () => {
  const { article, worker, uncaught } = await openArticle()
  await pressTranslateShortcut(article)
  await article.locator(".jiandao-translated-block-content").first().waitFor({ state: "detached" })
  const saved = await worker.evaluate(async () => {
    const config = await chrome.storage.local.get("config")
    await chrome.storage.local.remove("config")
    return config
  })
  await pressTranslateShortcut(article)
  await article.getByText("Add an API key first. Click the Jiandao icon in the toolbar to set it up.", { exact: true }).waitFor()
  await worker.evaluate(config => chrome.storage.local.set(config), saved)
  await pressTranslateShortcut(article)
  const translations = article.locator(".jiandao-translated-block-content")
  await translations.nth(4).waitFor({ timeout: 20_000 })
  assert.ok((await translations.allTextContents()).every(text => text.startsWith("【译】")))
  assert.deepEqual(uncaught, [], "missing config is a recoverable state")
})
