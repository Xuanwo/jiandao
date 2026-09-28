// @vitest-environment jsdom
import type { Config } from "@/types/config/config"
import { afterEach, beforeEach, expect, it } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { configWithMode, storeConfig } from "@/entrypoints/host.content/__tests__/host-content-harness"
import { CONTENT_WRAPPER_CLASS, OWNED_PRESENTATION_SELECTOR, WORD_PREFIX_TAG } from "@/utils/constants/dom-labels"
import { onMessage } from "@/utils/message"
import { flushBatchedOperations } from "../../dom/batch-dom"
import { walkAndLabelElement } from "../../dom/traversal"
import { startWordPrefixEmphasis } from "../../word-prefix-emphasis"
import { translateWalkedElement } from "../core/translation-walker"
import { removeAllTranslatedWrapperNodes } from "../dom/translation-cleanup"

const TRANSLATION = "Une lecture attentive garde le sens."

let requests: string[] = []
let removeTranslator = () => {}
let stopEmphasis = () => {}

function paragraph(): HTMLElement {
  const element = document.querySelector("p")
  if (!element)
    throw new Error("The page has no paragraph")
  return element
}

/** Walks and translates the page the way page translation does, and waits for the DOM writes. */
async function translatePage(config: Config) {
  const walkId = crypto.randomUUID()
  walkAndLabelElement(document.body, walkId, config)
  await translateWalkedElement(document.body, walkId, config)
  flushBatchedOperations()
}

beforeEach(async () => {
  fakeBrowser.reset()
  requests = []
  // The background answers translation requests; this stand-in records the text of each one.
  removeTranslator = onMessage("enqueueTranslateRequest", async (message) => {
    requests.push(message.data.text)
    return TRANSLATION
  })
})

afterEach(() => {
  stopEmphasis()
  stopEmphasis = () => {}
  removeTranslator()
  document.body.replaceChildren()
})

it("user shows the original after translation only: Given emphasized text with a link, When the page is translated, emphasis is turned off and the original is shown, Then the model got plain markup and the paragraph returns without emphasis", async () => {
  // Given
  const config = configWithMode("translationOnly")
  await storeConfig(config)
  const text = "Reading unfamiliar words takes practice every single day."
  document.body.innerHTML = "<p>Reading <a href=\"#note\">unfamiliar words</a> takes practice every single day.</p>"
  stopEmphasis = startWordPrefixEmphasis(document)

  // When
  await translatePage(config)

  // Then
  expect(requests).toHaveLength(1)
  expect(requests[0]).not.toContain(WORD_PREFIX_TAG)
  expect(requests[0]).toContain("unfamiliar words")
  expect(paragraph().textContent).toBe(TRANSLATION)

  // When
  stopEmphasis()
  removeAllTranslatedWrapperNodes()
  flushBatchedOperations()

  // Then
  expect(paragraph().querySelector(OWNED_PRESENTATION_SELECTOR)).toBeNull()
  expect(paragraph().textContent).toBe(text)
  expect(paragraph().querySelector("a[href='#note']")?.textContent).toBe("unfamiliar words")
})

it("user shows the original of line-broken text after translation only: Given emphasized lines with a line break, When the page is translated, emphasis is turned off and the original is shown, Then the lines return without emphasis", async () => {
  // Given
  const config = configWithMode("translationOnly")
  await storeConfig(config)
  document.body.innerHTML = "<div><span>Reading unfamiliar words</span><br><span>takes practice every day</span> and more words</div>"
  const text = "Reading unfamiliar wordstakes practice every day and more words"
  stopEmphasis = startWordPrefixEmphasis(document)

  // When
  await translatePage(config)
  stopEmphasis()
  removeAllTranslatedWrapperNodes()
  flushBatchedOperations()

  // Then
  expect(requests.length).toBeGreaterThan(0)
  expect(document.body.querySelector(OWNED_PRESENTATION_SELECTOR)).toBeNull()
  expect(document.body.textContent).toBe(text)
  expect(document.body.querySelectorAll("br")).toHaveLength(1)
})

it("user turns emphasis off on a bilingual page: Given an emphasized paragraph of plain text, When it is translated and emphasis is turned off, Then the original text and one translation stay in the paragraph", async () => {
  // Given
  const config = configWithMode("bilingual")
  await storeConfig(config)
  const text = "Reading unfamiliar words takes practice every single day."
  document.body.innerHTML = `<p>${text}</p>`
  stopEmphasis = startWordPrefixEmphasis(document)

  // When
  await translatePage(config)
  stopEmphasis()

  // Then
  expect(requests).toEqual([text])
  expect(paragraph().querySelector(OWNED_PRESENTATION_SELECTOR)).toBeNull()
  expect(paragraph().firstChild?.textContent).toBe(text)
  expect(paragraph().querySelectorAll(`.${CONTENT_WRAPPER_CLASS}`)).toHaveLength(1)
  expect(paragraph().querySelector(`.${CONTENT_WRAPPER_CLASS}`)?.textContent).toBe(TRANSLATION)
})
