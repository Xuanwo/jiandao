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
  it("accepts the minimal document for an official service", () => {
    const result = parseSetupDocument(`{"type":"deepseek","apiKey":"sk-abc","model":"deepseek-flash"}`)
    expect(result.ok).toBe(true)
  })

  it("accepts every official service and a compatible one with its own wire format", () => {
    for (const type of ["openai", "anthropic", "gemini", "deepseek"]) {
      expect(parseSetupDocument(JSON.stringify({ type, apiKey: "k", model: "m" })).ok).toBe(true)
    }
    const xai = parseSetupDocument(`{"type":"openai-compatible","api":"openai-responses","apiKey":"k","model":"grok-4.7","baseURL":"https://api.x.ai/v1"}`)
    expect(xai.ok).toBe(true)
  })

  it("reports each problem with its JSON path so the agent can fix it", () => {
    const result = parseSetupDocument(`{"type":"openai-compatible","apiKey":"local","model":"qwen3:8b"}`)
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.error).toContain("baseURL: baseURL is required")

    const noModel = parseSetupDocument(`{"type":"openai","apiKey":"sk-abc"}`)
    expect(noModel.ok).toBe(false)
    if (!noModel.ok)
      expect(noModel.error).toMatch(/^model:/)
  })

  it("covers the service only: languages, display and prompt are rejected", () => {
    const result = parseSetupDocument(`{"type":"deepseek","apiKey":"sk-abc","model":"deepseek-flash","targetLanguage":"cmn","prompt":null}`)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("targetLanguage")
      expect(result.error).toContain("prompt")
    }
  })

  it("rejects unknown fields instead of ignoring them", () => {
    const result = parseSetupDocument(`{"type":"openai","apiKey":"sk-abc","model":"gpt-6-luna","providerOptions":{}}`)
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.error).toContain("providerOptions")
  })

  it("rejects text that is not JSON", () => {
    const result = parseSetupDocument("sk-abcdef")
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.error).toMatch(/^Not valid JSON/)
  })
})

describe("applySetupDocument", () => {
  it("user adds a service: Given a valid document, When saved, Then selection and other settings stay unchanged", () => {
    const parsed = parseSetupDocument(JSON.stringify({
      type: "openai-compatible",
      name: "Ollama",
      apiKey: "local",
      model: "qwen3:8b",
      baseURL: "http://localhost:11434/v1/",
      body: { reasoning_effort: "none" },
    }))
    if (!parsed.ok)
      throw new Error(parsed.error)

    const { config, providerId } = applySetupDocument(DEFAULT_CONFIG, parsed.document, { kind: "add" })
    const added = config.providersConfig.find(p => p.id === providerId)

    expect(config.providersConfig).toHaveLength(DEFAULT_CONFIG.providersConfig.length + 1)
    expect(added).toEqual({
      id: providerId,
      name: "Ollama",
      enabled: true,
      provider: "openai-compatible",
      apiKey: "local",
      baseURL: "http://localhost:11434/v1",
      model: "qwen3:8b",
      body: { reasoning_effort: "none" },
    })
    expect(config.translate).toEqual(DEFAULT_CONFIG.translate)
    expect(config.language).toEqual(DEFAULT_CONFIG.language)
  })

  it("drops the previous connection check of a replaced service", () => {
    const stored = configWithOpenAIKey("sk-old-key")
    stored.providersConfig = stored.providersConfig.map(p => ({ ...p, connectionCheck: { ok: true, checkedAt: 1 } }))
    const parsed = parseSetupDocument(`{"type":"openai","apiKey":"sk-new-key","model":"gpt-6-luna"}`)
    if (!parsed.ok)
      throw new Error(parsed.error)

    const { config, providerId } = applySetupDocument(stored, parsed.document, { kind: "edit", providerId: "openai-default" })
    expect(config.providersConfig.find(p => p.id === providerId)).not.toHaveProperty("connectionCheck")
  })

  it("replaces the stored service with the same type and endpoint and keeps the others", () => {
    const parsed = parseSetupDocument(`{"type":"openai","apiKey":"sk-new-key","model":"gpt-6-luna","body":{"reasoning":{"effort":"none"}}}`)
    if (!parsed.ok)
      throw new Error(parsed.error)

    const stored: Config = { ...configWithOpenAIKey("sk-old-key") }
    stored.providersConfig = [...stored.providersConfig, { id: "claude", name: "Claude", enabled: true, provider: "anthropic", apiKey: "sk-ant-x", model: "claude-haiku-4-5" }]

    const { config, providerId } = applySetupDocument(stored, parsed.document, { kind: "edit", providerId: "openai-default" })

    expect(providerId).toBe("openai-default")
    expect(config.providersConfig).toHaveLength(stored.providersConfig.length)
    expect(config.providersConfig.find(p => p.id === "openai-default")).toMatchObject({
      apiKey: "sk-new-key",
      model: "gpt-6-luna",
      body: { reasoning: { effort: "none" } },
    })
    expect(config.providersConfig.find(p => p.id === "claude")).toEqual(stored.providersConfig[1])
  })

  it("keeps the stored key when the document carries the masked key from an export", () => {
    const stored = configWithOpenAIKey("sk-proj-1234567890a9f2")
    const exported = exportSetupDocument(stored, "openai-default")
    if (!exported)
      throw new Error("export failed")
    expect(exported.apiKey).toBe("sk-proj-…a9f2")

    const edited = { ...exported, model: "gpt-5-mini" }
    const { config } = applySetupDocument(stored, edited, { kind: "edit", providerId: "openai-default" })

    expect(config.providersConfig.find(p => p.id === "openai-default")).toMatchObject({
      apiKey: "sk-proj-1234567890a9f2",
      model: "gpt-5-mini",
    })
  })

  it("refuses a document without a usable key when no stored service matches", () => {
    const parsed = parseSetupDocument(`{"type":"deepseek","apiKey":"sk-…a9f2","model":"deepseek-flash"}`)
    if (!parsed.ok)
      throw new Error(parsed.error)

    expect(() => applySetupDocument(DEFAULT_CONFIG, parsed.document, { kind: "add" })).toThrow(SetupDocumentError)
  })

  it("treats a relay with its own base URL as a different service from the official API", () => {
    const parsed = parseSetupDocument(`{"type":"openai","apiKey":"sk-relay","model":"gpt-6-luna","baseURL":"https://relay.example.com/v1"}`)
    if (!parsed.ok)
      throw new Error(parsed.error)

    const { config } = applySetupDocument(configWithOpenAIKey("sk-official"), parsed.document, { kind: "add" })

    expect(config.providersConfig.filter(p => p.provider === "openai")).toHaveLength(2)
    expect(config.providersConfig.find(p => p.id === "openai-default")?.apiKey).toBe("sk-official")
  })
})

describe("describeSetupDocument", () => {
  it("tells the reader where page text will go and whether the key is new", () => {
    const parsed = parseSetupDocument(`{"type":"deepseek","apiKey":"sk-abc","model":"deepseek-flash","body":{"thinking":{"type":"disabled"}}}`)
    if (!parsed.ok)
      throw new Error(parsed.error)

    expect(describeSetupDocument(DEFAULT_CONFIG, parsed.document, { kind: "add" })).toEqual({
      type: "deepseek",
      api: "openai-chat",
      providerName: "DeepSeek",
      modelId: "deepseek-flash",
      host: "api.deepseek.com",
      keyStatus: "new",
      thinkingOff: true,
    })
  })

  it("recognizes the thinking switch of each wire format", () => {
    const cases: Array<[Record<string, unknown>, boolean]> = [
      [{ type: "openai", body: { reasoning: { effort: "none" } } }, true],
      [{ type: "openai", body: { reasoning: { effort: "high" } } }, false],
      [{ type: "anthropic", body: { thinking: { type: "disabled" } } }, true],
      [{ type: "anthropic", body: { output_config: { effort: "low" } } }, true],
      [{ type: "gemini", body: { generationConfig: { thinkingConfig: { thinkingLevel: "minimal" } } } }, true],
      [{ type: "gemini", body: { generationConfig: { thinkingConfig: { thinkingBudget: 0 } } } }, true],
      [{ type: "openai-compatible", baseURL: "http://localhost:1234/v1", body: { enable_thinking: false } }, true],
    ]
    for (const [provider, expected] of cases) {
      const parsed = parseSetupDocument(JSON.stringify({ apiKey: "k", model: "m", ...provider }))
      if (!parsed.ok)
        throw new Error(parsed.error)
      expect(describeSetupDocument(DEFAULT_CONFIG, parsed.document, { kind: "add" }).thinkingOff, JSON.stringify(provider)).toBe(expected)
    }
  })

  it("uses the base URL host for custom endpoints and reports a missing key", () => {
    const parsed = parseSetupDocument(`{"type":"openai-compatible","model":"qwen3:8b","baseURL":"http://localhost:11434/v1"}`)
    if (!parsed.ok)
      throw new Error(parsed.error)

    const preview = describeSetupDocument(DEFAULT_CONFIG, parsed.document, { kind: "add" })
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
    const exported = exportSetupDocument(configWithOpenAIKey("sk-abcdefghijkl"), "openai-default")
    if (!exported)
      throw new Error("export failed")

    const reparsed = parseSetupDocument(stringifySetupDocument(exported))
    expect(reparsed.ok).toBe(true)
    // The default name is left out, so the document holds only what the reader or agent chose.
    expect(exported).toEqual({ type: "openai", apiKey: "sk-…ijkl", model: "gpt-6-luna" })
  })
})

describe("user manages independent service configurations", () => {
  it("user adds a service: Given the same endpoint, When a second model is saved, Then both entries remain and selection stays unchanged", () => {
    const stored = configWithOpenAIKey("first-key")
    const result = applySetupDocument(stored, { type: "openai", apiKey: "second-key", model: "second-model" }, { kind: "add" })
    expect(result.config.providersConfig).toHaveLength(2)
    expect(result.config.providersConfig[0]).toEqual(stored.providersConfig[0])
    expect(result.config.translate).toEqual(stored.translate)
  })

  it("user edits an inactive service: Given duplicate endpoints, When its masked document is saved, Then only its own key is reused", () => {
    const stored = configWithOpenAIKey("first-key")
    stored.providersConfig.push({ ...stored.providersConfig[0], id: "second", name: "Second", apiKey: "second-key" })
    const document = exportSetupDocument(stored, "second")!
    expect(document.apiKey).toBe("…-key")
    const result = applySetupDocument(stored, { ...document, model: "second-model" }, { kind: "edit", providerId: "second" })
    expect(result.config.providersConfig[0]).toEqual(stored.providersConfig[0])
    expect(result.config.providersConfig[1]).toMatchObject({ id: "second", apiKey: "second-key", model: "second-model" })
    expect(result.config.translate).toEqual(stored.translate)
  })

  it("user protects a stored key: Given a masked key, When adding or changing destination, Then the key is not reused", () => {
    const stored = configWithOpenAIKey("first-key")
    const document = { type: "openai" as const, apiKey: "…-key", model: "model" }
    expect(() => applySetupDocument(stored, document, { kind: "add" })).toThrow(SetupDocumentError)
    expect(() => applySetupDocument(stored, { ...document, baseURL: "https://other.example/v1" }, { kind: "edit", providerId: "openai-default" })).toThrow(SetupDocumentError)
    expect(() => applySetupDocument(stored, document, { kind: "edit", providerId: "deleted" })).toThrow(SetupDocumentError)
  })
})
