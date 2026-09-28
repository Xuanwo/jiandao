import { useAtom } from "jotai"
import { useId } from "react"
import { i18n } from "#imports"
import { ShortcutKeyRecorder } from "@/components/shortcut-key-recorder"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { DEFAULT_AUTO_TRANSLATE_SHORTCUT_KEY } from "@/utils/constants/translate"
import { SettingsGroup, SettingsRow, SettingsSection } from "../../components/settings-section"

/** Keyboard shortcuts, each named after the action it runs, as the popup names that action. */
export function ShortcutSection() {
  const [translateConfig, setTranslateConfig] = useAtom(configFieldsAtomMap.translate)
  const togglePageId = useId()

  return (
    <SettingsSection id="shortcut" title={i18n.t("options.shortcut.title")}>
      <SettingsGroup>
        <SettingsRow
          label={i18n.t("options.shortcut.togglePage")}
          htmlFor={togglePageId}
          control={(
            <ShortcutKeyRecorder
              id={togglePageId}
              className="w-28 text-center"
              shortcutKey={translateConfig.page.shortcut ?? DEFAULT_AUTO_TRANSLATE_SHORTCUT_KEY}
              onChange={shortcut => void setTranslateConfig({ ...translateConfig, page: { ...translateConfig.page, shortcut } })}
            />
          )}
        />
      </SettingsGroup>
    </SettingsSection>
  )
}
