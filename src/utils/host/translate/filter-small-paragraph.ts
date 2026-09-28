const LETTER_RE = /\p{L}/u

/**
 * Paragraphs not worth a request: text without a single letter (numbers,
 * prices, dates, symbols) and single characters such as icons or bullets.
 * Code blocks never get here; the DOM walk skips <pre>.
 */
export function shouldFilterSmallParagraph(text: string): boolean {
  const trimmed = text.trim()
  return [...trimmed].length < 2 || !LETTER_RE.test(trimmed)
}
