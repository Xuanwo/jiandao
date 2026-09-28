import { i18n } from "#imports"
import { openOptionsPage } from "@/utils/navigation"

/**
 * Shown instead of the translate action while no service is configured.
 * Configuration happens on the settings page, where the setup document is
 * pasted and checked; the popup only points there.
 */
export function SetupPromptCard() {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3.5">
      <div className="flex flex-col gap-1">
        <div className="text-sm font-semibold leading-5">{i18n.t("popup.setup.title")}</div>
        <div className="text-xs leading-[17px] text-muted-foreground">{i18n.t("popup.setup.description")}</div>
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
