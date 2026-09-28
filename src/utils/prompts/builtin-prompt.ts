import { LANG_CODE_TO_EN_NAME } from "@/definitions"
import { BATCH_SEPARATOR } from "@/utils/constants/prompt"

/** The language of the built-in prompts. */
type PromptLanguage = "en" | "zh"

/** The Chinese target languages: their English names, which the prompt resolver gets, and their names in a Chinese prompt. */
const CHINESE_TARGET_NAMES = new Map<string, string>([
  [LANG_CODE_TO_EN_NAME.cmn, "简体中文"],
  [LANG_CODE_TO_EN_NAME["cmn-Hant"], "繁体中文"],
  [LANG_CODE_TO_EN_NAME.yue, "粤语"],
])

/**
 * The language of the built-in prompts and the target language name in that
 * language. The prompts are in Chinese when the target is a Chinese language,
 * and in English for all other targets.
 */
function resolvePromptLanguage(targetLang: string): { promptLanguage: PromptLanguage, targetLanguage: string } {
  const chineseName = CHINESE_TARGET_NAMES.get(targetLang)
  if (chineseName) {
    return { promptLanguage: "zh", targetLanguage: chineseName }
  }
  return { promptLanguage: "en", targetLanguage: targetLang }
}

interface BuiltinPromptText {
  backgroundLabel: string
  titleLabel: string
  summaryLabel: string
  sourceLabel: string
  /** The task sentence of the Hy-MT2 "Default" template. */
  translate: (targetLanguage: string) => string
  /** The task sentence of the Hy-MT2 "Background" template. */
  translateWithBackground: (targetLanguage: string) => string
  /** Tells the model to output only the translation. The end mark follows it. */
  translationOnly: string
  /** The end mark of the "Default" template, before the text. */
  colon: string
  /** The end mark of all other instructions. */
  period: string
  /** The Hy-MT2 "Delimiters" rule, with the delimiter that the batch request uses. */
  delimiterRule: string
}

const BUILTIN_PROMPT_TEXT: Record<PromptLanguage, BuiltinPromptText> = {
  en: {
    backgroundLabel: "[Background Information]",
    titleLabel: "Title",
    summaryLabel: "Summary",
    sourceLabel: "[Source Text]",
    translate: targetLanguage => `Translate the following text into ${targetLanguage}. `,
    translateWithBackground: targetLanguage => `Please translate the following text into ${targetLanguage}, taking the provided background information into consideration. `,
    translationOnly: "Note that you should only output the translated result without any additional explanation",
    colon: ":",
    period: ".",
    delimiterRule: `You must retain the exact same number of delimiters (standalone ${BATCH_SEPARATOR} lines) in the translation. Strictly do not omit, escape, or translate these symbols, and pay close attention to their placement.`,
  },
  zh: {
    backgroundLabel: "【背景信息】",
    titleLabel: "标题",
    summaryLabel: "摘要",
    sourceLabel: "【待翻译文本】",
    translate: targetLanguage => `将以下文本翻译为${targetLanguage}，`,
    translateWithBackground: targetLanguage => `请结合背景信息将以下文本翻译为${targetLanguage}，`,
    translationOnly: "注意只需要输出翻译后的结果，不要额外解释",
    colon: "：",
    period: "。",
    delimiterRule: `你必须在译文中保留等量的分隔符（单独一行的 ${BATCH_SEPARATOR}），绝对不可遗漏、转义或翻译该符号，并注意分隔符的位置。`,
  },
}

interface BuiltinTranslatePromptInput {
  /** The English name of the target language. */
  targetLang: string
  input: string
  webTitle?: string | null
  webSummary?: string | null
  isBatch?: boolean
}

/**
 * Renders the built-in prompt from the Hy-MT2 translation instruction templates
 * (https://huggingface.co/tencent/Hy-MT2-7B): "Background" when the page has
 * a title or summary, and "Default" otherwise. A batch adds the Hy-MT2
 * "Delimiters" rule. Hy-MT2 has no system prompt, so the user message contains
 * all text.
 *
 * Every instruction asks for the translation only: without it, models copied
 * the background labels into the translation in batch tests.
 */
export function renderBuiltinTranslatePrompt({ targetLang, input, webTitle, webSummary, isBatch }: BuiltinTranslatePromptInput): string {
  const { promptLanguage, targetLanguage } = resolvePromptLanguage(targetLang)
  const text = BUILTIN_PROMPT_TEXT[promptLanguage]
  const title = webTitle?.trim()
  const summary = webSummary?.trim()
  const background = [
    title && `${text.titleLabel}: ${title}`,
    summary && `${text.summaryLabel}: ${summary}`,
  ].filter(Boolean).join("\n")
  // The official "Default" template ends with a colon before the text.
  const end = !background && !isBatch ? text.colon : text.period
  const translate = background ? text.translateWithBackground : text.translate
  const instruction = `${translate(targetLanguage)}${text.translationOnly}${end}`

  return [
    background && `${text.backgroundLabel}\n${background}`,
    isBatch ? `${instruction}\n${text.delimiterRule}` : instruction,
    background ? `${text.sourceLabel}\n${input}` : input,
  ].filter(Boolean).join("\n\n")
}
