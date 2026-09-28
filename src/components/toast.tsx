import { useSyncExternalStore } from "react"
import { browser } from "#imports"
import jiandaoIcon from "@/assets/icons/jiandao.png?url&no-inline"
import { APP_NAME } from "@/utils/constants/app"
import { NOTRANSLATE_CLASS } from "@/utils/constants/dom-labels"

/**
 * Toasts are a module-level list any code can append to; every React root
 * that renders <Toasts /> shows them. In the content script the root lives
 * in a shadow host, so page styles never touch them.
 */

export interface ToastItem {
  id: number
  kind: "success" | "error"
  message: string
  description?: string
}

const DEFAULT_DURATION_MS = 4000
const listeners = new Set<(items: ToastItem[]) => void>()
let items: ToastItem[] = []
let nextId = 1

function publish(next: ToastItem[]) {
  items = next
  for (const listener of listeners)
    listener(items)
}

function show(kind: ToastItem["kind"], message: string, options?: { description?: string, durationMs?: number }) {
  const item: ToastItem = { id: nextId++, kind, message, description: options?.description }
  publish([...items, item])
  setTimeout(dismiss, options?.durationMs ?? DEFAULT_DURATION_MS, item.id)
  return item.id
}

export function dismiss(id: number) {
  if (items.some(item => item.id === id))
    publish(items.filter(item => item.id !== id))
}

export const toast = {
  success: (message: string, options?: { description?: string, durationMs?: number }) => show("success", message, options),
  error: (message: string, options?: { description?: string, durationMs?: number }) => show("error", message, options),
}

function subscribe(listener: (items: ToastItem[]) => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function useToasts() {
  return useSyncExternalStore(subscribe, () => items, () => items)
}

const iconUrl = new URL(jiandaoIcon, browser.runtime.getURL("/")).href

export function Toasts() {
  const current = useToasts()
  if (current.length === 0)
    return null

  return (
    <div
      role="region"
      aria-label={`${APP_NAME} notifications`}
      className={`${NOTRANSLATE_CLASS} pointer-events-none fixed bottom-4 left-4 z-[2147483647] flex w-[min(356px,calc(100vw-2rem))] flex-col gap-2`}
    >
      {current.map(item => (
        <div
          key={item.id}
          role={item.kind === "error" ? "alert" : "status"}
          className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-border bg-background p-3 text-sm text-foreground shadow-md animate-[jiandao-fade-in_150ms_ease-out]"
        >
          <img src={iconUrl} alt="" className="mt-px size-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className={item.kind === "error" ? "font-medium text-destructive" : "font-medium"}>{item.message}</div>
            {item.description && <div className="mt-0.5 text-xs text-muted-foreground">{item.description}</div>}
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismiss(item.id)}
            className="-m-1 rounded p-1 text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
