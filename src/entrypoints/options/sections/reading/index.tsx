import { useAtom } from "jotai"
import { useId } from "react"
import { i18n } from "#imports"
import { SegmentedControl } from "@/components/segmented-control"
import { Switch } from "@/components/ui/switch"
import { TRANSLATION_MODES } from "@/types/config/translate"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { SettingsGroup, SettingsRow, SettingsSection } from "../../components/settings-section"
import { EnglishPreview, TranslationPreview } from "./previews"
import { StyleSetting } from "./style-setting"

const MODE_LABEL_KEY = {
  bilingual: "options.reading.mode.bilingual",
  translationOnly: "options.reading.mode.translationOnly",
} as const

/**
 * How pages read, in two groups: how a translation shows, and the emphasis
 * that every page gets. Each group starts with a preview of its settings.
 */
export function ReadingSection() {
  const [translateConfig, setTranslateConfig] = useAtom(configFieldsAtomMap.translate)
  const [readingConfig, setReadingConfig] = useAtom(configFieldsAtomMap.reading)
  const emphasisId = useId()

  return (
    <SettingsSection id="reading" title={i18n.t("options.reading.title")}>
      <div className="flex flex-col gap-5">
        <SettingsGroup caption={i18n.t("options.reading.whileTranslating")}>
          <TranslationPreview />
          <SettingsRow
            label={i18n.t("options.reading.mode.title")}
            control={(
              <SegmentedControl
                size="sm"
                aria-label={i18n.t("options.reading.mode.title")}
                value={translateConfig.mode}
                options={TRANSLATION_MODES.map(mode => ({ value: mode, label: i18n.t(MODE_LABEL_KEY[mode]) }))}
                onChange={mode => void setTranslateConfig({ mode })}
              />
            )}
          />
          {/* The translation style applies to bilingual display only. */}
          {translateConfig.mode === "bilingual" && <StyleSetting />}
        </SettingsGroup>
        <SettingsGroup caption={i18n.t("options.reading.allPages")}>
          <EnglishPreview />
          <SettingsRow
            label={i18n.t("options.reading.wordPrefixEmphasis.title")}
            description={i18n.t("options.reading.wordPrefixEmphasis.description")}
            htmlFor={emphasisId}
            control={(
              <Switch
                id={emphasisId}
                checked={readingConfig.wordPrefixEmphasis}
                onCheckedChange={wordPrefixEmphasis => void setReadingConfig({ wordPrefixEmphasis })}
              />
            )}
          />
        </SettingsGroup>
      </div>
    </SettingsSection>
  )
}
