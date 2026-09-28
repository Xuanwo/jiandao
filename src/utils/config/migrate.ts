import { DEFAULT_REQUEST_API, isProviderType } from "@/types/config/provider"

/**
 * Jiandao 1.0 stored the model as `{ model, isCustomModel, customModel }` and
 * request options in the AI SDK's own vocabulary (`providerOptions`). Both
 * became plain values: `model` is the ID the service expects, `body` is JSON
 * merged into the request. This runs on every stored config before schema
 * validation and leaves configs that are already in the new shape untouched.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function legacyModelId(model: unknown): string | undefined {
  if (typeof model === "string")
    return undefined
  if (!isRecord(model))
    return ""
  const selected = model.isCustomModel ? model.customModel : model.model
  return typeof selected === "string" ? selected.trim() : ""
}

/** SDK option names → the fields the wire format actually uses. Unknown keys pass through as they are. */
function legacyOptionsToBody(options: Record<string, unknown>, api: string): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(options)) {
    if (api === "openai-responses" && key === "reasoningEffort")
      body.reasoning = { ...(isRecord(body.reasoning) ? body.reasoning : {}), effort: value }
    else if (api === "openai-responses" && key === "textVerbosity")
      body.text = { ...(isRecord(body.text) ? body.text : {}), verbosity: value }
    else if (api === "openai-chat" && key === "reasoningEffort")
      body.reasoning_effort = value
    else if (api === "openai-chat" && key === "textVerbosity")
      body.verbosity = value
    else
      body[key] = value
  }
  return body
}

function migrateProvider(provider: unknown): unknown {
  if (!isRecord(provider))
    return provider
  const type = provider.provider
  if (!isProviderType(String(type)))
    return provider

  const next: Record<string, unknown> = { ...provider }
  const model = legacyModelId(provider.model)
  if (model !== undefined)
    next.model = model

  if ("providerOptions" in next) {
    const { providerOptions, ...rest } = next
    const api = DEFAULT_REQUEST_API[type as keyof typeof DEFAULT_REQUEST_API]
    const body = isRecord(providerOptions) ? legacyOptionsToBody(providerOptions, api) : {}
    Object.assign(next, rest)
    delete next.providerOptions
    if (Object.keys(body).length > 0)
      next.body = body
  }

  if (isRecord(next.headers)) {
    next.headers = Object.fromEntries(Object.entries(next.headers).filter(([, value]) => typeof value === "string" && value !== ""))
  }

  return next
}

export function migrateStoredConfig(stored: unknown): unknown {
  if (!isRecord(stored) || !Array.isArray(stored.providersConfig))
    return stored
  return { ...stored, providersConfig: stored.providersConfig.map(migrateProvider) }
}
