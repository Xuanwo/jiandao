import type { PickerItem } from "@/components/language-picker"
import type { LangCodeISO6393 } from "@/definitions"
import { useAtom, useAtomValue } from "jotai"
import { useMemo } from "react"
import { i18n } from "#imports"
import { IconArrowRight } from "@/components/icons"
import { LanguagePicker } from "@/components/language-picker"
import { langCodeISO6393Schema } from "@/definitions"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { detectedCodeAtom } from "@/utils/atoms/detected-code"
import { getLanguageLabel, getLanguageName } from "@/utils/language-labels"
import { cn } from "@/utils/styles/utils"

type SourceCode = LangCodeISO6393 | "auto"

function languageItem<V extends string>(value: V, code: LangCodeISO6393, badge?: React.ReactNode): PickerItem<V> {
  return { value, label: getLanguageLabel(code), keywords: getLanguageName(code), badge }
}

function LanguageTrigger({ title, caption, ariaLabel, ...props }: { title: string, caption: string, ariaLabel: string } & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={title}
      className="flex h-11 min-w-0 flex-1 cursor-pointer flex-col justify-center gap-0.5 rounded-[10px] border border-border bg-card px-3 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
      {...props}
    >
      <span className="w-full truncate text-sm font-semibold leading-[18px]">{title}</span>
      <span className="text-[11px] leading-[14px] text-muted-foreground">{caption}</span>
    </button>
  )
}

const PANEL_CLASS = "inset-x-0 top-full mt-1.5"

export function LanguageRow({ muted = false }: { muted?: boolean }) {
  const [language, setLanguage] = useAtom(configFieldsAtomMap.language)
  const detectedCode = useAtomValue(detectedCodeAtom)

  const targetItems = useMemo(() => langCodeISO6393Schema.options.map(code => languageItem(code, code)), [])
  const sourceItems = useMemo<PickerItem<SourceCode>[]>(() => [
    languageItem<SourceCode>("auto", detectedCode, (
      <span className="ml-auto rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">{i18n.t("popup.auto")}</span>
    )),
    ...targetItems,
  ], [detectedCode, targetItems])

  const isAuto = language.sourceCode === "auto"
  const sourceTitle = getLanguageName(language.sourceCode === "auto" ? detectedCode : language.sourceCode)

  return (
    <div className={cn("relative flex items-center gap-2", muted && "opacity-60")}>
      <LanguagePicker
        items={sourceItems}
        value={language.sourceCode}
        onChange={(sourceCode) => {
          if (sourceCode !== language.sourceCode)
            void setLanguage({ sourceCode })
        }}
        searchPlaceholder={i18n.t("languageCombobox.searchLanguages")}
        emptyText={i18n.t("languageCombobox.noLanguagesFound")}
        panelClassName={PANEL_CLASS}
        renderTrigger={props => (
          <LanguageTrigger
            title={sourceTitle}
            caption={isAuto ? i18n.t("popup.autoDetected") : i18n.t("popup.sourceLanguage")}
            ariaLabel={i18n.t("popup.sourceLanguage")}
            {...props}
          />
        )}
      />
      <IconArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <LanguagePicker
        items={targetItems}
        value={language.targetCode}
        onChange={(targetCode) => {
          if (targetCode !== language.targetCode)
            void setLanguage({ targetCode })
        }}
        searchPlaceholder={i18n.t("languageCombobox.searchLanguages")}
        emptyText={i18n.t("languageCombobox.noLanguagesFound")}
        panelClassName={PANEL_CLASS}
        renderTrigger={props => (
          <LanguageTrigger
            title={getLanguageName(language.targetCode)}
            caption={i18n.t("popup.translateInto")}
            ariaLabel={i18n.t("popup.targetLanguage")}
            {...props}
          />
        )}
      />
    </div>
  )
}
