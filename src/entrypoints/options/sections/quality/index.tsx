import type { Config } from "@/types/config/config"
import { useAtom } from "jotai"
import { useId, useState } from "react"
import { i18n } from "#imports"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { DEFAULT_TRANSLATE_PROMPT, DEFAULT_TRANSLATE_SYSTEM_PROMPT, getTokenCellText, INPUT } from "@/utils/constants/prompt"
import { deepMerge } from "@/utils/object"
import { cn } from "@/utils/styles/utils"
import { SettingsGroup, SettingsRow, SettingsSection } from "../../components/settings-section"

type PromptsConfig = Config["translate"]["customPromptsConfig"]

interface PromptTexts {
  systemPrompt: string
  prompt: string
}

const CUSTOM_PROMPT_ID = "custom"
const DEFAULT_PROMPT: PromptTexts = { systemPrompt: DEFAULT_TRANSLATE_SYSTEM_PROMPT, prompt: DEFAULT_TRANSLATE_PROMPT }

function activePrompt({ promptId, patterns }: PromptsConfig): PromptTexts | null {
  const pattern = promptId ? patterns.find(p => p.id === promptId) : undefined
  return pattern ? { systemPrompt: pattern.systemPrompt, prompt: pattern.prompt } : null
}

/** Texts equal to the built-in prompt are stored as "no custom prompt", so later changes to the default reach this reader. */
function toPromptsConfig(texts: PromptTexts): PromptsConfig {
  if (texts.systemPrompt === DEFAULT_PROMPT.systemPrompt && texts.prompt === DEFAULT_PROMPT.prompt)
    return { promptId: null, patterns: [] }
  return { promptId: CUSTOM_PROMPT_ID, patterns: [{ id: CUSTOM_PROMPT_ID, name: "Custom", ...texts }] }
}

/** What the model is told: whether it sees the whole page, and the prompt itself, edited in place. */
export function QualitySection() {
  const [translateConfig, setTranslateConfig] = useAtom(configFieldsAtomMap.translate)
  const contextSwitchId = useId()
  const [editing, setEditing] = useState(false)
  const custom = activePrompt(translateConfig.customPromptsConfig)

  return (
    <SettingsSection id="quality" title={i18n.t("options.quality.title")}>
      <SettingsGroup>
        <SettingsRow
          label={i18n.t("options.quality.context.title")}
          htmlFor={contextSwitchId}
          control={(
            <Switch
              id={contextSwitchId}
              checked={translateConfig.enableAIContentAware}
              onCheckedChange={checked => void setTranslateConfig(deepMerge(translateConfig, { enableAIContentAware: checked }))}
            />
          )}
        />
        {editing
          ? (
              <PromptEditor
                initial={custom ?? DEFAULT_PROMPT}
                isCustom={!!custom}
                onCancel={() => setEditing(false)}
                onApply={async (texts) => {
                  await setTranslateConfig({ ...translateConfig, customPromptsConfig: toPromptsConfig(texts) })
                  setEditing(false)
                }}
              />
            )
          : (
              <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                <div className="flex min-w-0 items-baseline gap-2.5">
                  <span className="text-[13px] font-medium">{i18n.t("options.quality.prompt.title")}</span>
                  <span className="text-[13px] text-muted-foreground">
                    {custom ? i18n.t("options.quality.prompt.custom") : i18n.t("options.quality.prompt.default")}
                  </span>
                </div>
                <Button variant="outline" className="px-3.5 text-[13px] font-normal" onClick={() => setEditing(true)}>
                  {i18n.t("options.quality.prompt.edit")}
                </Button>
              </div>
            )}
      </SettingsGroup>
    </SettingsSection>
  )
}

function PromptTextarea({ label, value, rows, autoFocus, onChange }: { label: string, value: string, rows: number, autoFocus?: boolean, onChange: (value: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <textarea
        value={value}
        spellCheck={false}
        autoFocus={autoFocus}
        style={{ height: `${rows * 18 + 24}px` }}
        onChange={event => onChange(event.target.value)}
        className="w-full resize-y rounded-lg border border-input bg-card px-3 py-[11px] font-mono text-xs leading-[18px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20"
      />
    </label>
  )
}

function PromptEditor({ initial, isCustom, onCancel, onApply }: {
  initial: PromptTexts
  isCustom: boolean
  onCancel: () => void
  onApply: (texts: PromptTexts) => Promise<void>
}) {
  const [texts, setTexts] = useState(initial)
  const [applying, setApplying] = useState(false)
  const inputToken = getTokenCellText(INPUT)
  const missingInput = !texts.prompt.includes(inputToken)
  const willBeCustom = toPromptsConfig(texts).promptId !== null
  const changed = texts.systemPrompt !== initial.systemPrompt || texts.prompt !== initial.prompt

  const apply = async () => {
    setApplying(true)
    try {
      await onApply(texts)
    }
    finally {
      setApplying(false)
    }
  }

  const label = (custom: boolean) => custom ? i18n.t("options.quality.prompt.custom") : i18n.t("options.quality.prompt.default")

  return (
    <div className="flex flex-col gap-3.5 px-4 py-3.5">
      <div className="flex items-baseline gap-2.5">
        <span className="text-[13px] font-medium">{i18n.t("options.quality.prompt.title")}</span>
        <span className="text-[13px] text-muted-foreground">
          {willBeCustom === isCustom ? label(isCustom) : `${label(isCustom)} → ${label(willBeCustom)}`}
        </span>
      </div>
      <PromptTextarea
        label={i18n.t("options.quality.prompt.system")}
        value={texts.systemPrompt}
        rows={14}
        autoFocus
        onChange={systemPrompt => setTexts(current => ({ ...current, systemPrompt }))}
      />
      <PromptTextarea
        label={i18n.t("options.quality.prompt.template")}
        value={texts.prompt}
        rows={4}
        onChange={prompt => setTexts(current => ({ ...current, prompt }))}
      />
      <p className={cn("m-0 text-xs leading-[17px]", missingInput ? "text-destructive" : "text-muted-foreground")}>
        {missingInput ? i18n.t("options.quality.prompt.missingInput") : i18n.t("options.quality.prompt.tokens")}
      </p>
      <div className="flex items-center gap-2 pt-1">
        <div className="flex-1">
          <button
            type="button"
            onClick={() => setTexts(DEFAULT_PROMPT)}
            className="text-[13px] text-muted-foreground hover:text-foreground"
          >
            {i18n.t("options.quality.prompt.restore")}
          </button>
        </div>
        <Button variant="outline" className="px-3.5 text-[13px] font-normal" disabled={applying} onClick={onCancel}>
          {i18n.t("options.quality.prompt.cancel")}
        </Button>
        <Button className="px-4 text-[13px] font-semibold" disabled={!changed || missingInput || applying} onClick={() => void apply()}>
          {i18n.t("options.quality.prompt.apply")}
        </Button>
      </div>
    </div>
  )
}
