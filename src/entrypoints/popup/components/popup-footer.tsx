import type { ProviderConfig } from "@/types/config/provider"
import { IconSettings } from "@tabler/icons-react"
import { useAtomValue } from "jotai"
import { i18n } from "#imports"
import { isAPIProviderConfig, isLLMProviderConfig } from "@/types/config/provider"
import { featureProviderConfigAtom } from "@/utils/atoms/provider"
import { PROVIDER_ITEMS } from "@/utils/constants/providers"
import { openOptionsPage } from "@/utils/navigation"
import { resolveModelId } from "@/utils/providers/model-id"
import { cn } from "@/utils/styles/utils"

function isProviderReady(provider: ProviderConfig): boolean {
  return !isAPIProviderConfig(provider) || !!provider.apiKey?.trim()
}

function describeProvider(provider: ProviderConfig): string {
  const modelId = isLLMProviderConfig(provider) ? resolveModelId(provider.model) : null
  const displayName = provider.name || PROVIDER_ITEMS[provider.provider].name
  return modelId ? `${displayName} · ${modelId}` : displayName
}

/** Which service translates, as a status line. Changing it is the agent's job, through settings. */
export function PopupFooter() {
  const current = useAtomValue(featureProviderConfigAtom("translate"))
  const ready = !!current && isProviderReady(current)

  return (
    <div className="flex items-center justify-between border-t border-border py-2 pr-2.5 pl-4">
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", ready ? "bg-emerald-600" : "bg-amber-600")} />
        <span className="truncate">
          {current
            ? ready ? describeProvider(current) : `${current.name} · ${i18n.t("popup.provider.missingKey")}`
            : i18n.t("popup.provider.none")}
        </span>
      </span>
      <button
        type="button"
        aria-label={i18n.t("popup.settings")}
        title={i18n.t("popup.settings")}
        onClick={() => void openOptionsPage()}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <IconSettings className="size-4" stroke={1.75} />
      </button>
    </div>
  )
}
