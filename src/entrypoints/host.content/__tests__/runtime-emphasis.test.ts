// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { highlightedPrefixes, isWordPrefixHighlightRegistered, stubHighlightRegistry } from "@/utils/host/__tests__/highlight-registry-fake"
import { EMPHASIS_ON, setUpHostContentTests, storeConfig } from "./host-content-harness"

const hostContent = setUpHostContentTests({ pageTranslation: false })

beforeEach(() => {
  stubHighlightRegistry()
  document.body.innerHTML = "<p id=\"passage\">Reading needs practice</p>"
})

it("user changes word-prefix emphasis while a page is open: Given a page that starts with emphasis on, When the setting changes and the content script ends, Then the page follows each change and then stays plain", async () => {
  // Given
  await storeConfig(EMPHASIS_ON)
  await hostContent.start()
  await vi.waitFor(() => expect(highlightedPrefixes()).toEqual(["Read", "nee", "prac"]))

  // When
  await storeConfig(DEFAULT_CONFIG)

  // Then
  expect(isWordPrefixHighlightRegistered()).toBe(false)

  // When
  await storeConfig(EMPHASIS_ON)

  // Then
  expect(highlightedPrefixes()).toEqual(["Read", "nee", "prac"])

  // When: an extension update or removal ends the content script.
  hostContent.invalidate()
  await storeConfig(DEFAULT_CONFIG)
  await storeConfig(EMPHASIS_ON)

  // Then
  expect(isWordPrefixHighlightRegistered()).toBe(false)
})
