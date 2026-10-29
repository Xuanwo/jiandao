import { CONTENT_WRAPPER_CLASS, REACT_SHADOW_HOST_CLASS, TRANSLATION_ERROR_CONTAINER_CLASS, WORD_PREFIX_HIGHLIGHT } from "@/utils/constants/dom-labels"
import { isElement, isTextNode } from "./dom/filter"

// Text in these elements keeps its look: code, controls, editable text, headings and text that is already bold.
const EXCLUDED_SELECTOR = [
  "script", "style", "noscript", "template", "svg", "math",
  "pre", "code", "kbd", "samp", "input", "textarea", "select", "button",
  "[contenteditable]", "[role=textbox]", "[role=button]",
  "b", "strong", "h1", "h2", "h3", "h4", "h5", "h6",
  `.${REACT_SHADOW_HOST_CLASS}`, `.${TRANSLATION_ERROR_CONTAINER_CLASS}`,
].join(",")
// A change of these attributes can move text into or out of an excluded element.
const EXCLUSION_ATTRIBUTES = ["contenteditable", "role", "lang", "xml:lang"]
const TEXT_CONTEXT = `p,div,li,td,th,blockquote,figcaption,article,section,body,html,.${CONTENT_WRAPPER_CLASS}`
const NON_LATIN_LETTER = /(?!\p{Script=Latin})\p{L}/u
const ENGLISH_WORD = /^[a-z]+(?:['’][a-z]+)*$/i
const WORDS = /[\p{L}\p{M}\p{N}_]+(?:['’][\p{L}\p{M}\p{N}_]+)*/gu
// Preserve offsets while excluding code, addresses and paths in ordinary text containers.
const PROTECTED_TEXT = /```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*(?:`|$)|<([a-z][\w:-]*)\b(?:"[^"]*"|'[^']*'|[^'">])*>[^<]*<\/\1\s*>|<\/?[a-z](?:"[^"]*"|'[^']*'|[^'">])*>|\b(?:[a-z][\w+.-]*:\/\/|www\.)[^\s<>]+|(?<![\w.+-])[\w.+-]+@[\w.-]+|(?<![\w~.-])(?:[\w~.-]*[/\\])+[\w./\\-]+|\b[\w-]+(?:\.[\w-]+)+/gi

function textContext(node: Node): Element | null {
  return node.parentElement?.closest(TEXT_CONTEXT) ?? node.parentElement
}

/** The first half of each English word, rounded up; one-letter words stay plain. */
function wordPrefixRanges(text: Text, plain: string): StaticRange[] {
  const languageElement = text.parentElement?.closest("[lang],[xml\\:lang]")
  const language = (languageElement?.getAttribute("lang") ?? languageElement?.getAttribute("xml:lang") ?? "").trim()
  if (language && !/^en(?:-|$)/i.test(language))
    return []
  const ranges: StaticRange[] = []
  for (const { 0: word, index } of plain.matchAll(WORDS)) {
    if (word.length < 2)
      continue
    const prefixLength = Math.ceil(word.length / 2)
    ranges.push(new StaticRange({ startContainer: text, startOffset: index, endContainer: text, endOffset: index + prefixLength }))
  }
  return ranges
}

/** The highlight that every emphasized root of a page adds its ranges to, and the number of those roots. */
const sharedHighlights = new WeakMap<HighlightRegistry, { highlight: Highlight, roots: number }>()

function acquireHighlight(registry: HighlightRegistry): Highlight {
  let shared = sharedHighlights.get(registry)
  if (!shared) {
    shared = { highlight: new Highlight(), roots: 0 }
    sharedHighlights.set(registry, shared)
  }
  if (shared.roots++ === 0)
    registry.set(WORD_PREFIX_HIGHLIGHT, shared.highlight)
  return shared.highlight
}

function releaseHighlight(registry: HighlightRegistry) {
  const shared = sharedHighlights.get(registry)
  if (!shared || --shared.roots > 0)
    return
  if (registry.get(WORD_PREFIX_HIGHLIGHT) === shared.highlight)
    registry.delete(WORD_PREFIX_HIGHLIGHT)
  sharedHighlights.delete(registry)
}

/**
 * Registers the word prefixes under root in the highlight that the page styles
 * paint with ::highlight(jiandao-word-prefix), and keeps them up to date. The
 * DOM does not change, so page scripts, page CSS, copied text and translation
 * see the original page. Returns the function that removes the prefixes.
 */
export function startWordPrefixEmphasis(root: HTMLElement): () => void {
  // Browsers without the CSS Custom Highlight API keep the page plain.
  if (typeof Highlight === "undefined" || !CSS.highlights)
    return () => {}

  const doc = root.ownerDocument
  const registry = CSS.highlights
  const highlight = acquireHighlight(registry)
  // Static ranges cost nothing when the page changes the DOM; the observer below replaces the ranges of changed text.
  const rangesOfText = new Map<Text, StaticRange[]>()

  function forgetText(text: Text) {
    rangesOfText.get(text)?.forEach(range => highlight.delete(range))
    rangesOfText.delete(text)
  }

  function emphasizeText(text: Text, plain: string) {
    forgetText(text)
    const ranges = wordPrefixRanges(text, plain)
    if (ranges.length === 0)
      return
    ranges.forEach(range => highlight.add(range))
    rangesOfText.set(text, ranges)
  }

  /** Calls onText for each text node under node, node included, and skips excluded subtrees when skipExcluded is set. */
  function eachText(node: Node, skipExcluded: boolean, onText: (text: Text) => void) {
    if (isTextNode(node)) {
      onText(node)
      return
    }
    const walker = doc.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(candidate) {
        if (isElement(candidate))
          return skipExcluded && candidate.matches(EXCLUDED_SELECTOR) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP
        return NodeFilter.FILTER_ACCEPT
      },
    })
    while (walker.nextNode())
      onText(walker.currentNode as Text)
  }

  function emphasize(node: Node) {
    // The walker rejects excluded subtrees, so only the ancestors of node need a check.
    const element = isElement(node) ? node : node.parentElement
    if (!node.isConnected || !element || element.closest(EXCLUDED_SELECTOR))
      return
    const contexts = new Map<Element | null, Text[]>()
    eachText(node, true, (text) => {
      const context = textContext(text)
      const texts = contexts.get(context) ?? []
      texts.push(text)
      contexts.set(context, texts)
    })
    for (const texts of contexts.values()) {
      // Inline markup can split a URL or a code fence. Mask the complete text before mapping its offsets back.
      const content = texts.map(text => text.data).join("")
      // Translation wrappers own a separate context, so a Chinese translation does not suppress the English original.
      const plain = NON_LATIN_LETTER.test(content)
        ? " ".repeat(content.length)
        : content.replace(PROTECTED_TEXT, match => " ".repeat(match.length)).replace(WORDS, word =>
            ENGLISH_WORD.test(word) && !/[a-z][A-Z]/.test(word) ? word : " ".repeat(word.length))
      let offset = 0
      for (const text of texts) {
        emphasizeText(text, plain.slice(offset, offset + text.length))
        offset += text.length
      }
    }
  }

  function forget(node: Node) {
    eachText(node, false, forgetText)
  }

  const observer = new MutationObserver((records) => {
    // Forget every touched node first, so that a node that moves in this batch gets its ranges again.
    const touched = new Set<Node>()
    for (const record of records) {
      if (record.type === "childList")
        record.removedNodes.forEach(forget)
      const target = root.contains(record.target)
        ? isElement(record.target) && record.target.matches(TEXT_CONTEXT)
          ? record.target
          : textContext(record.target) ?? root
        : root
      forget(target)
      touched.add(target)
    }
    touched.forEach(emphasize)
  })
  emphasize(root)
  observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: EXCLUSION_ATTRIBUTES })
  for (let ancestor = root.parentElement; ancestor; ancestor = ancestor.parentElement)
    observer.observe(ancestor, { attributes: true, attributeFilter: EXCLUSION_ATTRIBUTES })

  return () => {
    observer.disconnect()
    rangesOfText.forEach(ranges => ranges.forEach(range => highlight.delete(range)))
    rangesOfText.clear()
    releaseHighlight(registry)
  }
}

/** Turns word-prefix emphasis on the body of the document on and off. */
export function createWordPrefixEmphasisController(doc: Document) {
  let stopEmphasis: (() => void) | undefined
  const setEnabled = (enabled: boolean) => {
    if (!enabled) {
      stopEmphasis?.()
      stopEmphasis = undefined
    }
    // SVG and XML documents have no body to emphasize.
    else if (!stopEmphasis && doc.body) {
      stopEmphasis = startWordPrefixEmphasis(doc.body)
    }
  }
  return { setEnabled }
}
