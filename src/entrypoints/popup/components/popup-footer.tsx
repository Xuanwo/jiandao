import type { ProviderConfig } from "@/types/config/provider"
import { useAtomValue, useSetAtom, useStore } from "jotai"
import { useState } from "react"
import { i18n } from "#imports"
import { IconSettings } from "@/components/icons"
import { configAtom, configFieldsAtomMap } from "@/utils/atoms/config"
import { featureProviderConfigAtom } from "@/utils/atoms/provider"
import { PROVIDER_ITEMS } from "@/utils/constants/providers"
import { openOptionsPage } from "@/utils/navigation"
import { cn } from "@/utils/styles/utils"
import { WordPrefixEmphasisToggle } from "./word-prefix-emphasis-toggle"

function isProviderReady(provider: ProviderConfig): boolean {
  return !!provider.apiKey?.trim()
}

function describeProvider(provider: ProviderConfig): string {
  const modelId = provider.model.trim()
  const displayName = provider.name || PROVIDER_ITEMS[provider.provider].name
  return modelId ? `${displayName} · ${modelId}` : displayName
}

/** Service selection does not restart an active page translation. */
export function PopupFooter() {
  const current = useAtomValue(featureProviderConfigAtom("translate"))
  const config = useAtomValue(configAtom)
  const store = useStore()
  const setTranslate = useSetAtom(configFieldsAtomMap.translate)
  const [failure, setFailure] = useState(false)
  const available = config.providersConfig.filter(p => p.enabled && isProviderReady(p))
  const canSwitch = available.some(p => p.id !== current?.id)
  const ready = !!current && isProviderReady(current)

  return (
    <div className="flex items-center justify-between border-t border-border py-2 pr-2.5 pl-4">
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", ready ? "bg-success" : "bg-attention")} />
        {canSwitch
          ? (
              <select
                aria-label={i18n.t("options.service.title")}
                value={current?.id ?? ""}
                className="min-w-0 max-w-[190px] rounded bg-transparent text-xs focus-visible:ring-2 focus-visible:ring-ring"
                onChange={(event) => {
                  const provider = store.get(configAtom).providersConfig.find(p => p.id === event.target.value)
                  if (!provider?.enabled || !isProviderReady(provider))
                    return
                  setFailure(false)
                  void setTranslate({ providerId: provider.id }).catch(() => setFailure(true))
                }}
              >
                {!ready && <option value={current?.id ?? ""} disabled>{current?.name ?? i18n.t("popup.provider.none")}</option>}
                {available.map(provider => <option key={provider.id} value={provider.id}>{describeProvider(provider)}</option>)}
              </select>
            )
          : (
              <span className="truncate">
                {current
                  ? ready ? describeProvider(current) : `${current.name} · ${i18n.t("popup.provider.missingKey")}`
                  : i18n.t("popup.provider.none")}
              </span>
            )}
        {failure && <span role="alert" className="text-destructive">{i18n.t("options.service.saveFailed")}</span>}
      </span>
      <div className="flex shrink-0 items-center gap-0.5">
        <WordPrefixEmphasisToggle />
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
    </div>
  )
}
