/**
 * Clipboard helpers for the setup hand-off with an agent. Both run from a
 * click handler, which is the user activation the clipboard API requires.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  }
  catch {
    return false
  }
}

/**
 * Overwrites the clipboard after a configuration was applied, so a pasted
 * API key does not linger there.
 */
export async function clearClipboard(): Promise<void> {
  try {
    await navigator.clipboard.writeText("")
  }
  catch {
    // Without clipboard access the key stays where the user put it; nothing else to do.
  }
}
