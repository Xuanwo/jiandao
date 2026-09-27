import type { LLMProviderConfig } from "@/types/config/provider"
import { Combobox as ComboboxPrimitive } from "@base-ui/react"
import { IconAlertCircle, IconList, IconListSearch } from "@tabler/icons-react"
import { useMutation } from "@tanstack/react-query"
import { z } from "zod"
import { i18n } from "#imports"
import LoadingDots from "@/components/loading-dots"
import { Button } from "@/components/ui/base-ui/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/base-ui/combobox"
import { DEFAULT_LLM_PROVIDER_BASE_URLS } from "@/utils/constants/providers"
import { extractErrorMessage } from "@/utils/error/extract-message"
import { getProviderHeadersWithOverride } from "@/utils/providers/headers"

const modelsResponseSchema = z.object({
  data: z.array(z.object({ id: z.string() })),
})

interface ModelSuggestionButtonProps {
  providerConfig: LLMProviderConfig
  onSelect: (model: string) => void
}

export function ModelSuggestionButton({ providerConfig, onSelect }: ModelSuggestionButtonProps) {
  // Remove trailing slashes, so that the request goes to `${baseURL}/models` and not to `//models`.
  const baseURL = providerConfig.baseURL?.trim().replace(/\/+$/, "") || DEFAULT_LLM_PROVIDER_BASE_URLS[providerConfig.provider]
  const headers = getProviderHeadersWithOverride(providerConfig.provider, providerConfig.headers)
  const mutation = useMutation({
    mutationKey: ["fetchModels", baseURL],
    meta: {
      errorDescription: i18n.t("options.providers.form.models.fetchError"),
    },
    mutationFn: async () => {
      const requestHeaders = new Headers(headers)
      if (providerConfig.apiKey && !requestHeaders.has("Authorization")) {
        requestHeaders.set("Authorization", `Bearer ${providerConfig.apiKey}`)
      }

      const response = await fetch(`${baseURL}/models`, {
        headers: requestHeaders,
      })
      if (!response.ok) {
        throw new Error(await extractErrorMessage(response))
      }

      const result = modelsResponseSchema.safeParse(await response.json())
      if (!result.success) {
        throw new Error(i18n.t("options.providers.form.models.fetchError"))
      }
      return result.data.data.map(model => model.id)
    },
  })

  const models = mutation.data ?? []
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button
        type="button"
        variant="outline"
        size="xs"
        onClick={() => {
          mutation.reset()
          mutation.mutate()
        }}
        disabled={!baseURL || mutation.isPending}
        className={mutation.isError ? "text-red-500 hover:text-red-500" : undefined}
      >
        {mutation.isPending
          ? <LoadingDots className="scale-75" />
          : mutation.isError
            ? <IconAlertCircle className="size-3.5" />
            : <IconListSearch className="size-3.5" />}
        {mutation.isError
          ? i18n.t("options.providers.form.models.clickToRetry")
          : i18n.t("options.providers.form.models.fetchModels")}
      </Button>
      {mutation.isSuccess && (models.length === 0
        ? <span className="text-xs text-muted-foreground">{i18n.t("options.providers.form.models.noModels")}</span>
        : (
            <Combobox
              items={models}
              defaultOpen
              onValueChange={(model: string | null) => {
                if (model)
                  onSelect(model)
              }}
            >
              <ComboboxPrimitive.Trigger render={<Button type="button" variant="outline" size="xs" />}>
                <IconList />
                {i18n.t("options.providers.form.models.selectModel")}
              </ComboboxPrimitive.Trigger>
              <ComboboxContent align="end" className="w-64">
                <ComboboxInput showTrigger={false} placeholder={i18n.t("options.providers.form.models.searchModels")} />
                <ComboboxList>
                  {(model: string) => (
                    <ComboboxItem key={model} value={model}>
                      {model}
                    </ComboboxItem>
                  )}
                </ComboboxList>
                <ComboboxEmpty>{i18n.t("options.providers.form.models.noModelsFound")}</ComboboxEmpty>
              </ComboboxContent>
            </Combobox>
          ))}
    </div>
  )
}
