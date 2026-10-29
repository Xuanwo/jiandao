// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { TRANSLATION_ERROR_CONTAINER_CLASS } from "@/utils/constants/dom-labels"
import { createWordPrefixEmphasisController, startWordPrefixEmphasis } from "../word-prefix-emphasis"
import { highlightedPrefixes, isWordPrefixHighlightRegistered, stubHighlightRegistry, wordPrefixRangeCount } from "./highlight-registry-fake"

let stop = () => {}

/** Lets the MutationObserver deliver the records of the changes so far. */
function flushMutations(): Promise<void> {
  return new Promise(resolve => queueMicrotask(resolve))
}

function select(selector: string): HTMLElement {
  const element = document.querySelector(selector)
  if (!(element instanceof HTMLElement))
    throw new Error(`No element matches ${selector}`)
  return element
}

beforeEach(() => {
  stubHighlightRegistry()
})

afterEach(() => {
  stop()
  stop = () => {}
  vi.unstubAllGlobals()
  document.body.replaceChildren()
  document.documentElement.removeAttribute("lang")
})

it("user reads English prose: Given English text with accented loanwords, When emphasis starts, Then English words get prefixes and the page DOM does not change", () => {
  // Given
  document.body.innerHTML = "<p></p>"
  const paragraph = select("p")
  paragraph.textContent = "A cat reads quietly. naïve élan don't 👩‍💻 <script> & 123"
  const text = paragraph.firstChild
  const markup = document.body.innerHTML

  // When
  stop = startWordPrefixEmphasis(document.body)

  // Then: accented loanwords and literal markup stay plain; apostrophes count toward the prefix length.
  expect(highlightedPrefixes()).toEqual(["ca", "rea", "quie", "don"])
  expect(document.body.innerHTML).toBe(markup)
  expect(paragraph.firstChild).toBe(text)
})

it("user keeps code, controls and headings plain: Given a page with them, When emphasis starts, Then only the prose and the link are highlighted", () => {
  // Given
  document.body.innerHTML = `<h2>Section heading</h2><p>Reading <a href="#target">linked text</a>.</p>
    <pre>sample code</pre><code>inline code</code><kbd>keyboard shortcut</kbd>
    <div contenteditable="true"><p>editable text</p></div><div role="textbox">textbox text</div>
    <button>button text</button><select><option>option text</option></select><textarea>input text</textarea>
    <strong>important text</strong><b>bold text</b><svg><text>vector text</text></svg>
    <div class="${TRANSLATION_ERROR_CONTAINER_CLASS}">Translation failed</div>`

  // When
  stop = startWordPrefixEmphasis(document.body)

  // Then
  expect(highlightedPrefixes()).toEqual(["Read", "lin", "te"])
})

it("user reads a page that changes: Given emphasis on, When the page changes, adds, moves, removes and merges text, Then the highlight follows the page and keeps no range of removed text", async () => {
  // Given
  document.body.innerHTML = "<p id=\"first\">Original sentence.</p><p id=\"second\">Hello wonderful</p><div id=\"box\"></div>"
  stop = startWordPrefixEmphasis(document.body)

  // When
  select("#first").firstChild!.textContent = "Updated passage."
  const added = document.createElement("p")
  added.id = "added"
  added.textContent = "Another paragraph."
  const code = document.createElement("pre")
  code.textContent = "Keep code plain."
  document.body.append(added, code)
  select("#box").append(select("#second"))
  select("#second").append(" world")
  await flushMutations()

  // Then
  expect(highlightedPrefixes()).toEqual(["Upda", "pass", "Hel", "wonde", "wor", "Anot", "parag"])

  // When: highlighters and editors merge text nodes this way; then the page removes a paragraph.
  document.body.normalize()
  select("#added").remove()
  await flushMutations()

  // Then
  expect(highlightedPrefixes()).toEqual(["Upda", "pass", "Hel", "wonde", "wor"])
  expect(wordPrefixRangeCount()).toBe(5)
})

it("user edits text in place: Given emphasized text, When the page makes it editable and then not, Then the text is plain while editable and highlighted again after", async () => {
  // Given
  document.body.innerHTML = "<div id=\"title\"><span>Editable title</span></div>"
  stop = startWordPrefixEmphasis(document.body)

  // When
  select("#title").setAttribute("contenteditable", "true")
  await flushMutations()

  // Then
  expect(highlightedPrefixes()).toEqual([])
  expect(wordPrefixRangeCount()).toBe(0)

  // When
  select("#title").removeAttribute("contenteditable")
  await flushMutations()

  // Then
  expect(highlightedPrefixes()).toEqual(["Edit", "tit"])
})

it("user removes an inline language region: Given emphasized inline text, When its language changes and it leaves the page in one update, Then no highlight remains on the removed text", async () => {
  // Given: MutationObserver delivers both records after the element has no parent.
  document.body.innerHTML = "<p><span lang=\"en\">Reading daily.</span></p>"
  const span = select("span")
  stop = startWordPrefixEmphasis(document.body)
  expect(highlightedPrefixes()).toEqual(["Read", "dai"])

  // When
  span.lang = "zh"
  span.remove()
  await flushMutations()

  // Then
  expect(wordPrefixRangeCount()).toBe(0)
  expect(highlightedPrefixes()).toEqual([])
})

it("user closes an emphasized inline preview: Given a custom inline root, When the root leaves the page and its text changes, Then its removed text has no prefixes", async () => {
  // Given
  document.body.innerHTML = "<reading-preview>Reading daily.</reading-preview>"
  const preview = select("reading-preview")
  stop = startWordPrefixEmphasis(preview)
  expect(highlightedPrefixes()).toEqual(["Read", "dai"])

  // When: the root is detached before the observer delivers its records.
  preview.lang = "zh"
  preview.remove()
  preview.firstChild!.textContent = "Another passage."
  await flushMutations()

  // Then
  expect(wordPrefixRangeCount()).toBe(0)
})

it("user reads split accents: Given a text node that starts with a combining mark, When emphasis starts, Then the mark is not a word start", () => {
  // Given: a framework split "élan" between "e" and the combining acute accent.
  document.body.innerHTML = "<p></p>"
  select("p").append("Quiet e", "́lan today")

  // When
  stop = startWordPrefixEmphasis(document.body)

  // Then
  expect(highlightedPrefixes()).toEqual(["Qui", "tod"])
})

it("user opens a page where emphasis cannot run: Given an SVG document or a browser without the Highlight API, When emphasis turns on and off, Then nothing fails", () => {
  // Given
  const svg = document.implementation.createDocument("http://www.w3.org/2000/svg", "svg")
  document.body.innerHTML = "<p>Reading needs practice</p>"
  const svgEmphasis = createWordPrefixEmphasisController(svg)

  // When / Then
  expect(() => {
    svgEmphasis.setEnabled(true)
    svgEmphasis.setEnabled(false)
  }).not.toThrow()
  vi.stubGlobal("Highlight", undefined)
  expect(() => startWordPrefixEmphasis(document.body)()).not.toThrow()
})

it("user sees two previews with emphasis: Given two emphasized regions of one page, When one of them stops, Then the other keeps its prefixes, and the highlight goes when both stop", () => {
  // Given
  document.body.innerHTML = "<p id=\"first\">Reading needs</p><p id=\"second\">practice daily</p>"
  const stopFirst = startWordPrefixEmphasis(select("#first"))
  const stopSecond = startWordPrefixEmphasis(select("#second"))
  expect(highlightedPrefixes()).toEqual(["Read", "nee", "prac", "dai"])

  // When
  stopFirst()

  // Then
  expect(highlightedPrefixes()).toEqual(["prac", "dai"])

  // When
  stopSecond()

  // Then
  expect(isWordPrefixHighlightRegistered()).toBe(false)
})

it("user switches emphasis in the settings: Given a page, When the setting turns emphasis on twice and then off, Then the words get one set of prefixes and stay plain after later updates", async () => {
  // Given
  document.body.innerHTML = "<p>Reading needs practice</p>"
  const emphasis = createWordPrefixEmphasisController(document)
  stop = () => emphasis.setEnabled(false)

  // When: the setting is off, as on a new install.
  emphasis.setEnabled(false)

  // Then
  expect(isWordPrefixHighlightRegistered()).toBe(false)

  // When: another change of the settings keeps emphasis on.
  emphasis.setEnabled(true)
  emphasis.setEnabled(true)

  // Then
  expect(highlightedPrefixes()).toEqual(["Read", "nee", "prac"])
  expect(wordPrefixRangeCount()).toBe(3)

  // When
  emphasis.setEnabled(false)
  select("p").textContent = "Updates remain plain"
  await flushMutations()

  // Then
  expect(isWordPrefixHighlightRegistered()).toBe(false)
  expect(select("p").innerHTML).toBe("Updates remain plain")
})
