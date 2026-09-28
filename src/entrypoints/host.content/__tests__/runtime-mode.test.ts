// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest"
import { configWithMode, nextAnimationFrame, setUpHostContentTests, storeConfig } from "./host-content-harness"

const hostContent = setUpHostContentTests()

function shownMode() {
  return document.querySelector("#passage [data-jiandao-translation-mode]")?.getAttribute("data-jiandao-translation-mode")
}

const PASSAGE = "Reading and experience train your model of the world."

beforeEach(() => {
  document.body.innerHTML = `<p id="passage">${PASSAGE}</p>`
})

it("user changes the translation mode on a translated page: Given a page translated in bilingual mode, When the stored mode changes and then the content script ends, Then the page follows the change and then keeps its mode", async () => {
  // Given: wait for the translation text too; the wrapper shows its mode before the translation arrives.
  await storeConfig(configWithMode("bilingual"))
  await hostContent.start()
  await vi.waitFor(() => {
    expect(shownMode()).toBe("bilingual")
    expect(document.querySelector("#passage")?.textContent).toContain("translated: ")
  })

  // When
  const statesBefore = hostContent.stateMessages.length
  await storeConfig(configWithMode("translationOnly"))

  // Then
  await vi.waitFor(() => {
    expect(shownMode()).toBe("translationOnly")
    expect(document.querySelector("#passage")?.textContent).toBe(`translated: ${PASSAGE}`)
  })
  // The page translation stays on for the tab, so the popup and the toolbar icon do not show "off" in between.
  expect(hostContent.stateMessages.slice(statesBefore)).not.toContain(false)

  // When: an extension update or removal ends the content script.
  hostContent.invalidate()
  await storeConfig(configWithMode("bilingual"))
  // A page translation that stops removes its translations in the next animation frame.
  await nextAnimationFrame()

  // Then
  expect(shownMode()).toBe("translationOnly")
})

it.each([
  ["bilingual", "translationOnly", `translated: ${PASSAGE}`],
  ["translationOnly", "bilingual", `${PASSAGE}translated: ${PASSAGE}`],
] as const)("user changes the translation mode while the page is translating: Given a paragraph translating in %s mode, When the stored mode changes to %s before the translation arrives, Then the paragraph shows the translation in the new mode", async (from, to, shownText) => {
  // Given: the paragraph shows its translation wrapper, but the translation has not arrived.
  await storeConfig(configWithMode(from))
  const releaseTranslations = hostContent.holdTranslations()
  await hostContent.start()
  await vi.waitFor(() => expect(shownMode()).toBe(from))

  // When
  await storeConfig(configWithMode(to))
  await vi.waitFor(() => expect(shownMode()).toBe(to))
  releaseTranslations()

  // Then: the translation of the ended page translation arrives too, and it does not change the page.
  await vi.waitFor(() => expect(document.querySelector("#passage")?.textContent).toBe(shownText))
  await nextAnimationFrame()
  expect(document.querySelector("#passage")?.textContent).toBe(shownText)
  expect(document.querySelectorAll("#passage [data-jiandao-translation-mode]")).toHaveLength(1)
  expect(shownMode()).toBe(to)
})
