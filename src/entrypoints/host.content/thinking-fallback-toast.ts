import { onMessage } from "@/utils/message"
import { showThinkingFallbackToast } from "@/utils/providers/thinking-fallback-toast"

/**
 * Shows why the background changed the provider options, after the provider
 * rejected the preset. Only the top frame shows it, so a page with frames
 * shows it once. Returns the function that stops the listener.
 */
export function listenForThinkingFallback(isTopFrame: boolean): () => void {
  if (!isTopFrame)
    return () => {}
  return onMessage("notifyThinkingFallback", msg => showThinkingFallbackToast(msg.data))
}
