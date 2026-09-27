import type { APIProviderConfig } from "@/types/config/provider"
import { useStore } from "@tanstack/react-form"
import { i18n } from "#imports"
import { isLLMProviderConfig } from "@/types/config/provider"
import { resolveModelId } from "@/utils/providers/model-id"
import { ModelSuggestionButton } from "./components/model-suggestion-button"
import { ProviderOptionsRecommendationTrigger } from "./components/provider-options-recommendation-trigger"
import { withForm } from "./form"

export const TranslateModelSelector = withForm({
  ...{ defaultValues: {} as APIProviderConfig },
  render: function Render({ form }) {
    const providerConfig = useStore(form.store, state => state.values)
    if (!isLLMProviderConfig(providerConfig))
      return <></>

    const modelId = resolveModelId(providerConfig.model)
    const setModel = (model: string) => {
      form.setFieldValue("model", model)
      void form.handleSubmit()
    }

    return (
      <form.AppField
        name="model"
        validators={{
          onChange: ({ value }) => value.trim() ? undefined : i18n.t("options.providers.form.models.required"),
        }}
      >
        {field => (
          <field.InputFieldAutoSave
            formForSubmit={form}
            label={i18n.t("options.providers.form.model")}
            labelExtra={(
              <div className="flex flex-wrap items-center justify-end gap-2">
                <ProviderOptionsRecommendationTrigger
                  providerId={providerConfig.id}
                  modelId={modelId}
                  currentProviderOptions={providerConfig.providerOptions}
                  onApply={(options) => {
                    form.setFieldValue("providerOptions", options)
                    void form.handleSubmit()
                  }}
                />
                <ModelSuggestionButton providerConfig={providerConfig} onSelect={setModel} />
              </div>
            )}
          />
        )}
      </form.AppField>
    )
  },
})
