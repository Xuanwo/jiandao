import { describe, expect, it } from "vitest"
import { DEFAULT_DETECTED_CODE } from "@/utils/constants/config"
import { normalizeDetectedCode } from "../languages"

describe("normalizeDetectedCode", () => {
  it("keeps supported codes and falls back for anything else", () => {
    expect(normalizeDetectedCode("jpn")).toBe("jpn")
    expect(normalizeDetectedCode("vmw")).toBe(DEFAULT_DETECTED_CODE)
    expect(normalizeDetectedCode(null)).toBe(DEFAULT_DETECTED_CODE)
  })
})
