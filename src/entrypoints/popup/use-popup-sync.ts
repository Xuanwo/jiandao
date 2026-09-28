import { useAtomValue, useSetAtom } from "jotai"
import { useEffect } from "react"
import { onMessage, sendMessage } from "@/utils/message"
import { activeTabAtom, pageTranslationEnabledAtom, translationProgressAtom } from "./atoms"

/**
 * Keeps the popup's view of the active tab in step with the background while
 * the popup stays open (shortcut toggles, translation progress).
 *
 * The popup reads the state once before it renders, and only then starts
 * listening, so a change broadcast in between would be lost. Once
 * listening, it reads the state again; a broadcast that arrives first is
 * newer than that read and wins.
 */
export function usePopupSync() {
  const activeTab = useAtomValue(activeTabAtom)
  const setEnabled = useSetAtom(pageTranslationEnabledAtom)
  const setProgress = useSetAtom(translationProgressAtom)

  useEffect(() => {
    let heardState = false
    let heardProgress = false

    const cleanupState = onMessage("pageTranslationStateChanged", (message) => {
      if (message.data.tabId !== activeTab.id)
        return
      heardState = true
      setEnabled(message.data.enabled)
      if (!message.data.enabled) {
        heardProgress = true
        setProgress(null)
      }
    })

    const cleanupProgress = onMessage("translationProgressChanged", (message) => {
      if (message.data.tabId !== activeTab.id)
        return
      heardProgress = true
      setProgress(message.data.progress)
    })

    const tabId = activeTab.id
    if (tabId !== null) {
      void sendMessage("getEnablePageTranslationByTabId", { tabId })
        .then((enabled) => {
          if (!heardState && typeof enabled === "boolean")
            setEnabled(enabled)
        })
        .catch(() => {})
      void sendMessage("getTranslationProgressByTabId", { tabId })
        .then((progress) => {
          if (!heardProgress && progress !== undefined)
            setProgress(progress)
        })
        .catch(() => {})
    }

    return () => {
      cleanupState()
      cleanupProgress()
    }
  }, [activeTab.id, setEnabled, setProgress])
}
