// @vitest-environment jsdom

import { describe, expect, it } from "vitest"
import { extractArticleText, findArticleElement, readableText } from "../article"

function page(html: string): Document {
  const doc = document.implementation.createHTMLDocument("test")
  doc.body.innerHTML = html
  return doc
}

const PARAGRAPH = "This sentence is long enough to be counted as a paragraph of real prose, with commas, too."

describe("findArticleElement", () => {
  it("picks the block holding the paragraphs over navigation and sidebars", () => {
    const doc = page(`
      <div id="nav"><a href="/a">${PARAGRAPH}</a><a href="/b">${PARAGRAPH}</a></div>
      <div class="post-body"><p>${PARAGRAPH}</p><p>${PARAGRAPH}</p><p>${PARAGRAPH}</p></div>
      <div class="sidebar"><p>${PARAGRAPH}</p></div>`)
    expect(findArticleElement(doc)?.className).toBe("post-body")
  })

  it("prefers the article landmark when scores are close", () => {
    const doc = page(`
      <div class="comments"><p>${PARAGRAPH}</p><p>${PARAGRAPH}</p><p>${PARAGRAPH}</p></div>
      <article><p>${PARAGRAPH}</p><p>${PARAGRAPH}</p><p>${PARAGRAPH}</p></article>`)
    expect(findArticleElement(doc)?.tagName).toBe("ARTICLE")
  })

  it("ignores hidden blocks and elements inside nav, header, footer and aside", () => {
    const doc = page(`
      <header><p>${PARAGRAPH}</p><p>${PARAGRAPH}</p></header>
      <aside><p>${PARAGRAPH}</p><p>${PARAGRAPH}</p></aside>
      <div hidden><p>${PARAGRAPH}</p><p>${PARAGRAPH}</p><p>${PARAGRAPH}</p></div>
      <section><p>${PARAGRAPH}</p></section>`)
    expect(findArticleElement(doc)?.tagName).toBe("SECTION")
  })

  it("returns null for a page that is only links or short fragments", () => {
    const doc = page(`<div><a href="/a">${PARAGRAPH}</a><a href="/b">${PARAGRAPH}</a></div><div>Short</div>`)
    expect(findArticleElement(doc)).toBeNull()
  })
})

describe("readableText", () => {
  it("emits one line per block and drops scripts, styles and hidden parts", () => {
    const doc = page(`<div><h2>Title</h2><p>One <b>two</b>  three</p><script>var x = 1</script><p aria-hidden="true">hidden</p><ul><li>a</li><li>b</li></ul></div>`)
    expect(readableText(doc.body)).toBe("Title\nOne two three\na\nb")
  })
})

describe("extractArticleText", () => {
  it("falls back to the whole body when nothing stands out", () => {
    const doc = page(`<div>Just a line</div><div>And another</div>`)
    expect(extractArticleText(doc)).toBe("Just a line\nAnd another")
  })

  it("returns an empty string for an empty document", () => {
    expect(extractArticleText(page(""))).toBe("")
  })
})
