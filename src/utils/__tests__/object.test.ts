import { describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { deepEqual, deepMerge } from "../object"

type Loose = Record<string, unknown>

describe("deepMerge", () => {
  it("merges nested objects and replaces arrays in a config patch", () => {
    const config = {
      language: DEFAULT_CONFIG.language,
      translate: {
        ...DEFAULT_CONFIG.translate,
        customPromptsConfig: {
          promptId: null,
          patterns: [{ id: "old", name: "Old", systemPrompt: "", prompt: "old" }],
        },
      },
    }

    const result = deepMerge(config, {
      language: { targetCode: "jpn" },
      translate: {
        customPromptsConfig: {
          promptId: null,
          patterns: [{ id: "new", name: "New", systemPrompt: "", prompt: "new" }],
        },
        page: { shortcut: "Alt+T" },
        mode: "translationOnly",
      },
    })

    expect(result.language).toEqual({ ...DEFAULT_CONFIG.language, targetCode: "jpn" })
    expect(result.translate.customPromptsConfig.patterns).toEqual([{ id: "new", name: "New", systemPrompt: "", prompt: "new" }])
    expect(result.translate.page).toEqual({ shortcut: "Alt+T" })
    expect(result.translate.enableAIContentAware).toBe(DEFAULT_CONFIG.translate.enableAIContentAware)
    expect(result.translate.mode).toBe("translationOnly")

    // Neither input is modified.
    expect(result).not.toBe(config)
    expect(config.translate.customPromptsConfig.patterns[0].id).toBe("old")
    expect(config.translate.mode).toBe(DEFAULT_CONFIG.translate.mode)
  })

  it("replaces values whose type changes, including null and undefined", () => {
    expect(deepMerge<Loose>({ arr: [1, 2] }, { arr: "string" })).toEqual({ arr: "string" })
    expect(deepMerge<Loose>({ val: "text" }, { val: ["a", "b"] })).toEqual({ val: ["a", "b"] })
    expect(deepMerge<Loose>({ items: ["x"] }, { items: [] })).toEqual({ items: [] })
    expect(deepMerge<Loose>({ a: null }, { a: 1, b: undefined })).toEqual({ a: 1, b: undefined })
    expect(deepMerge<Loose>({ a: { b: 1 } }, { a: null })).toEqual({ a: null })
  })
})

describe("deepEqual", () => {
  it("compares JSON-like values structurally", () => {
    expect(deepEqual({ a: [1, { b: "x" }], c: null }, { c: null, a: [1, { b: "x" }] })).toBe(true)
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false)
    expect(deepEqual([1, 2], [2, 1])).toBe(false)
    expect(deepEqual(Number.NaN, Number.NaN)).toBe(true)
    expect(deepEqual("1", 1)).toBe(false)
    expect(deepEqual(DEFAULT_CONFIG, structuredClone(DEFAULT_CONFIG))).toBe(true)
  })
})
