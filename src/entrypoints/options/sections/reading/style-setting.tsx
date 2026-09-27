import type { TranslationNodeStylePreset } from "@/types/config/translate"
import { deepmerge } from "deepmerge-ts"
import { useAtom } from "jotai"
import { useEffect, useRef } from "react"
import { i18n } from "#imports"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { BLOCK_CONTENT_CLASS, CONTENT_WRAPPER_CLASS } from "@/utils/constants/dom-labels"
import { decorateTranslationNode } from "@/utils/host/translate/ui/decorate-translation"
import { cn } from "@/utils/styles/utils"
import { SettingsRow } from "../../components/settings-section"
import { CSSEditor } from "./css-editor"

const PRESET_LABEL_KEY = {
  default: "options.reading.style.presets.default",
  line: "options.reading.style.presets.line",
  weakened: "options.reading.style.presets.weakened",
  textColor: "options.reading.style.presets.textColor",
  dashedLine: "options.reading.style.presets.dashedLine",
  background: "options.reading.style.presets.background",
  blockquote: "options.reading.style.presets.blockquote",
  border: "options.reading.style.presets.border",
  blur: "options.reading.style.presets.blur",
} as const satisfies Record<TranslationNodeStylePreset, string>

/**
 * The presets offered. The others stay valid for configs that already use
 * them and show up as an extra chip while selected.
 */
const OFFERED_PRESETS: readonly TranslationNodeStylePreset[] = ["line", "default", "weakened", "textColor", "background"]

const CUSTOM_CHOICE = "custom"

const PREVIEW_SOURCE = "Reading and experience train your model of the world."
const PREVIEW_TRANSLATION = "阅读和经历训练的是你对世界的模型。"

function Chip({ selected, onClick, children }: { selected: boolean, onClick: () => void, children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "h-7 rounded-full border px-3 text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  )
}

function StylePreview() {
  const [translateConfig] = useAtom(configFieldsAtomMap.translate)
  const { translationNodeStyle } = translateConfig
  const previewRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (previewRef.current)
      void decorateTranslationNode(previewRef.current, translationNodeStyle)
  }, [translationNodeStyle])

  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-muted/50 px-3.5 py-3 text-sm leading-relaxed">
      <p className="m-0 font-serif">{PREVIEW_SOURCE}</p>
      <span className={CONTENT_WRAPPER_CLASS} lang="zh" dir="ltr">
        <span ref={previewRef} className={cn("text-[13px]", BLOCK_CONTENT_CLASS)}>{PREVIEW_TRANSLATION}</span>
      </span>
    </div>
  )
}

export function StyleSetting() {
  const [translateConfig, setTranslateConfig] = useAtom(configFieldsAtomMap.translate)
  const { translationNodeStyle } = translateConfig
  const selected = translationNodeStyle.isCustom ? CUSTOM_CHOICE : translationNodeStyle.preset
  const presets = OFFERED_PRESETS.includes(translationNodeStyle.preset) ? OFFERED_PRESETS : [...OFFERED_PRESETS, translationNodeStyle.preset]

  const choosePreset = (preset: TranslationNodeStylePreset) => {
    void setTranslateConfig(deepmerge(translateConfig, { translationNodeStyle: { preset, isCustom: false } }))
  }

  return (
    <SettingsRow label={i18n.t("options.reading.style.title")}>
      <div role="group" aria-label={i18n.t("options.reading.style.title")} className="flex flex-wrap gap-1.5">
        {presets.map(preset => (
          <Chip key={preset} selected={selected === preset} onClick={() => choosePreset(preset)}>
            {i18n.t(PRESET_LABEL_KEY[preset])}
          </Chip>
        ))}
        <Chip selected={selected === CUSTOM_CHOICE} onClick={() => void setTranslateConfig(deepmerge(translateConfig, { translationNodeStyle: { isCustom: true } }))}>
          {i18n.t("options.reading.style.custom")}
        </Chip>
      </div>
      {translationNodeStyle.isCustom && <CSSEditor />}
      <StylePreview />
    </SettingsRow>
  )
}
