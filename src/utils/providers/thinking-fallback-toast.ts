import type { ThinkingFallback } from "./thinking-fallback"
import { toast } from "sonner"
import { i18n } from "#imports"

/** Tells the user why the provider options changed after the provider rejected the preset. */
export function showThinkingFallbackToast({ kind, reason }: Pick<ThinkingFallback, "kind" | "reason">) {
  const message = kind === "removed" ? i18n.t("translation.thinkingRemoved", [reason]) : i18n.t("translation.thinkingFallback", [reason])
  toast.info(message, { duration: 15_000 })
}
