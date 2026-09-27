import { describe, expect, it } from "vitest"
import { sha256Hex, stringHash } from "../hash"

describe("sha256Hex", () => {
  it("matches the digests earlier versions stored as cache keys", async () => {
    await expect(sha256Hex("hello")).resolves.toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824")
    await expect(sha256Hex("hello", "world")).resolves.toBe("55a3db6314a88ae7f97bdbc9133e215f32ee5c93a84d600a5a003ccd9d82c305")
  })

  it("keeps parameter boundaries apart", async () => {
    expect(await sha256Hex("a", "bc")).not.toBe(await sha256Hex("ab", "c"))
  })

  it("rejects a call without texts", async () => {
    await expect(sha256Hex()).rejects.toThrow("At least one text parameter is required")
  })
})

describe("stringHash", () => {
  it("is stable, 16 hex characters, and tells nearby strings apart", () => {
    expect(stringHash("hello")).toBe(stringHash("hello"))
    expect(stringHash("hello")).toMatch(/^[0-9a-f]{16}$/)
    expect(stringHash("hello")).not.toBe(stringHash("hellp"))
    expect(stringHash("a", "bc")).not.toBe(stringHash("ab", "c"))
    expect(stringHash("")).toMatch(/^[0-9a-f]{16}$/)
  })
})
