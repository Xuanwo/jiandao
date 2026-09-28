import { CONTENT_WRAPPER_CLASS } from "@/utils/constants/dom-labels"
import { isDontWalkIntoAndDontTranslateAsChildElement, isHTMLElement, isShallowInlineHTMLElement, isTranslatedContentNode, isTranslatedWrapperNode } from "./filter"
import { isOwnedPresentationElement } from "./owned-presentation"
import { smashTruncationStyle } from "./style"

export function findNearestAncestorBlockNodeFor(element: Element) {
  const startElement = element.closest(`.${CONTENT_WRAPPER_CLASS}`)?.parentElement || element
  let currentNode = startElement
  while (currentNode && currentNode.parentElement && isHTMLElement(currentNode) && isShallowInlineHTMLElement(currentNode)) {
    currentNode = currentNode.parentElement
  }
  return currentNode
}

export function deepQueryTopLevelSelector(element: HTMLElement | ShadowRoot | Document, selectorFn: (element: HTMLElement) => boolean): HTMLElement[] {
  if (element instanceof Document) {
    return deepQueryTopLevelSelector(element.body, selectorFn)
  }

  const result: HTMLElement[] = []
  if (element instanceof ShadowRoot) {
    for (const child of element.children) {
      if (isHTMLElement(child)) {
        result.push(...deepQueryTopLevelSelector(child, selectorFn))
      }
    }
    return result
  }

  if (selectorFn(element)) {
    return [element]
  }

  if (element.shadowRoot) {
    for (const child of element.shadowRoot.children) {
      if (isHTMLElement(child)) {
        result.push(...deepQueryTopLevelSelector(child, selectorFn))
      }
    }
  }

  for (const child of element.children) {
    if (isHTMLElement(child)) {
      result.push(...deepQueryTopLevelSelector(child, selectorFn))
    }
  }

  return result
}

export function unwrapDeepestOnlyHTMLChild(element: HTMLElement) {
  let currentElement = element
  while (currentElement) {
    smashTruncationStyle(currentElement)

    const shouldKeepNode = (child: ChildNode) => {
      if (!child.textContent?.trim())
        return false
      if (child.nodeType === Node.TEXT_NODE)
        return true
      return isHTMLElement(child) && !isDontWalkIntoAndDontTranslateAsChildElement(child)
    }

    const effectiveChildNodes = [...currentElement.childNodes].filter(shouldKeepNode)
    const effectiveChildren = effectiveChildNodes.filter(child => child.nodeType === Node.ELEMENT_NODE)

    // Only have one HTML child and no Text Child
    if (!(effectiveChildren.length === 1 && effectiveChildNodes.length === 1))
      break

    const onlyChildElement = effectiveChildren[0]
    if (!isHTMLElement(onlyChildElement))
      break

    // The extension removes its presentation elements when the reader turns off the emphasis.
    // Keep the translation and its snapshot in the page element.
    if (isOwnedPresentationElement(onlyChildElement))
      break

    currentElement = onlyChildElement
  }

  return currentElement
}

/**
 * Find the nearest translated content wrapper ancestor
 * @param node - The node should be a translated content node
 */
export function findTranslatedContentWrapper(node: HTMLElement): HTMLElement | null {
  if (!isTranslatedContentNode(node))
    return null

  let currentElement = node.parentElement
  while (currentElement) {
    if (isTranslatedWrapperNode(currentElement)) {
      return currentElement
    }
    currentElement = currentElement.parentElement
  }
  return null
}
