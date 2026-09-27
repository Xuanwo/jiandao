import type { LangCodeISO6393 } from "@/definitions"
import type { Config } from "@/types/config/config"
import type { APIProviderConfig, APIProviderTypes, LLMProviderConfig, ProviderConfig } from "@/types/config/provider"
import type { TranslationMode } from "@/types/config/translate"
import { z } from "zod"
import { langCodeISO6393Schema } from "@/definitions"
import { configSchema } from "@/types/config/config"
import { API_PROVIDER_TYPES, isAPIProviderConfig, isLLMProviderConfig, LLM_PROVIDER_MODELS } from "@/types/config/provider"
import { translationModeSchema } from "@/types/config/translate"
import { DEFAULT_LLM_PROVIDER_MODELS, PROVIDER_ITEMS } from "@/utils/constants/providers"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { getUniqueName } from "@/utils/name"
import { resolveModelId } from "@/utils/providers/model-id"

/**
 * The setup document is the only way a translation service gets configured.
 * An agent writes it, the reader pastes it, Plainly previews and applies it.
 * It describes intent, not storage: the internal Config may change shape,
 * this document is versioned and stays stable.
 */
export const SETUP_DOCUMENT_VERSION = 1

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
)

export const setupProviderSchema = z.strictObject({
  type: z.enum(API_PROVIDER_TYPES).describe("Which kind of service. \"openai-compatible\" is any endpoint that speaks the OpenAI chat completions API, such as Ollama, LM Studio or a gateway."),
  name: z.string().trim().min(1).optional().describe("Display name. Defaults to the service type's name."),
  apiKey: z.string().trim().min(1).optional().describe("The API key. Required for a new service. Endpoints without authentication still need a non-empty value, e.g. \"local\". When updating an existing service, the masked value from an export (such as \"sk-…a9f2\") keeps the stored key."),
  model: z.string().trim().min(1).optional().describe("Model ID as the service expects it. Required for openai-compatible. Defaults to Plainly's default model for openai and deepseek."),
  baseURL: z.url().optional().describe("Endpoint base URL including the API version path, e.g. \"http://localhost:11434/v1\". Required for openai-compatible. Omit for the official OpenAI or DeepSeek API."),
  headers: z.record(z.string(), z.string()).optional().describe("Extra HTTP headers sent with every request."),
  providerOptions: z.record(z.string(), jsonValueSchema).optional().describe("Provider-specific request options, for example { \"reasoningEffort\": \"none\" } for OpenAI or { \"thinking\": { \"type\": \"disabled\" } } for DeepSeek."),
  temperature: z.number().min(0).optional().describe("Sampling temperature. Omit to use the service default."),
}).superRefine((provider, ctx) => {
  if (provider.type === "openai-compatible") {
    if (!provider.baseURL)
      ctx.addIssue({ code: "custom", path: ["baseURL"], message: "baseURL is required for an openai-compatible service" })
    if (!provider.model)
      ctx.addIssue({ code: "custom", path: ["model"], message: "model is required for an openai-compatible service" })
  }
})

export const setupPromptSchema = z.strictObject({
  name: z.string().trim().min(1).optional().describe("Shown in settings. Defaults to \"Custom\"."),
  systemPrompt: z.string().optional().describe("System message. Omit for none."),
  prompt: z.string().min(1).describe("User message template. Must contain {{input}}; may use {{targetLanguage}}, {{webTitle}}, {{webDescription}}, {{webContent}}, {{webSummary}}."),
}).refine(prompt => prompt.prompt.includes("{{input}}"), { path: ["prompt"], message: "prompt must contain {{input}}" })

export const setupDocumentSchema = z.strictObject({
  plainly: z.literal(SETUP_DOCUMENT_VERSION).describe("Document format version. Always 1."),
  provider: setupProviderSchema,
  prompt: setupPromptSchema.nullable().optional().describe("Translation prompt to use. null restores Plainly's built-in prompt. Omit to leave the current prompt as it is."),
  targetLanguage: langCodeISO6393Schema.optional().describe("ISO 639-3 code of the language to translate into, e.g. \"cmn\" for Simplified Chinese, \"eng\" for English."),
  sourceLanguage: langCodeISO6393Schema.or(z.literal("auto")).optional().describe("ISO 639-3 code of the page language, or \"auto\" to detect it."),
  mode: translationModeSchema.optional().describe("\"bilingual\" shows the translation under each paragraph; \"translationOnly\" replaces the original."),
})

export type SetupDocument = z.infer<typeof setupDocumentSchema>
export type SetupProvider = SetupDocument["provider"]
export type SetupPrompt = z.infer<typeof setupPromptSchema>

const CUSTOM_PROMPT_ID = "agent-prompt"

/** The prompt config a document asks for; undefined leaves the stored prompt alone. */
function buildPromptsConfig(prompt: SetupDocument["prompt"]): Config["translate"]["customPromptsConfig"] | undefined {
  if (prompt === undefined)
    return undefined
  if (prompt === null)
    return { promptId: null, patterns: [] }
  return {
    promptId: CUSTOM_PROMPT_ID,
    patterns: [{ id: CUSTOM_PROMPT_ID, name: prompt.name ?? "Custom", systemPrompt: prompt.systemPrompt ?? "", prompt: prompt.prompt }],
  }
}

export type SetupDocumentParseResult
  = | { ok: true, document: SetupDocument }
    | { ok: false, error: string }

/** Parses pasted text. Errors are one line per problem, with the JSON path, so they can be pasted back to the agent. */
export function parseSetupDocument(text: string): SetupDocumentParseResult {
  let json: unknown
  try {
    json = JSON.parse(text)
  }
  catch (error) {
    return { ok: false, error: `Not valid JSON: ${error instanceof Error ? error.message : String(error)}` }
  }

  const result = setupDocumentSchema.safeParse(json)
  if (!result.success) {
    const lines = result.error.issues.map(issue => `${issue.path.length ? issue.path.join(".") : "(root)"}: ${issue.message}`)
    return { ok: false, error: lines.join("\n") }
  }
  return { ok: true, document: result.data }
}

/* ──────────────────────────────
  API key masking
  ────────────────────────────── */

const MASK_MARK = "…"
const KNOWN_KEY_PREFIX = /^(sk-(?:proj-|ant-)?)/

/** Keeps the well-known prefix and the last four characters: "sk-…a9f2". Exported documents never carry a full key. */
export function maskApiKey(apiKey: string): string {
  const prefix = KNOWN_KEY_PREFIX.exec(apiKey)?.[1] ?? ""
  const tail = apiKey.slice(-4)
  return `${prefix}${MASK_MARK}${tail}`
}

/** A masked key from an export, pasted back unchanged, means "keep the stored key". */
export function isMaskedApiKey(apiKey: string): boolean {
  return apiKey.includes(MASK_MARK) || apiKey.includes("...")
}

/* ──────────────────────────────
  Matching a document to stored providers
  ────────────────────────────── */

export const DEFAULT_PROVIDER_HOSTS: Record<APIProviderTypes, string> = {
  "openai": "api.openai.com",
  "deepseek": "api.deepseek.com",
  "openai-compatible": "",
}

function normalizeBaseURL(baseURL: string | undefined): string {
  return (baseURL ?? "").trim().replace(/\/+$/, "")
}

/**
 * The provider a document replaces: same type and same endpoint. Two OpenAI
 * entries with different relay URLs are different services.
 */
export function findMatchingProvider(providersConfig: ProviderConfig[], provider: SetupProvider): APIProviderConfig | undefined {
  const wanted = normalizeBaseURL(provider.baseURL)
  return providersConfig.find((candidate): candidate is APIProviderConfig =>
    isAPIProviderConfig(candidate)
    && candidate.provider === provider.type
    && normalizeBaseURL(candidate.baseURL) === wanted,
  )
}

/** Host that page text will be sent to, shown prominently before applying. */
export function getRequestHost(provider: Pick<SetupProvider, "type" | "baseURL">): string {
  if (provider.baseURL) {
    try {
      return new URL(provider.baseURL).host
    }
    catch {
      return provider.baseURL
    }
  }
  return DEFAULT_PROVIDER_HOSTS[provider.type]
}

/** True when the options turn thinking off for this provider type; null when the document sets no options. */
export function describesThinkingOff(providerOptions: SetupProvider["providerOptions"]): boolean | null {
  if (!providerOptions)
    return null
  const effort = providerOptions.reasoningEffort ?? providerOptions.reasoning_effort
  if (effort === "none" || effort === "minimal")
    return true
  const thinking = providerOptions.thinking
  if (typeof thinking === "object" && thinking !== null && (thinking as { type?: unknown }).type === "disabled")
    return true
  return false
}

/* ──────────────────────────────
  Applying
  ────────────────────────────── */

export class SetupDocumentError extends Error {
  constructor(public readonly code: "MISSING_API_KEY" | "INVALID_RESULT", message: string) {
    super(message)
    this.name = "SetupDocumentError"
  }
}

function buildModel(type: APIProviderTypes, model: string | undefined): LLMProviderConfig["model"] {
  if (type === "openai-compatible") {
    return { model: "use-custom-model", isCustomModel: true, customModel: model ?? null }
  }
  // The catalog in the config schema only lists known IDs; anything else is stored as a custom model.
  const defaults = DEFAULT_LLM_PROVIDER_MODELS[type] as LLMProviderConfig["model"]
  if (!model)
    return defaults
  const catalog: readonly string[] = LLM_PROVIDER_MODELS[type]
  if (catalog.includes(model))
    return { model, isCustomModel: false, customModel: null } as LLMProviderConfig["model"]
  return { model: defaults.model, isCustomModel: true, customModel: model } as LLMProviderConfig["model"]
}

export interface ApplySetupDocumentResult {
  config: Config
  providerId: string
  /** Whether the document replaced a stored service or added a new one. */
  replaced: boolean
  /** Whether the stored key was kept because the document carried a masked key or none. */
  keyReused: boolean
}

/**
 * Returns the config with the document applied: the matching service is
 * replaced (or a new one appended), it becomes the translation service, and
 * the language and display settings change only where the document sets them.
 * Every other service and setting stays as it is. The result is validated
 * against the config schema before it is returned.
 */
export function applySetupDocument(config: Config, document: SetupDocument): ApplySetupDocumentResult {
  const { provider } = document
  const existing = findMatchingProvider(config.providersConfig, provider)

  const documentKey = provider.apiKey && !isMaskedApiKey(provider.apiKey) ? provider.apiKey : undefined
  const apiKey = documentKey ?? existing?.apiKey
  if (!apiKey) {
    throw new SetupDocumentError("MISSING_API_KEY", "The document has no API key and no stored service matches it. Endpoints without authentication still need a non-empty value such as \"local\".")
  }

  const otherNames = new Set(config.providersConfig.filter(p => p.id !== existing?.id).map(p => p.name))
  const name = provider.name ?? existing?.name ?? getUniqueName(PROVIDER_ITEMS[provider.type].name, otherNames)

  const next: APIProviderConfig = {
    id: existing?.id ?? getRandomUUID(),
    name: otherNames.has(name) ? getUniqueName(name, otherNames) : name,
    enabled: true,
    provider: provider.type,
    apiKey,
    model: buildModel(provider.type, provider.model),
    ...(provider.baseURL && { baseURL: normalizeBaseURL(provider.baseURL) }),
    ...(provider.headers && { headers: provider.headers }),
    ...(provider.providerOptions && { providerOptions: provider.providerOptions as Record<string, any> }),
    ...(provider.temperature !== undefined && { temperature: provider.temperature }),
  } as APIProviderConfig

  const providersConfig = existing
    ? config.providersConfig.map(p => p.id === existing.id ? next : p)
    : [...config.providersConfig, next]

  const promptsConfig = buildPromptsConfig(document.prompt)
  const candidate: Config = {
    ...config,
    providersConfig,
    language: {
      ...config.language,
      ...(document.targetLanguage && { targetCode: document.targetLanguage }),
      ...(document.sourceLanguage && { sourceCode: document.sourceLanguage }),
    },
    translate: {
      ...config.translate,
      providerId: next.id,
      ...(document.mode && { mode: document.mode }),
      ...(promptsConfig && { customPromptsConfig: promptsConfig }),
    },
  }

  const parsed = configSchema.safeParse(candidate)
  if (!parsed.success) {
    throw new SetupDocumentError("INVALID_RESULT", parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).join("\n"))
  }

  return { config: parsed.data, providerId: next.id, replaced: !!existing, keyReused: !documentKey }
}

/* ──────────────────────────────
  Preview and export
  ────────────────────────────── */

export interface SetupPreview {
  type: APIProviderTypes
  providerName: string
  modelId: string
  host: string
  keyStatus: "new" | "reused" | "missing"
  thinkingOff: boolean | null
  targetLanguage?: LangCodeISO6393
  sourceLanguage?: LangCodeISO6393 | "auto"
  mode?: TranslationMode
  /** Name of the prompt the document sets; undefined when it leaves the prompt alone or restores the default. */
  promptName?: string
  replaces: boolean
}

/** What applying the document would change, for the reader to check before confirming. */
export function describeSetupDocument(config: Config, document: SetupDocument): SetupPreview {
  const { provider } = document
  const existing = findMatchingProvider(config.providersConfig, provider)
  const hasDocumentKey = !!provider.apiKey && !isMaskedApiKey(provider.apiKey)

  return {
    type: provider.type,
    providerName: provider.name ?? existing?.name ?? PROVIDER_ITEMS[provider.type].name,
    modelId: resolveModelId(buildModel(provider.type, provider.model)) ?? "",
    host: getRequestHost(provider),
    keyStatus: hasDocumentKey ? "new" : existing?.apiKey ? "reused" : "missing",
    thinkingOff: describesThinkingOff(provider.providerOptions),
    targetLanguage: document.targetLanguage,
    sourceLanguage: document.sourceLanguage,
    mode: document.mode,
    promptName: document.prompt ? document.prompt.name ?? "Custom" : undefined,
    replaces: !!existing,
  }
}

/**
 * The current translation service as a setup document, with the key masked.
 * An agent edits this and hands it back; applying it keeps the stored key.
 */
export function exportSetupDocument(config: Config): SetupDocument | null {
  const provider = config.providersConfig.find(p => p.id === config.translate.providerId)
  if (!provider || !isAPIProviderConfig(provider))
    return null

  const modelId = isLLMProviderConfig(provider) ? resolveModelId(provider.model) : undefined
  const { promptId, patterns } = config.translate.customPromptsConfig
  const prompt = promptId ? patterns.find(pattern => pattern.id === promptId) : undefined

  return {
    plainly: SETUP_DOCUMENT_VERSION,
    provider: {
      type: provider.provider,
      name: provider.name,
      ...(provider.apiKey && { apiKey: maskApiKey(provider.apiKey) }),
      ...(modelId && { model: modelId }),
      ...(provider.baseURL && { baseURL: provider.baseURL }),
      ...(provider.headers && { headers: provider.headers as Record<string, string> }),
      ...(provider.providerOptions && { providerOptions: provider.providerOptions }),
      ...(provider.temperature !== undefined && { temperature: provider.temperature }),
    },
    ...(prompt && { prompt: { name: prompt.name, ...(prompt.systemPrompt && { systemPrompt: prompt.systemPrompt }), prompt: prompt.prompt } }),
    targetLanguage: config.language.targetCode,
    sourceLanguage: config.language.sourceCode,
    mode: config.translate.mode,
  }
}

export function stringifySetupDocument(document: SetupDocument): string {
  return JSON.stringify(document, null, 2)
}
