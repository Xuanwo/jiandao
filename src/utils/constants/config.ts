import type { Config } from "@/types/config/config"
import { CONFIG_VERSION } from "@/types/config/config"
import { DEFAULT_TRANSLATE_PROMPTS_CONFIG } from "./prompt"
import { DEFAULT_PROVIDER_CONFIG_LIST } from "./providers"
import { DEFAULT_AUTO_TRANSLATE_SHORTCUT_KEY } from "./translate"
import { TRANSLATION_NODE_STYLE_ON_INSTALLED } from "./translation-node-style"

export const CONFIG_STORAGE_KEY = "config"

export const DEFAULT_DETECTED_CODE = "eng" as const

export const DEFAULT_CONFIG: Config = {
  version: CONFIG_VERSION,
  language: {
    sourceCode: "auto",
    targetCode: "cmn",
    level: "intermediate",
  },
  providersConfig: DEFAULT_PROVIDER_CONFIG_LIST,
  reading: {
    wordPrefixEmphasis: false,
  },
  translate: {
    providerId: "openai-default",
    mode: "bilingual",
    page: {
      shortcut: DEFAULT_AUTO_TRANSLATE_SHORTCUT_KEY,
    },
    enableAIContentAware: false,
    customPromptsConfig: DEFAULT_TRANSLATE_PROMPTS_CONFIG,
    translationNodeStyle: {
      preset: TRANSLATION_NODE_STYLE_ON_INSTALLED,
      isCustom: false,
      customCSS: null,
    },
  },
}
