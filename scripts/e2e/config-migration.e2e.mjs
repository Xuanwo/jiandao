/* global chrome -- worker.evaluate() runs a callback in the extension service worker. */
import assert from "node:assert/strict"
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, afterEach, before, it } from "node:test"
import { configureService, extensionPath, launchBrowser, reportFailure, storedConfig } from "./browser.mjs"
import { setupDocumentFor, startFakeService } from "./fake-service.mjs"

let service
let context
const cleanup = []

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
    for (const step of cleanup.splice(0))
      await step()
  }
})

/** What Plainly 1.0 stored: no version, the model as an object, options in the AI SDK's names. */
const plainly10Config = {
  language: { sourceCode: "auto", targetCode: "cmn", level: "intermediate" },
  providersConfig: [
    {
      id: "openai-default",
      name: "OpenAI",
      enabled: true,
      provider: "openai",
      apiKey: "sk-old",
      model: { model: "gpt-5-mini", isCustomModel: false, customModel: null },
      providerOptions: { reasoningEffort: "minimal" },
    },
  ],
  translate: {
    providerId: "openai-default",
    mode: "bilingual",
    page: { range: "all", shortcut: "Alt+E", preload: { margin: 1000, threshold: 0 } },
    enableAIContentAware: false,
    customPromptsConfig: { promptId: null, patterns: [] },
    requestQueueConfig: { capacity: 60, rate: 5 },
    translationNodeStyle: { preset: "default", isCustom: false, customCSS: null },
  },
}

/**
 * Starts a build that reports version 1.0.0 in a new profile and leaves
 * `items` in its local storage, then starts the current build in the same
 * profile. Chromium sees a newer version of the same extension and runs it as
 * an update. Returns the launched browser once the config is initialized.
 */
async function updateFrom(items) {
  const dir = await mkdtemp(join(tmpdir(), "jiandao-update-"))
  cleanup.push(() => rm(dir, { recursive: true, force: true }))
  const oldBuild = join(dir, "old-build")
  const userDataDir = join(dir, "profile")
  await cp(extensionPath, oldBuild, { recursive: true })
  const manifest = JSON.parse(await readFile(join(oldBuild, "manifest.json"), "utf8"))
  await writeFile(join(oldBuild, "manifest.json"), JSON.stringify({ ...manifest, version: "1.0.0" }))

  const previous = await launchBrowser({ userDataDir, extension: oldBuild })
  const oldWorker = previous.context.serviceWorkers()[0]
  // The old build writes its config on install; `items` must come after that write.
  await waitForConfig(oldWorker)
  await oldWorker.evaluate(async (stored) => {
    await chrome.storage.local.clear()
    await chrome.storage.local.set(stored)
  }, items)
  await previous.context.close()

  const launched = await launchBrowser({ userDataDir })
  context = launched.context
  const worker = context.serviceWorkers()[0]
  await waitForConfig(worker)
  return { ...launched, worker }
}

/** Waits until the extension has written a config with a version, which initializeConfig does last. */
async function waitForConfig(worker) {
  await worker.evaluate(async () => {
    for (let i = 0; i < 100; i++) {
      if ((await chrome.storage.local.get("config")).config?.version !== undefined)
        return
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    throw new Error("the config was not initialized")
  })
}

it("user updates from a build whose config cannot be migrated: Given the 1.0 config, When the extension updates, Then local storage is cleared, the popup and settings explain why, and applying a service ends the notice", async () => {
  const { page, extensionId, worker } = await updateFrom({
    config: plainly10Config,
    config$: { schemaVersion: 1, lastModifiedAt: 1 },
    theme: "dark",
  })

  const stored = await worker.evaluate(() => chrome.storage.local.get(null))
  assert.deepEqual(Object.keys(stored).sort(), ["config", "config$"], "nothing but the new config is left")
  assert.equal(stored.config.version, 1)
  assert.equal(stored.config.providersConfig.some(provider => provider.apiKey), false, "the old key is gone")
  assert.equal(typeof stored.config$.resetAt, "number", "the reset is recorded")

  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await page.getByText("Set up your translation service again").waitFor()
  await page.getByText(/changed its configuration format/).waitFor()

  await page.goto(`chrome-extension://${extensionId}/options.html#service`)
  await page.locator("#service").getByText("Set up your translation service again").waitFor()

  await configureService(page, extensionId, setupDocumentFor(service.origin))
  // "Connected" shows once the config is saved; the notice is cleared right after.
  const meta = await worker.evaluate(async () => {
    for (let i = 0; i < 100; i++) {
      const { config$ } = await chrome.storage.local.get("config$")
      if (config$?.resetAt === undefined)
        return config$
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    return (await chrome.storage.local.get("config$")).config$
  })
  assert.equal(meta?.resetAt, undefined, "applying a service ends the notice")

  await page.goto(`chrome-extension://${extensionId}/popup.html`)
  await page.getByRole("button", { name: "Translate this page" }).waitFor()
})

it("user updates from 1.1.0: Given its config without a version, When the extension updates, Then the service is kept and the version is added", async () => {
  // The service as 1.1.0 stored it after the agent's document was applied.
  const current = await launchBrowser()
  context = current.context
  await configureService(current.page, current.extensionId, setupDocumentFor(service.origin))
  const { version: _, ...unversioned } = await storedConfig(context)
  await context.close()
  context = undefined

  const { worker } = await updateFrom({ config: unversioned, config$: { schemaVersion: 3, lastModifiedAt: 1 } })

  const config = await storedConfig(context)
  assert.deepEqual(config, { ...unversioned, version: 1 })
  const meta = await worker.evaluate(async () => (await chrome.storage.local.get("config$")).config$)
  assert.equal(meta.resetAt, undefined, "no reset is recorded")
})
