import { i18n } from "#imports"
import { getRequestErrorMeta } from "@/utils/request/retry-policy"
import { RetryButton } from "./retry-button"

function describeError(error: Error): string {
  const { statusCode } = getRequestErrorMeta(error)
  const status = statusCode ? `${statusCode} ` : ""
  const message = error.message?.trim() || i18n.t("translation.unknownError")
  return `${status}${message}`
}

/**
 * Inline replacement for a paragraph whose translation failed: one muted
 * line with the reason and a retry button, nothing floating.
 */
export function TranslationError({ nodes, error }: { nodes: ChildNode[], error: Error }) {
  const detail = describeError(error)

  return (
    <div className="notranslate inline-flex max-w-full items-center gap-2 text-sm text-muted-foreground">
      <span className="truncate" title={detail}>
        {i18n.t("translation.failed")}
        {" · "}
        {detail}
      </span>
      <RetryButton nodes={nodes} />
    </div>
  )
}
