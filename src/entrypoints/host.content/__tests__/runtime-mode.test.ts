// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest"
import { configWithMode, nextAnimationFrame, setUpHostContentTests, storeConfig } from "./host-content-harness"

const hostContent = setUpHostContentTests()

function shownMode() {
  return document.querySelector("#passage [data-jiandao-translation-mode]")?.getAttribute("data-jiandao-translation-mode")
}

beforeEach(() => {
  document.body.innerHTML = "<p id=\"passage\">Reading and experience train your model of the world.</p>"
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
    expect(document.querySelector("#passage")?.textContent).toBe("translated: Reading and experience train your model of the world.")
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
