import assert from "node:assert/strict"
import http from "node:http"
import { after, afterEach, before, it } from "node:test"
import { CONTENT_WRAPPER_CLASS, OWNED_PRESENTATION_SELECTOR, WORD_PREFIX_TAG } from "../../src/utils/constants/dom-labels.ts"
import { configureService, launchBrowser, pressTranslateShortcut, reportFailure } from "./browser.mjs"
import { setupDocumentFor, startFakeService } from "./fake-service.mjs"

const SWITCH = "Word-prefix emphasis"
const MODE_LABELS = { bilingual: "Bilingual", translationOnly: "Translation only" }
const PASSAGE = "Reading unfamiliar words takes practice. Keep the whole sentence in view."

const articlePage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Reading preferences</title>
<style>body { font: 20px/1.8 system-ui; max-width: 760px; margin: 40px auto; }</style></head>
<body><h1>A quiet moment to read</h1><article><p id="passage">${PASSAGE}</p>
<p id="mixed">Café naïve élan. 中文和日本語保持原样。 <a id="link" href="#note">Read the note</a>.</p>
<pre id="code">const message = "Keep code unchanged";</pre>
<p contenteditable="true" id="editor">Editable words stay unchanged.</p>
<p id="note">Choose the presentation that feels comfortable for long articles.</p></article></body></html>`

// Rules from a real landing page (silo.pgsty.com) that put each prefix on its own line
// or split words into spaced flex items when the emphasis used span elements.
const landingPage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Landing page</title>
<style>body { font: 18px/1.6 system-ui; margin: 40px; width: 900px; }
.hero-sub span { display: block; }
.board-top, .board-foot { display: flex; justify-content: space-between; gap: 18px; font-family: monospace; letter-spacing: 0.12em; }
.board-top span, .board-foot span:last-child { display: inline-flex; align-items: center; gap: 8px; }
.board-top :last-child { display: inline-flex; gap: 8px; }</style></head>
<body><p class="hero-sub" id="hero"><span>PGSTY SILO is a MinIO fork maintained by volunteers.</span><span>Provide packages and fixes.</span></p>
<div class="board-top" id="top"><span>STORAGE NODE</span><span>PGSTY</span></div>
<div class="board-foot" id="foot"><span>COMMUNITY FORK</span><span>MAINTAINED BY PIGSTY</span></div></body></html>`

let service
let pages
let pagesOrigin
let context

before(async () => {
  service = await startFakeService()
  pages = http.createServer((request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8")
    response.end(request.url.startsWith("/landing") ? landingPage : articlePage)
  })
  await new Promise(resolve => pages.listen(0, "127.0.0.1", resolve))
  pagesOrigin = `http://127.0.0.1:${pages.address().port}`
})

after(async () => {
  await service.close()
  await new Promise(resolve => pages.close(resolve))
})

afterEach(async (test) => {
  try {
    await reportFailure(test, context)
    if (test.error)
      test.diagnostic(`requests to the fake service:\n${service.completions().map(({ body }) => body.slice(0, 600)).join("\n")}`)
  }
  finally {
    await context?.close()
    context = undefined
  }
})

/**
 * Starts the browser, applies a setup document for the fake service on the
 * settings page, and chooses the display mode in the reading settings.
 * Returns the settings page.
 */
async function setUp(mode = "bilingual") {
  const launched = await launchBrowser()
  context = launched.context
  const { page: options, extensionId } = launched
  await configureService(options, extensionId, setupDocumentFor(service.origin))
  await options.goto(`chrome-extension://${extensionId}/options.html#reading`)
  await options.getByRole("button", { name: MODE_LABELS[mode], exact: true }).click()
  await options.getByRole("button", { name: MODE_LABELS[mode], exact: true, pressed: true }).waitFor()
  return options
}

/** Sets the emphasis switch in the settings page with a click when its state differs. */
async function setEmphasis(options, on) {
  await options.bringToFront()
  const toggle = options.getByRole("switch", { name: SWITCH, exact: true })
  if (await toggle.getAttribute("aria-checked") !== String(on))
    await toggle.click()
  await options.getByRole("switch", { name: SWITCH, exact: true, checked: on }).waitFor()
}

/** Opens a page of the test site and waits until the content script runs in it. */
async function openPage(path) {
  const page = await context.newPage()
  await page.goto(`${pagesOrigin}${path}`)
  // The content script adds its preset styles and starts to watch the settings in one synchronous step.
  await page.waitForFunction(() => document.adoptedStyleSheets.length > 0 || document.querySelector("#jiandao-preset-styles"))
  return page
}

/** The user messages of the translation requests that contain `text`. */
function translationRequestsWith(text) {
  return service.translationRequests()
    .map(messages => messages.filter(message => message.role === "user").map(message => message.content).join("\n"))
    .filter(content => content.includes(text))
}

it("user chooses word-prefix emphasis: Given an open article, When the switch is turned on and off in the settings, Then the page updates without a reload, keeps its text and controls, and returns to its original markup", async () => {
  // Given
  const options = await setUp()
  const article = await openPage("/")
  assert.equal(await article.locator(OWNED_PRESENTATION_SELECTOR).count(), 0)

  // When: the keyboard turns the switch on.
  await options.bringToFront()
  const toggle = options.getByRole("switch", { name: SWITCH, exact: true })
  assert.equal(await toggle.getAttribute("aria-checked"), "false")
  await toggle.focus()
  await options.keyboard.press("Space")
  await options.getByRole("switch", { name: SWITCH, exact: true, checked: true }).waitFor()

  // Then
  await article.bringToFront()
  const firstPrefix = article.locator(`#passage ${WORD_PREFIX_TAG}`).first()
  await firstPrefix.waitFor({ state: "attached" })
  assert.equal(await article.locator("#passage").textContent(), PASSAGE)
  assert.equal(await firstPrefix.textContent(), "Read")
  assert.equal(await firstPrefix.evaluate(element => getComputedStyle(element).fontWeight), "700")
  assert.equal(await article.locator(`#code ${WORD_PREFIX_TAG}, #editor ${WORD_PREFIX_TAG}`).count(), 0, "code and editable text stay unchanged")
  await article.locator("#link").click()
  assert.equal(await article.evaluate(() => location.hash), "#note")
  await article.evaluate(() => document.querySelector("#passage").textContent = "Updated reading material.")
  await article.waitForFunction(tag => document.querySelector(`#passage ${tag}`)?.textContent === "Upda", WORD_PREFIX_TAG)
  await article.reload()
  await article.locator(`#passage ${WORD_PREFIX_TAG}`).first().waitFor({ state: "attached" })

  // When: the pointer turns the switch off.
  await setEmphasis(options, false)

  // Then
  await article.locator(OWNED_PRESENTATION_SELECTOR).first().waitFor({ state: "detached" })
  assert.equal(await article.locator("#passage").innerHTML(), PASSAGE)
  await article.evaluate(() => document.querySelector("#passage").textContent = "Updates remain plain.")
  assert.equal(await article.evaluate(() => document.querySelector("#passage").children.length), 0)
})

it("user keeps the page layout: Given page CSS for every span and last child, When emphasis is turned on, Then lines, flex items and heights stay the same", async () => {
  // Given
  const options = await setUp()
  const landing = await openPage("/landing")
  const measure = () => ["#hero", "#top", "#foot"].map((selector) => {
    const element = document.querySelector(selector)
    const range = document.createRange()
    range.selectNodeContents(element)
    return { lines: new Set([...range.getClientRects()].map(rect => Math.round(rect.top))).size, height: Math.round(element.getBoundingClientRect().height), items: element.children.length }
  })
  const before = await landing.evaluate(measure)

  // When
  await setEmphasis(options, true)
  await landing.locator(`#hero ${WORD_PREFIX_TAG}`).first().waitFor({ state: "attached" })
  await landing.locator(`#foot ${WORD_PREFIX_TAG}`).first().waitFor({ state: "attached" })

  // Then
  const after = await landing.evaluate(measure)
  assert.deepEqual(after.map(({ lines, items }) => ({ lines, items })), before.map(({ lines, items }) => ({ lines, items })))
  for (const [index, { height }] of after.entries())
    assert.ok(Math.abs(height - before[index].height) <= 1, `height of block ${index} changed from ${before[index].height} to ${height}`)
  // A text wrapper that is a flex item is blockified like the anonymous item it replaces; prefixes stay inline.
  assert.deepEqual(await landing.evaluate(tag => [...new Set([...document.querySelectorAll(tag)].map(element => getComputedStyle(element).display))], WORD_PREFIX_TAG), ["inline"])
  assert.equal(await landing.locator("#foot").textContent(), "COMMUNITY FORKMAINTAINED BY PIGSTY")
})

for (const mode of ["translationOnly", "bilingual"]) {
  it(`user shows the original after ${mode} translation: Given emphasis on a translated article, When emphasis is turned off and the original is shown, Then the model got no emphasis markup and the original text returns without it`, async () => {
    // Given
    const options = await setUp(mode)
    await setEmphasis(options, true)
    const article = await openPage("/")
    await article.locator(`#passage ${WORD_PREFIX_TAG}`).first().waitFor({ state: "attached" })
    await pressTranslateShortcut(article)
    const translation = article.locator(`#passage .${CONTENT_WRAPPER_CLASS}`).filter({ hasText: "【译】" })
    await translation.waitFor({ timeout: 20_000 })
    await article.locator(`#passage .${CONTENT_WRAPPER_CLASS} ${WORD_PREFIX_TAG}`).first().waitFor({ state: "attached" })
    const requests = translationRequestsWith("unfamiliar")
    assert.ok(requests.length > 0, "the passage reached the service")
    assert.ok(requests.every(content => !content.includes(WORD_PREFIX_TAG)), `requests: ${requests.join(" | ")}`)

    // When
    await setEmphasis(options, false)
    await article.locator(OWNED_PRESENTATION_SELECTOR).first().waitFor({ state: "detached" })
    await pressTranslateShortcut(article)

    // Then
    await article.locator(`.${CONTENT_WRAPPER_CLASS}`).first().waitFor({ state: "detached" })
    assert.equal(await article.locator("#passage").textContent(), PASSAGE)
    assert.equal(await article.locator(OWNED_PRESENTATION_SELECTOR).count(), 0)
  })
}

it("user turns on emphasis on a translated page: Given a bilingual translation, When emphasis is turned on, Then each paragraph keeps one translation and no paragraph is sent again", async () => {
  // Given
  const options = await setUp("bilingual")
  const article = await openPage("/")
  await pressTranslateShortcut(article)
  await article.waitForFunction(wrapperClass => ["#passage", "#mixed", "#note"].every(selector => document.querySelector(`${selector} .${wrapperClass}`)?.textContent.includes("【译】")), CONTENT_WRAPPER_CLASS)
  const passageRequests = translationRequestsWith("unfamiliar").length

  // When
  await setEmphasis(options, true)
  await article.locator(`#passage .${CONTENT_WRAPPER_CLASS} ${WORD_PREFIX_TAG}`).first().waitFor({ state: "attached" })
  // A paragraph added after the emphasis marks the point where the page has handled the emphasis changes.
  await article.evaluate(() => {
    const next = document.createElement("p")
    next.id = "next"
    next.textContent = "Another paragraph arrives after the reader enabled emphasis."
    document.querySelector("article").append(next)
  })
  await article.locator(`#next .${CONTENT_WRAPPER_CLASS}`).filter({ hasText: "【译】" }).waitFor({ timeout: 20_000 })

  // Then
  assert.equal(translationRequestsWith("unfamiliar").length, passageRequests, "the passage was not sent again")
  for (const selector of ["#passage", "#mixed", "#note"])
    assert.equal(await article.locator(`${selector} .${CONTENT_WRAPPER_CLASS}`).count(), 1, `${selector} has one translation`)
})
