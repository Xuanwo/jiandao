export const WEB_PAGE_PROMPT_TOKENS = ["targetLanguage", "input", "webTitle", "webDescription", "webContent", "webSummary"] as const
export const TOKENS = WEB_PAGE_PROMPT_TOKENS

/**
 * Separator used to distinguish multiple text segments in batch translation.
 * It is used to differentiate different text paragraphs when merging multiple translation tasks into a single request.
 */
export const BATCH_SEPARATOR = "%%"
export const BATCH_SEPARATOR_LINE_PATTERN = /\r?\n[ \t]*%%[ \t]*\r?\n/

export const TARGET_LANGUAGE = WEB_PAGE_PROMPT_TOKENS[0]
export const INPUT = WEB_PAGE_PROMPT_TOKENS[1]
export const WEB_TITLE = WEB_PAGE_PROMPT_TOKENS[2]
export const WEB_DESCRIPTION = WEB_PAGE_PROMPT_TOKENS[3]
export const WEB_CONTENT = WEB_PAGE_PROMPT_TOKENS[4]
export const WEB_SUMMARY = WEB_PAGE_PROMPT_TOKENS[5]

export const getTokenCellText = (token: string) => `{{${token}}}`

/** Rules for custom prompts in requests that join several paragraphs with {@link BATCH_SEPARATOR} lines. */
export const DEFAULT_BATCH_TRANSLATE_PROMPT = `## Multi-paragraph Translation Rules
1. If input contains a standalone line containing only ${BATCH_SEPARATOR}, use a standalone ${BATCH_SEPARATOR} line in your output. If input has no standalone ${BATCH_SEPARATOR} line, don't use ${BATCH_SEPARATOR} in your output.
2. **CRITICAL**: Treat ${BATCH_SEPARATOR} as a separator only when it appears on its own line. Do not treat ${BATCH_SEPARATOR} as a separator when it appears inside normal text, code, quotes, or punctuation.

## OUTPUT FORMAT:
- **Single paragraph input** → Output translation directly (no separators, no extra text)
- **Multi-paragraph input (input uses standalone ${BATCH_SEPARATOR} separator lines)** → Put ${BATCH_SEPARATOR} on its own line between translations

## Examples

### Multi-paragraph Input:
Paragraph A

${BATCH_SEPARATOR}

Paragraph B

${BATCH_SEPARATOR}

Paragraph C

### Multi-paragraph Output:
Translation A

${BATCH_SEPARATOR}

Translation B

${BATCH_SEPARATOR}

Translation C

### Single paragraph Input:
Single paragraph content

### Single paragraph Output:
Direct translation without separators
`

/**
 * UI sentinel value for default prompt selection
 * NOTE: This is NOT stored in config - it's only used in UI components
 * Config stores `null` for default, this string is just for Select/UI compatibility
 */
export const DEFAULT_TRANSLATE_PROMPT_ID = "__default__"

export const DEFAULT_TRANSLATE_PROMPTS_CONFIG = {
  promptId: null,
  patterns: [],
}
