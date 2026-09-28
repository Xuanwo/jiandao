import { z } from "zod"
import { PROVIDER_TYPES, REQUEST_APIS } from "./constants"

/* ──────────────────────────────
  Providers config schema
  ────────────────────────────── */

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema)]),
)

export const connectionCheckSchema = z.strictObject({
  ok: z.boolean(),
  /** Milliseconds since the epoch. */
  checkedAt: z.number(),
  /** The service's error text, verbatim, when the check failed. */
  error: z.string().optional(),
})
export type ConnectionCheck = z.infer<typeof connectionCheckSchema>

/**
 * One translation service. The stored shape mirrors the setup document an
 * agent writes: what the agent verified with curl is what Jiandao sends.
 */
export const providerConfigItemSchema = z.strictObject({
  id: z.string().nonempty(),
  name: z.string().nonempty(),
  description: z.string().optional(),
  enabled: z.boolean(),
  provider: z.enum(PROVIDER_TYPES),
  /** Wire format; defaults per provider type (see DEFAULT_REQUEST_API). */
  api: z.enum(REQUEST_APIS).optional(),
  apiKey: z.string().optional(),
  /** Endpoint base URL up to and including the version path. Required for "openai-compatible". */
  baseURL: z.string().optional(),
  /** Model ID exactly as the service expects it. Empty only for a service that has not been set up yet. */
  model: z.string(),
  temperature: z.number().min(0).optional(),
  /** Extra HTTP headers, sent as given. */
  headers: z.record(z.string(), z.string()).optional(),
  /** JSON merged into the request body after Jiandao's own fields, so it can add or override any of them. */
  body: z.record(z.string(), jsonValueSchema).optional(),
  /**
   * The last connection check: written when a configuration is applied and
   * whenever the reader tests the connection, so the settings page can show
   * it without sending a request.
   */
  connectionCheck: connectionCheckSchema.optional(),
}).superRefine((provider, ctx) => {
  if (provider.provider === "openai-compatible" && !provider.baseURL) {
    ctx.addIssue({ code: "custom", path: ["baseURL"], message: "baseURL is required for an openai-compatible service" })
  }
})

export const providersConfigSchema = z.array(providerConfigItemSchema).superRefine(
  (providers, ctx) => {
    const idSet = new Set<string>()
    providers.forEach((provider, index) => {
      if (idSet.has(provider.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate provider id "${provider.id}"`,
          path: [index, "id"],
        })
      }
      idSet.add(provider.id)
    })

    const nameSet = new Set<string>()
    providers.forEach((provider, index) => {
      if (nameSet.has(provider.name)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate provider name "${provider.name}"`,
          path: [index, "name"],
        })
      }
      nameSet.add(provider.name)
    })
  },
)
export type ProvidersConfig = z.infer<typeof providersConfigSchema>
export type ProviderConfig = ProvidersConfig[number]
