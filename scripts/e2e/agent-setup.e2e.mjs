import assert from "node:assert/strict"
import { after, afterEach, before, it } from "node:test"
import { clickButton, launchBrowser, readClipboardWrites, reportFailure, storedConfig, trackClipboard } from "./browser.mjs"
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

it("user sets up the service from the popup: Given no key, When the agent's document is pasted and applied, Then the service is stored, the clipboard is cleared and the popup offers to translate", async () => {
  const launched = await launchBrowser()
  context = launched.context
  const { page, extensionId } = launched
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await trackClipboard(page)
  await page.getByText("No translation service yet").waitFor()

  // The instructions the reader hands to the agent point at the guide and carry no configuration yet.
  await clickButton(page, "Copy instructions for your agent")
  await page.getByRole("button", { name: "Copied" }).waitFor()
  const [instructions] = await readClipboardWrites(page)
  assert.match(instructions, /docs\/agent-setup\.md/)
  assert.match(instructions, /\(none yet\)/)

  // A document the agent got wrong is refused line by line, with the JSON path.
  const box = page.getByLabel("Configuration from your agent")
  await box.fill(`{"plainly":1,"provider":{"type":"openai-compatible","apiKey":"local","model":"fake-model"}}`)
  await page.getByText(/provider\.baseURL: baseURL is required/).waitFor()
  assert.equal(await page.getByRole("button", { name: "Apply" }).isDisabled(), true)

  // The verified document previews what the service is and where page text goes, then applies.
  const doc = setupDocumentFor(service.origin)
  await box.fill(JSON.stringify(doc, null, 2))
  await page.getByText(`Local gateway · fake-model · ${new URL(service.origin).host}`).waitFor()
  await clickButton(page, "Apply")
  await page.getByRole("button", { name: /Translate this page/ }).waitFor({ timeout: 10_000 })

  const config = await storedConfig(context)
  const stored = config.providersConfig.find(provider => provider.name === "Local gateway")
  assert.ok(stored, "the service is stored")
  assert.equal(stored.apiKey, "local-secret-key")
  assert.equal(stored.baseURL, `${service.origin}/v1`)
  assert.equal(stored.model, "fake-model")
  assert.equal(config.translate.providerId, stored.id)
  assert.equal((await readClipboardWrites(page)).at(-1), "", "the clipboard is cleared after applying")
})

it("user changes the service from settings: Given a stored key, When a document with the masked key and a prompt is pasted, Then the key is kept, the prompt is installed and the connection is confirmed", async () => {
  const launched = await launchBrowser()
  context = launched.context
  const { page, extensionId } = launched
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await page.getByLabel("Configuration from your agent").fill(JSON.stringify(setupDocumentFor(service.origin)))
  await clickButton(page, "Apply")
  await page.getByRole("button", { name: /Translate this page/ }).waitFor({ timeout: 10_000 })

  await page.goto(`chrome-extension://${extensionId}/options.html#import`)
  await trackClipboard(page)
  const section = page.locator("#service")
  await section.getByText("Local gateway", { exact: true }).waitFor()
  assert.equal(await section.locator("input").count(), 0, "nothing to type except the paste box")
  assert.equal(await section.getByText("OpenAI", { exact: true }).count(), 0, "keyless defaults are not shown")

  const edited = setupDocumentFor(service.origin, {
    provider: { apiKey: "…-key", model: "fake-model-2", body: { reasoning_effort: "none" } },
    prompt: { name: "Terse", prompt: "Translate tersely: {{input}}" },
  })
  await page.getByLabel("Configuration from your agent").fill(JSON.stringify(edited, null, 2))
  await section.locator("span", { hasText: "fake-model-2" }).waitFor()
  await section.locator("span", { hasText: "· Terse" }).waitFor()
  await page.getByRole("button", { name: "Apply", exact: true }).click()
  await section.getByText("Connected", { exact: true }).waitFor({ timeout: 15_000 })
  assert.equal(await page.getByLabel("Configuration from your agent").count(), 0, "the paste box collapses after success")

  const config = await storedConfig(context)
  const stored = config.providersConfig.filter(provider => provider.name === "Local gateway")
  assert.equal(stored.length, 1, "replaced, not duplicated")
  assert.equal(stored[0].apiKey, "local-secret-key", "the masked key kept the stored key")
  assert.equal(stored[0].model, "fake-model-2")
  assert.deepEqual(stored[0].body, { reasoning_effort: "none" })
  assert.equal(config.translate.customPromptsConfig.patterns[0]?.name, "Terse")
  await page.locator("#quality").getByText("Terse").waitFor()

  const confirmation = service.completions().at(-1)
  assert.ok(confirmation, "the confirmation request reached the service")
  assert.equal(confirmation.authorization, "Bearer local-secret-key")
  const body = JSON.parse(confirmation.body)
  assert.equal(body.model, "fake-model-2")
  assert.equal(body.reasoning_effort, "none")
  assert.match(body.messages.at(-1).content, /^Translate tersely: /)

  // The instructions now carry the configuration with the key masked, never the key itself.
  await clickButton(page, "Copy instructions for your agent")
  await page.getByRole("button", { name: "Copied" }).waitFor()
  const instructions = (await readClipboardWrites(page)).at(-1)
  assert.match(instructions, /"apiKey": "…-key"/)
  assert.match(instructions, /"model": "fake-model-2"/)
  assert.doesNotMatch(instructions, /local-secret-key/)
})
