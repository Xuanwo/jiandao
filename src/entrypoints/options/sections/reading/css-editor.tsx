import { useAtom } from "jotai"
import { useMemo, useState } from "react"
import { i18n } from "#imports"
import { Button } from "@/components/ui/button"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { MAX_CUSTOM_CSS_LENGTH } from "@/types/config/translate"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { lintCSS } from "@/utils/css/lint-css"
import { cn } from "@/utils/styles/utils"

/**
 * Custom CSS for translated nodes, validated as you type and saved on demand
 * so a half-typed rule never reaches the page.
 */
export function CSSEditor() {
  const [translateConfig, setTranslateConfig] = useAtom(configFieldsAtomMap.translate)
  const savedCss = translateConfig.translationNodeStyle.customCSS ?? ""
  const [cssInput, setCssInput] = useState(savedCss)
  const debouncedCssInput = useDebouncedValue(cssInput, 500)

  const syntaxCheck = useMemo(() => lintCSS(debouncedCssInput), [debouncedCssInput])

  const hasLengthError = debouncedCssInput.length > MAX_CUSTOM_CSS_LENGTH
  const hasSyntaxError = !syntaxCheck.valid
  const isValidating = cssInput !== debouncedCssInput
  const hasChanges = cssInput !== savedCss
  const canSave = !isValidating && !hasSyntaxError && !hasLengthError && hasChanges

  const handleSave = () => {
    if (!canSave)
      return
    void setTranslateConfig({
      ...translateConfig,
      translationNodeStyle: {
        ...translateConfig.translationNodeStyle,
        customCSS: cssInput,
      },
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={cssInput}
        onChange={event => setCssInput(event.target.value)}
        aria-invalid={hasSyntaxError || hasLengthError || undefined}
        aria-label={i18n.t("options.reading.style.custom")}
        placeholder={i18n.t("options.reading.style.cssPlaceholder")}
        spellCheck={false}
        className={cn(
          "min-h-[160px] max-h-[360px] w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 font-mono text-[13px] leading-5 outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          (hasSyntaxError || hasLengthError) && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/40",
        )}
      />
      <div className="flex items-center justify-between gap-2">
        <div className={cn("text-xs text-muted-foreground", (hasSyntaxError || hasLengthError) && "text-destructive")}>
          {cssInput.trim().length > 0 ? getValidationMessage(isValidating, syntaxCheck.errors[0], hasLengthError, hasChanges) : ""}
        </div>
        <Button size="sm" onClick={handleSave} disabled={!canSave}>
          {hasChanges ? i18n.t("options.reading.style.css.save") : i18n.t("options.reading.style.css.saved")}
        </Button>
      </div>
    </div>
  )
}

function getValidationMessage(isValidating: boolean, syntaxError: string | undefined, hasLengthError: boolean, hasChanges: boolean) {
  if (isValidating)
    return i18n.t("options.reading.style.css.validating")
  if (syntaxError)
    return `${i18n.t("options.reading.style.css.syntaxError")} · ${syntaxError}`
  if (hasLengthError)
    return i18n.t("options.reading.style.css.tooLong")
  if (!hasChanges)
    return i18n.t("options.reading.style.css.allSaved")
  return i18n.t("options.reading.style.css.valid")
}
