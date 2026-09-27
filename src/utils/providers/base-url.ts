/** Returns the configured base URL without surrounding spaces or trailing slashes. */
export function normalizeBaseURL(baseURL: string | undefined): string {
  return (baseURL ?? "").trim().replace(/\/+$/, "")
}
