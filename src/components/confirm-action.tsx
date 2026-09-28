import type { ReactNode } from "react"
import { useEffect, useId, useRef, useState } from "react"
import { Button } from "@/components/ui/button"

interface ConfirmActionProps {
  /** Renders the element that opens the dialog; spread the props onto it. */
  trigger: (props: { onClick: () => void, disabled: boolean | undefined }) => ReactNode
  title: ReactNode
  description: ReactNode
  confirmLabel: ReactNode
  cancelLabel: ReactNode
  destructive?: boolean
  disabled?: boolean
  onConfirm: () => void | Promise<void>
}

/**
 * Asks once before running an action that cannot be undone. A native
 * `<dialog>` supplies the modality, focus trap and Escape handling.
 */
export function ConfirmAction({ trigger, title, description, confirmLabel, cancelLabel, destructive = true, disabled, onConfirm }: ConfirmActionProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog)
      return
    if (open && !dialog.open)
      dialog.showModal()
    else if (!open && dialog.open)
      dialog.close()
  }, [open])

  const confirm = async () => {
    setPending(true)
    try {
      await onConfirm()
    }
    finally {
      setPending(false)
      setOpen(false)
    }
  }

  return (
    <>
      {trigger({ onClick: () => setOpen(true), disabled })}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClose={() => setOpen(false)}
        onClick={event => event.target === event.currentTarget && setOpen(false)}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl bg-background p-0 text-foreground ring-1 ring-foreground/10 backdrop:bg-black/10 open:animate-[plainly-fade-in_120ms_ease-out]"
      >
        <div className="flex flex-col gap-1.5 p-4">
          <h2 id={titleId} className="text-base font-medium">{title}</h2>
          <p id={descriptionId} className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex justify-end gap-2 rounded-b-xl border-t border-border bg-muted/50 p-4">
          <Button variant="outline" onClick={() => setOpen(false)}>{cancelLabel}</Button>
          <Button variant={destructive ? "destructive" : "default"} disabled={pending} onClick={() => void confirm()}>{confirmLabel}</Button>
        </div>
      </dialog>
    </>
  )
}
