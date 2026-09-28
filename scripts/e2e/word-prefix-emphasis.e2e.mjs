import assert from "node:assert/strict"
import http from "node:http"
import { after, afterEach, before, it } from "node:test"
import { CONTENT_WRAPPER_CLASS, WORD_PREFIX_HIGHLIGHT } from "../../src/utils/constants/dom-labels.ts"
import { configureService, launchBrowser, pressTranslateShortcut, reportFailure } from "./browser.mjs"
import { setupDocumentFor, startFakeService } from "./fake-service.mjs"

const SWITCH = "Word-prefix emphasis"
const MODE_LABELS = { bilingual: "Bilingual", translationOnly: "Translation only" }
const PASSAGE = "Reading unfamiliar words takes practice. Keep the whole sentence in view."
const PASSAGE_PREFIXES = ["Read", "unfam", "wor", "tak", "prac", "Ke", "th", "who", "sent", "i", "vi"]

const articlePage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Reading preferences</title>
<style>body { font: 20px/1.8 system-ui; max-width: 760px; margin: 40px auto; } .icon > svg:only-child { width: 40px; }</style></head>
<body><h1>A quiet moment to read</h1><article><p id="passage">${PASSAGE}</p>
<p id="mixed">Café naïve élan. 中文和日本語保持原样。 <a class="icon" id="link" href="#note"><svg viewBox="0 0 1 1" width="16"></svg>Read the note</a>.</p>
<pre id="code">const message = "Keep code unchanged";</pre>
<p contenteditable="true" id="editor">Editable words stay unchanged.</p>
<p id="note">Choose the presentation that feels comfortable for long articles.</p></article></body></html>`

let service
let pages
let pagesOrigin
let context

before(async () => {
  service = await startFakeService()
  pages = http.createServer((request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8")
    response.end(articlePage)
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

/** Opens the article and waits until the content script runs in it. */
async function openArticle() {
  const page = await context.newPage()
  await page.goto(`${pagesOrigin}/`)
  // The content script adds its preset styles and starts to watch the settings in one synchronous step.
  await page.waitForFunction(() => document.adoptedStyleSheets.length > 0 || document.querySelector("#jiandao-preset-styles"))
  return page
}

/**
 * The page sees the highlight that the content script registers. Gives the
 * text of each word prefix under the selector in page order, the number of
 * ranges of text that left the page, or null when no highlight is registered.
 */
function readHighlight(page, selector = "body") {
  return page.evaluate(({ name, selector }) => {
    const highlight = CSS.highlights.get(name)
    if (!highlight)
      return null
    const root = document.querySelector(selector)
    const ranges = [...highlight]
    const prefixes = ranges
      .filter(range => root.contains(range.startContainer))
      .sort((a, b) => a.startContainer === b.startContainer
        ? a.startOffset - b.startOffset
        : a.startContainer.compareDocumentPosition(b.startContainer) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)
      .map(range => range.startContainer.data.slice(range.startOffset, range.endOffset))
    return { prefixes, stale: ranges.filter(range => !range.startContainer.isConnected).length }
  }, { name: WORD_PREFIX_HIGHLIGHT, selector })
}

/** Waits until the word prefixes under the selector are the expected ones. */
async function waitForPrefixes(page, selector, expected) {
  await page.waitForFunction(({ name, selector, first }) => {
    const root = document.querySelector(selector)
    return [...CSS.highlights.get(name) ?? []].some(range => root?.contains(range.startContainer) && range.startContainer.data.slice(range.startOffset, range.endOffset) === first)
  }, { name: WORD_PREFIX_HIGHLIGHT, selector, first: expected[0] })
  assert.deepEqual((await readHighlight(page, selector)).prefixes, expected)
}

/** Whether a style sheet of the document has a rule for ::highlight() of the word prefixes. */
function paintsHighlight(page) {
  return page.evaluate(name => [...document.adoptedStyleSheets, ...document.styleSheets]
    .some(sheet => [...sheet.cssRules].some(rule => rule.selectorText === `::highlight(${name})` && rule.style.textShadow)), WORD_PREFIX_HIGHLIGHT)
}

/** The positions of the link icon and each line of the passage. */
function measureLayout(page) {
  return page.evaluate(() => {
    const range = document.createRange()
    range.selectNodeContents(document.querySelector("#passage"))
    return { icon: document.querySelector("#link svg").getBoundingClientRect().toJSON(), lines: [...range.getClientRects()].map(rect => rect.toJSON()) }
  })
}

/** Copies the passage with the keyboard and gives the HTML that the clipboard gets. */
async function copyPassage(page) {
  await page.evaluate(() => {
    const range = document.createRange()
    range.selectNodeContents(document.querySelector("#passage"))
    getSelection().removeAllRanges()
    getSelection().addRange(range)
  })
  await page.keyboard.press("ControlOrMeta+C")
  return page.evaluate(async () => {
    getSelection().removeAllRanges()
    const [item] = await navigator.clipboard.read()
    return (await item.getType("text/html")).text()
  })
}

it("user chooses word-prefix emphasis: Given an open article, When the switch is turned on and off in the settings, Then the article shows the prefixes without a reload and keeps its markup, layout and copied text", async () => {
  // Given
  const options = await setUp()
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: pagesOrigin })
  const article = await openArticle()
  const markup = await article.locator("body").innerHTML()
  const layout = await measureLayout(article)
  const plainCopy = await copyPassage(article)
  assert.equal(await readHighlight(article), null)

  // When: the keyboard turns the switch on.
  await options.bringToFront()
  const toggle = options.getByRole("switch", { name: SWITCH, exact: true })
  assert.equal(await toggle.getAttribute("aria-checked"), "false")
  await toggle.focus()
  await options.keyboard.press("Space")
  await options.getByRole("switch", { name: SWITCH, exact: true, checked: true }).waitFor()

  // Then: code and editable text stay plain.
  await article.bringToFront()
  await waitForPrefixes(article, "#passage", PASSAGE_PREFIXES)
  assert.deepEqual((await readHighlight(article, "#mixed")).prefixes, ["Ca", "naï", "él", "Re", "th", "no"])
  assert.deepEqual((await readHighlight(article, "#code")).prefixes, [])
  assert.deepEqual((await readHighlight(article, "#editor")).prefixes, [])
  assert.ok(await paintsHighlight(article), "the page styles paint the highlight")
  assert.equal(await article.locator("body").innerHTML(), markup)
  assert.deepEqual(await measureLayout(article), layout)
  assert.equal(await copyPassage(article), plainCopy, "the copied text has no emphasis")

  // When: the page changes the text, and the reader reloads the page.
  await article.evaluate(() => document.querySelector("#passage").textContent = "Updated reading material.")

  // Then
  await waitForPrefixes(article, "#passage", ["Upda", "read", "mate"])
  await article.reload()
  await waitForPrefixes(article, "#passage", PASSAGE_PREFIXES)

  // When: the pointer turns the switch off.
  await setEmphasis(options, false)

  // Then
  await article.waitForFunction(name => !CSS.highlights.has(name), WORD_PREFIX_HIGHLIGHT)
})

for (const mode of ["translationOnly", "bilingual"]) {
  it(`user reads a ${mode} translation with emphasis: Given emphasis on, When the article is translated and then shown in the original, Then the translation and the original get prefixes, and no range of removed text stays`, async () => {
    // Given
    const options = await setUp(mode)
    await setEmphasis(options, true)
    const article = await openArticle()
    await waitForPrefixes(article, "#passage", PASSAGE_PREFIXES)

    // When
    await pressTranslateShortcut(article)

    // Then: the fake service translates to "【译】" and the first 24 characters of the paragraph.
    await waitForPrefixes(article, `#passage .${CONTENT_WRAPPER_CLASS}`, ["Read", "unfam", "wor"])
    assert.equal((await readHighlight(article)).stale, 0)

    // When
    await pressTranslateShortcut(article)

    // Then
    await article.locator(`.${CONTENT_WRAPPER_CLASS}`).first().waitFor({ state: "detached" })
    assert.equal(await article.locator("#passage").textContent(), PASSAGE)
    await waitForPrefixes(article, "#passage", PASSAGE_PREFIXES)
    assert.equal((await readHighlight(article)).stale, 0)
  })
}
