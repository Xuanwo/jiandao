import type { SetupPreview } from "@/utils/setup-document"
import { i18n } from "#imports"
import { getLanguageName } from "@/utils/language-labels"
import { cn } from "@/utils/styles/utils"

const MODE_LABEL_KEY = {
  bilingual: "options.reading.mode.bilingual",
  translationOnly: "options.reading.mode.translationOnly",
} as const

const KEY_STATUS_LABEL_KEY = {
  new: "setupPreview.keyNew",
  reused: "setupPreview.keyReused",
  missing: "setupPreview.keyMissing",
} as const

function Row({ label, value, highlight = false, last = false }: { label: string, value: React.ReactNode, highlight?: boolean, last?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 px-3.5 py-2.5", !last && "border-b border-border", highlight && "bg-brand/10")}>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right", highlight && "font-semibold text-link")}>{value}</span>
    </div>
  )
}

/** The table a reader checks before a setup document is applied. */
export function SetupPreviewTable({ preview }: { preview: SetupPreview }) {
  const languageLine = [
    preview.targetLanguage ? getLanguageName(preview.targetLanguage) : null,
    preview.mode ? i18n.t(MODE_LABEL_KEY[preview.mode]) : null,
  ].filter(Boolean).join(" · ")

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card text-[13px]">
      <Row label={i18n.t("setupPreview.provider")} value={<span className="font-semibold">{preview.providerName}</span>} />
      <Row label={i18n.t("setupPreview.model")} value={<span className="font-mono text-xs">{preview.modelId || "—"}</span>} />
      <Row
        label={i18n.t("setupPreview.apiKey")}
        value={(
          <span className={cn("text-xs", preview.keyStatus === "missing" ? "text-destructive" : "text-muted-foreground")}>
            {i18n.t(KEY_STATUS_LABEL_KEY[preview.keyStatus])}
          </span>
        )}
      />
      <Row label={i18n.t("setupPreview.host")} value={preview.host || "—"} highlight />
      <Row
        label={i18n.t("setupPreview.thinking")}
        value={preview.thinkingOff === null ? i18n.t("setupPreview.unset") : preview.thinkingOff ? i18n.t("setupPreview.yes") : i18n.t("setupPreview.no")}
      />
      <Row label={i18n.t("setupPreview.languages")} value={languageLine || i18n.t("setupPreview.unchanged")} last />
    </div>
  )
}

/** One-line version for the popup: "DeepSeek · deepseek-flash · api.deepseek.com". */
export function describePreviewInline(preview: SetupPreview): string {
  return [preview.providerName, preview.modelId, preview.host].filter(Boolean).join(" · ")
}
