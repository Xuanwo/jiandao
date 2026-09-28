import { OWNED_PRESENTATION_SELECTOR, REACT_SHADOW_HOST_CLASS, TRANSLATION_ERROR_CONTAINER_CLASS, WORD_PREFIX_TAG, WORD_PREFIX_TEXT_TAG } from "@/utils/constants/dom-labels"
import { isElement, isTextNode } from "./dom/filter"
import { unwrapOwnedPresentation } from "./dom/owned-presentation"

const EXCLUDED_SELECTOR = [
  "script", "style", "noscript", "template", "svg", "math",
  "pre", "code", "kbd", "samp", "input", "textarea", "select", "button",
  "[contenteditable]", "[role=textbox]", "[role=button]", "[hidden]", "[inert]", "[aria-hidden=true]",
  "b", "strong", "h1", "h2", "h3", "h4", "h5", "h6",
  `.${REACT_SHADOW_HOST_CLASS}`, `.${TRANSLATION_ERROR_CONTAINER_CLASS}`,
].join(",")
const SKIPPED_SELECTOR = `${EXCLUDED_SELECTOR},${OWNED_PRESENTATION_SELECTOR}`
// A word starts with a letter: a leading combining mark belongs to the previous text node.
const LATIN_WORD = /^\p{Script=Latin}[\p{Script=Latin}\p{M}]*(?:['’][\p{Script=Latin}\p{M}]+)*$/u
const TEXT_PARTS = /[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*|[^\p{L}\p{M}\p{N}]+/gu
const LETTERS = /\P{M}\p{M}*/gu
const HAS_LATIN = /\p{Script=Latin}/u

function createOwnedElement(doc: Document, tag: string): HTMLElement {
  const element = doc.createElement(tag)
  // Inline !important declarations win over every page rule, including `*` and `:last-child`.
  element.style.setProperty("all", "unset", "important")
  return element
}

/** The nodes that a batch of mutation records touches. */
interface TouchedNodes {
  /** The nodes to emphasize again. */
  roots: Set<Node>
  changedTexts: Set<Node>
  changedWrappers: Set<Element>
  /** The emphasized texts, with their wrappers, that can need a change. */
  candidates: Map<Text, HTMLElement>
}

/** Sorts mutation records into the nodes that they touch. It changes no node. */
function collectTouched(records: MutationRecord[], originals: Map<Text, HTMLElement>, textOfWrapper: WeakMap<Element, Text>): TouchedNodes {
  const touched: TouchedNodes = { roots: new Set(), changedTexts: new Set(), changedWrappers: new Set(), candidates: new Map() }
  const addCandidate = (text: Text) => {
    const wrapper = originals.get(text)
    if (wrapper)
      touched.candidates.set(text, wrapper)
  }
  // A removed subtree can hold emphasized texts; each one is next to its wrapper.
  const addCandidatesIn = (node: Node) => {
    if (isTextNode(node)) {
      addCandidate(node)
    }
    else if (isElement(node)) {
      for (const wrapper of node.matches(WORD_PREFIX_TEXT_TAG) ? [node] : node.querySelectorAll(WORD_PREFIX_TEXT_TAG)) {
        const text = textOfWrapper.get(wrapper)
        if (text)
          addCandidate(text)
      }
    }
  }
  for (const record of records) {
    const element = isElement(record.target) ? record.target : record.target.parentElement
    const wrapper = element?.closest(WORD_PREFIX_TEXT_TAG)
    if (wrapper) {
      touched.changedWrappers.add(wrapper)
      addCandidatesIn(wrapper)
    }
    else if (record.type === "characterData") {
      touched.changedTexts.add(record.target)
      addCandidatesIn(record.target)
      touched.roots.add(record.target)
    }
    else {
      record.removedNodes.forEach(addCandidatesIn)
      // A node that the page inserts after an emphasized text separates the text from its wrapper.
      if (record.previousSibling)
        addCandidatesIn(record.previousSibling)
      record.addedNodes.forEach(node => touched.roots.add(node))
    }
  }
  return touched
}

export function startWordPrefixEmphasis(doc: Document): () => void {
  // SVG and XML documents have no body to emphasize.
  const body = doc.body
  if (!body)
    return () => {}
  // Each emphasized text node keeps its place, empty, before its wrapper.
  const originals = new Map<Text, HTMLElement>()
  const textOfWrapper = new WeakMap<Element, Text>()

  function emphasize(text: Text) {
    // Most page text nodes are whitespace or non-Latin; skip them before building markup.
    if (!HAS_LATIN.test(text.data))
      return
    const wrapper = createOwnedElement(doc, WORD_PREFIX_TEXT_TAG)
    for (const [segment] of text.data.matchAll(TEXT_PARTS)) {
      // Latin base letters and their combining marks stay together, including on Firefox 112.
      const letters = LATIN_WORD.test(segment) ? [...segment.matchAll(LETTERS)].map(part => part[0]) : []
      if (letters.length < 2) {
        wrapper.append(segment)
        continue
      }
      // Half the graphemes, rounded up, is a presentation choice, not a proven optimum.
      const length = Math.ceil(letters.length / 2)
      const prefix = createOwnedElement(doc, WORD_PREFIX_TAG)
      prefix.style.setProperty("font-weight", "700", "important")
      prefix.textContent = letters.slice(0, length).join("")
      wrapper.append(prefix, letters.slice(length).join(""))
    }
    // Only prefixes are appended as elements; plain text is appended as strings.
    if (wrapper.firstElementChild) {
      // Keep framework-owned nodes in their original parent so updates and removals still work.
      text.after(wrapper)
      text.data = ""
      originals.set(text, wrapper)
      textOfWrapper.set(wrapper, text)
    }
  }

  function restore(text: Text, wrapper: HTMLElement, keepPageText: boolean) {
    if (!keepPageText)
      text.data = wrapper.textContent
    wrapper.remove()
  }

  function visit(root: Node) {
    // The walker rejects skipped subtrees, so ancestors only need checking once per root.
    const element = isElement(root) ? root : root.parentElement
    if (!root.isConnected || !element || element.closest(SKIPPED_SELECTOR))
      return
    if (isTextNode(root)) {
      emphasize(root)
      return
    }
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (isElement(node))
          return node.matches(SKIPPED_SELECTOR) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP
        return NodeFilter.FILTER_ACCEPT
      },
    })
    const nodes: Node[] = []
    while (walker.nextNode())
      nodes.push(walker.currentNode)
    nodes.filter(isTextNode).forEach(emphasize)
  }

  /**
   * Brings one emphasized text in line with the page after a change. Returns
   * the node to emphasize again, or null when the text needs no change.
   */
  function reconcile(text: Text, wrapper: HTMLElement, touched: TouchedNodes): Node | null {
    if (!text.isConnected && wrapper.isConnected && touched.changedWrappers.has(wrapper)) {
      // normalize() removes the empty text node before the wrapper and joins the text nodes in the wrapper.
      // Then only the wrapper holds the page text. Replace the wrapper with one text node that holds this text.
      const merged = doc.createTextNode(wrapper.textContent)
      wrapper.replaceWith(merged)
      originals.delete(text)
      return merged
    }
    if (touched.changedTexts.has(text) || touched.changedWrappers.has(wrapper) || !text.isConnected || text.nextSibling !== wrapper) {
      restore(text, wrapper, touched.changedTexts.has(text))
      originals.delete(text)
      return text
    }
    return null
  }

  const observer = new MutationObserver((records) => {
    // Disconnect only for our synchronous writes; page mutations remain observable.
    observer.disconnect()
    // Only the emphasized texts that these records touch can need a change.
    const touched = collectTouched(records, originals, textOfWrapper)
    for (const [text, wrapper] of touched.candidates) {
      const root = reconcile(text, wrapper, touched)
      if (root)
        touched.roots.add(root)
    }
    touched.roots.forEach(visit)
    observe()
  })
  function observe() {
    observer.observe(body, { childList: true, subtree: true, characterData: true })
  }
  visit(body)
  observe()
  return () => {
    const pendingUpdates = new Set(observer.takeRecords().filter(record => record.type === "characterData").map(record => record.target))
    observer.disconnect()
    originals.forEach((wrapper, text) => restore(text, wrapper, pendingUpdates.has(text)))
    originals.clear()
    // The page may have copied emphasized markup into nodes that are not tracked.
    unwrapOwnedPresentation(body)
  }
}

/** Turns word-prefix emphasis on the document on and off. */
export function createWordPrefixEmphasisController(doc: Document) {
  let stopEmphasis: (() => void) | undefined
  const setEnabled = (enabled: boolean) => {
    if (!enabled) {
      stopEmphasis?.()
      stopEmphasis = undefined
    }
    else if (!stopEmphasis) {
      stopEmphasis = startWordPrefixEmphasis(doc)
    }
  }
  return { setEnabled }
}
