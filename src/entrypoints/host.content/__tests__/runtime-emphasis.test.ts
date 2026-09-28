// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { WORD_PREFIX_TAG } from "@/utils/constants/dom-labels"
import { EMPHASIS_ON, setUpHostContentTests, storeConfig } from "./host-content-harness"

const hostContent = setUpHostContentTests({ pageTranslation: false })

function prefixes(): string[] {
  return [...document.querySelectorAll(`#passage ${WORD_PREFIX_TAG}`)].map(prefix => prefix.textContent)
}

beforeEach(() => {
  document.body.innerHTML = "<p id=\"passage\">Reading needs practice</p>"
})

it("user changes word-prefix emphasis while a page is open: Given a page that starts with emphasis on, When the setting changes and the content script ends, Then the page follows each change and then stays plain", async () => {
  // Given
  await storeConfig(EMPHASIS_ON)
  await hostContent.start()
  await vi.waitFor(() => expect(prefixes()).toEqual(["Read", "nee", "prac"]))

  // When
  await storeConfig(DEFAULT_CONFIG)

  // Then
  expect(document.querySelector("#passage")?.innerHTML).toBe("Reading needs practice")

  // When
  await storeConfig(EMPHASIS_ON)

  // Then
  expect(prefixes()).toEqual(["Read", "nee", "prac"])

  // When: an extension update or removal ends the content script.
  hostContent.invalidate()
  await storeConfig(DEFAULT_CONFIG)
  await storeConfig(EMPHASIS_ON)

  // Then
  expect(document.querySelector("#passage")?.innerHTML).toBe("Reading needs practice")
})
