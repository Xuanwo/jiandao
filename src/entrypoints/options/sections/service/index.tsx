import { useAtomValue, useSetAtom } from "jotai"
import { useState } from "react"
import { i18n } from "#imports"
import { isAPIProviderConfig } from "@/types/config/provider"
import { configAtom, writeConfigAtom } from "@/utils/atoms/config"
import { copyText } from "@/utils/clipboard"
import { buildFeatureProviderPatch } from "@/utils/constants/feature-providers"
import { DEFAULT_PROVIDER_CONFIG_LIST } from "@/utils/constants/providers"
import { testProviderConnection } from "@/utils/providers/test-connection"
import { buildAgentInstructions } from "@/utils/setup-agent-instructions"
import { exportSetupDocument, stringifySetupDocument } from "@/utils/setup-document"
import { cn } from "@/utils/styles/utils"
import { ConfirmAction } from "../../components/confirm-action"
import { SettingsGroup, SettingsSection } from "../../components/settings-section"
import { ImportPanel } from "./import-panel"
import { ServiceRow } from "./service-row"

export const IMPORT_HASH = "import"

const COPIED_FEEDBACK_MS = 2000

type TestState = { status: "idle" } | { status: "testing" } | { status: "ok" } | { status: "error", error: string }

function ActionButton({ onClick, tone = "muted", children, disabled }: { onClick: () => void, tone?: "muted" | "link" | "destructive", children: React.ReactNode, disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "text-[13px] transition-colors hover:underline disabled:cursor-not-allowed disabled:opacity-50",
        tone === "link" && "font-medium text-link",
        tone === "muted" && "text-muted-foreground hover:text-foreground",
        tone === "destructive" && "text-destructive",
      )}
    >
      {children}
    </button>
  )
}

/**
 * The translation service is configured by an agent, never by hand: this
 * section shows what is stored, lets the reader import what the agent
 * produced, and hands the agent the current state to change it.
 */
export function ServiceSection() {
  const config = useAtomValue(configAtom)
  const setConfig = useSetAtom(writeConfigAtom)
  const [importOpen, setImportOpen] = useState(() => window.location.hash.slice(1) === IMPORT_HASH)
  const [copied, setCopied] = useState<"config" | "instructions" | null>(null)
  // A test result belongs to the service it ran against; switching services shows no stale result.
  const [testResult, setTestResult] = useState<{ providerId: string, state: TestState } | null>(null)

  // Plainly has one translation service. Switching to another one is an import, so nothing here selects.
  const active = config.providersConfig.filter(isAPIProviderConfig).find(p => p.id === config.translate.providerId)
  const test: TestState = testResult && testResult.providerId === active?.id ? testResult.state : { status: "idle" }

  const flashCopied = (what: "config" | "instructions") => {
    setCopied(what)
    setTimeout(() => setCopied(current => current === what ? null : current), COPIED_FEEDBACK_MS)
  }

  const copyConfiguration = async () => {
    const exported = exportSetupDocument(config)
    if (exported && await copyText(stringifySetupDocument(exported)))
      flashCopied("config")
  }

  const copyInstructions = async () => {
    if (await copyText(buildAgentInstructions(config)))
      flashCopied("instructions")
  }

  const runTest = async () => {
    if (!active)
      return
    setTestResult({ providerId: active.id, state: { status: "testing" } })
    const result = await testProviderConnection(active)
    setTestResult({ providerId: active.id, state: result.ok ? { status: "ok" } : { status: "error", error: result.error } })
  }

  const removeActive = async () => {
    if (!active)
      return
    const remaining = config.providersConfig.filter(p => p.id !== active.id)
    const fallback = remaining.find(p => isAPIProviderConfig(p) && p.enabled) ?? remaining[0]
    if (fallback) {
      await setConfig({ ...buildFeatureProviderPatch({ translate: fallback.id }), providersConfig: remaining })
      return
    }
    // Nothing left: back to the defaults without keys, which brings the setup card back in the popup.
    await setConfig({ ...buildFeatureProviderPatch({ translate: DEFAULT_PROVIDER_CONFIG_LIST[0].id }), providersConfig: DEFAULT_PROVIDER_CONFIG_LIST })
  }

  return (
    <SettingsSection
      id="service"
      title={i18n.t("options.service.title")}
      description={i18n.t("options.service.description")}
    >
      <SettingsGroup>
        {active && <ServiceRow provider={active} connection={test} />}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <ActionButton tone="link" onClick={() => setImportOpen(open => !open)}>{i18n.t("options.service.import")}</ActionButton>
          <ActionButton onClick={() => void copyConfiguration()} disabled={!active?.apiKey}>
            {copied === "config" ? i18n.t("options.service.copied") : i18n.t("options.service.export")}
          </ActionButton>
          <ActionButton onClick={() => void copyInstructions()}>
            {copied === "instructions" ? i18n.t("options.service.copied") : i18n.t("options.service.copyInstructions")}
          </ActionButton>
          <ActionButton onClick={() => void runTest()} disabled={!active?.apiKey || test.status === "testing"}>
            {test.status === "testing" ? i18n.t("options.service.testing") : i18n.t("options.service.test")}
          </ActionButton>
          {active && (
            <div className="ml-auto">
              <ConfirmAction
                trigger={<button type="button" className="text-[13px] text-destructive hover:underline">{i18n.t("options.service.remove")}</button>}
                title={i18n.t("options.service.removeDialog.title", [active.name])}
                description={i18n.t("options.service.removeDialog.description")}
                confirmLabel={i18n.t("options.service.removeDialog.confirm")}
                cancelLabel={i18n.t("options.service.removeDialog.cancel")}
                onConfirm={removeActive}
              />
            </div>
          )}
        </div>
        {test.status === "error" && (
          <pre className="m-0 whitespace-pre-wrap border-t border-border px-4 py-3 font-sans text-xs leading-[17px] text-destructive">{test.error}</pre>
        )}
      </SettingsGroup>
      {importOpen && <ImportPanel onClose={() => setImportOpen(false)} />}
    </SettingsSection>
  )
}
