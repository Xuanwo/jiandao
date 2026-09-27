import { useAtom, useAtomValue } from "jotai"
import { i18n } from "#imports"
import { SegmentedControl } from "@/components/segmented-control"
import { isAPIProviderConfig } from "@/types/config/provider"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { featureProviderConfigAtom } from "@/utils/atoms/provider"
import { AgentSetupCard } from "./components/agent-setup-card"
import { LanguageRow } from "./components/language-row"
import { PopupFooter } from "./components/popup-footer"
import { TranslateButton } from "./components/translate-button"
import { usePopupSync } from "./use-popup-sync"

function DisplayModeControl() {
  const [translateConfig, setTranslateConfig] = useAtom(configFieldsAtomMap.translate)

  return (
    <SegmentedControl
      aria-label={i18n.t("popup.displayMode")}
      value={translateConfig.mode}
      options={[
        { value: "bilingual", label: i18n.t("popup.bilingual") },
        { value: "translationOnly", label: i18n.t("popup.translationOnly") },
      ]}
      onChange={mode => void setTranslateConfig({ mode })}
    />
  )
}

/**
 * Popup layout reads top to bottom as one sentence: from this language, into
 * that language, shown this way, translate. When the chosen service has no
 * key yet, the agent setup card takes the action's place.
 */
export default function App() {
  usePopupSync()
  const providerConfig = useAtomValue(featureProviderConfigAtom("translate"))
  const needsApiKey = !!providerConfig && isAPIProviderConfig(providerConfig) && !providerConfig.apiKey?.trim()

  return (
    <div className="flex min-h-[300px] flex-col justify-between">
      <div className="flex flex-col gap-3.5 px-4 pt-4 pb-4">
        <LanguageRow muted={needsApiKey} />
        {needsApiKey
          ? <AgentSetupCard />
          : (
              <>
                <DisplayModeControl />
                <TranslateButton />
              </>
            )}
      </div>
      <PopupFooter />
    </div>
  )
}
