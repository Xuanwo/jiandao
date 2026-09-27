import type { ReactNode } from "react"
import { cn } from "@/utils/styles/utils"

/** A titled block. The title has to carry the meaning on its own; there is no explanatory sentence under it. */
export function SettingsSection({ id, title, children, className }: {
  id: string
  title: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section id={id} className={cn("flex scroll-mt-8 flex-col gap-3", className)}>
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  )
}

/** The one container style on the page: rows separated by hairlines. */
export function SettingsGroup({ children, className }: { children: ReactNode, className?: string }) {
  return (
    <div className={cn("flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card", className)}>
      {children}
    </div>
  )
}

export function SettingsRow({ label, htmlFor, control, children, className }: {
  label: ReactNode
  htmlFor?: string
  /** Control rendered on the right of the label. */
  control?: ReactNode
  /** Content rendered below the label row, full width. */
  children?: ReactNode
  className?: string
}) {
  const LabelTag = htmlFor ? "label" : "div"

  return (
    <div className={cn("flex flex-col gap-3 px-4 py-3.5", className)}>
      <div className="flex items-center justify-between gap-4">
        <LabelTag htmlFor={htmlFor} className="text-[13px] font-medium">{label}</LabelTag>
        {control && <div className="shrink-0">{control}</div>}
      </div>
      {children}
    </div>
  )
}
