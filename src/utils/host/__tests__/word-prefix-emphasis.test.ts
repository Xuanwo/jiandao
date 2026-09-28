// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it } from "vitest"
import { OWNED_PRESENTATION_SELECTOR, WORD_PREFIX_TAG, WORD_PREFIX_TEXT_TAG } from "@/utils/constants/dom-labels"
import { originalInnerHTML } from "../dom/owned-presentation"
import { createWordPrefixEmphasisController, startWordPrefixEmphasis } from "../word-prefix-emphasis"

let stop = () => {}

/** Lets the MutationObserver deliver the records of the changes so far. */
function flushMutations(): Promise<void> {
  return new Promise(resolve => queueMicrotask(resolve))
}

function select(selector: string, root: ParentNode = document): HTMLElement {
  const element = root.querySelector(selector)
  if (!(element instanceof HTMLElement))
    throw new Error(`No element matches ${selector}`)
  return element
}

/** The text of each word prefix under root, in page order. */
function prefixTexts(root: ParentNode = document): string[] {
  return [...root.querySelectorAll(WORD_PREFIX_TAG)].map(prefix => prefix.textContent)
}

afterEach(() => {
  stop()
  document.body.replaceChildren()
})

it("user reads unchanged text: Given Latin words and other scripts, When emphasis is enabled, Then only Latin word prefixes are bold and graphemes stay intact", () => {
  const text = "A cat reads quietly. naïve e\u0301lan don't 中文 日本語 한국어 العربية 👩‍💻 <script> & 123"
  document.body.innerHTML = "<p></p>"
  const paragraph = select("p")
  paragraph.textContent = text
  stop = startWordPrefixEmphasis(document)
  expect(paragraph.textContent).toBe(text)
  expect(prefixTexts(paragraph))
    .toEqual(["ca", "rea", "quie", "naï", "e\u0301l", "don", "scr"])
  expect(paragraph.querySelector("script")).toBeNull()
  stop()
  expect(paragraph.innerHTML).toBe("A cat reads quietly. naïve élan don't 中文 日本語 한국어 العربية 👩‍💻 &lt;script&gt; &amp; 123")
})

it("user keeps page controls intact: Given code, editors and existing emphasis, When enabled, Then those regions and link actions are preserved", () => {
  document.body.innerHTML = `<p>Reading <a href="#target">linked text</a>.</p>
    <pre>sample code</pre><code>inline code</code><kbd>keyboard shortcut</kbd>
    <div contenteditable="true"><p>editable text</p></div>
    <div role="textbox">textbox text</div><button>button text</button>
    <select><option>option text</option></select><textarea>input text</textarea>
    <strong>important text</strong><svg><text>vector text</text></svg>
    <div hidden>hidden text</div><div inert>inert text</div>`
  const link = select("a")
  let clicked = false
  link.addEventListener("click", () => {
    clicked = true
  })
  stop = startWordPrefixEmphasis(document)
  expect(document.querySelectorAll(WORD_PREFIX_TAG)).toHaveLength(3)
  expect(document.querySelector("a")).toBe(link)
  link.click()
  expect(clicked).toBe(true)
  stop()
  expect(document.querySelector("a")).toBe(link)
  expect(document.querySelectorAll(WORD_PREFIX_TAG)).toHaveLength(0)
})

it("user reads live updates: Given an enabled page, When text is inserted or changed, Then new text is emphasized once and stopping preserves updates", async () => {
  document.body.innerHTML = "<p>Original sentence.</p>"
  stop = startWordPrefixEmphasis(document)
  const paragraph = select("p")
  paragraph.textContent = "Updated passage."
  const extra = document.createElement("p")
  extra.textContent = "Another paragraph."
  document.body.append(extra)
  // Flush the real MutationObserver delivery, without replacing browser APIs.
  await flushMutations()
  expect(prefixTexts(paragraph)).toEqual(["Upda", "pass"])
  expect(extra.querySelectorAll(WORD_PREFIX_TAG)).toHaveLength(2)
  const prefix = select(WORD_PREFIX_TAG, paragraph)
  const prefixText = prefix.firstChild
  if (!prefixText)
    throw new Error("The prefix has no text")
  prefixText.textContent = "Revised"
  await flushMutations()
  expect(paragraph.textContent).toBe("Revisedted passage.")
  expect(paragraph.querySelector(`${WORD_PREFIX_TAG} ${WORD_PREFIX_TAG}`)).toBeNull()
  stop()
  expect(paragraph.textContent).toBe("Revisedted passage.")
  expect(extra.innerHTML).toBe("Another paragraph.")
  paragraph.textContent = "Stopped updates."
  await flushMutations()
  expect(paragraph.children).toHaveLength(0)
})

it("user translates original markup: Given emphasized text, When translation takes a snapshot, Then it receives original markup without mutating the visible page", () => {
  document.body.innerHTML = "<p>Hello <a href=\"#link\">wonderful world</a>.</p>"
  const paragraph = select("p")
  const original = paragraph.innerHTML
  stop = startWordPrefixEmphasis(document)
  expect(originalInnerHTML(paragraph)).toBe(original)
  expect(paragraph.querySelectorAll(WORD_PREFIX_TAG).length).toBeGreaterThan(0)
})

it("user reads framework updates: Given a React page, When text changes or disappears during emphasis and after stopping, Then the visible page follows React", async () => {
  const container = document.createElement("div")
  document.body.append(container)
  const root = createRoot(container)
  const render = (word: string | null) => act(() => root.render(createElement("p", null, "Status: ", word, createElement("a", { href: "#end" }, "details"))))
  try {
    render("Original")
    stop = startWordPrefixEmphasis(document)
    render("Updated")
    await flushMutations()
    expect(container.textContent).toBe("Status: Updateddetails")
    render(null)
    await flushMutations()
    expect(container.textContent).toBe("Status: details")
    render("Returned")
    await flushMutations()
    render("Pending")
    stop()
    expect(container.textContent).toBe("Status: Pendingdetails")
    render("Final")
    expect(container.textContent).toBe("Status: Finaldetails")
    expect(container.querySelector(WORD_PREFIX_TAG)).toBeNull()
  }
  finally {
    stop()
    act(() => root.unmount())
  }
})

it("user reads inserted content: Given active emphasis, When code and normal paragraphs are inserted, Then only the normal paragraph is emphasized", async () => {
  stop = startWordPrefixEmphasis(document)
  const code = document.createElement("pre")
  code.innerHTML = "<span>Keep code unchanged.</span>"
  const paragraph = document.createElement("p")
  paragraph.textContent = "Latest content."
  document.body.append(code, paragraph)
  await flushMutations()
  expect(code.innerHTML).toBe("<span>Keep code unchanged.</span>")
  expect(paragraph.querySelector(WORD_PREFIX_TAG)?.textContent).toBe("Lat")
})

it("user keeps the page structure: Given page CSS that styles spans and last children, When emphasis is enabled, Then the page gains no span and each text run stays one element", () => {
  // Given: rules from a real landing page; computed layout is checked in the browser E2E test.
  document.body.innerHTML = "<div class=\"column\">Community project maintained<span>by volunteers</span></div>"
  const column = select(".column")

  // When
  stop = startWordPrefixEmphasis(document)

  // Then
  expect(column.textContent).toBe("Community project maintainedby volunteers")
  expect(column.children).toHaveLength(2)
  expect(column.querySelectorAll("span")).toHaveLength(1)
  expect(prefixTexts(column)).toEqual(["Commu", "proj", "maint", "b", "volun"])
})

it("user keeps split accents: Given a text node that starts with a combining mark, When emphasis runs and stops, Then the mark is kept", () => {
  // Given: a framework split "élan" between "e" and the combining acute accent.
  document.body.innerHTML = "<p></p>"
  const paragraph = select("p")
  paragraph.append("Quiet e", "́lan today")

  // When
  stop = startWordPrefixEmphasis(document)

  // Then
  expect(paragraph.textContent).toBe("Quiet élan today")
  stop()
  expect(paragraph.textContent).toBe("Quiet élan today")
})

it("user opens a document without a body: Given an SVG document, When emphasis starts and stops, Then nothing fails", () => {
  // Given
  const svg = document.implementation.createDocument("http://www.w3.org/2000/svg", "svg")

  // When / Then
  const stopSvg = startWordPrefixEmphasis(svg)
  expect(() => stopSvg()).not.toThrow()
})

it("user turns emphasis off after the page copied markup: Given emphasized markup copied by the page, When emphasis stops, Then the copy returns to plain text", () => {
  // Given
  document.body.innerHTML = "<p id=\"source\">Carousel caption text</p><p id=\"copy\"></p>"
  stop = startWordPrefixEmphasis(document)
  const copy = select("#copy")
  copy.innerHTML = select("#source").innerHTML

  // When
  stop()

  // Then
  expect(document.querySelectorAll(OWNED_PRESENTATION_SELECTOR)).toHaveLength(0)
  expect(copy.textContent).toBe("Carousel caption text")
})

it("user keeps text when the page normalizes it: Given emphasized sentences, When the page calls normalize(), Then the text stays visible and survives turning emphasis off", async () => {
  // Given
  document.body.innerHTML = "<p>Hello wonderful world today</p><div>Some <em>marked</em> words here</div>"
  stop = startWordPrefixEmphasis(document)

  // When: highlighters and editors merge text nodes this way.
  document.body.normalize()
  await flushMutations()

  // Then
  expect(document.body.textContent).toBe("Hello wonderful world todaySome marked words here")
  stop()
  expect(document.body.textContent).toBe("Hello wonderful world todaySome marked words here")
  expect(document.querySelectorAll(OWNED_PRESENTATION_SELECTOR)).toHaveLength(0)
})

it("user switches emphasis in the settings: Given a page, When the setting turns emphasis on twice, then off, Then the words get one set of prefixes, return to plain text and stay plain after later updates", async () => {
  // Given
  document.body.innerHTML = "<p>Reading needs practice</p>"
  const emphasis = createWordPrefixEmphasisController(document)
  stop = () => emphasis.setEnabled(false)

  // When: the setting is off, as on a new install.
  emphasis.setEnabled(false)

  // Then
  expect(document.querySelectorAll(WORD_PREFIX_TAG)).toHaveLength(0)

  // When: another change of the settings keeps emphasis on.
  emphasis.setEnabled(true)
  emphasis.setEnabled(true)

  // Then
  expect(prefixTexts()).toEqual(["Read", "nee", "prac"])

  // When
  emphasis.setEnabled(false)

  // Then
  expect(select("p").innerHTML).toBe("Reading needs practice")
  select("p").textContent = "Updates remain plain"
  await flushMutations()
  expect(select("p").children).toHaveLength(0)
})

it("user reads one-letter words: Given a text of single Latin letters, When emphasis is enabled, Then the page keeps the same text node without markup", () => {
  // Given
  document.body.innerHTML = "<p>A b c</p>"
  const text = select("p").firstChild

  // When
  stop = startWordPrefixEmphasis(document)

  // Then
  expect(select("p").firstChild).toBe(text)
  expect(select("p").innerHTML).toBe("A b c")
})

it("user translates a paragraph with a custom element: Given emphasized text next to a custom element of the page, When translation takes a snapshot, Then the page code of the element does not run again", () => {
  // Given: the page counts each construction of its custom element.
  let constructions = 0
  customElements.define("page-counter", class extends HTMLElement {
    constructor() {
      super()
      constructions++
    }
  })
  document.body.innerHTML = "<p>Reading needs practice <page-counter></page-counter></p>"
  stop = startWordPrefixEmphasis(document)
  const before = constructions

  // When
  const snapshot = originalInnerHTML(select("p"))

  // Then
  expect(snapshot).toBe("Reading needs practice <page-counter></page-counter>")
  expect(constructions).toBe(before)
  expect(select("p").querySelectorAll(WORD_PREFIX_TEXT_TAG)).toHaveLength(1)
})

it("user reads a page that removes nodes: Given emphasis on, When the page removes a comment, a text without Latin words and a copy of emphasized markup, Then the emphasized text stays and turning emphasis off leaves plain text", async () => {
  // Given
  document.body.innerHTML = "<p id=\"source\">Reading needs practice</p><p id=\"copy\"></p><p id=\"other\">中文</p><!-- marker -->"
  stop = startWordPrefixEmphasis(document)
  select("#copy").innerHTML = select("#source").innerHTML
  await flushMutations()

  // When
  select("#copy").remove()
  select("#other").firstChild?.remove()
  document.body.lastChild?.remove()
  await flushMutations()

  // Then
  expect(prefixTexts(select("#source"))).toEqual(["Read", "nee", "prac"])
  stop()
  expect(select("#source").innerHTML).toBe("Reading needs practice")
  expect(document.body.childNodes).toHaveLength(2)
  expect(select("#other").childNodes).toHaveLength(0)
})
