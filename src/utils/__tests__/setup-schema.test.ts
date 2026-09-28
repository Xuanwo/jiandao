import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import process from "node:process"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import { setupDocumentSchema } from "../setup-document"

const SCHEMA_PATH = resolve(__dirname, "../../../schema/jiandao-setup.schema.json")

/** The JSON Schema agents read. `pnpm schema:setup` rewrites the committed file from the zod schema. */
export function buildSetupJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(setupDocumentSchema, { target: "draft-7" }) as Record<string, unknown>
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "https://github.com/Xuanwo/jiandao/blob/main/schema/jiandao-setup.schema.json",
    title: "Jiandao setup document",
    description: "Configuration for Jiandao's translation service. Written by an agent, pasted into Jiandao by the reader. See docs/agent-setup.md.",
    ...schema,
  }
}

describe("setup document JSON Schema", () => {
  it("the committed schema matches the zod schema the extension validates with", () => {
    const generated = `${JSON.stringify(buildSetupJsonSchema(), null, 2)}\n`
    if (process.env.UPDATE_SETUP_SCHEMA) {
      writeFileSync(SCHEMA_PATH, generated)
    }
    const committed = readFileSync(SCHEMA_PATH, "utf8")
    // Regenerate with: pnpm schema:setup
    expect(committed).toBe(generated)
  })

  it("keeps the fields agents rely on and rejects unknown ones", () => {
    const schema = buildSetupJsonSchema()
    const properties = schema.properties as Record<string, unknown>
    expect(Object.keys(properties)).toEqual(["jiandao", "provider", "prompt", "targetLanguage", "sourceLanguage", "mode"])
    expect(schema.additionalProperties).toBe(false)
    const provider = properties.provider as { properties: Record<string, unknown>, additionalProperties: boolean }
    expect(Object.keys(provider.properties)).toEqual(["type", "api", "name", "apiKey", "model", "baseURL", "headers", "body", "temperature"])
    expect(provider.additionalProperties).toBe(false)
  })
})
