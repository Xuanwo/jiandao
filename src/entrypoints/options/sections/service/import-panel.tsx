import { useAtomValue, useSetAtom } from "jotai"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import { i18n } from "#imports"
import { SetupPreviewTable } from "@/components/setup-preview"
import { isAPIProviderConfig } from "@/types/config/provider"
import { configAtom, writeConfigAtom } from "@/utils/atoms/config"
import { clearClipboard } from "@/utils/clipboard"
import { testProviderConnection } from "@/utils/providers/test-connection"
import { applySetupDocument, describeSetupDocument, parseSetupDocument } from "@/utils/setup-document"
import { cn } from "@/utils/styles/utils"

type ApplyState
  = | { status: "editing" }
    | { status: "applying" }
    | { status: "confirming" }
    | { status: "done" }
    | { status: "failed", error: string }

/**
 * Paste what the agent put on the clipboard, check the preview, apply.
 * Applying sends one short request through the new service so the reader
 * sees right away whether the agent's verification holds inside Plainly.
 */
export function ImportPanel({ onClose }: { onClose: () => void }) {
  const textareaId = useId()
  const config = useAtomValue(configAtom)
  const setConfig = useSetAtom(writeConfigAtom)
  const [text, setText] = useState("")
  const [state, setState] = useState<ApplyState>({ status: "editing" })
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const parsed = useMemo(() => text.trim() ? parseSetupDocument(text) : null, [text])
  const preview = parsed?.ok ? describeSetupDocument(config, parsed.document) : null
  const busy = state.status === "applying" || state.status === "confirming"
  const canApply = !!parsed?.ok && preview?.keyStatus !== "missing" && !busy

  const apply = async () => {
    if (!parsed?.ok)
      return
    setState({ status: "applying" })
    try {
      const { config: next, providerId } = applySetupDocument(config, parsed.document)
      await setConfig(next)
      await clearClipboard()
      setState({ status: "confirming" })
      const provider = next.providersConfig.find(p => p.id === providerId)
      if (!provider || !isAPIProviderConfig(provider))
        throw new Error("The applied service is not available")
      const result = await testProviderConnection(provider)
      setState(result.ok ? { status: "done" } : { status: "failed", error: result.error })
    }
    catch (error) {
      setState({ status: "failed", error: error instanceof Error ? error.message : String(error) })
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">{i18n.t("options.service.importPanel.title")}</h3>
        <p className="text-xs text-muted-foreground">{i18n.t("options.service.importPanel.description")}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={textareaId} className="text-xs text-muted-foreground">{i18n.t("options.service.importPanel.pasteLabel")}</label>
          <textarea
            id={textareaId}
            ref={textareaRef}
            value={text}
            spellCheck={false}
            disabled={busy || state.status === "done"}
            placeholder={i18n.t("popup.setup.placeholder")}
            onChange={(event) => {
              setText(event.target.value)
              setState({ status: "editing" })
            }}
            className="min-h-[260px] flex-1 resize-y rounded-lg border border-input bg-background p-3 font-mono text-xs leading-[18px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
          />
        </div>
        <div className="flex flex-col gap-2.5">
          <div className="text-xs text-muted-foreground">{i18n.t("options.service.importPanel.previewTitle")}</div>
          {preview
            ? <SetupPreviewTable preview={preview} />
            : (
                <div className="flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">
                  {parsed && !parsed.ok
                    ? <pre className="m-0 whitespace-pre-wrap p-3 font-sans text-destructive">{parsed.error}</pre>
                    : i18n.t("options.service.importPanel.empty")}
                </div>
              )}
          {preview && (
            <p className="text-xs leading-[17px] text-muted-foreground">
              {preview.replaces ? i18n.t("options.service.importPanel.replaces", [preview.providerName]) : i18n.t("options.service.importPanel.adds")}
              {" "}
              {i18n.t("options.service.importPanel.clearsClipboard")}
            </p>
          )}
          {state.status === "confirming" && <p className="text-xs text-muted-foreground">{i18n.t("options.service.importPanel.confirming")}</p>}
          {state.status === "done" && <p className="text-xs text-emerald-700 dark:text-emerald-400">{i18n.t("options.service.importPanel.done")}</p>}
          {state.status === "failed" && (
            <pre className="m-0 whitespace-pre-wrap font-sans text-xs leading-[17px] text-destructive">{state.error}</pre>
          )}
          <div className="mt-auto flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-[9px] border border-input bg-card px-3.5 text-[13px] hover:bg-muted"
            >
              {state.status === "done" ? i18n.t("options.service.importPanel.close") : i18n.t("options.service.importPanel.cancel")}
            </button>
            {state.status !== "done" && (
              <button
                type="button"
                onClick={() => void apply()}
                disabled={!canApply}
                className={cn("h-9 rounded-[9px] bg-primary px-4 text-[13px] font-semibold text-primary-foreground hover:bg-primary/85 disabled:cursor-not-allowed disabled:opacity-50")}
              >
                {i18n.t("options.service.importPanel.apply")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
