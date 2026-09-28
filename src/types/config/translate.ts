import { z } from "zod"
import { TRANSLATION_NODE_STYLE } from "@/utils/constants/translation-node-style"
import { isPageTranslationShortcutEmpty, isValidConfiguredPageTranslationShortcut } from "@/utils/page-translation-shortcut"

export const TRANSLATION_MODES = ["bilingual", "translationOnly"] as const
export const translationModeSchema = z.enum(TRANSLATION_MODES)

// Translation node style preset (excluding 'custom' - controlled by isCustom flag)
export const translationNodeStylePresetSchema = z.enum(TRANSLATION_NODE_STYLE)
export type TranslationNodeStylePreset = z.infer<typeof translationNodeStylePresetSchema>

export const MAX_CUSTOM_CSS_LENGTH = 8192

// Translation node style configuration
export const translationNodeStyleConfigSchema = z.object({
  preset: translationNodeStylePresetSchema,
  isCustom: z.boolean(),
  customCSS: z.string()
    .max(MAX_CUSTOM_CSS_LENGTH, "Custom CSS cannot exceed 8KB")
    .nullable(),
})

export type TranslationNodeStyleConfig = z.infer<typeof translationNodeStyleConfigSchema>

export const translatePromptObjSchema = z.object({
  name: z.string(),
  id: z.string(),
  systemPrompt: z.string(),
  prompt: z.string(),
})
export type TranslatePromptObj = z.infer<typeof translatePromptObjSchema>

export const customPromptsConfigSchema = z.object({
  promptId: z.string().nullable(),
  patterns: z.array(
    translatePromptObjSchema,
  ),
}).superRefine((data, ctx) => {
  if (data.promptId !== null) {
    const patternIds = data.patterns.map(p => p.id)
    if (!patternIds.includes(data.promptId)) {
      ctx.addIssue({
        code: "invalid_value",
        values: patternIds,
        message: `promptId "${data.promptId}" must be null or match a pattern id`,
        path: ["promptId"],
      })
    }
  }
})

export const pageTranslationShortcutSchema = z.string().superRefine((shortcut, ctx) => {
  if (isPageTranslationShortcutEmpty(shortcut)) {
    return
  }

  if (!isValidConfiguredPageTranslationShortcut(shortcut)) {
    ctx.addIssue({
      code: "custom",
      message: "Page translation shortcut must include at least one modifier key and one non-modifier key.",
    })
  }
})

export const translateConfigSchema = z.object({
  providerId: z.string().nonempty(),
  mode: translationModeSchema,
  page: z.object({
    shortcut: pageTranslationShortcutSchema,
  }),
  enableAIContentAware: z.boolean(),
  customPromptsConfig: customPromptsConfigSchema,
  translationNodeStyle: translationNodeStyleConfigSchema,
})

export type TranslateConfig = z.infer<typeof translateConfigSchema>
export type TranslationMode = z.infer<typeof translationModeSchema>
