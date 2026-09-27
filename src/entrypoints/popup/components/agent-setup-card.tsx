import { IconCheck, IconCopy } from "@tabler/icons-react"
import { useAtomValue, useSetAtom } from "jotai"
import { useId, useMemo, useState } from "react"
import { i18n } from "#imports"
import { describePreviewInline } from "@/components/setup-preview"
import { configAtom, writeConfigAtom } from "@/utils/atoms/config"
import { clearClipboard, copyText } from "@/utils/clipboard"
import { buildAgentInstructions } from "@/utils/setup-agent-instructions"
import { applySetupDocument, describeSetupDocument, parseSetupDocument, SetupDocumentError } from "@/utils/setup-document"
import { cn } from "@/utils/styles/utils"
import { activeTabAtom, pageTranslationEnabledAtom } from "../atoms"
import { setPageTranslation } from "./translate-button"

const COPIED_FEEDBACK_MS = 2000

/**
 * First-run path. The reader hands instructions to their agent, the agent
 * verifies a configuration against the real service and puts it on the
 * clipboard, the reader pastes it here. Plainly never asks for a key by hand.
 */
export function AgentSetupCard() {
  const textareaId = useId()
  const config = useAtomValue(configAtom)
  const setConfig = useSetAtom(writeConfigAtom)
  const activeTab = useAtomValue(activeTabAtom)
  const setEnabled = useSetAtom(pageTranslationEnabledAtom)

  const [text, setText] = useState("")
  const [copied, setCopied] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)

  const parsed = useMemo(() => text.trim() ? parseSetupDocument(text) : null, [text])
  const preview = parsed?.ok ? describeSetupDocument(config, parsed.document) : null
  const canApply = !!parsed?.ok && preview?.keyStatus !== "missing" && !applying

  const copyInstructions = async () => {
    if (await copyText(buildAgentInstructions(config))) {
      setCopied(true)
      setTimeout(setCopied, COPIED_FEEDBACK_MS, false)
    }
  }

  const apply = async () => {
    if (!parsed?.ok)
      return
    setApplying(true)
    setApplyError(null)
    try {
      const { config: next } = applySetupDocument(config, parsed.document)
      // Persist before asking the page to translate: the content script reads
      // the service straight from storage.
      await setConfig(next)
      await clearClipboard()
      if (activeTab.id !== null && activeTab.translatable) {
        setEnabled(true)
        await setPageTranslation(activeTab.id, true)
      }
    }
    catch (error) {
      setApplyError(error instanceof SetupDocumentError || error instanceof Error ? error.message : String(error))
    }
    finally {
      setApplying(false)
    }
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3.5">
      <div className="flex flex-col gap-1">
        <div className="text-sm font-semibold leading-5">{i18n.t("popup.setup.title")}</div>
        <div className="text-xs leading-[17px] text-muted-foreground">{i18n.t("popup.setup.description")}</div>
      </div>
      <button
        type="button"
        onClick={() => void copyInstructions()}
        className="flex h-9 items-center justify-center gap-1.5 rounded-[9px] border border-input bg-background text-[13px] font-medium transition-colors hover:bg-muted"
      >
        {copied ? <IconCheck className="size-3.5" aria-hidden="true" /> : <IconCopy className="size-3.5" aria-hidden="true" />}
        <span>{copied ? i18n.t("popup.setup.copied") : i18n.t("popup.setup.copyInstructions")}</span>
      </button>
      <label htmlFor={textareaId} className="mt-0.5 text-[11px] text-muted-foreground">{i18n.t("popup.setup.pasteLabel")}</label>
      <textarea
        id={textareaId}
        value={text}
        spellCheck={false}
        placeholder={i18n.t("popup.setup.placeholder")}
        onChange={(event) => {
          setText(event.target.value)
          setApplyError(null)
        }}
        className="h-16 resize-none rounded-lg border border-input bg-background px-2.5 py-2 font-mono text-xs leading-4 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      {parsed && !parsed.ok && (
        <pre className="m-0 whitespace-pre-wrap font-sans text-xs leading-[16px] text-destructive">{parsed.error}</pre>
      )}
      {preview && (
        <div className={cn("text-xs leading-[16px]", preview.keyStatus === "missing" ? "text-destructive" : "text-muted-foreground")}>
          {describePreviewInline(preview)}
          {preview.keyStatus === "missing" && ` · ${i18n.t("popup.setup.keyMissing")}`}
        </div>
      )}
      {applyError && (
        <pre className="m-0 whitespace-pre-wrap font-sans text-xs leading-[16px] text-destructive">{applyError}</pre>
      )}
      <button
        type="button"
        onClick={() => void apply()}
        disabled={!canApply}
        className="h-10 rounded-[9px] bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/85 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {activeTab.translatable ? i18n.t("popup.setup.apply") : i18n.t("popup.setup.applyOnly")}
      </button>
    </div>
  )
}
