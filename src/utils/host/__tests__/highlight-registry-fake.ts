import { vi } from "vitest"
import { WORD_PREFIX_HIGHLIGHT } from "@/utils/constants/dom-labels"

/** jsdom has no CSS Custom Highlight API. Like the browser, this fake keeps a set of ranges for each registered name. */
class FakeHighlight extends Set<AbstractRange> {
  priority = 0
  type: HighlightType = "highlight"
}

/** Installs the fake Highlight and CSS.highlights until vi.unstubAllGlobals(). */
export function stubHighlightRegistry() {
  vi.stubGlobal("Highlight", FakeHighlight)
  vi.stubGlobal("CSS", Object.assign(Object.create(CSS), { highlights: new Map<string, FakeHighlight>() }))
}

/** Whether the word-prefix highlight is registered. */
export function isWordPrefixHighlightRegistered(): boolean {
  return CSS.highlights.has(WORD_PREFIX_HIGHLIGHT)
}

/** The text of each word prefix under root that the highlight covers, in page order. */
export function highlightedPrefixes(root: Node = document.body): string[] {
  const highlight = CSS.highlights.get(WORD_PREFIX_HIGHLIGHT)
  if (!highlight)
    return []
  const texts: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  while (walker.nextNode())
    texts.push(walker.currentNode as Text)
  const ranges = [...highlight] as StaticRange[]
  return texts.flatMap(text => ranges
    .filter(range => range.startContainer === text)
    .sort((a, b) => a.startOffset - b.startOffset)
    .map(range => text.data.slice(range.startOffset, range.endOffset)))
}

/** The number of ranges in the word-prefix highlight, including ranges of text that left the page. */
export function wordPrefixRangeCount(): number {
  return CSS.highlights.get(WORD_PREFIX_HIGHLIGHT)?.size ?? 0
}
