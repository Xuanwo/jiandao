import { describe, expect, it } from "vitest"
import { configSchema } from "@/types/config/config"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { migrateStoredConfig } from "../migrate"

/** The three services Plainly 1.0 stored on a fresh install, with a key added to one. */
const legacyConfig = {
  ...DEFAULT_CONFIG,
  providersConfig: [
    {
      id: "openai-default",
      name: "OpenAI",
      enabled: true,
      provider: "openai",
      apiKey: "sk-old",
      model: { model: "gpt-5-mini", isCustomModel: false, customModel: null },
      providerOptions: { reasoningEffort: "minimal", textVerbosity: "low" },
      headers: { "X-Test": "1", "X-Empty": "", "X-Number": 1 },
    },
    {
      id: "deepseek-default",
      name: "DeepSeek",
      enabled: true,
      provider: "deepseek",
      model: { model: "deepseek-v4-flash", isCustomModel: true, customModel: " deepseek-flash " },
      providerOptions: { thinking: { type: "disabled" } },
    },
    {
      id: "openai-compatible-default",
      name: "Custom Provider",
      enabled: true,
      provider: "openai-compatible",
      baseURL: "https://api.example.com/v1",
      model: { model: "use-custom-model", isCustomModel: true, customModel: null },
      providerOptions: { reasoning_effort: "none", reasoningEffort: "low" },
    },
  ],
}

describe("migrateStoredConfig", () => {
  it("turns the 1.0 model object and SDK options into a model ID and a request body", () => {
    const migrated = migrateStoredConfig(legacyConfig)
    const parsed = configSchema.safeParse(migrated)
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true)
    if (!parsed.success)
      return

    expect(parsed.data.providersConfig).toEqual([
      expect.objectContaining({
        id: "openai-default",
        apiKey: "sk-old",
        model: "gpt-5-mini",
        body: { reasoning: { effort: "minimal" }, text: { verbosity: "low" } },
        headers: { "X-Test": "1" },
      }),
      expect.objectContaining({ id: "deepseek-default", model: "deepseek-flash", body: { thinking: { type: "disabled" } } }),
      expect.objectContaining({ id: "openai-compatible-default", model: "", body: { reasoning_effort: "low" } }),
    ])
    expect(parsed.data.providersConfig[0]).not.toHaveProperty("providerOptions")
  })

  it("rewrites the 1.0 selectors and variables in custom CSS to the renamed ones", () => {
    const customCSS = `[data-plainly-custom-translation-style='custom'] { color: var(--plainly-brand); }\n.plainly-translated-block-content { margin: 0; }`
    const stored = { ...DEFAULT_CONFIG, translate: { ...DEFAULT_CONFIG.translate, translationNodeStyle: { preset: "line", isCustom: true, customCSS } } }
    const migrated = migrateStoredConfig(stored) as typeof DEFAULT_CONFIG

    expect(migrated.translate.translationNodeStyle.customCSS).toBe(
      `[data-jiandao-custom-translation-style='custom'] { color: var(--jiandao-brand); }\n.jiandao-translated-block-content { margin: 0; }`,
    )
    expect(configSchema.safeParse(migrated).success).toBe(true)
  })

  it("leaves a config that is already in the current shape untouched", () => {
    const current = { ...DEFAULT_CONFIG, providersConfig: [{ ...DEFAULT_CONFIG.providersConfig[0], body: { reasoning: { effort: "none" } } }] }
    expect(migrateStoredConfig(current)).toEqual(current)
    expect(migrateStoredConfig(null)).toBeNull()
  })
})
