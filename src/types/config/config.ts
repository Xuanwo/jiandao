import { z } from "zod"

import { langCodeISO6393Schema, langLevel } from "@/definitions"
import { FEATURE_PROVIDER_DEFS } from "@/utils/constants/feature-providers"
import { providersConfigSchema } from "./provider"
import { translateConfigSchema } from "./translate"

// Language schema
const languageSchema = z.object({
  sourceCode: langCodeISO6393Schema.or(z.literal("auto")),
  targetCode: langCodeISO6393Schema,
  level: langLevel,
})

/**
 * Version of the stored config shape. Bump it with every change to the
 * shape and add the step from the previous version to CONFIG_MIGRATIONS
 * (utils/config/migrate.ts); a stored config with no path to this version
 * is cleared.
 */
export const CONFIG_VERSION = 1

// Complete config schema
export const configSchema = z.object({
  version: z.literal(CONFIG_VERSION),
  language: languageSchema,
  providersConfig: providersConfigSchema,
  // A stored config without this section gets the default of each field.
  reading: z.object({
    wordPrefixEmphasis: z.boolean().default(false),
  }).prefault({}),
  translate: translateConfigSchema,
}).superRefine((data, ctx) => {
  const providerIdsSet = new Set(data.providersConfig.map(p => p.id))

  for (const def of Object.values(FEATURE_PROVIDER_DEFS)) {
    const providerId = def.getProviderId(data)

    const validIds = new Set(providerIdsSet)
    if (!validIds.has(providerId)) {
      ctx.addIssue({
        code: "invalid_value",
        values: [...validIds],
        message: `Invalid provider id "${providerId}".`,
        path: [...def.configPath],
      })
      continue
    }

    const provider = data.providersConfig.find(p => p.id === providerId)
    if (provider && !def.isProvider(provider.provider)) {
      ctx.addIssue({
        code: "invalid_value",
        values: [...validIds],
        message: `Provider "${providerId}" is not a valid provider for this feature.`,
        path: [...def.configPath],
      })
    }

    if (provider && !provider.enabled) {
      ctx.addIssue({
        code: "custom",
        message: `Provider "${providerId}" must be enabled for this feature.`,
        path: [...def.configPath],
      })
    }
  }
})

export type Config = z.infer<typeof configSchema>
