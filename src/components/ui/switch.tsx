import type { ComponentProps } from "react"
import { cn } from "@/utils/styles/utils"

interface SwitchProps extends Omit<ComponentProps<"button">, "onChange" | "type" | "role"> {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
}

/** A native button with the switch role; `data-checked`/`data-unchecked` drive the styling. */
export function Switch({ checked, onCheckedChange, className, disabled, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-checked={checked || undefined}
      data-unchecked={!checked || undefined}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-checked:bg-primary data-unchecked:bg-input",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none block size-4 rounded-full bg-background transition-transform data-checked:translate-x-[calc(100%-2px)] data-unchecked:translate-x-0 dark:data-unchecked:bg-foreground dark:data-checked:bg-primary-foreground"
        data-checked={checked || undefined}
        data-unchecked={!checked || undefined}
      />
    </button>
  )
}
