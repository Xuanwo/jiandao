import { useAtom } from "jotai"
import { i18n } from "#imports"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { cn } from "@/utils/styles/utils"

/**
 * Turns English word-prefix emphasis on and off for every page. It sits in
 * the footer, apart from the translation controls, because it works on pages
 * that are not translated too.
 */
export function WordPrefixEmphasisToggle() {
  const [readingConfig, setReadingConfig] = useAtom(configFieldsAtomMap.reading)
  const on = readingConfig.wordPrefixEmphasis
  const label = i18n.t("popup.wordPrefixEmphasis")

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={() => void setReadingConfig({ wordPrefixEmphasis: !on })}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md font-serif text-sm leading-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
        on ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <span aria-hidden="true">
        <span className="font-bold">A</span>
        b
      </span>
    </button>
  )
}
