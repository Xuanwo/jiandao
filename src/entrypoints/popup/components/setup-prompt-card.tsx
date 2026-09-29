import { i18n } from "#imports"
import { openOptionsPage } from "@/utils/navigation"

/**
 * Shown instead of the translate action while no service is configured.
 * Configuration happens on the settings page, where the setup document is
 * pasted and checked; the popup only points there. After an update cleared
 * a config that could not be migrated, the card says so.
 */
export function SetupPromptCard({ afterReset = false }: { afterReset?: boolean }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3.5">
      <div className="flex flex-col gap-1">
        <div className="text-sm font-semibold leading-5">{afterReset ? i18n.t("popup.setup.resetTitle") : i18n.t("popup.setup.title")}</div>
        <div className="text-xs leading-[17px] text-muted-foreground">{afterReset ? i18n.t("popup.setup.resetDescription") : i18n.t("popup.setup.description")}</div>
      </div>
      <button
        type="button"
        onClick={() => void openOptionsPage({ section: "service" })}
        className="h-10 rounded-[9px] bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85"
      >
        {i18n.t("popup.setup.openSettings")}
      </button>
    </div>
  )
}
