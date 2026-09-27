import type { ProviderConfig } from "@/types/config/provider"
import type { DeepPartial } from "@/utils/object"
import { describe, expect, it } from "vitest"
import { DEFAULT_PROVIDER_CONFIG } from "@/utils/constants/providers"
import { updateProviderConfig } from "../provider"

describe("provider config updates", () => {
  it("merges request body objects and preserves the rest of the config", () => {
    const result = updateProviderConfig({ ...DEFAULT_PROVIDER_CONFIG, body: { reasoning: { effort: "low" }, seed: 1 } }, {
      body: { reasoning: { effort: "none" } },
    })

    expect(result.body).toEqual({ reasoning: { effort: "none" }, seed: 1 })
    expect(result.model).toBe(DEFAULT_PROVIDER_CONFIG.model)
    expect(result.provider).toBe("openai")
  })

  it("merges provider headers and preserves the rest of the config", () => {
    const result = updateProviderConfig(DEFAULT_PROVIDER_CONFIG, {
      headers: {
        "X-Test": "1",
      },
    })

    expect(result.headers).toEqual({ "X-Test": "1" })
    expect(result.model).toBe(DEFAULT_PROVIDER_CONFIG.model)
  })

  it("rejects merged configs that no longer match the provider schema", () => {
    const invalidUpdates = {
      provider: "openai-compatible",
    } as DeepPartial<ProviderConfig>

    // An openai-compatible service needs a base URL.
    expect(() => updateProviderConfig(DEFAULT_PROVIDER_CONFIG, invalidUpdates)).toThrow()
  })
})
