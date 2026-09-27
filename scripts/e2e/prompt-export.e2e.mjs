import assert from "node:assert/strict"
import { Buffer } from "node:buffer"
import { readFile } from "node:fs/promises"
import { afterEach, it } from "node:test"
import { clickButton, launchBrowser, reportFailure } from "./browser.mjs"

let context

afterEach(async (test) => {
  try {
    await reportFailure(test, context)
  }
  finally {
    await context?.close()
  }
})

it("user exports prompts: Given custom prompts with Unicode, When the user exports them, Then the downloaded JSON has the expected filename and exact bytes", async () => {
  const launched = await launchBrowser()
  context = launched.context
  const { page, extensionId } = launched

  async function addPrompt({ name, systemPrompt, prompt }) {
    await clickButton(page, "New")
    await page.locator("#prompt-name").fill(name)
    await page.locator("[role=dialog] textarea.min-h-40").fill(systemPrompt)
    await page.locator("[role=dialog] textarea.max-h-60").fill(prompt)
    await clickButton(page, "Save")
  }

  await page.goto(`chrome-extension://${extensionId}/options.html#quality`)

  // Given
  const first = { name: "中英 🌏", systemPrompt: "你是翻译助手。", prompt: "Translate café: {{input}}" }
  const last = { name: "Résumé", systemPrompt: "Keep Unicode intact", prompt: "日本語とemoji 🚀" }
  await addPrompt(first)
  await addPrompt(last)

  // When
  const [download] = await Promise.all([page.waitForEvent("download"), clickButton(page, "Export")])

  // Then
  assert.equal(download.suggestedFilename(), "Plainly_prompts.json")
  assert.deepEqual(await readFile(await download.path()), Buffer.from(JSON.stringify([first, last], null, 2)))
})
