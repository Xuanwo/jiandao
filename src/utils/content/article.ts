/**
 * Finds the text a page is about: the block with the most paragraph text
 * once navigation, chrome and link lists are set aside. It feeds the page
 * summary, which tolerates noise, so the heuristics stay small and the
 * fallback is the whole body.
 */

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "CANVAS", "IFRAME", "OBJECT", "VIDEO", "AUDIO", "NAV", "HEADER", "FOOTER", "ASIDE", "FORM", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "MENU", "DIALOG"])
const SKIP_ROLES = new Set(["navigation", "banner", "contentinfo", "complementary", "search", "menu", "menubar", "dialog", "toolbar", "tablist"])
const BLOCK_TAGS = new Set(["P", "DIV", "SECTION", "ARTICLE", "MAIN", "LI", "UL", "OL", "PRE", "BLOCKQUOTE", "H1", "H2", "H3", "H4", "H5", "H6", "TD", "TH", "TR", "DD", "DT", "DL", "FIGCAPTION", "BR", "HR", "TABLE"])
const PARAGRAPH_SELECTOR = "p, li, pre, blockquote, h1, h2, h3, h4, h5, h6, td, dd, figcaption"
const NOISE_RE = /\b(?:nav|menu|sidebar|footer|header|comment|share|social|related|promo|ads?|advert|cookie|popup|modal|breadcrumb|widget|banner)\b/i
const CONTENT_RE = /\b(?:article|content|main|post|entry|story|body|text)\b/i
const LIST_ITEM_TAGS = new Set(["LI", "DD", "TD"])
const MIN_PARAGRAPH_CHARS = 25
/** A block whose text is mostly link text is a menu or a list of teasers, not the article. */
const MAX_LINK_DENSITY = 0.5

function isSkipped(element: Element): boolean {
  if (SKIP_TAGS.has(element.tagName))
    return true
  const role = element.getAttribute("role")
  if (role && SKIP_ROLES.has(role))
    return true
  return element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true"
}

function hasSkippedAncestor(element: Element, root: Element): boolean {
  for (let current: Element | null = element; current && current !== root; current = current.parentElement) {
    if (isSkipped(current))
      return true
  }
  return false
}

function normalizeText(text: string): string {
  return text.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\s+/g, " ").trim()
}

/** Visible text with one line per block, without the parts a reader skips. */
export function readableText(root: Element): string {
  const lines: string[] = []
  let current = ""
  const flush = () => {
    const line = normalizeText(current)
    if (line)
      lines.push(line)
    current = ""
  }
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      current += node.textContent ?? ""
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE)
      return
    const element = node as Element
    if (isSkipped(element))
      return
    const block = BLOCK_TAGS.has(element.tagName)
    if (block)
      flush()
    for (const child of element.childNodes)
      walk(child)
    if (block)
      flush()
  }
  walk(root)
  flush()
  return lines.join("\n")
}

function linkDensity(element: Element): number {
  const total = normalizeText(element.textContent ?? "").length
  if (total === 0)
    return 0
  let linked = 0
  for (const anchor of element.querySelectorAll("a"))
    linked += normalizeText(anchor.textContent ?? "").length
  return linked / total
}

function classHint(element: Element): number {
  const hint = `${element.id} ${element.className && typeof element.className === "string" ? element.className : ""}`
  let factor = 1
  if (NOISE_RE.test(hint))
    factor *= 0.5
  if (CONTENT_RE.test(hint))
    factor *= 1.5
  return factor
}

/**
 * Scores every paragraph's parent and grandparent by the paragraph text
 * they hold, then returns the best block. Landmarks (`article`, `main`,
 * `role="main"`) and content-like class names count extra; link-heavy
 * blocks and navigation-like names count less.
 */
export function findArticleElement(doc: Document): Element | null {
  const root = doc.body
  if (!root)
    return null

  const scores = new Map<Element, number>()
  for (const paragraph of root.querySelectorAll(PARAGRAPH_SELECTOR)) {
    if (hasSkippedAncestor(paragraph, root))
      continue
    const text = normalizeText(paragraph.textContent ?? "")
    if (text.length < MIN_PARAGRAPH_CHARS)
      continue
    // Commas mark prose; long link lists have few. List items and definitions
    // count less: references, menus and API indexes are made of them.
    const weight = LIST_ITEM_TAGS.has(paragraph.tagName) ? 0.3 : 1
    const value = (text.length + (text.match(/[,，。.]/g)?.length ?? 0) * 10) * weight
    const parent = paragraph.parentElement
    const grandparent = parent?.parentElement
    if (parent && parent !== root)
      scores.set(parent, (scores.get(parent) ?? 0) + value)
    if (grandparent && grandparent !== root)
      scores.set(grandparent, (scores.get(grandparent) ?? 0) + value / 2)
  }

  let best: Element | null = null
  let bestScore = 0
  for (const [element, raw] of scores) {
    const landmark = element.matches("article, main, [role='main']") || !!element.closest("article, main, [role='main']")
    const score = raw * (1 - Math.min(linkDensity(element), 1)) * classHint(element) * (landmark ? 1.5 : 1)
    if (score > bestScore) {
      best = element
      bestScore = score
    }
  }
  if (best && linkDensity(best) > MAX_LINK_DENSITY)
    return null
  return best
}

/** The article's text, or the whole body's readable text when no block stands out. */
export function extractArticleText(doc: Document): string {
  const article = findArticleElement(doc)
  const text = article ? readableText(article) : ""
  if (text)
    return text
  return doc.body ? readableText(doc.body) : ""
}
