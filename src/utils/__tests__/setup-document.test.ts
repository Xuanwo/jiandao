import type { Config } from "@/types/config/config"
import { describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import {
  applySetupDocument,
  describeSetupDocument,
  exportSetupDocument,
  isMaskedApiKey,
  maskApiKey,
  parseSetupDocument,
  SetupDocumentError,
  stringifySetupDocument,
} from "../setup-document"

function configWithOpenAIKey(apiKey: string): Config {
  return {
    ...DEFAULT_CONFIG,
    providersConfig: DEFAULT_CONFIG.providersConfig.map(provider =>
      provider.id === "openai-default" ? { ...provider, apiKey } : provider,
    ),
  }
}

describe("parseSetupDocument", () => {
  it("accepts the minimal document for a built-in service", () => {
    const result = parseSetupDocument(`{"plainly":1,"provider":{"type":"deepseek","apiKey":"sk-abc"}}`)
    expect(result.ok).toBe(true)
  })

  it("reports each problem with its JSON path so the agent can fix it", () => {
    const result = parseSetupDocument(`{"plainly":1,"provider":{"type":"openai-compatible","apiKey":"local"},"targetLanguage":"zh"}`)
    expect(result.ok).toBe(false)
    if (result.ok)
      return
    expect(result.error).toContain("provider.baseURL: baseURL is required")
    expect(result.error).toContain("provider.model: model is required")
    expect(result.error).toContain("targetLanguage:")
  })

  it("rejects unknown fields instead of ignoring them", () => {
    const result = parseSetupDocument(`{"plainly":1,"provider":{"type":"openai","apiKey":"sk-abc","modelName":"gpt-6-luna"}}`)
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.error).toContain("modelName")
  })

  it("rejects text that is not JSON", () => {
    const result = parseSetupDocument("sk-abcdef")
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.error).toMatch(/^Not valid JSON/)
  })
})

describe("applySetupDocument", () => {
  it("adds a new service, makes it the translation service and sets languages", () => {
    const parsed = parseSetupDocument(JSON.stringify({
      plainly: 1,
      provider: { type: "openai-compatible", name: "Ollama", apiKey: "local", model: "qwen3:8b", baseURL: "http://localhost:11434/v1/", providerOptions: { reasoningEffort: "none" } },
      targetLanguage: "jpn",
      sourceLanguage: "eng",
      mode: "translationOnly",
    }))
    if (!parsed.ok)
      throw new Error(parsed.error)

    const { config, providerId, replaced, keyReused } = applySetupDocument(DEFAULT_CONFIG, parsed.document)
    const added = config.providersConfig.find(p => p.id === providerId)

    expect(replaced).toBe(false)
    expect(keyReused).toBe(false)
    expect(config.providersConfig).toHaveLength(DEFAULT_CONFIG.providersConfig.length + 1)
    expect(added).toMatchObject({
      name: "Ollama",
      provider: "openai-compatible",
      apiKey: "local",
      baseURL: "http://localhost:11434/v1",
      model: { model: "use-custom-model", isCustomModel: true, customModel: "qwen3:8b" },
      providerOptions: { reasoningEffort: "none" },
    })
    expect(config.translate.providerId).toBe(providerId)
    expect(config.translate.mode).toBe("translationOnly")
    expect(config.language).toEqual({ ...DEFAULT_CONFIG.language, targetCode: "jpn", sourceCode: "eng" })
  })

  it("replaces the stored service with the same type and endpoint and keeps the others", () => {
    const parsed = parseSetupDocument(`{"plainly":1,"provider":{"type":"openai","apiKey":"sk-new-key","model":"gpt-6-luna","providerOptions":{"reasoningEffort":"none"}}}`)
    if (!parsed.ok)
      throw new Error(parsed.error)

    const { config, providerId, replaced } = applySetupDocument(configWithOpenAIKey("sk-old-key"), parsed.document)

    expect(replaced).toBe(true)
    expect(providerId).toBe("openai-default")
    expect(config.providersConfig).toHaveLength(DEFAULT_CONFIG.providersConfig.length)
    expect(config.providersConfig.find(p => p.id === "openai-default")).toMatchObject({
      apiKey: "sk-new-key",
      // A model outside the built-in catalog is stored as a custom model.
      model: { isCustomModel: true, customModel: "gpt-6-luna" },
      providerOptions: { reasoningEffort: "none" },
    })
    expect(config.providersConfig.find(p => p.id === "deepseek-default")).toEqual(DEFAULT_CONFIG.providersConfig.find(p => p.id === "deepseek-default"))
  })

  it("keeps the stored key when the document carries the masked key from an export", () => {
    const stored = configWithOpenAIKey("sk-proj-1234567890a9f2")
    const exported = exportSetupDocument(stored)
    if (!exported)
      throw new Error("export failed")
    expect(exported.provider.apiKey).toBe("sk-proj-…a9f2")

    const edited = { ...exported, provider: { ...exported.provider, model: "gpt-5-mini" } }
    const { config, keyReused } = applySetupDocument(stored, edited)

    expect(keyReused).toBe(true)
    expect(config.providersConfig.find(p => p.id === "openai-default")).toMatchObject({
      apiKey: "sk-proj-1234567890a9f2",
      model: { model: "gpt-5-mini", isCustomModel: false, customModel: null },
    })
  })

  it("refuses a document without a usable key when no stored service matches", () => {
    const parsed = parseSetupDocument(`{"plainly":1,"provider":{"type":"deepseek","apiKey":"sk-…a9f2"}}`)
    if (!parsed.ok)
      throw new Error(parsed.error)

    expect(() => applySetupDocument(DEFAULT_CONFIG, parsed.document)).toThrow(SetupDocumentError)
  })

  it("treats a relay with its own base URL as a different service from the official API", () => {
    const parsed = parseSetupDocument(`{"plainly":1,"provider":{"type":"openai","apiKey":"sk-relay","baseURL":"https://relay.example.com/v1"}}`)
    if (!parsed.ok)
      throw new Error(parsed.error)

    const { config, replaced } = applySetupDocument(configWithOpenAIKey("sk-official"), parsed.document)

    expect(replaced).toBe(false)
    expect(config.providersConfig.filter(p => p.provider === "openai")).toHaveLength(2)
    expect(config.providersConfig.find(p => p.id === "openai-default")?.apiKey).toBe("sk-official")
  })
})

describe("applySetupDocument prompt", () => {
  it("installs the document's prompt as the one in use and restores the default with null", () => {
    const withPrompt = parseSetupDocument(JSON.stringify({ plainly: 1, provider: { type: "deepseek", apiKey: "sk-abc" }, prompt: { name: "Terse", systemPrompt: "Be terse.", prompt: "Translate: {{input}}" } }))
    if (!withPrompt.ok)
      throw new Error(withPrompt.error)
    const applied = applySetupDocument(DEFAULT_CONFIG, withPrompt.document).config
    expect(applied.translate.customPromptsConfig).toEqual({
      promptId: "agent-prompt",
      patterns: [{ id: "agent-prompt", name: "Terse", systemPrompt: "Be terse.", prompt: "Translate: {{input}}" }],
    })
    expect(exportSetupDocument(applied)?.prompt).toEqual({ name: "Terse", systemPrompt: "Be terse.", prompt: "Translate: {{input}}" })

    const restore = parseSetupDocument(JSON.stringify({ plainly: 1, provider: { type: "deepseek", apiKey: "sk-…-abc" }, prompt: null }))
    if (!restore.ok)
      throw new Error(restore.error)
    const restored = applySetupDocument(applied, restore.document).config
    expect(restored.translate.customPromptsConfig).toEqual({ promptId: null, patterns: [] })
    expect(exportSetupDocument(restored)?.prompt).toBeUndefined()
  })

  it("leaves the stored prompt alone when the document does not mention it, and rejects a prompt without {{input}}", () => {
    const stored = { ...DEFAULT_CONFIG, translate: { ...DEFAULT_CONFIG.translate, customPromptsConfig: { promptId: "p1", patterns: [{ id: "p1", name: "Mine", systemPrompt: "", prompt: "{{input}}" }] } } }
    const untouched = parseSetupDocument(`{"plainly":1,"provider":{"type":"deepseek","apiKey":"sk-abc"}}`)
    if (!untouched.ok)
      throw new Error(untouched.error)
    expect(applySetupDocument(stored, untouched.document).config.translate.customPromptsConfig).toEqual(stored.translate.customPromptsConfig)

    const bad = parseSetupDocument(`{"plainly":1,"provider":{"type":"deepseek","apiKey":"sk-abc"},"prompt":{"prompt":"Translate this"}}`)
    expect(bad.ok).toBe(false)
    if (!bad.ok)
      expect(bad.error).toContain("prompt.prompt: prompt must contain {{input}}")
  })
})

describe("describeSetupDocument", () => {
  it("tells the reader where page text will go and whether the key is new", () => {
    const parsed = parseSetupDocument(`{"plainly":1,"provider":{"type":"deepseek","apiKey":"sk-abc","model":"deepseek-flash","providerOptions":{"thinking":{"type":"disabled"}}},"targetLanguage":"cmn","mode":"bilingual"}`)
    if (!parsed.ok)
      throw new Error(parsed.error)

    expect(describeSetupDocument(DEFAULT_CONFIG, parsed.document)).toEqual({
      type: "deepseek",
      providerName: "DeepSeek",
      modelId: "deepseek-flash",
      host: "api.deepseek.com",
      keyStatus: "new",
      thinkingOff: true,
      targetLanguage: "cmn",
      sourceLanguage: undefined,
      mode: "bilingual",
      promptName: undefined,
      replaces: true,
    })
  })

  it("uses the base URL host for custom endpoints and reports a missing key", () => {
    const parsed = parseSetupDocument(`{"plainly":1,"provider":{"type":"openai-compatible","model":"qwen3:8b","baseURL":"http://localhost:11434/v1"}}`)
    if (!parsed.ok)
      throw new Error(parsed.error)

    const preview = describeSetupDocument(DEFAULT_CONFIG, parsed.document)
    expect(preview.host).toBe("localhost:11434")
    expect(preview.keyStatus).toBe("missing")
    expect(preview.thinkingOff).toBeNull()
  })
})

describe("api key masking", () => {
  it("keeps the prefix and the last four characters", () => {
    expect(maskApiKey("sk-abcdefghijkl")).toBe("sk-…ijkl")
    expect(maskApiKey("sk-ant-abcdefghijkl")).toBe("sk-ant-…ijkl")
    expect(maskApiKey("token12345")).toBe("…2345")
  })

  it("recognizes masked keys written with the ellipsis or three dots", () => {
    expect(isMaskedApiKey("sk-…ijkl")).toBe(true)
    expect(isMaskedApiKey("sk-...ijkl")).toBe(true)
    expect(isMaskedApiKey("sk-abcdefghijkl")).toBe(false)
  })
})

describe("exportSetupDocument", () => {
  it("round-trips through parse with the masked key", () => {
    const exported = exportSetupDocument(configWithOpenAIKey("sk-abcdefghijkl"))
    if (!exported)
      throw new Error("export failed")

    const reparsed = parseSetupDocument(stringifySetupDocument(exported))
    expect(reparsed.ok).toBe(true)
    expect(exported).toMatchObject({ plainly: 1, provider: { type: "openai", apiKey: "sk-…ijkl", model: "gpt-5-mini" }, targetLanguage: "cmn", sourceLanguage: "auto", mode: "bilingual" })
  })
})
