/**
 * SHA-256 of the texts joined with a separator, as lowercase hex. Cache keys
 * use it, so the digest must stay stable across releases: the Web Crypto
 * output is byte-identical to the js-sha256 output earlier versions stored.
 */
export async function sha256Hex(...texts: string[]): Promise<string> {
  if (texts.length === 0) {
    throw new Error("At least one text parameter is required")
  }

  // The separator keeps ("a", "bc") and ("ab", "c") apart.
  const bytes = new TextEncoder().encode(texts.join("|"))
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")
}

/**
 * A fast synchronous 64-bit string hash (two independent 32-bit hashes,
 * FNV-1a and djb2) for keys that only need to tell strings apart within one
 * session, such as batch grouping and injected style sheets. Not for storage.
 */
export function stringHash(...texts: string[]): string {
  const text = texts.join("|")
  let fnv = 0x811C9DC5
  let djb = 5381
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    fnv = Math.imul(fnv ^ code, 0x01000193)
    djb = (Math.imul(djb, 33) ^ code) >>> 0
  }
  return (fnv >>> 0).toString(16).padStart(8, "0") + djb.toString(16).padStart(8, "0")
}
