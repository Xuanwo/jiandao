/* global chrome -- worker.evaluate() runs in the extension service worker. */
import assert from "node:assert/strict"
import { after, afterEach, before, it } from "node:test"
import { configureService, launchBrowser, reportFailure, storedConfig } from "./browser.mjs"
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

async function addService(section, document) {
  await section.getByRole("button", { name: "Add service", exact: true }).click()
  await section.getByLabel("Translation service configuration").fill(JSON.stringify(document))
  await section.getByRole("button", { name: "Apply", exact: true }).click()
  await section.getByRole("article", { name: document.name, exact: true }).waitFor()
}

it("user manages services: Given one configured endpoint, When another account is added and edited, Then selection stays unchanged until selected and inactive deletion is confirmed", async () => {
  const launched = await launchBrowser()
  context = launched.context
  const { page, extensionId } = launched
  await configureService(page, extensionId, setupDocumentFor(service.origin))
  const initial = await storedConfig(context)
  const section = page.locator("#service")
  await addService(section, setupDocumentFor(service.origin, { name: "Second account", apiKey: "second-secret", model: "second-model" }))
  const second = section.getByRole("article", { name: "Second account" })
  await second.getByText("Connected", { exact: true }).waitFor()
  let config = await storedConfig(context)
  assert.equal(config.providersConfig.length, 2)
  assert.equal(config.translate.providerId, initial.translate.providerId)
  await second.getByRole("button", { name: "Edit", exact: true }).click()
  const editor = section.getByLabel("Translation service configuration")
  const document = JSON.parse(await editor.inputValue())
  assert.equal(document.model, "second-model")
  await editor.fill(JSON.stringify({ ...document, name: "Work account", model: "edited-model" }))
  await section.getByRole("button", { name: "Apply", exact: true }).click()
  await section.getByRole("article", { name: "Work account" }).waitFor()
  config = await storedConfig(context)
  assert.equal(config.providersConfig.find(p => p.name === "Work account").apiKey, "second-secret")
  assert.equal(config.translate.providerId, initial.translate.providerId)
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  const chooser = page.getByRole("combobox", { name: "Translation service", exact: true })
  const workId = config.providersConfig.find(p => p.name === "Work account").id
  await chooser.selectOption(workId)
  await page.reload()
  await chooser.waitFor()
  assert.equal(await chooser.inputValue(), workId)
  await page.goto(`chrome-extension://${extensionId}/options.html#service`)
  const active = section.getByRole("article", { name: "Work account" })
  assert.equal(await active.getByRole("button", { name: "Delete", exact: true }).isDisabled(), true)
  await section.getByRole("article", { name: "Local gateway" }).getByRole("button", { name: "Delete", exact: true }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click()
  await section.getByRole("article", { name: "Local gateway" }).waitFor({ state: "detached" })
  config = await storedConfig(context)
  assert.equal(config.providersConfig.length, 1)
  assert.equal(config.translate.providerId, workId)
})

it("user switches during a connection check: Given an inactive edit, When the popup selects that service before save completes, Then the latest selection survives", async () => {
  const launched = await launchBrowser()
  context = launched.context
  const { page, extensionId } = launched
  await configureService(page, extensionId, setupDocumentFor(service.origin))
  const section = page.locator("#service")
  await addService(section, setupDocumentFor(service.origin, { name: "Second", model: "second-model" }))
  const row = section.getByRole("article", { name: "Second", exact: true })
  await row.waitFor()
  const secondId = (await storedConfig(context)).providersConfig.find(p => p.name === "Second").id
  await row.getByRole("button", { name: "Edit", exact: true }).click()
  const editor = section.getByLabel("Translation service configuration")
  await editor.fill(JSON.stringify({ ...JSON.parse(await editor.inputValue()), model: "edited-model" }))
  const release = service.holdAnswers()
  try {
    await section.getByRole("button", { name: "Apply", exact: true }).click()
    await section.getByRole("button", { name: "Checking…", exact: true }).waitFor()
    const popup = await context.newPage()
    await popup.goto(`chrome-extension://${extensionId}/popup.html`)
    await popup.getByRole("combobox", { name: "Translation service", exact: true }).selectOption(secondId)
    await popup.reload()
    await popup.getByRole("combobox", { name: "Translation service", exact: true }).waitFor()
    assert.equal((await storedConfig(context)).translate.providerId, secondId)
    release()
    await row.waitFor()
    const saved = await storedConfig(context)
    assert.equal(saved.translate.providerId, secondId)
    assert.equal(saved.providersConfig.find(p => p.id === secondId).model, "edited-model")
  }
  finally {
    release()
  }
})

it("user keeps page results: Given translated content, When another service is selected, Then existing text stays and new paragraphs use that service", async () => {
  const launched = await launchBrowser()
  context = launched.context
  const { page, extensionId } = launched
  await configureService(page, extensionId, setupDocumentFor(service.origin))
  const section = page.locator("#service")
  await addService(section, setupDocumentFor(service.origin, { name: "Second", apiKey: "second-secret", model: "second-model" }))
  await section.getByRole("article", { name: "Second", exact: true }).waitFor()
  const secondId = (await storedConfig(context)).providersConfig.find(p => p.name === "Second").id
  const article = await context.newPage()
  await article.goto(`${service.origin}/article`)
  await article.bringToFront()
  await article.locator("body").click()
  await article.keyboard.press("Alt+E")
  const blocks = article.locator(".jiandao-translated-block-content")
  await blocks.nth(4).waitFor()
  const original = await blocks.allTextContents()
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await page.getByRole("combobox", { name: "Translation service", exact: true }).selectOption(secondId)
  await page.reload()
  await page.getByRole("combobox", { name: "Translation service", exact: true }).waitFor()
  assert.deepEqual(await blocks.allTextContents(), original)
  const before = service.completions().length
  await article.evaluate(() => {
    const paragraph = document.createElement("p")
    paragraph.textContent = "This newly inserted paragraph explains why distinct translation services must remain independent after selection."
    document.body.append(paragraph)
    paragraph.scrollIntoView()
  })
  await article.bringToFront()
  await blocks.nth(5).waitFor()
  assert.deepEqual((await blocks.allTextContents()).slice(0, 5), original)
  const requests = service.completions().slice(before)
  assert.ok(requests.some(request => request.authorization === "Bearer second-secret" && JSON.parse(request.body).model === "second-model"))
})

it("user rejects a stale edit: Given two settings windows, When one changes the target during the other's check, Then the late save cannot overwrite it", async () => {
  const launched = await launchBrowser()
  context = launched.context
  const { page, extensionId } = launched
  await configureService(page, extensionId, setupDocumentFor(service.origin))
  const other = await context.newPage()
  await other.goto(`chrome-extension://${extensionId}/options.html#service`)
  const section = page.locator("#service")
  await section.getByRole("button", { name: "Edit", exact: true }).click()
  const editor = section.getByLabel("Translation service configuration")
  await editor.fill(JSON.stringify({ ...JSON.parse(await editor.inputValue()), model: "late-model" }))
  const release = service.holdAnswers()
  try {
    await section.getByRole("button", { name: "Apply", exact: true }).click()
    await section.getByRole("button", { name: "Checking…", exact: true }).waitFor()
    // Simulate a configuration update from another extension context through real storage.
    const worker = context.serviceWorkers()[0]
    await worker.evaluate(async () => {
      const { config } = await chrome.storage.local.get("config")
      config.providersConfig[0].model = "newer-model"
      await chrome.storage.local.set({ config })
    })
    await other.getByText("newer-model", { exact: true }).waitFor()
    release()
    await section.getByText("The service changed. Reopen the editor and try again.", { exact: true }).waitFor()
    assert.equal((await storedConfig(context)).providersConfig[0].model, "newer-model")
  }
  finally {
    release()
  }
})

it("user protects a newer configuration: Given an open editor, When another window changes the service before Apply, Then the old document cannot overwrite it", async () => {
  const launched = await launchBrowser()
  context = launched.context
  const { page, extensionId } = launched
  await configureService(page, extensionId, setupDocumentFor(service.origin))
  const section = page.locator("#service")
  await section.getByRole("button", { name: "Edit", exact: true }).click()
  const editor = section.getByLabel("Translation service configuration")
  await editor.fill(JSON.stringify({ ...JSON.parse(await editor.inputValue()), model: "old-document-model" }))
  await context.serviceWorkers()[0].evaluate(async () => {
    const { config } = await chrome.storage.local.get("config")
    config.providersConfig[0].model = "newer-model"
    await chrome.storage.local.set({ config })
  })
  await section.getByText("newer-model", { exact: true }).waitFor()
  await section.getByRole("button", { name: "Apply", exact: true }).click()
  await section.getByText("The service changed. Reopen the editor and try again.", { exact: true }).waitFor({ timeout: 5_000 })
  assert.equal((await storedConfig(context)).providersConfig[0].model, "newer-model")
})
