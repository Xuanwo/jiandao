import { i18n } from "#imports"
import { toast } from "@/components/toast"

interface NumberSettingProps {
  id: string
  label: string
  value: number
  min: number
  max?: number
  step?: number
  onChange: (value: number) => void
}

/**
 * Compact numeric row for the advanced section. Out-of-range input is
 * reported once and not persisted, matching the config schema bounds.
 */
export function NumberSetting({ id, label, value, min, max, step, onChange }: NumberSettingProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-[13px]">{label}</label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (Number.isNaN(next) || next < min || (max !== undefined && next > max)) {
            toast.error(max === undefined
              ? i18n.t("options.advanced.minError", [String(min)])
              : i18n.t("options.advanced.rangeError", [String(min), String(max)]))
            return
          }
          onChange(next)
        }}
        className="h-8 w-24 rounded-md border border-input bg-background px-2 text-right text-[13px] tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </div>
  )
}
