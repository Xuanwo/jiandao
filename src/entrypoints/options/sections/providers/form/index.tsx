import type { ProvidersConfig } from "@/types/config/provider"
import { useStore } from "@tanstack/react-form"
import { dequal } from "dequal"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { i18n } from "#imports"
import { isAPIProviderConfig, isLLMProvider, isTranslateProvider } from "@/types/config/provider"
import { configAtom, configFieldsAtomMap, writeConfigAtom } from "@/utils/atoms/config"
import { providerConfigAtom } from "@/utils/atoms/provider"
import {
  computeProviderFallbacksAfterDeletion,
  findFeatureMissingProvider,
} from "@/utils/config/helpers"
import { buildFeatureProviderPatch } from "@/utils/constants/feature-providers"
import { ConfirmAction } from "../../../components/confirm-action"
import { expandedProviderIdAtom } from "../atoms"
import { duplicateProvider } from "../utils"
import { APIKeyField } from "./api-key-field"
import { BaseURLField } from "./base-url-field"
import { AdvancedOptionsSection } from "./components/advanced-options-section"
import { formOpts, useAppForm } from "./form"
import { ProviderHeadersField } from "./provider-headers-field"
import { ProviderOptionsField } from "./provider-options-field"
import { TemperatureField } from "./temperature-field"
import { TranslateModelSelector } from "./translate-model-selector"

/** Inline editor for one provider; every field saves as it changes. */
export function ProviderForm({ providerId }: { providerId: string }) {
  const [providerConfig, setProviderConfig] = useAtom(providerConfigAtom(providerId))
  const [allProvidersConfig, setAllProvidersConfig] = useAtom(configFieldsAtomMap.providersConfig)
  const setExpandedId = useSetAtom(expandedProviderIdAtom)
  const setConfig = useSetAtom(writeConfigAtom)
  const config = useAtomValue(configAtom)
  // The provider config that the form saved or loaded last. After a save, the atom gets an equal copy.
  // A reset to that copy can remove a value that the user changed after the save.
  const syncedConfigRef = useRef(providerConfig)

  const form = useAppForm({
    ...formOpts,
    defaultValues: providerConfig && isAPIProviderConfig(providerConfig) ? providerConfig : undefined,
    onSubmit: async ({ value }) => {
      syncedConfigRef.current = value
      void setProviderConfig(value)
    },
  })

  const providerType = useStore(form.store, state => state.values.provider)
  const isTranslateProviderType = isTranslateProvider(providerType)
  const isLLM = isLLMProvider(providerType)

  useEffect(() => {
    if (providerConfig && isAPIProviderConfig(providerConfig) && !dequal(providerConfig, syncedConfigRef.current)) {
      syncedConfigRef.current = providerConfig
      form.reset(providerConfig)
    }
  }, [providerConfig, form])

  if (!providerConfig || !isAPIProviderConfig(providerConfig)) {
    return null
  }

  const chooseNextProviderConfig = (providersConfig: ProvidersConfig) => providersConfig[0]

  const handleDuplicate = async () => {
    await duplicateProvider(providerConfig, allProvidersConfig, setAllProvidersConfig, setExpandedId)
  }

  const handleDelete = async () => {
    const updatedAllProviders = allProvidersConfig.filter(provider => provider.id !== providerConfig.id)

    if (findFeatureMissingProvider(updatedAllProviders)) {
      toast.error(i18n.t("options.providers.atLeastOne"))
      return
    }

    const fallbacks = computeProviderFallbacksAfterDeletion(providerConfig.id, config, updatedAllProviders)
    const patch = buildFeatureProviderPatch(fallbacks)
    if (Object.keys(patch).length > 0) {
      await setConfig(patch)
    }

    await setAllProvidersConfig(updatedAllProviders)
    setExpandedId(chooseNextProviderConfig(updatedAllProviders).id)
  }

  return (
    <form.AppForm>
      <div className="flex flex-col gap-4">
        <form.AppField
          name="name"
          validators={{
            onChange: ({ value }) => {
              const duplicate = allProvidersConfig.find(provider => provider.name === value && provider.id !== providerConfig.id)
              return duplicate ? i18n.t("options.providers.duplicateName", [value]) : undefined
            },
          }}
        >
          {field => <field.InputFieldAutoSave formForSubmit={form} label={i18n.t("options.providers.form.name")} />}
        </form.AppField>
        <APIKeyField form={form} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {isTranslateProviderType && <TranslateModelSelector form={form} />}
          <BaseURLField form={form} />
        </div>
        {isLLM && (
          <AdvancedOptionsSection>
            <TemperatureField form={form} />
            <ProviderOptionsField form={form} />
            <ProviderHeadersField form={form} />
          </AdvancedOptionsSection>
        )}
        <div className="flex items-center gap-4 pt-1 text-xs">
          <button type="button" onClick={() => void handleDuplicate()} className="text-muted-foreground hover:text-foreground hover:underline">
            {i18n.t("options.providers.duplicate")}
          </button>
          <ConfirmAction
            trigger={(
              <button type="button" className="text-destructive hover:underline">
                {i18n.t("options.providers.delete")}
              </button>
            )}
            title={i18n.t("options.providers.deleteDialog.title")}
            description={i18n.t("options.providers.deleteDialog.description")}
            confirmLabel={i18n.t("options.providers.deleteDialog.confirm")}
            cancelLabel={i18n.t("options.providers.deleteDialog.cancel")}
            onConfirm={handleDelete}
          />
        </div>
      </div>
    </form.AppForm>
  )
}
