/**
 * The human-readable part of an error body. OpenAI, Anthropic, Gemini and
 * the compatible gateways all answer `{ "error": { "message" } }`; some
 * answer `{ "message" }` or plain text.
 */
export function describeErrorBody(text: string, fallback: string): string {
  if (!text.trim())
    return fallback

  try {
    const json = JSON.parse(text)
    if (typeof json === "string")
      return json
    if (json?.error?.message)
      return String(json.error.message)
    if (typeof json?.error === "string")
      return json.error
    if (json?.message)
      return String(json.message)
    return fallback
  }
  catch {
    return text.slice(0, 200)
  }
}
