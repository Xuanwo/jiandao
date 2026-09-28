// @vitest-environment jsdom
import { expect, it, vi } from "vitest"
import { WORD_PREFIX_TAG } from "@/utils/constants/dom-labels"
import { configWithMode, EMPHASIS_ON, setUpHostContentTests, storeConfig } from "../../__tests__/host-content-harness"

const hostContent = setUpHostContentTests()

it("user turns on emphasis during page translation: Given a translated paragraph, When emphasis wraps its words, Then no new translation request is sent", async () => {
  // Given
  const text = "Reading unfamiliar words takes practice every single day."
  document.body.innerHTML = `<p id="passage">${text}</p>`
  await storeConfig(configWithMode("bilingual"))
  await hostContent.start()
  await vi.waitFor(() => expect(document.querySelector("#passage")?.textContent).toContain(`translated: ${text}`))

  // When
  await storeConfig(EMPHASIS_ON)
  expect(document.querySelector(`#passage ${WORD_PREFIX_TAG}`)).not.toBeNull()
  // A paragraph added after the emphasis marks the point where the page has handled the emphasis changes.
  const nextText = "Keep the whole sentence in view while you read it."
  const next = document.createElement("p")
  next.textContent = nextText
  document.body.append(next)
  await vi.waitFor(() => expect(hostContent.requests).toContain(nextText))

  // Then
  expect(hostContent.requests).toEqual([text, nextText])
})
