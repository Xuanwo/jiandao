import assert from "node:assert/strict"
import http from "node:http"
import { after, afterEach, before, it } from "node:test"
import { CONTENT_WRAPPER_CLASS, WORD_PREFIX_HIGHLIGHT } from "../../src/utils/constants/dom-labels.ts"
import { configureService, launchBrowser, pressTranslateShortcut, reportFailure } from "./browser.mjs"
import { setupDocumentFor, startFakeService } from "./fake-service.mjs"

const SWITCH = "Bold English word starts"
const MODE_LABELS = { bilingual: "Bilingual", translationOnly: "Translation only" }
const PASSAGE = "Reading unfamiliar words takes practice. Keep the whole sentence in view."
const PASSAGE_PREFIXES = ["Read", "unfam", "wor", "tak", "prac", "Ke", "th", "who", "sent", "i", "vi"]

const CHAT_MESSAGE = "https://example.com/lexicon?entry=cedar\n词条卡片显示读音，旁边的技术备注保持原样。\n```html\n<tr><th id=\"sound\">讀音</th>\n    <td headers=\"sound\"><span>jí qū áo yá</span></td></tr>\n```\n\n纸鸢目录中的 nebula 工具记录 maple/archive 路径，版本标签使用 cedarKey 和 FIELD_NAME。\n终端备注：使用 sample cli 查看记录。"
const escapeHtml = text => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")

const articlePage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Reading preferences</title>
<style>body { font: 20px/1.8 system-ui; max-width: 760px; margin: 40px auto; } .icon > svg:only-child { width: 40px; }</style></head>
<body><h1>A quiet moment to read</h1><article><p id="passage">${PASSAGE}</p>
<p id="mixed">Café naïve élan. 中文和日本語保持原样。 <a class="icon" id="link" href="#note"><svg viewBox="0 0 1 1" width="16"></svg>Read the note</a>.</p>
<pre id="code">const message = "Keep code unchanged";</pre>
<p contenteditable="true" id="editor">Editable words stay unchanged.</p>
<p id="note">Choose the presentation that feels comfortable for long articles.</p>
<section id="protected">
<table lang="zh-Hant-TW"><tr><th id="col1">漢語拼音</th><td headers="col1"><ib data-pre="">jí qū áo yá </ib> </td></tr><tr><td>ji qu ao ya</td></tr></table>
<p id="unmarked-pinyin">jí qū áo yá jí qū áo yá</p>
<div dir="auto" data-message-text="true" id="chat">${escapeHtml(CHAT_MESSAGE)}</div>
<p lang="zh">目录使用 <span>sample cli</span> 查看记录</p>
<p id="non-english" lang="de">Lesen macht Freude.</p>
</section>
<p id="technical">Visit https://example.com/read, email reader@example.com, or open src/main.ts. Keep reading.</p>
<div id="plain-code">${escapeHtml("Before reading.\n```html\n<tr><td>Keep code unchanged</td></tr>\n```\nAfter reading. Use `wordPrefixRanges(text)` carefully. <span title=\"Quoted > text\">No code emphasis</span> Keep reading. Use wordPrefixEmphasis and API_KEY unchanged.")}</div>
<p id="foreign">Café naïve élan. English prose stays readable.</p>
<p id="language" lang="en-US"><span>Reading daily.</span></p>
</article></body></html>`

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
  assert.deepEqual((await readHighlight(article, "#mixed")).prefixes, [])
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

  // When: the toggle in the popup turns the emphasis off.
  const popup = await context.newPage()
  await popup.goto(options.url().replace(/options\.html.*$/, "popup.html"))
  await popup.getByRole("button", { name: SWITCH, pressed: true }).click()
  await popup.getByRole("button", { name: SWITCH, pressed: false }).waitFor()

  // Then
  await article.waitForFunction(name => !CSS.highlights.has(name), WORD_PREFIX_HIGHLIGHT)
})

it("user reads pronunciation and technical text: Given a dictionary and a plain chat message, When emphasis is on, Then protected text stays plain and English prose keeps its prefixes", async () => {
  // Given / When
  const options = await setUp()
  await setEmphasis(options, true)
  const article = await openArticle()
  await waitForPrefixes(article, "#passage", PASSAGE_PREFIXES)

  // Then: the browser supplies the real Highlight API; the extension does not change source text.
  assert.deepEqual((await readHighlight(article, "#protected")).prefixes, [])
  assert.equal(await article.locator("#chat").textContent(), CHAT_MESSAGE)
  assert.deepEqual((await readHighlight(article, "#technical")).prefixes, ["Vis", "ema", "o", "op", "Ke", "read"])
  assert.deepEqual((await readHighlight(article, "#plain-code")).prefixes, ["Bef", "read", "Aft", "read", "Us", "caref", "Ke", "read", "Us", "an", "uncha"])
  assert.deepEqual((await readHighlight(article, "#foreign")).prefixes, ["Engl", "pro", "sta", "read"])
  await waitForPrefixes(article, "#language", ["Read", "dai"])

  // When: the page changes the language on an ancestor, then declares English on its child.
  await article.locator("#language").evaluate(element => element.lang = "zh-Hant")
  await article.waitForFunction(name => ![...CSS.highlights.get(name)].some(range => document.querySelector("#language").contains(range.startContainer)), WORD_PREFIX_HIGHLIGHT)
  await article.locator("#language span").evaluate(element => element.lang = "en")

  // Then
  await waitForPrefixes(article, "#language", ["Read", "dai"])

  // When: a chat renderer splits a fence across spans, or inserts Chinese next to an English span.
  await article.locator("#plain-code").evaluate((element) => {
    element.textContent = "Before reading.\n```html\n"
    const span = document.createElement("span")
    span.textContent = "Keep code unchanged"
    element.append(span, "\n```\nAfter reading.")
  })
  await article.locator("#language").evaluate(element => element.append("使用 gh cli"))

  // Then: inline markup does not defeat the text protections, and old prefixes disappear.
  await article.waitForFunction(name => ![...CSS.highlights.get(name)].some(range => document.querySelector("#language").contains(range.startContainer)), WORD_PREFIX_HIGHLIGHT)
  assert.deepEqual((await readHighlight(article, "#plain-code")).prefixes, ["Bef", "read", "Aft", "read"])

  // When: a renderer splits an accented word and the page changes its document language.
  await article.locator("#foreign").evaluate((element) => {
    element.replaceChildren("Caf")
    const span = document.createElement("span")
    span.textContent = "é"
    element.append(span, " reading.")
  })
  await waitForPrefixes(article, "#foreign", ["read"])
  await article.evaluate(() => document.documentElement.lang = "zh-Hant-TW")

  // Then: the inherited document language also applies after startup.
  await article.waitForFunction(name => ![...CSS.highlights.get(name)].some(range => document.querySelector("#passage").contains(range.startContainer)), WORD_PREFIX_HIGHLIGHT)
  await article.evaluate(() => document.documentElement.lang = "en")
  await waitForPrefixes(article, "#passage", PASSAGE_PREFIXES)
})

for (const mode of ["translationOnly", "bilingual"]) {
  it(`user reads a ${mode} translation with emphasis: Given emphasis on, When the article is translated and then shown in the original, Then the Chinese translation stays plain and the English original gets prefixes again`, async () => {
    // Given
    const options = await setUp(mode)
    await setEmphasis(options, true)
    const article = await openArticle()
    await waitForPrefixes(article, "#passage", PASSAGE_PREFIXES)

    // When
    await pressTranslateShortcut(article)

    // Then: the fake service translates to "【译】" and the first 24 characters of the paragraph.
    await article.locator(`#passage .${CONTENT_WRAPPER_CLASS}`).filter({ hasText: "【译】" }).waitFor()
    assert.deepEqual((await readHighlight(article, `#passage .${CONTENT_WRAPPER_CLASS}`)).prefixes, [])
    if (mode === "bilingual")
      assert.deepEqual((await readHighlight(article, "#passage")).prefixes, PASSAGE_PREFIXES)
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
