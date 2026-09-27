/* global chrome -- worker.evaluate() runs a callback in the extension service worker. */
import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import process from "node:process"
import { chromium } from "playwright-core"

export const extensionPath = resolve(".output/chrome-mv3")

/**
 * Starts headless Chromium with the built extension and a new profile.
 * Returns the browser context, its first page and the extension ID.
 */
export async function launchBrowser() {
  // An empty path makes Playwright create a temporary profile and delete it on close.
  const context = await chromium.launchPersistentContext("", {
    // Headless Chromium loads extensions; the headless shell does not.
    channel: "chromium",
    headless: true,
    // On Linux, Chromium takes the extension UI language from LANGUAGE. The tests find elements by their English names.
    env: { ...process.env, LANGUAGE: "en" },
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  })
  recordBrowserEvents(context)
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker")
  return { context, page: context.pages()[0], extensionId: new URL(worker.url()).host }
}

const MAX_EVENTS = 200
const browserEvents = new WeakMap()
// Values under these keys must not reach a log.
const SECRET_KEY = /(?:api[_-]?key|token|authorization|password)$/i

/**
 * Records the recent console messages and errors of the pages and of the
 * extension service worker, and the failed requests, for reportFailure.
 */
function recordBrowserEvents(context) {
  const events = []
  browserEvents.set(context, events)
  const record = (source, text) => {
    events.push(`${new Date().toISOString().slice(11, 23)} [${source}] ${text}`)
    if (events.length > MAX_EVENTS)
      events.shift()
  }
  context.on("console", message => record(message.worker() ? "extension worker" : `page ${message.page()?.url()}`, `${message.type()}: ${message.text()}`))
  context.on("weberror", error => record(`page ${error.page()?.url()}`, `uncaught: ${error.error().stack ?? error.error()}`))
  context.on("requestfailed", request => record("network", `${request.method()} ${request.url()} failed: ${request.failure()?.errorText}`))
  context.on("response", (response) => {
    if (response.status() >= 400)
      record("network", `${response.request().method()} ${response.url()} answered ${response.status()}`)
  })
  context.on("serviceworker", worker => void recordStorageChanges(worker))
  for (const worker of context.serviceWorkers())
    void recordStorageChanges(worker)
}

/**
 * Records each change of the extension storage in the service worker: the
 * time, the area and key, and for an object the paths that changed, with
 * their old and new values. A worker that starts again records again.
 */
async function recordStorageChanges(worker) {
  await worker.evaluate((secretSource) => {
    if (globalThis.e2eStorageChanges)
      return
    const changes = []
    globalThis.e2eStorageChanges = changes
    const secret = new RegExp(secretSource, "i")
    const short = value => value === undefined ? "undefined" : JSON.stringify(value, (key, item) => secret.test(key) ? "(hidden)" : item).slice(0, 160)
    const diff = (path, before, after, out) => {
      if (out.length >= 30 || JSON.stringify(before) === JSON.stringify(after))
        return
      if (before && after && typeof before === "object" && typeof after === "object") {
        for (const key of new Set([...Object.keys(before), ...Object.keys(after)]))
          diff(`${path}.${key}`, before[key], after[key], out)
        return
      }
      out.push(secret.test(path) ? `${path}: (hidden)` : `${path}: ${short(before)} -> ${short(after)}`)
    }
    chrome.storage.onChanged.addListener((items, area) => {
      for (const [key, { oldValue, newValue }] of Object.entries(items)) {
        const paths = []
        diff(key, oldValue, newValue, paths)
        changes.push(`${new Date().toISOString().slice(11, 23)} [storage ${area}] ${paths.join("; ")}`)
        if (changes.length > 100)
          changes.shift()
      }
    })
  }, SECRET_KEY.source).catch(() => {})
}

// A field of the accessibility tree whose name shows a secret, for example `textbox "API Key": sk-…`.
const SECRET_FIELD = /^(\s*- textbox "[^"]*(?:key|token|authorization|password)[^"]*"): .*$/gim

/**
 * Adds the state of the browser to the report of a failed test, so that a CI
 * log shows why it failed: the recent console messages, errors and failed
 * requests; the URL and the accessibility tree of each open page; the recent
 * changes of the extension storage and the stored config, without secrets.
 * When E2E_ARTIFACTS names a directory, it also saves a screenshot of each
 * page there.
 */
export async function reportFailure(test, context) {
  if (!test.error || !context)
    return
  const events = browserEvents.get(context) ?? []
  test.diagnostic(`browser events (last ${events.length}):\n${events.join("\n") || "(none)"}`)
  for (const [index, page] of context.pages().entries()) {
    const tree = await page.locator("body").ariaSnapshot({ timeout: 2_000 }).catch(error => `(no accessibility tree: ${error.message})`)
    test.diagnostic(`page ${index} ${page.url()}:\n${tree.replace(SECRET_FIELD, "$1: (hidden)").slice(0, 4_000)}`)
    if (process.env.E2E_ARTIFACTS) {
      await mkdir(process.env.E2E_ARTIFACTS, { recursive: true })
      const path = resolve(process.env.E2E_ARTIFACTS, `${test.name.slice(0, 60).replace(/\W+/g, "-")}-page-${index}.png`)
      await page.screenshot({ path, fullPage: true }).then(() => test.diagnostic(`screenshot: ${path}`), () => {})
    }
  }
  const worker = context.serviceWorkers()[0]
  const storageChanges = await worker?.evaluate(() => globalThis.e2eStorageChanges ?? []).catch(() => [])
  test.diagnostic(`storage changes (last ${storageChanges?.length ?? 0}):\n${storageChanges?.join("\n") || "(none)"}`)
  const config = await worker?.evaluate(async () => (await chrome.storage.local.get("config")).config).catch(error => `(no config: ${error.message})`)
  test.diagnostic(`stored config: ${JSON.stringify(config, (key, value) => SECRET_KEY.test(key) ? "(hidden)" : value)}`)
}

/** Clicks the button whose accessible name is exactly `name`. */
export async function clickButton(page, name) {
  await page.getByRole("button", { name, exact: true }).click()
}

/** Waits until `text` is visible on the page. */
export async function waitForText(page, text) {
  await page.getByText(text).first().waitFor()
}

/**
 * Waits until `predicate(config, arg)` is true for the config in the extension
 * storage. It checks at once and after each storage change. `page` must be an
 * extension page. The predicate runs in that page, so it can use only its
 * parameters, and `arg` must be JSON.
 */
export async function waitForStorage(page, predicate, arg) {
  // A string, because a function argument cannot cross into the page.
  await page.evaluate(`new Promise((resolve) => {
    const predicate = ${predicate}
    const check = async () => {
      const { config } = await chrome.storage.local.get("config")
      if (config && predicate(config, ${JSON.stringify(arg) ?? "undefined"})) {
        chrome.storage.onChanged.removeListener(check)
        resolve()
      }
    }
    chrome.storage.onChanged.addListener(check)
    check()
  })`)
}

// Chromium refuses these ports with ERR_UNSAFE_PORT (net/base/port_util.cc).
// Only ports above 1023 are here, because the system never assigns lower ones.
const UNSAFE_PORTS = new Set([1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080])

/** Listens on a free local port that the browser can reach, and returns the port. */
export async function listenOnLocalPort(server) {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address()
  if (!UNSAFE_PORTS.has(port))
    return port
  await new Promise(resolve => server.close(resolve))
  return listenOnLocalPort(server)
}
