/**
 * The presentation markup that the extension adds around page text, for
 * example the word-prefix emphasis. Code that reads page markup for
 * translation or for a restore snapshot must use originalInnerHTML or
 * originalMarkup, not innerHTML or outerHTML.
 */
import { OWNED_PRESENTATION_SELECTOR } from "@/utils/constants/dom-labels"
import { isElement, isTextNode } from "./filter"

export function isOwnedPresentationElement(node: Node): boolean {
  return isElement(node) && node.matches(OWNED_PRESENTATION_SELECTOR)
}

/** Replaces each owned presentation element under root with its child nodes. */
export function unwrapOwnedPresentation(root: ParentNode): void {
  for (const element of [...root.querySelectorAll(OWNED_PRESENTATION_SELECTOR)].reverse()) {
    element.normalize()
    element.replaceWith(...element.childNodes)
  }
}

const inertDocuments = new WeakMap<Document, Document>()

/**
 * The element without owned presentation markup: the element itself when it
 * has none, else a copy. The copy belongs to an inert document, one for each
 * page document, so it loads no resource and runs no page code, for example
 * the constructor of a custom element.
 */
function withoutOwnedPresentation(element: Element): Element {
  if (!element.querySelector(OWNED_PRESENTATION_SELECTOR))
    return element
  let inertDocument = inertDocuments.get(element.ownerDocument)
  if (!inertDocument) {
    inertDocument = element.ownerDocument.implementation.createHTMLDocument("")
    inertDocuments.set(element.ownerDocument, inertDocument)
  }
  const copy = inertDocument.importNode(element, true)
  unwrapOwnedPresentation(copy)
  return copy
}

/** The innerHTML of the element without owned presentation markup. */
export function originalInnerHTML(element: Element): string {
  return withoutOwnedPresentation(element).innerHTML
}

/**
 * The markup of a node without owned presentation markup: the text of a text
 * node or of an owned element, and the outerHTML of any other element.
 */
export function originalMarkup(node: Element | Text): string {
  if (isTextNode(node) || isOwnedPresentationElement(node))
    return node.textContent
  return withoutOwnedPresentation(node).outerHTML
}
