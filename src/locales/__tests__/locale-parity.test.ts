import type { ParsedMessage } from "@wxt-dev/i18n/build"
import { parseMessagesText } from "@wxt-dev/i18n/build"
import { describe, expect, it } from "vitest"

const LOCALE_TEXTS = import.meta.glob<string>("../*.yml", { query: "?raw", import: "default", eager: true })

// Each case is [file name, file text], for example ["ja.yml", "name: 素読\n…"].
// en.yml is the reference, so it is not a case.
const LOCALE_CASES: [string, string][] = Object.entries(LOCALE_TEXTS)
  .map(([path, text]): [string, string] => [path.replace("../", ""), text])
  .filter(([file]) => file !== "en.yml")
  .sort(([a], [b]) => a.localeCompare(b))

// Chrome substitutions ($1), named placeholders ($name$) and {{...}} tokens.
const TOKEN_PATTERN = /\$\d+|\$\w+\$|\{\{[^}]*\}\}/g

// The build parses the locale files with this parser, so the test sees the same keys.
function parseMessages(text: string): Map<string, string[]> {
  return new Map(parseMessagesText(text, "YAML").map(message => [message.key.join("."), messageTexts(message)]))
}

function messageTexts(message: ParsedMessage): string[] {
  return message.type === "plural" ? Object.values(message.plurals) : [message.message]
}

function tokensOf(texts: string[]): string[] {
  return texts.flatMap(text => text.match(TOKEN_PATTERN) ?? []).sort()
}

const EN_TEXT = LOCALE_TEXTS["../en.yml"]
const EN_MESSAGES = parseMessages(EN_TEXT)

describe("locale files", () => {
  it("user finds a locale file for each supported language: Given src/locales, When the test lists it, Then en.yml and the other locales are there", () => {
    expect(EN_TEXT).toBeTypeOf("string")
    expect(LOCALE_CASES.length).toBeGreaterThan(0)
  })

  it.each(LOCALE_CASES)("user sees every setting in their language: Given %s, When compared with en.yml, Then it has exactly the keys of en.yml", (file, text) => {
    const locale = parseMessages(text)

    const missing = [...EN_MESSAGES.keys()].filter(key => !locale.has(key))
    const extra = [...locale.keys()].filter(key => !EN_MESSAGES.has(key))

    // On failure, the diff lists each key to add to or remove from this file.
    expect({ file, missing, extra }).toEqual({ file, missing: [], extra: [] })
  })

  it.each(LOCALE_CASES)("user sees complete messages: Given %s, When each value is compared with en.yml, Then it is a non-empty string with the same interpolation tokens", (file, text) => {
    const locale = parseMessages(text)

    const problems: string[] = []
    for (const [key, texts] of locale) {
      const enTexts = EN_MESSAGES.get(key)
      if (enTexts === undefined)
        continue
      if (texts.some(value => value.trim() === ""))
        problems.push(`${key}: empty value`)
      const expected = tokensOf(enTexts)
      const actual = tokensOf(texts)
      if (expected.join(" ") !== actual.join(" "))
        problems.push(`${key}: tokens [${actual.join(", ")}], en has [${expected.join(", ")}]`)
    }

    expect({ file, problems }).toEqual({ file, problems: [] })
  })
})
