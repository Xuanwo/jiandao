const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
]

/** "2 hours ago", "刚刚": how long ago `timestamp` was, in the reader's language. */
export function formatRelativeTime(timestamp: number, now: number, locale: string): string {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
  const elapsed = Math.max(0, now - timestamp)
  for (const [unit, size] of UNITS) {
    if (elapsed >= size)
      return format.format(-Math.floor(elapsed / size), unit)
  }
  return format.format(0, "second")
}
