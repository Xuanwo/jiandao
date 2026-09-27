import type { APIProviderConfig } from "@/types/config/provider"
import { useStore } from "@tanstack/react-form"
import { i18n } from "#imports"
import { isLLMProviderConfig } from "@/types/config/provider"
import { ModelSuggestionButton } from "./components/model-suggestion-button"
import { withForm } from "./form"

export const TranslateModelSelector = withForm({
  ...{ defaultValues: {} as APIProviderConfig },
  render: function Render({ form }) {
    const providerConfig = useStore(form.store, state => state.values)
    if (!isLLMProviderConfig(providerConfig))
      return <></>

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
            labelExtra={<ModelSuggestionButton providerConfig={providerConfig} onSelect={setModel} />}
          />
        )}
      </form.AppField>
    )
  },
})
