// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest"
import { WORD_PREFIX_TAG } from "@/utils/constants/dom-labels"
import { startWordPrefixEmphasis } from "../../word-prefix-emphasis"
import { getOrCreateWebPageContext } from "../webpage-context"

let stop = () => {}
afterEach(() => {
  stop()
  document.body.replaceChildren()
})

it("user gets page context from original words: Given word-prefix emphasis on an article, When the page context is built for the model, Then it contains whole words", async () => {
  // Given
  window.history.replaceState({}, "", "/emphasis-context")
  document.title = "Reading practice"
  document.body.innerHTML = `<article><h1>Reading practice</h1>
    <p>Reading unfamiliar words takes practice. Keep the whole sentence in view while you read.</p>
    <p>Choose the presentation that feels comfortable for long articles and short notes.</p></article>`
  stop = startWordPrefixEmphasis(document)

  // When
  const context = await getOrCreateWebPageContext()

  // Then
  expect(context?.webContent).toContain("Reading unfamiliar words takes practice.")
  expect(context?.webContent).toContain("Choose the presentation that feels comfortable")
  expect(context?.webContent).not.toContain(WORD_PREFIX_TAG)
})
