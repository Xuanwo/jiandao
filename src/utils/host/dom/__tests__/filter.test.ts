// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"

import {
  BLOCK_CONTENT_CLASS,
  INLINE_CONTENT_CLASS,
  NOTRANSLATE_CLASS,
} from "@/utils/constants/dom-labels"

import {
  isDontWalkIntoAndDontTranslateAsChildElement,
  isDontWalkIntoButTranslateAsChildElement,
  isShallowBlockHTMLElement,
  isShallowInlineHTMLElement,
  isTranslatedContentNode,
} from "../filter"

describe("isTranslatedContentNode", () => {
  it("should return true for block translated content", () => {
    const element = document.createElement("span")
    element.className = BLOCK_CONTENT_CLASS
    expect(isTranslatedContentNode(element)).toBe(true)
  })

  it("should return true for inline translated content", () => {
    const element = document.createElement("span")
    element.className = INLINE_CONTENT_CLASS
    expect(isTranslatedContentNode(element)).toBe(true)
  })

  it("should return false for non-translated content", () => {
    const element = document.createElement("div")
    element.className = "some-other-class"
    expect(isTranslatedContentNode(element)).toBe(false)
  })

  it("should return false for text nodes", () => {
    const textNode = document.createTextNode("text")
    expect(isTranslatedContentNode(textNode)).toBe(false)
  })

  it("should return true for elements with both classes", () => {
    const element = document.createElement("span")
    element.className = `${BLOCK_CONTENT_CLASS} ${INLINE_CONTENT_CLASS}`
    expect(isTranslatedContentNode(element)).toBe(true)
  })
})

describe("isDontWalkIntoButTranslateAsChildElement", () => {
  it("should return true for notranslate class", () => {
    const element = document.createElement("span")
    element.classList.add(NOTRANSLATE_CLASS)
    expect(isDontWalkIntoButTranslateAsChildElement(element)).toBe(true)
  })

  it("should return true for CODE tag", () => {
    const element = document.createElement("code")
    expect(isDontWalkIntoButTranslateAsChildElement(element)).toBe(true)
  })

  it("should return false for sr-only class", () => {
    const element = document.createElement("span")
    element.classList.add("sr-only")
    expect(isDontWalkIntoButTranslateAsChildElement(element)).toBe(false)
  })

  it("should return false for visually-hidden class", () => {
    const element = document.createElement("span")
    element.classList.add("visually-hidden")
    expect(isDontWalkIntoButTranslateAsChildElement(element)).toBe(false)
  })

  it("should return false for regular elements", () => {
    const element = document.createElement("div")
    expect(isDontWalkIntoButTranslateAsChildElement(element)).toBe(false)
  })
})

describe("inline/block display detection", () => {
  it("should treat ruby as inline", () => {
    const ruby = document.createElement("ruby")
    ruby.textContent = "大阪"

    expect(isShallowInlineHTMLElement(ruby)).toBe(true)
    expect(isShallowBlockHTMLElement(ruby)).toBe(false)
  })

  it("should not treat block ruby as inline", () => {
    const element = document.createElement("div")
    element.textContent = "大阪"
    element.style.display = "block ruby"

    expect(window.getComputedStyle(element).display).toBe("block ruby")
    expect(isShallowInlineHTMLElement(element)).toBe(false)
    expect(isShallowBlockHTMLElement(element)).toBe(true)
  })
})

describe("isDontWalkIntoAndDontTranslateAsChildElement", () => {
  it("should return true for sr-only class", () => {
    const element = document.createElement("span")
    element.classList.add("sr-only")
    expect(isDontWalkIntoAndDontTranslateAsChildElement(element)).toBe(true)
  })

  it("should return true for visually-hidden class", () => {
    const element = document.createElement("span")
    element.classList.add("visually-hidden")
    expect(isDontWalkIntoAndDontTranslateAsChildElement(element)).toBe(true)
  })

  it("should return true for aria-hidden=\"true\"", () => {
    const element = document.createElement("div")
    element.setAttribute("aria-hidden", "true")
    expect(isDontWalkIntoAndDontTranslateAsChildElement(element)).toBe(true)
  })

  it("should return true for SCRIPT tag", () => {
    const element = document.createElement("script")
    expect(isDontWalkIntoAndDontTranslateAsChildElement(element)).toBe(true)
  })

  it("should return false for regular elements", () => {
    const element = document.createElement("div")
    expect(isDontWalkIntoAndDontTranslateAsChildElement(element)).toBe(false)
  })

  describe("page chrome", () => {
    // Pages that mark up their main content lose their header, nav and footer; other pages are translated whole.
    function mount(html: string): HTMLElement {
      document.body.innerHTML = html
      return document.querySelector("[data-target]") as HTMLElement
    }

    afterEach(() => {
      document.body.innerHTML = ""
    })

    it.each(["header", "footer", "nav"])("skips a top-level <%s> when the page has an <article>", (tag) => {
      const element = mount(`<${tag} data-target></${tag}><article><p>Body</p></article>`)
      expect(isDontWalkIntoAndDontTranslateAsChildElement(element)).toBe(true)
    })

    it("skips a top-level <header> when the page has a <main>", () => {
      const element = mount(`<header data-target></header><main><p>Body</p></main>`)
      expect(isDontWalkIntoAndDontTranslateAsChildElement(element)).toBe(true)
    })

    it("keeps a <header> or <footer> inside the content container", () => {
      expect(isDontWalkIntoAndDontTranslateAsChildElement(mount(`<article><header data-target></header></article>`))).toBe(false)
      expect(isDontWalkIntoAndDontTranslateAsChildElement(mount(`<main><div><footer data-target></footer></div></main>`))).toBe(false)
    })

    it("keeps every <header> when the page does not mark up its main content", () => {
      const element = mount(`<header data-target></header><div><p>Body</p></div>`)
      expect(isDontWalkIntoAndDontTranslateAsChildElement(element)).toBe(false)
    })
  })
})
