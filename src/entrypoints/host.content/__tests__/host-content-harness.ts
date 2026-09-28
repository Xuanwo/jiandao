import type { Config } from "@/types/config/config"
import { afterEach, beforeEach, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { ContentScriptContext } from "wxt/utils/content-script-context"
import { storage } from "#imports"
import { CONFIG_STORAGE_KEY } from "@/utils/constants/config"
import { onMessage } from "@/utils/message"
import hostContentScript from "../index"

/**
 * jsdom has no IntersectionObserver. This fake reports each observed element
 * as visible. Like a browser, it reports in an animation frame, after the
 * animation frame callbacks that came before.
 */
export class VisibleIntersectionObserver implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = "0px"
  readonly scrollMargin = "0px"
  readonly thresholds = [0]
  private readonly targets = new Set<Element>()

  constructor(private readonly callback: IntersectionObserverCallback) {}

  observe(target: Element) {
    this.targets.add(target)
    requestAnimationFrame(() => {
      if (!this.targets.has(target))
        return
      const bounds = target.getBoundingClientRect()
      this.callback([{ target, isIntersecting: true, intersectionRatio: 1, boundingClientRect: bounds, intersectionRect: bounds, rootBounds: null, time: 0 }], this)
    })
  }

  unobserve(target: Element) {
    this.targets.delete(target)
  }

  disconnect() {
    this.targets.clear()
  }

  takeRecords() {
    return []
  }
}

export async function storeConfig(config: Config) {
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, config)
}

/** Resolves after the next animation frame, the frame in which the page applies batched DOM changes. */
export function nextAnimationFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()))
}

/**
 * Sets up each test for the content script of a page: the WXT fake browser,
 * the IntersectionObserver fake, and message handlers in place of the
 * background. The background has page translation on for the tab and
 * translates each text to "translated: <text>". A test can hold the answers
 * to keep translations in flight. Each test ends the content script that it
 * started.
 */
export function setUpHostContentTests() {
  let removeBackground = () => {}
  let ctx: ContentScriptContext | undefined
  /** Each page translation state that the content script sends to the background, oldest first. */
  const stateMessages: boolean[] = []
  /** While set, the background answers translation requests only after it resolves. */
  let heldAnswers: Promise<void> | undefined

  beforeEach(() => {
    fakeBrowser.reset()
    stateMessages.length = 0
    heldAnswers = undefined
    vi.stubGlobal("IntersectionObserver", VisibleIntersectionObserver)
    const removers = [
      onMessage("getEnablePageTranslationFromContentScript", () => true),
      onMessage("reportDetectedPageLanguage", () => {}),
      onMessage("setAndNotifyPageTranslationStateChangedByManager", (message) => {
        stateMessages.push(message.data.enabled)
      }),
      onMessage("reportTranslationProgress", () => {}),
      onMessage("enqueueTranslateRequest", async (message) => {
        await heldAnswers
        return `translated: ${message.data.text}`
      }),
    ]
    removeBackground = () => removers.forEach(remove => remove())
  })

  afterEach(() => {
    ctx?.notifyInvalidated()
    ctx = undefined
    removeBackground()
    vi.unstubAllGlobals()
    document.body.replaceChildren()
  })

  return {
    stateMessages,
    /** Starts the content script through its entry point, the same way the browser does. */
    async start() {
      ctx = new ContentScriptContext("host")
      await hostContentScript.main(ctx)
      return ctx
    },
    /** Holds the answers to translation requests until the returned function is called. */
    holdTranslations() {
      let release = () => {}
      heldAnswers = new Promise(resolve => release = resolve)
      return () => {
        heldAnswers = undefined
        release()
      }
    },
    /** Ends the content script, as an extension update or removal does. */
    invalidate() {
      ctx?.notifyInvalidated()
    },
  }
}
