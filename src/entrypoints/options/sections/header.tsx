import { i18n } from "#imports"

export function SettingsHeader() {
  return <h1 className="text-[22px] font-bold tracking-tight">{i18n.t("options.title")}</h1>
}
