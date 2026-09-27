import type { APIProviderConfig } from "@/types/config/provider"
import { i18n } from "#imports"
import ProviderIcon from "@/components/provider-icon"
import { isLLMProviderConfig } from "@/types/config/provider"
import { resolveModelId } from "@/utils/providers/model-id"
import { describesThinkingOff, getRequestHost, maskApiKey } from "@/utils/setup-document"
import { cn } from "@/utils/styles/utils"

type Connection = { status: "idle" } | { status: "testing" } | { status: "ok" } | { status: "error", error: string }

/** The service in use, read-only. Changing it is an import produced by an agent. */
export function ServiceRow({ provider, connection }: {
  provider: APIProviderConfig
  connection: Connection
}) {
  const modelId = isLLMProviderConfig(provider) ? resolveModelId(provider.model) : undefined
  const hasKey = !!provider.apiKey?.trim()
  const thinkingOff = describesThinkingOff(provider.providerOptions)

  const details = [
    hasKey ? `${i18n.t("options.service.key")} ${maskApiKey(provider.apiKey!)}` : null,
    i18n.t("options.service.sendsTo", [getRequestHost({ type: provider.provider, baseURL: provider.baseURL }) || "—"]),
    thinkingOff ? i18n.t("options.service.thinkingOff") : null,
  ].filter(Boolean).join(" · ")

  const status = connection.status === "ok"
    ? { label: i18n.t("options.service.connected"), tone: "ok" as const }
    : connection.status === "error"
      ? { label: i18n.t("options.service.connectionFailed"), tone: "error" as const }
      : hasKey
        ? { label: i18n.t("options.service.keyConfigured"), tone: "ok" as const }
        : { label: i18n.t("options.service.keyMissing"), tone: "warn" as const }

  return (
    <div className="flex items-center gap-3 px-4 py-4">
      <ProviderIcon providerType={provider.provider} size="md" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2.5">
          <span className="truncate text-sm font-semibold">{provider.name}</span>
          {modelId && <span className="truncate font-mono text-xs text-muted-foreground">{modelId}</span>}
        </div>
        <span className="truncate text-xs text-muted-foreground">{details}</span>
      </div>
      <span className={cn(
        "flex shrink-0 items-center gap-1.5 text-xs",
        status.tone === "ok" && "text-emerald-700 dark:text-emerald-400",
        status.tone === "warn" && "text-muted-foreground",
        status.tone === "error" && "text-destructive",
      )}
      >
        <span
          aria-hidden="true"
          className={cn("size-1.5 rounded-full", status.tone === "ok" && "bg-emerald-600", status.tone === "warn" && "bg-amber-600", status.tone === "error" && "bg-destructive")}
        />
        {status.label}
      </span>
    </div>
  )
}
