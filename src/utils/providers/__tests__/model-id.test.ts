import { describe, expect, it } from "vitest"
import { resolveModelId } from "../model-id"

describe("resolveModelId", () => {
  it("user enters a model ID with spaces: Given a padded model ID, When it is resolved, Then the spaces are removed", () => {
    expect(resolveModelId(" gpt-4.1-mini ")).toBe("gpt-4.1-mini")
  })

  it("user has no model yet: Given an empty or blank model ID, When it is resolved, Then no model ID is returned", () => {
    expect(resolveModelId("")).toBeUndefined()
    expect(resolveModelId("  ")).toBeUndefined()
  })
})
