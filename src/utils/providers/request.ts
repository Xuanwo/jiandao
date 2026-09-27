import type { ProviderConfig, RequestApi } from "@/types/config/provider"
import { DEFAULT_BASE_URLS, DEFAULT_REQUEST_API } from "@/types/config/provider"
import { describeErrorBody } from "@/utils/error/extract-message"
import { attachRequestErrorMeta } from "@/utils/request/retry-policy"

/**
 * One text request to a translation service, sent as the service's own API
 * expects it. There is no SDK in between: the body Plainly sends is the body
 * the agent verified with curl, plus whatever `provider.body` adds.
 */

export interface TextRequest {
  system?: string
  prompt: string
  temperature?: number
}

export interface PreparedRequest {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

export const ANTHROPIC_VERSION = "2023-06-01"
/** Anthropic requires `max_tokens`; a page batch fits comfortably. `provider.body` can raise it. */
export const ANTHROPIC_DEFAULT_MAX_TOKENS = 8192

export class ProviderRequestError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly statusCode?: number,
    public readonly responseHeaders?: Record<string, string>,
    public readonly responseBody?: string,
  ) {
    super(message)
    this.name = "ProviderRequestError"
  }
}

export function resolveRequestApi(provider: Pick<ProviderConfig, "provider" | "api">): RequestApi {
  return provider.api ?? DEFAULT_REQUEST_API[provider.provider]
}

/** The base URL without trailing slashes, or undefined when the config has none and the type has no official endpoint. */
export function resolveBaseURL(provider: Pick<ProviderConfig, "provider" | "baseURL">): string | undefined {
  const configured = provider.baseURL?.trim().replace(/\/+$/, "")
  if (configured)
    return configured
  return provider.provider === "openai-compatible" ? undefined : DEFAULT_BASE_URLS[provider.provider]
}

/** Host that page text is sent to, for display. */
export function getRequestHost(provider: Pick<ProviderConfig, "provider" | "baseURL">): string {
  const baseURL = resolveBaseURL(provider)
  if (!baseURL)
    return ""
  try {
    return new URL(baseURL).host
  }
  catch {
    return baseURL
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Objects merge key by key; anything else in `overrides` replaces the base value, including `null`. */
export function mergeBody(base: Record<string, unknown>, overrides: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!overrides)
    return base
  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(overrides)) {
    const current = merged[key]
    merged[key] = isPlainObject(current) && isPlainObject(value) ? mergeBody(current, value) : value
  }
  return merged
}

function buildBody(api: RequestApi, provider: ProviderConfig, request: TextRequest): Record<string, unknown> {
  const temperature = request.temperature !== undefined ? { temperature: request.temperature } : {}
  switch (api) {
    case "openai-chat":
      return {
        model: provider.model,
        messages: [
          ...(request.system ? [{ role: "system", content: request.system }] : []),
          { role: "user", content: request.prompt },
        ],
        ...temperature,
      }
    case "openai-responses":
      return {
        model: provider.model,
        ...(request.system && { instructions: request.system }),
        input: request.prompt,
        ...temperature,
      }
    case "anthropic":
      return {
        model: provider.model,
        max_tokens: ANTHROPIC_DEFAULT_MAX_TOKENS,
        ...(request.system && { system: request.system }),
        messages: [{ role: "user", content: request.prompt }],
        ...temperature,
      }
    case "gemini":
      return {
        ...(request.system && { systemInstruction: { parts: [{ text: request.system }] } }),
        contents: [{ role: "user", parts: [{ text: request.prompt }] }],
        ...(request.temperature !== undefined && { generationConfig: { temperature: request.temperature } }),
      }
  }
}

function buildHeaders(api: RequestApi, provider: ProviderConfig): Record<string, string> {
  const headers = new Headers({ "Content-Type": "application/json" })
  if (provider.apiKey) {
    switch (api) {
      case "anthropic":
        headers.set("x-api-key", provider.apiKey)
        break
      case "gemini":
        headers.set("x-goog-api-key", provider.apiKey)
        break
      default:
        headers.set("Authorization", `Bearer ${provider.apiKey}`)
    }
  }
  if (api === "anthropic")
    headers.set("anthropic-version", ANTHROPIC_VERSION)
  for (const [key, value] of Object.entries(provider.headers ?? {})) {
    if (value !== "")
      headers.set(key, value)
  }
  return Object.fromEntries(headers.entries())
}

function buildURL(api: RequestApi, baseURL: string, provider: ProviderConfig): string {
  switch (api) {
    case "openai-chat":
      return `${baseURL}/chat/completions`
    case "openai-responses":
      return `${baseURL}/responses`
    case "anthropic":
      return `${baseURL}/messages`
    case "gemini":
      return `${baseURL}/models/${encodeURIComponent(provider.model)}:generateContent`
  }
}

/** Everything about the request except sending it, so tests can check the exact wire shape. */
export function prepareRequest(provider: ProviderConfig, request: TextRequest): PreparedRequest {
  if (!provider.model.trim())
    throw new Error(`Service "${provider.name}" has no model`)
  const baseURL = resolveBaseURL(provider)
  if (!baseURL)
    throw new Error(`Service "${provider.name}" has no base URL`)
  const api = resolveRequestApi(provider)
  return {
    url: buildURL(api, baseURL, provider),
    headers: buildHeaders(api, provider),
    body: mergeBody(buildBody(api, provider, request), provider.body),
  }
}

function collectText(parts: unknown, pick: (part: Record<string, unknown>) => unknown): string {
  if (!Array.isArray(parts))
    return ""
  return parts
    .map(part => isPlainObject(part) ? pick(part) : undefined)
    .filter((text): text is string => typeof text === "string")
    .join("")
}

/** The model's text out of a successful response, or undefined when the response has none. */
export function extractResponseText(api: RequestApi, json: unknown): string | undefined {
  if (!isPlainObject(json))
    return undefined
  let text: string | undefined
  switch (api) {
    case "openai-chat": {
      const choices = json.choices
      const message = Array.isArray(choices) && isPlainObject(choices[0]) && isPlainObject(choices[0].message) ? choices[0].message : undefined
      const content = message?.content
      text = typeof content === "string" ? content : collectText(content, part => part.text)
      break
    }
    case "openai-responses": {
      if (typeof json.output_text === "string" && json.output_text) {
        text = json.output_text
        break
      }
      text = collectText(json.output, item => item.type === "message" ? collectText(item.content, part => part.type === "output_text" ? part.text : undefined) : undefined)
      break
    }
    case "anthropic":
      text = collectText(json.content, block => block.type === "text" ? block.text : undefined)
      break
    case "gemini": {
      const candidates = json.candidates
      const content = Array.isArray(candidates) && isPlainObject(candidates[0]) && isPlainObject(candidates[0].content) ? candidates[0].content : undefined
      text = collectText(content?.parts, part => part.thought === true ? undefined : part.text)
      break
    }
  }
  return text || undefined
}

/**
 * Sends one request and returns the model's text. A non-2xx answer becomes a
 * ProviderRequestError carrying the status, headers and body, which the
 * request queue reads to decide on retries and the reader sees verbatim.
 */
export async function requestText(provider: ProviderConfig, request: TextRequest, init?: { signal?: AbortSignal }): Promise<string> {
  const api = resolveRequestApi(provider)
  const { url, headers, body } = prepareRequest(provider, request)

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: init?.signal,
  })

  const responseText = await response.text()
  if (!response.ok) {
    const responseHeaders = Object.fromEntries(response.headers.entries())
    const message = describeErrorBody(responseText, `${response.status} ${response.statusText}`.trim())
    throw attachRequestErrorMeta(
      new ProviderRequestError(message, url, response.status, responseHeaders, responseText),
      { statusCode: response.status, responseHeaders },
    )
  }

  let json: unknown
  try {
    json = JSON.parse(responseText)
  }
  catch {
    throw new ProviderRequestError(`Response is not JSON: ${responseText.slice(0, 100)}`, url, response.status, undefined, responseText)
  }

  const text = extractResponseText(api, json)
  if (text === undefined) {
    throw new ProviderRequestError(`Response has no text: ${responseText.slice(0, 200)}`, url, response.status, undefined, responseText)
  }
  return text
}
