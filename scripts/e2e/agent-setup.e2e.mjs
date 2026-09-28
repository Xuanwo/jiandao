import assert from "node:assert/strict"
import { after, afterEach, before, it } from "node:test"
import { clickButton, configureService, launchBrowser, readClipboardWrites, reportFailure, storedConfig, trackClipboard } from "./browser.mjs"
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

it("user sets up the service on the settings page: Given no key, When the popup sends them to settings and the agent's document is pasted and applied, Then the connection is checked, the service is stored with the result and the clipboard is cleared", async () => {
  const launched = await launchBrowser()
  context = launched.context
  const { page, extensionId } = launched

  // The popup does not configure anything: it points to the settings page.
  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await page.getByText("No translation service yet").waitFor()
  assert.equal(await page.getByRole("textbox").count(), 0, "no paste box in the popup")
  await page.getByRole("button", { name: "Set up in settings" }).waitFor()

  // With nothing to preview, the settings page shows the editor right away.
  await page.goto(`chrome-extension://${extensionId}/options.html#service`)
  await trackClipboard(page)
  const section = page.locator("#service")
  const editor = section.getByLabel("Translation service configuration")
  await editor.waitFor()

  // The instructions the reader hands to the agent point at the guide and carry no configuration yet.
  await clickButton(page, "Copy instructions for your agent")
  await page.getByRole("button", { name: "Copied" }).waitFor()
  const [instructions] = await readClipboardWrites(page)
  assert.match(instructions, /docs\/agent-setup\.md/)
  assert.match(instructions, /\(none yet\)/)

  // A document the agent got wrong is refused line by line, with the JSON path.
  await editor.fill(`{"type":"openai-compatible","apiKey":"local","model":"fake-model"}`)
  await section.getByText(/baseURL: baseURL is required/).waitFor()
  assert.equal(await section.getByRole("button", { name: "Apply", exact: true }).isDisabled(), true)

  // The verified document previews where page text goes, then applies after the check.
  await editor.fill(JSON.stringify(setupDocumentFor(service.origin), null, 2))
  await section.getByText(new RegExp(`Page text goes to ${new URL(service.origin).host}`)).waitFor()
  const completionsBefore = service.completions().length
  await section.getByRole("button", { name: "Apply", exact: true }).click()
  await section.getByText("Connected", { exact: true }).waitFor({ timeout: 15_000 })
  assert.equal(await editor.count(), 0, "the editor gives way to the preview")
  assert.equal(service.completions().length, completionsBefore + 1, "one confirmation request reached the service")

  const config = await storedConfig(context)
  const stored = config.providersConfig.find(provider => provider.name === "Local gateway")
  assert.ok(stored, "the service is stored")
  assert.equal(stored.apiKey, "local-secret-key")
  assert.equal(stored.baseURL, `${service.origin}/v1`)
  assert.equal(stored.connectionCheck.ok, true, "the check result is stored with the service")
  assert.equal(config.translate.providerId, stored.id)
  assert.equal((await readClipboardWrites(page)).at(-1), "", "the clipboard is cleared after applying")

  // Reopened, the page shows the stored result without sending a request.
  const completionsAfter = service.completions().length
  await page.reload()
  await section.getByText("Connected", { exact: true }).waitFor()
  assert.equal(service.completions().length, completionsAfter, "opening settings sends nothing")

  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await page.getByRole("button", { name: /Translate this page/ }).waitFor()
})

it("user changes the service and the prompt in place: Given a stored key, When the masked document is edited and the prompt is changed, Then the key is kept, a failed check saves nothing and the prompt reaches the service", async () => {
  const launched = await launchBrowser()
  context = launched.context
  const { page, extensionId } = launched
  await configureService(page, extensionId, setupDocumentFor(service.origin))
  await trackClipboard(page)
  const section = page.locator("#service")

  // Edit opens the editor in place on the current service, key masked.
  await section.getByRole("button", { name: "Edit", exact: true }).click()
  const editor = section.getByLabel("Translation service configuration")
  const current = JSON.parse(await editor.inputValue())
  assert.equal(current.apiKey, "…-key")
  assert.equal(current.targetLanguage, undefined, "the document covers the service only")

  // A document the service rejects is not saved.
  await editor.fill(JSON.stringify({ ...current, model: "rejected-model" }, null, 2))
  await section.getByRole("button", { name: "Apply", exact: true }).click()
  await section.getByText("Failed, nothing saved").waitFor({ timeout: 15_000 })
  assert.equal((await storedConfig(context)).providersConfig.find(p => p.name === "Local gateway").model, "fake-model")

  await editor.fill(JSON.stringify({ ...current, model: "fake-model-2", body: { reasoning_effort: "none" } }, null, 2))
  await section.locator("span", { hasText: "fake-model-2" }).waitFor()
  await section.getByRole("button", { name: "Apply", exact: true }).click()
  await section.getByText("Connected", { exact: true }).waitFor({ timeout: 15_000 })

  let config = await storedConfig(context)
  const stored = config.providersConfig.filter(provider => provider.name === "Local gateway")
  assert.equal(stored.length, 1, "replaced, not duplicated")
  assert.equal(stored[0].apiKey, "local-secret-key", "the masked key kept the stored key")
  assert.equal(stored[0].model, "fake-model-2")
  assert.deepEqual(stored[0].body, { reasoning_effort: "none" })

  // The prompt is its own setting in the quality section.
  const quality = page.locator("#quality")
  await quality.getByRole("button", { name: "Edit", exact: true }).click()
  await quality.getByLabel("Prompt template").fill("Translate tersely: {{input}}")
  await quality.getByRole("button", { name: "Apply", exact: true }).click()
  await quality.getByText("Custom", { exact: true }).waitFor()
  config = await storedConfig(context)
  assert.equal(config.translate.customPromptsConfig.patterns[0]?.prompt, "Translate tersely: {{input}}")

  await section.getByRole("button", { name: "Test connection", exact: true }).click()
  await section.getByText("Connected", { exact: true }).waitFor({ timeout: 15_000 })
  const confirmation = service.completions().at(-1)
  assert.equal(confirmation.authorization, "Bearer local-secret-key")
  const body = JSON.parse(confirmation.body)
  assert.equal(body.model, "fake-model-2")
  assert.equal(body.reasoning_effort, "none")
  assert.match(body.messages.at(-1).content, /^Translate tersely: /)

  // The instructions carry the service configuration with the key masked, never the key itself.
  await section.getByRole("button", { name: "Edit", exact: true }).click()
  await clickButton(page, "Copy instructions for your agent")
  await page.getByRole("button", { name: "Copied" }).waitFor()
  const instructions = (await readClipboardWrites(page)).at(-1)
  assert.match(instructions, /"apiKey": "…-key"/)
  assert.match(instructions, /"model": "fake-model-2"/)
  assert.doesNotMatch(instructions, /local-secret-key/)
})
