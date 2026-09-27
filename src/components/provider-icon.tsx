import type { ProviderType } from "@/types/config/provider"
import { PROVIDER_ITEMS } from "@/utils/constants/providers"
import { cn } from "@/utils/styles/utils"

type ProviderIconSize = "sm" | "base" | "md"

const containerSizeClass: Record<ProviderIconSize, string> = {
  sm: "size-4 text-[9px]",
  base: "size-5 text-[10px]",
  md: "size-7 text-xs",
}

const textSizeClass: Record<ProviderIconSize, string> = {
  sm: "text-xs",
  base: "text-sm",
  md: "text-base",
}

interface ProviderIconProps {
  providerType: ProviderType
  name?: string
  size?: ProviderIconSize
  className?: string
  textClassName?: string
}

/**
 * Provider mark drawn from a monogram so the extension never loads a logo
 * from a remote host.
 */
export default function ProviderIcon({ providerType, name, size = "base", className, textClassName }: ProviderIconProps) {
  const monogram = PROVIDER_ITEMS[providerType].monogram

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold tracking-tight text-foreground/80 select-none",
          containerSizeClass[size],
        )}
      >
        {monogram}
      </span>
      {name && <span className={cn("truncate", textSizeClass[size], textClassName)}>{name}</span>}
    </div>
  )
}
