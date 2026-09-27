import type { SetupPreview } from "@/utils/setup-document"
import { useAtomValue, useSetAtom } from "jotai"
import { useEffect, useId, useMemo, useRef, useState } from "react"
import { i18n } from "#imports"
import { isAPIProviderConfig, isLLMProviderConfig } from "@/types/config/provider"
import { configAtom, writeConfigAtom } from "@/utils/atoms/config"
import { clearClipboard, copyText } from "@/utils/clipboard"
import { resolveModelId } from "@/utils/providers/model-id"
import { testProviderConnection } from "@/utils/providers/test-connection"
import { buildAgentInstructions } from "@/utils/setup-agent-instructions"
import { applySetupDocument, describeSetupDocument, getRequestHost, parseSetupDocument } from "@/utils/setup-document"
import { cn } from "@/utils/styles/utils"
import { SettingsGroup, SettingsSection } from "../../components/settings-section"

export const IMPORT_HASH = "import"

const COPIED_FEEDBACK_MS = 2000

type Connection = "unconfigured" | "configured" | "testing" | "ok" | "failed"

const CONNECTION_LABEL_KEY = {
  unconfigured: "options.service.status.unconfigured",
  configured: "options.service.status.configured",
  testing: "options.service.status.testing",
  ok: "options.service.status.ok",
  failed: "options.service.status.failed",
} as const satisfies Record<Connection, string>

interface TestOutcome { providerId: string, result: "testing" | "ok" | "failed", error?: string }

function TextButton({ onClick, primary = false, children }: { onClick: () => void, primary?: boolean, children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("text-[13px] hover:underline", primary ? "font-medium text-link" : "text-muted-foreground hover:text-foreground")}
    >
      {children}
    </button>
  )
}

/** Two lines a reader needs before applying: what the service is, and where page text will go. */
function PreviewLines({ preview }: { preview: SetupPreview }) {
  return (
    <div className="flex flex-col gap-0.5 text-[13px]">
      <div>
        <span className="font-semibold">{preview.providerName}</span>
        {preview.modelId && <span className="ml-2 font-mono text-xs text-muted-foreground">{preview.modelId}</span>}
        {preview.promptName && <span className="ml-2 text-xs text-muted-foreground">{`· ${preview.promptName}`}</span>}
      </div>
      <div className={cn("text-xs", preview.keyStatus === "missing" ? "text-destructive" : "text-muted-foreground")}>
        {preview.keyStatus === "missing"
          ? i18n.t("options.service.paste.keyMissing")
          : i18n.t("options.service.sendsTo", [preview.host || "—"])}
      </div>
    </div>
  )
}

/**
 * The translation service is one line: what it is, where page text goes,
 * whether it works. Everything else is the agent's job: the reader hands the
 * agent instructions, then pastes back what the agent produced.
 */
export function ServiceSection() {
  const config = useAtomValue(configAtom)
  const active = config.providersConfig.filter(isAPIProviderConfig).find(p => p.id === config.translate.providerId)

  const [pasting, setPasting] = useState(() => window.location.hash.slice(1) === IMPORT_HASH)
  const [copied, setCopied] = useState(false)
  const [tested, setTested] = useState<TestOutcome | null>(null)

  const hasKey = !!active?.apiKey?.trim()
  const connection: Connection = !hasKey
    ? "unconfigured"
    : tested && tested.providerId === active?.id ? tested.result : "configured"
  const modelId = active && isLLMProviderConfig(active) ? resolveModelId(active.model) : undefined
  const host = active ? getRequestHost({ type: active.provider, baseURL: active.baseURL }) : ""

  const copyInstructions = async () => {
    if (await copyText(buildAgentInstructions(config))) {
      setCopied(true)
      setTimeout(setCopied, COPIED_FEEDBACK_MS, false)
    }
  }

  const runTest = async () => {
    if (!active || !hasKey || connection === "testing")
      return
    setTested({ providerId: active.id, result: "testing" })
    const result = await testProviderConnection(active)
    setTested({ providerId: active.id, result: result.ok ? "ok" : "failed", error: result.ok ? undefined : result.error })
  }

  return (
    <SettingsSection id="service" title={i18n.t("options.service.title")}>
      <SettingsGroup>
        <div className="flex items-center gap-4 px-4 py-3.5">
          <div className="min-w-0 flex-1 truncate text-[13px]">
            {active
              ? (
                  <>
                    <span className="font-semibold">{active.name}</span>
                    {modelId && <span className="ml-2 font-mono text-xs text-muted-foreground">{modelId}</span>}
                    {host && <span className="ml-2 text-xs text-muted-foreground">{`· ${host}`}</span>}
                  </>
                )
              : <span className="text-muted-foreground">{i18n.t("options.service.status.none")}</span>}
          </div>
          <button
            type="button"
            onClick={() => void runTest()}
            disabled={!hasKey || connection === "testing"}
            title={i18n.t("options.service.testConnection")}
            className={cn(
              "flex shrink-0 items-center gap-1.5 text-xs disabled:cursor-default",
              connection === "ok" && "text-emerald-700 dark:text-emerald-400",
              connection === "failed" && "text-destructive",
              connection !== "ok" && connection !== "failed" && "text-muted-foreground",
              hasKey && "cursor-pointer hover:underline",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 rounded-full",
                connection === "ok" && "bg-emerald-600",
                connection === "failed" && "bg-destructive",
                connection === "unconfigured" && "bg-amber-600",
                (connection === "configured" || connection === "testing") && "bg-muted-foreground/50",
              )}
            />
            {i18n.t(CONNECTION_LABEL_KEY[connection])}
          </button>
        </div>
        {tested?.error && tested.providerId === active?.id && (
          <pre className="m-0 whitespace-pre-wrap px-4 py-3 font-sans text-xs leading-[17px] text-destructive">{tested.error}</pre>
        )}
        <div className="flex items-center gap-5 px-4 py-3">
          <TextButton onClick={() => void copyInstructions()}>
            {copied ? i18n.t("options.service.copied") : i18n.t("options.service.copyInstructions")}
          </TextButton>
          <TextButton primary onClick={() => setPasting(open => !open)}>{i18n.t("options.service.paste.open")}</TextButton>
        </div>
        {pasting && (
          <PasteBox
            onApplied={(outcome) => {
              setTested(outcome)
              if (outcome.result === "ok")
                setPasting(false)
            }}
            onCancel={() => setPasting(false)}
          />
        )}
      </SettingsGroup>
    </SettingsSection>
  )
}

/** Paste what the agent put on the clipboard, read two lines, apply. Collapses once the connection is confirmed. */
function PasteBox({ onApplied, onCancel }: { onApplied: (outcome: TestOutcome) => void, onCancel: () => void }) {
  const textareaId = useId()
  const config = useAtomValue(configAtom)
  const setConfig = useSetAtom(writeConfigAtom)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const parsed = useMemo(() => text.trim() ? parseSetupDocument(text) : null, [text])
  const preview = parsed?.ok ? describeSetupDocument(config, parsed.document) : null
  const canApply = !!preview && preview.keyStatus !== "missing" && !busy

  const apply = async () => {
    if (!parsed?.ok)
      return
    setBusy(true)
    setError(null)
    try {
      const { config: next, providerId } = applySetupDocument(config, parsed.document)
      await setConfig(next)
      await clearClipboard()
      const provider = next.providersConfig.find(p => p.id === providerId)
      if (!provider || !isAPIProviderConfig(provider))
        throw new Error("The applied service is not available")
      const result = await testProviderConnection(provider)
      if (!result.ok)
        setError(result.error)
      onApplied({ providerId, result: result.ok ? "ok" : "failed", error: result.ok ? undefined : result.error })
    }
    catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
    finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5">
      <textarea
        id={textareaId}
        ref={textareaRef}
        aria-label={i18n.t("options.service.paste.label")}
        value={text}
        spellCheck={false}
        disabled={busy}
        placeholder={i18n.t("popup.setup.placeholder")}
        onChange={(event) => {
          setText(event.target.value)
          setError(null)
        }}
        className="min-h-[120px] resize-y rounded-lg border border-input bg-background p-3 font-mono text-xs leading-[18px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
      />
      {parsed && !parsed.ok && <pre className="m-0 whitespace-pre-wrap font-sans text-xs leading-[17px] text-destructive">{parsed.error}</pre>}
      {preview && <PreviewLines preview={preview} />}
      {error && <pre className="m-0 whitespace-pre-wrap font-sans text-xs leading-[17px] text-destructive">{error}</pre>}
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="h-8 rounded-lg border border-input bg-card px-3 text-[13px] hover:bg-muted">
          {i18n.t("options.service.paste.cancel")}
        </button>
        <button
          type="button"
          onClick={() => void apply()}
          disabled={!canApply}
          className="h-8 rounded-lg bg-primary px-3.5 text-[13px] font-semibold text-primary-foreground hover:bg-primary/85 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? i18n.t("options.service.paste.applying") : i18n.t("options.service.paste.apply")}
        </button>
      </div>
    </div>
  )
}
