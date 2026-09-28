import { MARK_ATTRIBUTES } from "../../../constants/dom-labels"

// State management for translation operations

/**
 * The walk that is translating each node. A walk skips the nodes that it is
 * already translating, but a later walk translates them again: the earlier
 * walk may have ended, and its translation no longer changes the page.
 */
const translatingNodes = new WeakMap<ChildNode, string>()

export function isTranslatingInWalk(nodes: ChildNode[], walkId: string): boolean {
  return nodes.every(node => translatingNodes.get(node) === walkId)
}

export function markTranslatingInWalk(nodes: ChildNode[], walkId: string): void {
  nodes.forEach(node => translatingNodes.set(node, walkId))
}

/** Unmarks the nodes that this walk is translating, and keeps the marks of a later walk. */
export function unmarkTranslatingInWalk(nodes: ChildNode[], walkId: string): void {
  nodes.forEach((node) => {
    if (translatingNodes.get(node) === walkId)
      translatingNodes.delete(node)
  })
}

export const originalContentMap = new Map<Element, string>()

// Pre-compiled regex for better performance - removes all mark attributes
export const MARK_ATTRIBUTES_REGEX = new RegExp(`\\s*(?:${[...MARK_ATTRIBUTES].join("|")})(?:=['""][^'"]*['""]|=[^\\s>]*)?`, "g")
