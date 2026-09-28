import type { ReactNode, Ref } from "react"
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

/** The one container style on the page: rows separated by hairlines, with an optional caption above that names when the rows apply. */
export function SettingsGroup({ caption, children, className }: { caption?: ReactNode, children: ReactNode, className?: string }) {
  const group = (
    <div className={cn("flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card", className)}>
      {children}
    </div>
  )
  if (!caption)
    return group
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">{caption}</p>
      {group}
    </div>
  )
}

/** Sample text at the top of a group. It shows the result of the settings below it and follows each change. */
export function SettingsPreview({ ref, children, className }: { ref?: Ref<HTMLDivElement>, children: ReactNode, className?: string }) {
  return (
    <div ref={ref} className={cn("flex flex-col gap-1.5 bg-background/50 px-[18px] py-4 text-sm leading-[1.65]", className)}>
      {children}
    </div>
  )
}

export function SettingsRow({ label, description, htmlFor, control, children, className }: {
  label: ReactNode
  /** One line under the label that says what the setting does. */
  description?: ReactNode
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
        {description
          ? (
              <div className="flex min-w-0 flex-col gap-0.5">
                <LabelTag htmlFor={htmlFor} className="text-[13px] font-medium">{label}</LabelTag>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
            )
          : <LabelTag htmlFor={htmlFor} className="text-[13px] font-medium">{label}</LabelTag>}
        {control && <div className="shrink-0">{control}</div>}
      </div>
      {children}
    </div>
  )
}
