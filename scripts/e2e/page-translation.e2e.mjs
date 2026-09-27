import assert from "node:assert/strict"
import { after, afterEach, before, it } from "node:test"
import { clickButton, launchBrowser, reportFailure } from "./browser.mjs"
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

it("user translates a page with the shortcut: Given a configured service, When Alt+E is pressed on an article, Then every paragraph gets a translation and the popup shows the count", async () => {
  const launched = await launchBrowser()
  context = launched.context
  const { page: popup, extensionId } = launched
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await popup.getByLabel("Configuration from your agent").fill(JSON.stringify(setupDocumentFor(service.origin)))
  await clickButton(popup, "Apply")
  await popup.getByRole("button", { name: /Translate this page/ }).waitFor({ timeout: 10_000 })

  const article = await context.newPage()
  await article.goto(`${service.origin}/article`)
  await article.bringToFront()
  await article.locator("body").click()
  await article.keyboard.press("Alt+E")
  // The title and four paragraphs: five translated blocks.
  await article.locator(".plainly-translated-block-content").nth(4).waitFor({ timeout: 20_000 })
  const translations = await article.locator(".plainly-translated-block-content").allTextContents()
  assert.equal(translations.length, 5)
  assert.ok(translations.every(text => text.startsWith("【译】")), `translations: ${translations.join(" | ")}`)
  assert.ok(service.completions().length >= 1, "translation requests reached the service")

  // The popup reads the article tab's state while that tab is in front.
  await popup.reload()
  await popup.getByRole("button", { name: /Show original/ }).waitFor({ timeout: 10_000 })
  await popup.getByText("5 paragraphs").waitFor({ timeout: 10_000 })
})
