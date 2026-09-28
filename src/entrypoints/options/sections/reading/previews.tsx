import type { RefObject } from "react"
import { useAtomValue } from "jotai"
import { useEffect, useRef } from "react"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { BLOCK_CONTENT_CLASS, CONTENT_WRAPPER_CLASS } from "@/utils/constants/dom-labels"
import { decorateTranslationNode } from "@/utils/host/translate/ui/decorate-translation"
import { startWordPrefixEmphasis } from "@/utils/host/word-prefix-emphasis"
import { cn } from "@/utils/styles/utils"
import { SettingsPreview } from "../../components/settings-section"

const SOURCE = "Reading and experience train your model of the world."
const TRANSLATION = "阅读和经历训练的是你对世界的模型。"
const ENGLISH = "Reading and experience train your model of the world. Even if you forget what you read, its effect persists."

/** Emphasizes the word prefixes under ref while enabled, the same way the content script does on a page. */
function useWordPrefixEmphasis(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const root = ref.current
    if (!enabled || !root)
      return
    return startWordPrefixEmphasis(root)
  }, [ref, enabled])
}

/** A translated paragraph in the chosen display mode and translation style, with the English emphasis when it is on. */
export function TranslationPreview() {
  const { mode, translationNodeStyle } = useAtomValue(configFieldsAtomMap.translate)
  const { wordPrefixEmphasis } = useAtomValue(configFieldsAtomMap.reading)
  const previewRef = useRef<HTMLDivElement>(null)
  const translationRef = useRef<HTMLSpanElement>(null)
  useWordPrefixEmphasis(previewRef, wordPrefixEmphasis)

  useEffect(() => {
    if (translationRef.current)
      void decorateTranslationNode(translationRef.current, translationNodeStyle)
  }, [mode, translationNodeStyle])

  return (
    <SettingsPreview ref={previewRef}>
      {mode === "bilingual"
        ? (
            <>
              <p className="m-0 font-serif">{SOURCE}</p>
              <span className={CONTENT_WRAPPER_CLASS} lang="zh" dir="ltr">
                <span ref={translationRef} className={cn("text-[13px]", BLOCK_CONTENT_CLASS)}>{TRANSLATION}</span>
              </span>
            </>
          )
        // Translation only puts the translation in place of the original, without a translation style.
        : <p className="m-0" lang="zh">{TRANSLATION}</p>}
    </SettingsPreview>
  )
}

/** An English paragraph as every page shows it, with the emphasis when it is on. */
export function EnglishPreview() {
  const { wordPrefixEmphasis } = useAtomValue(configFieldsAtomMap.reading)
  const previewRef = useRef<HTMLDivElement>(null)
  useWordPrefixEmphasis(previewRef, wordPrefixEmphasis)

  return (
    <SettingsPreview ref={previewRef}>
      <p className="m-0 font-serif" lang="en">{ENGLISH}</p>
    </SettingsPreview>
  )
}
