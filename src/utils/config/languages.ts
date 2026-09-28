import type { LangCodeISO6393 } from "@/definitions"
import { langCodeISO6393Schema } from "@/definitions"
import { DEFAULT_DETECTED_CODE } from "../constants/config"

export function normalizeDetectedCode(value: unknown): LangCodeISO6393 {
  const parsedCode = langCodeISO6393Schema.safeParse(value)
  return parsedCode.success ? parsedCode.data : DEFAULT_DETECTED_CODE
}
