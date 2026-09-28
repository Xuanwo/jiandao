export interface CSSLintResult {
  valid: boolean
  errors: string[]
}

/** Counts top-level `{ … }` blocks, i.e. the rules the author wrote, ignoring braces inside strings and comments. */
function countAuthoredRules(css: string): { rules: number, balanced: boolean } {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, "\"\"")
  let depth = 0
  let rules = 0
  for (const char of source) {
    if (char === "{") {
      if (depth === 0)
        rules += 1
      depth += 1
    }
    else if (char === "}") {
      depth -= 1
      if (depth < 0)
        return { rules, balanced: false }
    }
  }
  return { rules, balanced: depth === 0 }
}

/**
 * Checks custom CSS the way the page will read it: the browser's own parser
 * drops what it cannot understand, so a rule that disappears between the
 * text and the parsed sheet is an error worth showing before saving.
 */
export function lintCSS(css: string): CSSLintResult {
  if (!css.trim())
    return { valid: true, errors: [] }

  const { rules, balanced } = countAuthoredRules(css)
  if (!balanced)
    return { valid: false, errors: ["Unbalanced braces"] }
  if (rules === 0)
    return { valid: false, errors: ["No CSS rule found; declarations belong inside a selector { … } block"] }

  if (typeof CSSStyleSheet === "undefined" || !("replaceSync" in CSSStyleSheet.prototype))
    return { valid: true, errors: [] }

  const sheet = new CSSStyleSheet()
  try {
    sheet.replaceSync(css)
  }
  catch (error) {
    return { valid: false, errors: [error instanceof Error ? error.message : String(error)] }
  }
  const parsed = sheet.cssRules.length
  if (parsed < rules)
    return { valid: false, errors: [`${rules - parsed} of ${rules} rules could not be parsed`] }
  return { valid: true, errors: [] }
}
