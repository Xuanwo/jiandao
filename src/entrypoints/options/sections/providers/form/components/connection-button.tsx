import type { JSONValue } from "ai"
import type { APIProviderConfig } from "@/types/config/provider"
import { IconCheck, IconX } from "@tabler/icons-react"
import { useMutation } from "@tanstack/react-query"
import { dequal } from "dequal"
import { useEffect } from "react"
import { i18n } from "#imports"
import LoadingDots from "@/components/loading-dots"
import { Button } from "@/components/ui/base-ui/button"
import { getObjectWithoutAPIKeys } from "@/utils/config/api"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { executeTranslate } from "@/utils/host/translate/execute-translate"
import { getTranslatePrompt } from "@/utils/prompts/translate"
import { runWithThinkingFallback } from "@/utils/providers/thinking-fallback"
import { showThinkingFallbackToast } from "@/utils/providers/thinking-fallback-toast"

function ConnectionSuccessIcon() {
  return (
    <div className="flex items-center justify-center size-5 rounded-full bg-green-200 dark:bg-green-800/50">
      <IconCheck className="size-3.5 text-green-700 dark:text-green-300 stroke-[2.5]" />
    </div>
  )
}

function ConnectionErrorIcon() {
  return (
    <div className="flex items-center justify-center size-5 rounded-full bg-red-200 dark:bg-red-800/50">
      <IconX className="size-3.5 text-red-700 dark:text-red-300 stroke-[2.5]" />
    </div>
  )
}

const ConnectionTestResultIconMap = {
  success: <ConnectionSuccessIcon />,
  error: <ConnectionErrorIcon />,
}

/**
 * Tests the provider with one short translation, with the thinking fallback
 * of runWithThinkingFallback. If the fallback works and the user did not
 * change the provider options during the test, the form gets the provider
 * options that worked, and the user sees why.
 */
export function ConnectionTestButton({ providerConfig, onProviderOptionsChange }: {
  providerConfig: APIProviderConfig
  onProviderOptionsChange: (options: Record<string, JSONValue>) => void
}) {
  const { apiKey, provider, providerOptions } = providerConfig
  const baseURL = "baseURL" in providerConfig ? providerConfig.baseURL : undefined

  const mutation = useMutation({
    // for safety, we should not include apiKey in the mutationKey
    // A new key clears the result. The provider options are not in it, because
    // the fallback saves new provider options after a test that used the old ones.
    mutationKey: ["apiConnection", getObjectWithoutAPIKeys({ ...providerConfig, providerOptions: undefined })],
    mutationFn: async (_testedOptions: Record<string, JSONValue> | undefined) => {
      const { fallback } = await runWithThinkingFallback(providerConfig, config => executeTranslate("Hi", DEFAULT_CONFIG.language, config, getTranslatePrompt))
      return fallback
    },
    onSuccess: (fallback, testedOptions) => {
      if (!fallback || !dequal(providerOptions, testedOptions))
        return
      onProviderOptionsChange(fallback.options)
      showThinkingFallbackToast(fallback)
    },
  })

  const handleTestConnection = () => {
    mutation.mutate(providerOptions)
  }

  useEffect(() => {
    mutation.reset()
  // eslint-disable-next-line react/exhaustive-deps
  }, [provider, apiKey, baseURL])

  // A result is for the provider options that the test used; after the user changes them, it is hidden.
  const resultOptions = mutation.data?.options ?? mutation.variables
  const testResult = !dequal(providerOptions, resultOptions) ? null : mutation.isSuccess ? "success" : mutation.isError ? "error" : null
  const ConnectionTestResultIcon = testResult ? ConnectionTestResultIconMap[testResult] : null

  return (
    <div className="flex items-center gap-2">
      {ConnectionTestResultIcon}
      <Button
        size="xs"
        variant="outline"
        onClick={handleTestConnection}
        disabled={mutation.isPending || !apiKey}
      >
        {mutation.isPending
          ? (
              <div className="flex items-center gap-2">
                <LoadingDots className="scale-75" />
                <span className="text-xs">
                  {i18n.t("options.providers.form.testConnection.testing")}
                </span>
              </div>
            )
          : (
              <span className="text-xs">
                {i18n.t("options.providers.form.testConnection.button")}
              </span>
            )}
      </Button>
    </div>
  )
}
