import type { LangCodeISO6393 } from "@/definitions"
import type { TranslatePromptObj } from "@/types/config/translate"
import type { WebPagePromptContext } from "@/types/content"
import { describe, expect, it } from "vitest"
import { LANG_CODE_TO_EN_NAME } from "@/definitions"
import { DEFAULT_BATCH_TRANSLATE_PROMPT } from "@/utils/constants/prompt"
import { getTranslatePromptFromConfig } from "../translate"

const CUSTOM_PROMPT: TranslatePromptObj = {
  id: "custom-1",
  name: "Mine",
  systemPrompt: "You translate into {{targetLanguage}}.",
  prompt: "{{input}}",
}

function translatePrompt({
  promptId = null,
  targetCode,
  input = "Hello world",
  isBatch = false,
  context,
}: {
  promptId?: string | null
  targetCode: LangCodeISO6393
  input?: string
  isBatch?: boolean
  context?: WebPagePromptContext
}) {
  const translateConfig = { customPromptsConfig: { promptId, patterns: [CUSTOM_PROMPT] } }
  return getTranslatePromptFromConfig(translateConfig, LANG_CODE_TO_EN_NAME[targetCode], input, { isBatch, context })
}

describe("built-in translation prompt", () => {
  it("user translates into Chinese: Given the default prompt, When the target is Simplified Chinese, Then the model gets the Hy-MT2 Chinese default template and no system prompt", () => {
    const result = translatePrompt({ targetCode: "cmn" })

    expect(result).toStrictEqual({
      prompt: "将以下文本翻译为简体中文，注意只需要输出翻译后的结果，不要额外解释：\n\nHello world",
    })
  })

  it("user translates into a non-Chinese language: Given the default prompt, When the target is Spanish, Then the model gets the Hy-MT2 English default template", () => {
    const result = translatePrompt({ targetCode: "spa", input: "你好" })

    expect(result.prompt).toBe("Translate the following text into Spanish. Note that you should only output the translated result without any additional explanation:\n\n你好")
  })

  it("user translates into Traditional Chinese or Cantonese: Given the default prompt, When the target is one of them, Then the Chinese prompt uses its own Chinese name", () => {
    expect(translatePrompt({ targetCode: "cmn-Hant" }).prompt).toContain("将以下文本翻译为繁体中文，")
    expect(translatePrompt({ targetCode: "yue" }).prompt).toContain("将以下文本翻译为粤语，")
  })

  it("user translates a page with a title and a summary: Given the page context, When the target is Simplified Chinese, Then the model gets the Hy-MT2 background template", () => {
    const result = translatePrompt({
      targetCode: "cmn",
      context: { webTitle: " Release notes ", webSummary: "The release adds a setting.\n", webContent: "Body" },
    })

    expect(result.prompt).toBe("【背景信息】\n标题: Release notes\n摘要: The release adds a setting.\n\n请结合背景信息将以下文本翻译为简体中文，注意只需要输出翻译后的结果，不要额外解释。\n\n【待翻译文本】\nHello world")
  })

  it("user translates a page with only a title: Given no summary, When the target is Spanish, Then the background has only the title line", () => {
    const result = translatePrompt({ targetCode: "spa", context: { webTitle: "Release notes", webSummary: "  " } })

    expect(result.prompt).toBe("[Background Information]\nTitle: Release notes\n\nPlease translate the following text into Spanish, taking the provided background information into consideration. Note that you should only output the translated result without any additional explanation.\n\n[Source Text]\nHello world")
  })

  it("user translates several paragraphs of a page into English: Given a batch request with a title, When the prompt is in English, Then the English delimiter rule names the standalone %% line and comes before the source text", () => {
    const result = translatePrompt({ targetCode: "eng", input: "你好", isBatch: true, context: { webTitle: "发布说明" } })

    expect(result.prompt).toBe("[Background Information]\nTitle: 发布说明\n\nPlease translate the following text into English, taking the provided background information into consideration. Note that you should only output the translated result without any additional explanation.\nYou must retain the exact same number of delimiters (standalone %% lines) in the translation. Strictly do not omit, escape, or translate these symbols, and pay close attention to their placement.\n\n[Source Text]\n你好")
  })

  it("user translates text with placeholders: Given a page title, When the text contains template placeholders, Then the text reaches the model unchanged", () => {
    const input = `Hello {{webTitle}}, you have %s messages and \${count} alerts.`
    const result = translatePrompt({ targetCode: "cmn", input, context: { webTitle: "Inbox" } })

    expect(result.prompt.endsWith(`【待翻译文本】\n${input}`)).toBe(true)
  })
})

describe("custom translation prompt", () => {
  it("user keeps their own prompt for several paragraphs: Given a batch request, When the target is Chinese, Then the English batch rules follow their system prompt", () => {
    const result = translatePrompt({ promptId: CUSTOM_PROMPT.id, targetCode: "cmn", isBatch: true })

    expect(result.systemPrompt).toBe(`You translate into Simplified Mandarin Chinese.\n\n${DEFAULT_BATCH_TRANSLATE_PROMPT}`)
  })

  it("user keeps their own prompt without a system prompt: Given a custom prompt with an empty system prompt, When one paragraph and then several paragraphs are translated, Then one request has no system prompt and the other has only the batch rules", () => {
    const translateConfig = { customPromptsConfig: { promptId: "bare", patterns: [{ ...CUSTOM_PROMPT, id: "bare", systemPrompt: "" }] } }
    const targetLang = LANG_CODE_TO_EN_NAME.cmn

    expect(getTranslatePromptFromConfig(translateConfig, targetLang, "Hello")).toStrictEqual({ prompt: "Hello" })
    expect(getTranslatePromptFromConfig(translateConfig, targetLang, "Hello", { isBatch: true })).toStrictEqual({ systemPrompt: DEFAULT_BATCH_TRANSLATE_PROMPT, prompt: "Hello" })
  })

  it("user deleted the selected prompt: Given the prompt id is not in the list, When they translate, Then the model gets the default prompt", () => {
    const result = translatePrompt({ promptId: "deleted", targetCode: "cmn" })

    expect(result).toStrictEqual({
      prompt: "将以下文本翻译为简体中文，注意只需要输出翻译后的结果，不要额外解释：\n\nHello world",
    })
  })
})
