import { useAtom } from "jotai"
import { useId } from "react"
import { i18n } from "#imports"
import { Switch } from "@/components/ui/base-ui/switch"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { deepMerge } from "@/utils/object"
import { SettingsGroup, SettingsRow, SettingsSection } from "../../components/settings-section"

/** What the model is told. The prompt itself comes with the setup document; here it is only named. */
export function QualitySection() {
  const [translateConfig, setTranslateConfig] = useAtom(configFieldsAtomMap.translate)
  const contextSwitchId = useId()
  const { promptId, patterns } = translateConfig.customPromptsConfig
  const prompt = promptId ? patterns.find(pattern => pattern.id === promptId) : undefined

  return (
    <SettingsSection id="quality" title={i18n.t("options.quality.title")}>
      <SettingsGroup>
        <SettingsRow
          label={i18n.t("options.quality.context.title")}
          htmlFor={contextSwitchId}
          control={(
            <Switch
              id={contextSwitchId}
              checked={translateConfig.enableAIContentAware}
              onCheckedChange={checked => void setTranslateConfig(deepMerge(translateConfig, { enableAIContentAware: checked }))}
            />
          )}
        />
        <SettingsRow
          label={i18n.t("options.quality.prompt.title")}
          control={<span className="text-[13px] text-muted-foreground">{prompt?.name ?? i18n.t("options.quality.prompt.default")}</span>}
        />
      </SettingsGroup>
    </SettingsSection>
  )
}
