import type { ThemeMode } from "@/types/config/theme"
import { i18n } from "#imports"
import { useTheme } from "@/components/providers/theme-provider"
import { SegmentedControl } from "@/components/segmented-control"
import { themeModes } from "@/types/config/theme"

const THEME_LABEL_KEY = {
  system: "options.appearance.system",
  light: "options.appearance.light",
  dark: "options.appearance.dark",
} as const satisfies Record<ThemeMode, string>

export function SettingsFooter() {
  const { themeMode, setThemeMode } = useTheme()

  return (
    <div className="flex items-center gap-3 border-t border-border pt-5">
      <span className="text-xs text-muted-foreground">{i18n.t("options.appearance.title")}</span>
      <SegmentedControl
        size="sm"
        aria-label={i18n.t("options.appearance.title")}
        value={themeMode}
        options={themeModes.map(mode => ({ value: mode, label: i18n.t(THEME_LABEL_KEY[mode]) }))}
        onChange={setThemeMode}
      />
    </div>
  )
}
