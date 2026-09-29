import type { ConnectionCheck, ProviderConfig } from "@/types/config/provider"
import type { SetupPreview, SetupTarget } from "@/utils/setup-document"
import { useAtomValue, useSetAtom, useStore } from "jotai"
import { useEffect, useMemo, useRef, useState } from "react"
import { i18n } from "#imports"
import { ConfirmAction } from "@/components/confirm-action"
import { IconCheck, IconCopy } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { configAtom, configFieldsAtomMap, writeConfigAtom } from "@/utils/atoms/config"
import { clearClipboard, copyText } from "@/utils/clipboard"
import { deepEqual } from "@/utils/object"
import { getRequestHost, resolveRequestApi } from "@/utils/providers/request"
import { checkConnection, withConnectionCheck } from "@/utils/providers/test-connection"
import { formatRelativeTime } from "@/utils/relative-time"
import { buildAgentInstructions } from "@/utils/setup-agent-instructions"
import { applySetupDocument, describeSetupDocument, describesThinkingOff, exportSetupDocument, maskApiKey, parseSetupDocument, stringifySetupDocument } from "@/utils/setup-document"
import { cn } from "@/utils/styles/utils"
import { SettingsSection } from "../../components/settings-section"

const COPIED_FEEDBACK_MS = 2000
const MONO = "font-mono text-xs text-muted-foreground"

/*
 * The translation service is a preview by default. The editor appears in
 * place only when it is needed: right away while no service is configured,
 * otherwise after "Edit". Its text is the service part of a setup document;
 * applying it first checks the connection and saves only when that works,
 * so a failed attempt never replaces the service in use. See
 * design/Service-States.html.
 */
export function ServiceSection() {
  const config = useAtomValue(configAtom)
  const store = useStore()
  const setConfig = useSetAtom(writeConfigAtom)
  const setTranslate = useSetAtom(configFieldsAtomMap.translate)
  const [target, setTarget] = useState<SetupTarget | null>(null)
  const [error, setError] = useState<string | null>(null)
  const active = config.providersConfig.find(p => p.id === config.translate.providerId)
  const initialSetup = config.providersConfig.length === 1 && !active?.apiKey?.trim()
  const editorTarget = target ?? (initialSetup && active ? { kind: "edit" as const, providerId: active.id } : null)
  const current = editorTarget?.kind === "edit" ? config.providersConfig.find(p => p.id === editorTarget.providerId) : undefined

  const remove = async (id: string) => {
    const latest = store.get(configAtom)
    if (latest.translate.providerId === id || latest.providersConfig.length <= 1) {
      setError(i18n.t("options.service.deleteActive"))
      return
    }
    try {
      await setConfig({ providersConfig: latest.providersConfig.filter(p => p.id !== id) })
    }
    catch {
      setError(i18n.t("options.service.saveFailed"))
    }
  }

  return (
    <SettingsSection id="service" title={i18n.t("options.service.title")}>
      {editorTarget
        ? <div className="flex flex-col gap-3.5 rounded-xl border border-border bg-card px-[18px] py-4"><ServiceEditor key={editorTarget.kind === "edit" ? editorTarget.providerId : "add"} target={editorTarget} current={current} initialSetup={initialSetup} onDone={() => setTarget(null)} /></div>
        : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">{i18n.t("options.service.switchHint")}</p>
                <Button variant="outline" onClick={() => setTarget({ kind: "add" })}>{i18n.t("options.service.add")}</Button>
              </div>
              {config.providersConfig.map(provider => (
                <article key={provider.id} aria-label={provider.name} className="flex flex-col gap-3 rounded-xl border border-border bg-card px-[18px] py-4">
                  <ServicePreview provider={provider} active={provider.id === config.translate.providerId} onEdit={() => setTarget({ kind: "edit", providerId: provider.id })}>
                    {provider.id !== config.translate.providerId && (
                      <Button
                        variant="outline"
                        disabled={!provider.enabled || !provider.apiKey?.trim()}
                        onClick={() => {
                          const latest = store.get(configAtom).providersConfig.find(p => p.id === provider.id)
                          if (latest?.enabled && latest.apiKey?.trim())
                            void setTranslate({ providerId: latest.id }).catch(() => setError(i18n.t("options.service.saveFailed")))
                        }}
                      >
                        {i18n.t("options.service.select")}
                      </Button>
                    )}
                    <ConfirmAction
                      disabled={provider.id === config.translate.providerId || config.providersConfig.length <= 1}
                      trigger={props => <Button variant="outline" {...props}>{i18n.t("options.service.delete")}</Button>}
                      title={i18n.t("options.service.deleteTitle")}
                      description={i18n.t("options.service.deleteDescription", [provider.name])}
                      confirmLabel={i18n.t("options.service.delete")}
                      cancelLabel={i18n.t("options.service.cancel")}
                      onConfirm={() => remove(provider.id)}
                    />
                  </ServicePreview>
                  {provider.id === config.translate.providerId && <span className="text-xs text-muted-foreground">{i18n.t("options.service.deleteActive")}</span>}
                </article>
              ))}
            </div>
          )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </SettingsSection>
  )
}

function Dot({ className }: { className: string }) {
  return <span aria-hidden="true" className={cn("inline-block size-1.5 shrink-0 rounded-full", className)} />
}

function Details({ parts }: { parts: string[] }) {
  return <span className="text-xs text-muted-foreground">{parts.join(" · ")}</span>
}

function NameAndModel({ name, model, size = "text-sm" }: { name: string, model: string, size?: string }) {
  return (
    <div className="min-w-0 truncate">
      <span className={cn("font-semibold", size)}>{name}</span>
      {model && <span className={cn("ml-2", MONO)}>{model}</span>}
    </div>
  )
}

function CopyInstructionsButton({ target }: { target: SetupTarget }) {
  const store = useStore()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (await copyText(buildAgentInstructions(store.get(configAtom), target))) {
      setCopied(true)
      setTimeout(setCopied, COPIED_FEEDBACK_MS, false)
    }
  }
  return (
    <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground">
      {copied ? <IconCheck className="size-3.5" aria-hidden="true" /> : <IconCopy className="size-3.5" aria-hidden="true" />}
      {copied ? i18n.t("options.service.copied") : i18n.t("options.service.copyInstructions")}
    </button>
  )
}

/* ──────────────────────────────
  Preview
  ────────────────────────────── */

function checkStatus(check: ConnectionCheck | undefined, now: number) {
  const locale = navigator.language
  if (!check)
    return { dot: "bg-muted-foreground/50", tone: "text-muted-foreground", label: i18n.t("options.service.status.unchecked"), when: null }
  const when = i18n.t("options.service.checkedAt", [formatRelativeTime(check.checkedAt, now, locale)])
  return check.ok
    ? { dot: "bg-success", tone: "text-success", label: i18n.t("options.service.status.ok"), when }
    : { dot: "bg-destructive", tone: "text-destructive", label: i18n.t("options.service.status.failed"), when }
}

function serviceDetails(provider: ProviderConfig): string[] {
  const parts = [i18n.t("options.service.sendsTo", [getRequestHost(provider)])]
  if (provider.apiKey)
    parts.push(i18n.t("options.service.key", [maskApiKey(provider.apiKey)]))
  if (describesThinkingOff(provider.body, resolveRequestApi(provider)))
    parts.push(i18n.t("options.service.thinkingOff"))
  return parts
}

function ServicePreview({ provider, active, onEdit, children }: { provider: ProviderConfig, active: boolean, onEdit: () => void, children: React.ReactNode }) {
  const store = useStore()
  const setConfig = useSetAtom(writeConfigAtom)
  const [testing, setTesting] = useState(false)
  // Read once per mount; "2 hours ago" does not need to tick while the page is open.
  const [now] = useState(Date.now)
  const status = checkStatus(provider.connectionCheck, provider.connectionCheck ? Math.max(now, provider.connectionCheck.checkedAt) : now)

  const test = async () => {
    setTesting(true)
    try {
      const check = await checkConnection(provider)
      await setConfig({ providersConfig: withConnectionCheck(store.get(configAtom), provider.id, check).providersConfig })
    }
    finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
        <div className="flex flex-wrap items-center gap-3">
          <NameAndModel name={provider.name} model={provider.model} />
          {active && <span className="text-xs text-link">{i18n.t("options.service.active")}</span>}
        </div>
        <Details parts={serviceDetails(provider)} />
        <div className="flex items-center gap-1.5 text-xs" data-testid="service-status">
          <Dot className={testing ? "bg-muted-foreground/50" : status.dot} />
          <span className={testing ? "text-muted-foreground" : status.tone}>{testing ? i18n.t("options.service.testing") : status.label}</span>
          {!testing && status.when && <span className="text-muted-foreground">{`· ${status.when}`}</span>}
        </div>
        {!testing && provider.connectionCheck?.error && (
          <code className="block whitespace-pre-wrap font-mono text-xs leading-[17px] text-muted-foreground">{provider.connectionCheck.error}</code>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="px-3.5 text-[13px] font-normal" disabled={testing} onClick={() => void test()}>
          {i18n.t("options.service.test")}
        </Button>
        <Button variant="outline" className="px-3.5 text-[13px] font-normal" disabled={testing} onClick={onEdit}>
          {i18n.t("options.service.edit")}
        </Button>
        {children}
      </div>
    </div>
  )
}

/* ──────────────────────────────
  Editor
  ────────────────────────────── */

function Labeled({ label, tone, children }: { label: string, tone?: string, children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)] items-baseline gap-3">
      <span className={cn("text-xs text-muted-foreground", tone)}>{label}</span>
      <div className="flex min-w-0 flex-col gap-[3px]">{children}</div>
    </div>
  )
}

function previewDetails(preview: SetupPreview): string[] {
  const parts = [i18n.t("options.service.sendsTo", [preview.host || "—"])]
  if (preview.keyStatus === "new")
    parts.push(i18n.t("options.service.newKey"))
  else if (preview.keyStatus === "reused")
    parts.push(i18n.t("options.service.keptKey"))
  if (preview.thinkingOff)
    parts.push(i18n.t("options.service.thinkingOff"))
  return parts
}

function ServiceEditor({ current, target, initialSetup, onDone }: { current: ProviderConfig | undefined, target: SetupTarget, initialSetup: boolean, onDone: () => void }) {
  const store = useStore()
  const config = useAtomValue(configAtom)
  const setConfig = useSetAtom(writeConfigAtom)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // The editor opens on the current service, masked, so a field can be changed in place.
  const [initial] = useState(() => {
    const exported = current?.apiKey ? exportSetupDocument(config, current.id) : null
    return exported ? stringifySetupDocument(exported) : ""
  })
  const [text, setText] = useState(initial)
  const [applying, setApplying] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  // A first setup shows the preview as soon as the service is saved, which
  // unmounts this editor before apply() returns. Closing then would close an
  // editor the reader has opened again since.
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea)
      return
    textarea.focus()
    // Selected, so pasting what the agent put on the clipboard replaces it whole.
    if (initial)
      textarea.select()
  }, [initial])

  const parsed = useMemo(() => text.trim() ? parseSetupDocument(text) : null, [text])
  const unchanged = !!current && !!parsed?.ok && deepEqual(parsed.document, exportSetupDocument(config, current.id))
  const preview = parsed?.ok && !unchanged && (target.kind === "add" || current) ? describeSetupDocument(config, parsed.document, target) : null
  const canApply = !!preview && preview.keyStatus !== "missing" && !applying

  const apply = async () => {
    if (!parsed?.ok)
      return
    setApplying(true)
    setFailure(null)
    try {
      const original = current
      const { config: next, providerId } = applySetupDocument(store.get(configAtom), parsed.document, target)
      const provider = next.providersConfig.find(p => p.id === providerId)!
      const check = await checkConnection(provider)
      if (!check.ok) {
        setFailure(check.error ?? "")
        return
      }
      const latest = store.get(configAtom)
      if (target.kind === "edit") {
        const updated = latest.providersConfig.find(p => p.id === target.providerId)
        if (!original || !updated || !deepEqual({ ...original, connectionCheck: undefined }, { ...updated, connectionCheck: undefined })) {
          setFailure(i18n.t("options.service.stale"))
          return
        }
      }
      const saved = { ...provider, connectionCheck: check }
      const names = latest.providersConfig.filter(p => p.id !== saved.id)
      if (names.some(p => p.name === saved.name)) {
        setFailure(i18n.t("options.service.stale"))
        return
      }
      await setConfig({ providersConfig: target.kind === "add" ? [...latest.providersConfig, saved] : latest.providersConfig.map(p => p.id === saved.id ? saved : p) })
      await clearClipboard()
      if (mountedRef.current)
        onDone()
    }
    catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
    }
    finally {
      setApplying(false)
    }
  }

  const rows = Math.max(5, text.split("\n").length)

  return (
    <>
      {current && !initialSetup
        ? (
            <Labeled label={i18n.t("options.service.label.current")}>
              <NameAndModel name={current.name} model={current.model} size="text-[13px]" />
            </Labeled>
          )
        : (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                <Dot className="bg-attention" />
                {i18n.t(initialSetup ? "options.service.empty.title" : "options.service.add")}
              </div>
              <p className="m-0 text-xs leading-[18px] text-muted-foreground">{i18n.t(initialSetup ? "options.service.empty.description" : "options.service.savedOnly")}</p>
            </div>
          )}
      {current && !initialSetup && <p className="text-xs text-muted-foreground">{i18n.t("options.service.savedOnly")}</p>}
      <textarea
        ref={textareaRef}
        aria-label={i18n.t("options.service.editorLabel")}
        value={text}
        spellCheck={false}
        disabled={applying}
        placeholder={i18n.t("options.service.placeholder")}
        style={{ height: `${rows * 18 + 24}px` }}
        onChange={(event) => {
          setText(event.target.value)
          setFailure(null)
        }}
        className="w-full resize-y rounded-lg border border-input bg-card px-3 py-[11px] font-mono text-xs leading-[18px] outline-none selection:bg-link/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:opacity-60"
      />
      {parsed && !parsed.ok && (
        <Labeled label={i18n.t("options.service.label.after")} tone="text-destructive">
          <pre className="m-0 whitespace-pre-wrap font-sans text-xs leading-[17px] text-destructive">{parsed.error}</pre>
        </Labeled>
      )}
      {unchanged && (
        <Labeled label={i18n.t("options.service.label.after")}>
          <span className="text-xs text-muted-foreground">{i18n.t("options.service.unchanged")}</span>
        </Labeled>
      )}
      {preview && (
        <Labeled label={i18n.t("options.service.label.after")}>
          <NameAndModel name={preview.providerName} model={preview.modelId} size="text-[13px]" />
          {preview.keyStatus === "missing"
            ? <span className="text-xs text-destructive">{i18n.t("options.service.keyMissing")}</span>
            : <Details parts={previewDetails(preview)} />}
        </Labeled>
      )}
      {failure !== null && (
        <Labeled label={i18n.t("options.service.label.connection")}>
          <div className="flex items-center gap-1.5 text-[13px] text-destructive">
            <Dot className="bg-destructive" />
            {i18n.t("options.service.failedNotSaved")}
          </div>
          {failure && <code className="block whitespace-pre-wrap font-mono text-xs leading-[17px] text-muted-foreground">{failure}</code>}
        </Labeled>
      )}
      <div className="flex items-center gap-2 pt-1">
        <div className="flex-1"><CopyInstructionsButton target={target} /></div>
        {!initialSetup && (
          <Button variant="outline" className="px-3.5 text-[13px] font-normal" disabled={applying} onClick={onDone}>
            {i18n.t("options.service.cancel")}
          </Button>
        )}
        <Button className="px-4 text-[13px] font-semibold" disabled={!canApply} onClick={() => void apply()}>
          {applying ? i18n.t("options.service.applying") : i18n.t("options.service.apply")}
        </Button>
      </div>
    </>
  )
}
