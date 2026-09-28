import type { ComponentProps } from "react"
import { cn } from "@/utils/styles/utils"

const VARIANT_CLASS = {
  default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
  outline: "border-input bg-card hover:bg-muted hover:text-foreground",
  destructive: "border-transparent bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20",
} as const

const SIZE_CLASS = {
  default: "h-8 gap-1.5 px-2.5 text-sm",
  sm: "h-7 gap-1 px-2.5 text-[0.8rem]",
} as const

export type ButtonProps = ComponentProps<"button"> & {
  variant?: keyof typeof VARIANT_CLASS
  size?: keyof typeof SIZE_CLASS
}

export function Button({ className, variant = "default", size = "default", type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md border font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        className,
      )}
      {...props}
    />
  )
}
